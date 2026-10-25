import { QUICK_KEY_PRESS_TIMEOUT_MS } from "./api";
import { alertNotConfigured, type FeedbackKey, pressRequest } from "./keyRequest";

// Key logic for Start Raffle, kept out of the action class so it can be tested directly.

/**
 * Reads the prize from a key's stored settings. Stream Deck settings are whatever JSON was saved, so
 * a number (e.g. from an edited profile) is accepted as well as the string the property inspector saves.
 * @param amount The stored `amount` setting.
 * @returns The trimmed amount text, or "" if it's missing, blank or not a string or finite number.
 */
export function readAmount(amount: unknown): string {
	if (typeof amount === "number") return Number.isFinite(amount) ? String(amount) : "";
	return typeof amount === "string" ? amount.trim() : "";
}

/**
 * Asks the bot to start a loyalty-points raffle in the key owner's Twitch chat, showing OK or an
 * alert on the key. The bot parses and checks the amount (`100`, `1,000`, `1K`), and refuses with
 * an alert if a raffle is already running or loyalty points are off.
 * @param key The pressed key.
 * @param amount The prize from the key's settings: any stored JSON, or undefined if it was never set.
 * @returns Resolves once the key shows the result.
 */
export async function startRaffle(key: FeedbackKey, amount: unknown): Promise<void> {
	const trimmed = readAmount(amount);
	if (trimmed === "") {
		await alertNotConfigured(key, "Start Raffle: no amount configured.");
		return;
	}
	await pressRequest(key, {
		label: `Start Raffle ${trimmed}`,
		path: "/raffle",
		body: { amount: trimmed },
		timeoutMs: QUICK_KEY_PRESS_TIMEOUT_MS,
	});
}
