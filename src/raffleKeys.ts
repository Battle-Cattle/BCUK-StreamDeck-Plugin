import { QUICK_KEY_PRESS_TIMEOUT_MS } from "./api";
import { alertNotConfigured, type FeedbackKey, pressRequest } from "./keyRequest";

// Key logic for Start Raffle, kept out of the action class so it can be tested directly.

/**
 * Asks the bot to start a loyalty-points raffle in the key owner's Twitch chat, showing OK or an
 * alert on the key. The bot parses and checks the amount (`100`, `1,000`, `1K`), and refuses with
 * an alert if a raffle is already running or loyalty points are off.
 * @param key The pressed key.
 * @param amount The prize from the key's settings, or undefined if it was never set.
 * @returns Resolves once the key shows the result.
 */
export async function startRaffle(key: FeedbackKey, amount: string | undefined): Promise<void> {
	const trimmed = amount?.trim() ?? "";
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
