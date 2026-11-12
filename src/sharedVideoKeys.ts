import type { JsonValue } from "@elgato/utils";
import { apiRequest, logFailure, QUICK_KEY_PRESS_TIMEOUT_MS } from "./apiClient";
import { getConnection } from "./globalSettings";
import { alertNotConfigured, type FeedbackKey } from "./keyRequest";
import { parseVideoId } from "./sharedVideos";
import streamDeck from "@elgato/streamdeck";
import { asObject } from "./json";

// Key logic for Play Shared Video, kept out of the action class so it can be tested directly.

/**
 * Plays a button's shared video on every connected shared overlay, showing OK only when the bot
 * actually sent it. The bot answers 200 in two cases where nothing was sent, and both show an alert:
 * another trigger came within its global cooldown (`triggered: false`), or no shared overlay was
 * connected (`reached: 0`). A disabled or deleted video is a 404 and alerts too.
 * @param key The pressed key.
 * @param savedId The button's saved video id.
 * @returns Resolves once the key shows the result.
 */
export async function playSharedVideo(key: FeedbackKey, savedId?: JsonValue): Promise<void> {
	const videoId = parseVideoId(savedId);
	if (videoId === null) {
		await alertNotConfigured(key, "Play Shared Video: no video configured.");
		return;
	}
	const result = await apiRequest<JsonValue>(
		getConnection(), "/shared-videos/trigger", { videoId }, QUICK_KEY_PRESS_TIMEOUT_MS,
	);
	if (!result.ok) {
		logFailure(`Play Shared Video ${videoId}`, result);
		await key.showAlert();
		return;
	}
	const body = asObject(result.data);
	if (body?.triggered === false) {
		streamDeck.logger.info(`Play Shared Video ${videoId}: not sent (${String(body.reason ?? "refused")}).`);
		await key.showAlert();
		return;
	}
	if (body?.reached === 0) {
		streamDeck.logger.warn(`Play Shared Video ${videoId}: no shared overlay is connected.`);
		await key.showAlert();
		return;
	}
	await key.showOk();
}
