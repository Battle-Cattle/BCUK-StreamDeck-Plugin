import type { JsonObject } from "@elgato/utils";
import streamDeck from "@elgato/streamdeck";
import { apiRequest, type ApiResult, getConnection, logFailure } from "./api";

/** The parts of a Stream Deck key a key-press request shows its result on. */
export interface FeedbackKey {
	showOk(): Promise<void>;
	showAlert(): Promise<void>;
}

/** One key press's call to the bot. */
export interface PressRequest<T> {
	/** Names the press in the failure log line, e.g. `Play SFX "!clap"`. */
	label: string;
	/** API path under `/api/streamdeck`, e.g. `/sfx`. */
	path: string;
	/** JSON body to POST. */
	body: JsonObject;
	/** How long to wait for the response; the API's default when omitted. */
	timeoutMs?: number;
	/** Runs on success, before the key shows OK (e.g. to remember the joined server). */
	onOk?: (data: T) => void;
}

/**
 * Logs that a key has nothing configured yet and shows an alert on it.
 * @param key The pressed key.
 * @param message The warning to log, e.g. "Play SFX: no command configured.".
 * @returns Resolves once the alert is shown.
 */
export async function alertNotConfigured(key: FeedbackKey, message: string): Promise<void> {
	streamDeck.logger.warn(message);
	await key.showAlert();
}

/**
 * Sends a key press's request to the bot and shows the outcome on the key: on success, runs
 * `onOk` and shows OK; otherwise logs the failure under `label` and shows an alert.
 * @param key The pressed key.
 * @param request The call to make.
 * @returns The request's result, for a caller that needs the response.
 */
export async function pressRequest<T>(key: FeedbackKey, request: PressRequest<T>): Promise<ApiResult<T>> {
	const conn = getConnection();
	// Leave the timeout argument off entirely when none is given, so apiRequest's default applies.
	const result = request.timeoutMs === undefined
		? await apiRequest<T>(conn, request.path, request.body)
		: await apiRequest<T>(conn, request.path, request.body, request.timeoutMs);
	if (result.ok) {
		request.onOk?.(result.data);
		await key.showOk();
	} else {
		logFailure(request.label, result);
		await key.showAlert();
	}
	return result;
}
