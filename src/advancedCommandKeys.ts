import type { JsonValue } from "@elgato/utils";
import streamDeck from "@elgato/streamdeck";
import { apiRequest, getConnection, logFailure, QUICK_KEY_PRESS_TIMEOUT_MS } from "./api";
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
 * Per key, a counter bumped by every state sync and toggle press. A sync applies its result only if
 * the counter hasn't moved while its request was in flight, so a slow, superseded sync (for a
 * previously selected command, or one started before a key press) can't overwrite a newer state.
 */
const stateGenerations = new Map<string, number>();

/**
 * Starts a new state change on a key, superseding any sync still in flight for it.
 * @param key The key.
 * @returns The new generation, for {@link isCurrent}.
 */
function nextGeneration(key: CommandKey): number {
	const generation = (stateGenerations.get(key.id) ?? 0) + 1;
	stateGenerations.set(key.id, generation);
	return generation;
}

/**
 * Whether no newer state change has started on a key since `generation`.
 * @param key The key.
 * @param generation The generation from {@link nextGeneration}.
 * @returns True if the result for `generation` may still be shown.
 */
function isCurrent(key: CommandKey, generation: number): boolean {
	return stateGenerations.get(key.id) === generation;
}

/** Manifest state index for each enabled state: 0 shows "on", 1 shows "off". */
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
 * Shows a button's command's current enabled state, read from the bot. Leaves the key as it is
 * when no command is chosen, it no longer exists, the bot can't be reached, or a newer sync or
 * key press started while this one's request was in flight.
 * @param key The key to update.
 * @param savedId The button's saved command id.
 */
export async function syncToggleState(key: CommandKey, savedId: JsonValue | undefined): Promise<void> {
	const generation = nextGeneration(key);
	const commandId = parseCommandId(savedId);
	if (commandId === null) return;
	const result = await apiRequest<{ commands?: JsonValue }>(getConnection(), "/advanced-commands", undefined, QUICK_KEY_PRESS_TIMEOUT_MS);
	if (!result.ok) {
		logFailure("Toggle Command state", result);
		return;
	}
	const command = toAdvancedCommands(result.data.commands).find((c) => c.id === commandId);
	if (command && isCurrent(key, generation)) await key.setState(stateFor(command.isEnabled));
}
