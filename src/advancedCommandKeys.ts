import type { JsonValue } from "@elgato/utils";
import streamDeck from "@elgato/streamdeck";
import { apiRequest, getConnection, logFailure, QUICK_KEY_PRESS_TIMEOUT_MS } from "./api";
import { fetchAdvancedCommandList, invalidateAdvancedCommandList } from "./advancedCommandList";
import { parseCommandId, toAdvancedCommands } from "./advancedCommands";

// Key logic for Trigger Command and Toggle Command, kept out of the decorated action classes so
// it can be unit-tested (the test runner doesn't compile `@action` decorators).

/** The parts of a Stream Deck key these handlers use. */
export interface CommandKey {
	/** The action instance's id: stable for one key, used to discard superseded state syncs. */
	readonly id: string;
	showOk(): Promise<void>;
	showAlert(): Promise<void>;
	setState(state: 0 | 1): Promise<void>;
}

/**
 * Per key, the generation of its latest state sync or toggle press. A sync applies its result only
 * if the key's generation hasn't moved while its request was in flight, so a slow, superseded sync
 * (for a previously selected command, or one started before a key press) can't overwrite a newer
 * state. Entries are removed when a key disappears (see {@link forgetKey}).
 */
const stateGenerations = new Map<string, number>();

/**
 * The last generation handed out, across all keys. Generations are never reused, so a sync still
 * in flight when its key disappeared can't match the generation of a sync started after the key
 * reappears.
 */
let lastGeneration = 0;

/**
 * Starts a new state change on a key, superseding any sync still in flight for it.
 * @param key The key.
 * @returns The new generation, for {@link isCurrent}.
 */
function nextGeneration(key: CommandKey): number {
	lastGeneration += 1;
	stateGenerations.set(key.id, lastGeneration);
	return lastGeneration;
}

/**
 * Whether no newer state change has started on a key since `generation`, and it hasn't disappeared.
 * @param key The key.
 * @param generation The generation from {@link nextGeneration}.
 * @returns True if the result for `generation` may still be shown.
 */
function isCurrent(key: CommandKey, generation: number): boolean {
	return stateGenerations.get(key.id) === generation;
}

/**
 * Stops tracking a key that has disappeared (deleted, or scrolled off with a page or profile
 * switch), so the plugin doesn't keep an entry for every key it has ever seen. Any sync or toggle
 * still in flight for the key then leaves its state alone; it syncs again when it reappears.
 * @param keyId The disappearing action instance's id.
 */
export function forgetKey(keyId: string): void {
	stateGenerations.delete(keyId);
}

/**
 * How many keys currently have a tracked generation.
 * @returns The number of keys that have synced or been pressed and haven't disappeared since.
 */
export function trackedKeyCount(): number {
	return stateGenerations.size;
}

/**
 * Manifest state index for each enabled state: 0 shows "on", 1 shows "off".
 * @param isEnabled Whether the command is enabled.
 * @returns 0 when enabled, 1 when disabled.
 */
export function stateFor(isEnabled: boolean): 0 | 1 {
	return isEnabled ? 0 : 1;
}

/**
 * Fires a button's advanced command — free, with no cooldowns — showing OK or an alert on the
 * key (e.g. when the command is disabled or was deleted).
 * @param key The pressed key.
 * @param savedId The button's saved command id.
 */
export async function triggerCommand(key: CommandKey, savedId: JsonValue | undefined): Promise<void> {
	const commandId = parseCommandId(savedId);
	if (commandId === null) {
		streamDeck.logger.warn("Trigger Command: no command configured.");
		await key.showAlert();
		return;
	}

	const result = await apiRequest(getConnection(), "/advanced-commands/trigger", { commandId }, QUICK_KEY_PRESS_TIMEOUT_MS);
	if (result.ok) {
		await key.showOk();
		return;
	}
	logFailure(`Trigger Command ${commandId}`, result);
	await key.showAlert();
}

/**
 * Flips a button's advanced command on or off and shows the new state on the key (unless the key's
 * command changed while the request was in flight).
 * @param key The pressed key.
 * @param savedId The button's saved command id.
 */
export async function toggleCommand(key: CommandKey, savedId: JsonValue | undefined): Promise<void> {
	const commandId = parseCommandId(savedId);
	if (commandId === null) {
		streamDeck.logger.warn("Toggle Command: no command configured.");
		await key.showAlert();
		return;
	}

	// The press's response is authoritative over any state sync still in flight, but is itself
	// superseded if the key's command changes (a new sync) before it arrives.
	const generation = nextGeneration(key);
	const result = await apiRequest<{ isEnabled?: JsonValue }>(
		getConnection(), "/advanced-commands/enabled", { commandId }, QUICK_KEY_PRESS_TIMEOUT_MS,
	);
	if (result.ok) {
		// The command's state changed, so a shared list fetched before the press is out of date.
		invalidateAdvancedCommandList();
	}
	if (result.ok && typeof result.data.isEnabled === "boolean") {
		// The press did take effect, so the OK is still shown; only the state of a command the key
		// no longer shows is skipped.
		if (isCurrent(key, generation)) await key.setState(stateFor(result.data.isEnabled));
		await key.showOk();
		return;
	}
	logFailure(`Toggle Command ${commandId}`, result.ok ? { status: null, error: "Response had no isEnabled" } : result);
	await key.showAlert();
}

/**
 * Shows a button's command's current enabled state, read from the bot's command list (shared with
 * other keys syncing at about the same time, see `fetchAdvancedCommandList`). Leaves the key as it is
 * when no command is chosen, it no longer exists, the bot can't be reached, or a newer sync or
 * key press started while this one's request was in flight.
 * @param key The key to update.
 * @param savedId The button's saved command id.
 */
export async function syncToggleState(key: CommandKey, savedId: JsonValue | undefined): Promise<void> {
	const generation = nextGeneration(key);
	const commandId = parseCommandId(savedId);
	if (commandId === null) return;
	// Shared with every other key syncing at the same time (e.g. a page of Toggle keys appearing).
	const result = await fetchAdvancedCommandList(getConnection());
	if (!result.ok) {
		logFailure("Toggle Command state", result);
		return;
	}
	const command = toAdvancedCommands(result.data.commands).find((c) => c.id === commandId);
	if (command && isCurrent(key, generation)) await key.setState(stateFor(command.isEnabled));
}
