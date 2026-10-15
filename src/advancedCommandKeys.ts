import type { JsonValue } from "@elgato/utils";
import streamDeck from "@elgato/streamdeck";
import { apiRequest, getConnection, logFailure, QUICK_KEY_PRESS_TIMEOUT_MS } from "./api";
import { parseCommandId, toAdvancedCommands } from "./advancedCommands";

// Key logic for Trigger Command and Toggle Command, kept out of the decorated action classes so
// it can be unit-tested (the test runner doesn't compile `@action` decorators).

/** The parts of a Stream Deck key these handlers use. */
export interface CommandKey {
	showOk(): Promise<void>;
	showAlert(): Promise<void>;
	setState(state: 0 | 1): Promise<void>;
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
 * Flips a button's advanced command on or off and shows the new state on the key.
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

	const result = await apiRequest<{ isEnabled?: JsonValue }>(
		getConnection(), "/advanced-commands/enabled", { commandId }, QUICK_KEY_PRESS_TIMEOUT_MS,
	);
	if (result.ok && typeof result.data.isEnabled === "boolean") {
		await key.setState(stateFor(result.data.isEnabled));
		await key.showOk();
		return;
	}
	logFailure(`Toggle Command ${commandId}`, result.ok ? { status: null, error: "Response had no isEnabled" } : result);
	await key.showAlert();
}

/**
 * Shows a button's command's current enabled state, read from the bot. Leaves the key as it is
 * when no command is chosen, it no longer exists, or the bot can't be reached.
 * @param key The key to update.
 * @param savedId The button's saved command id.
 */
export async function syncToggleState(key: CommandKey, savedId: JsonValue | undefined): Promise<void> {
	const commandId = parseCommandId(savedId);
	if (commandId === null) return;
	const result = await apiRequest<{ commands?: JsonValue }>(getConnection(), "/advanced-commands", undefined, QUICK_KEY_PRESS_TIMEOUT_MS);
	if (!result.ok) {
		logFailure("Toggle Command state", result);
		return;
	}
	const command = toAdvancedCommands(result.data.commands).find((c) => c.id === commandId);
	if (command) await key.setState(stateFor(command.isEnabled));
}
