import type { JsonObject } from "@elgato/utils";
import streamDeck from "@elgato/streamdeck";
import { type Connection, normalizeServerUrl } from "./serverUrl";

/** Outcome of a call to the bot: its JSON body on success, or the status and error text. */
export type ApiResult<T> =
	| { ok: true; data: T }
	| { ok: false; status: number | null; error: string };

/** Default timeout for a call, generous enough for Join Voice (the bot allows 30s to connect). */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Timeout for a key press that should answer almost at once (Play SFX, Leave Voice), so an
 * unreachable server shows the alert on the key within a few seconds instead of twenty.
 */
export const QUICK_KEY_PRESS_TIMEOUT_MS = 5_000;

type ApiFailure = Extract<ApiResult<never>, { ok: false }>;

/**
 * Calls the bot's Stream Deck API and parses its `{ ok, error }` JSON envelope.
 * @param conn Server URL and API key to use.
 * @param path Path under `/api/streamdeck`, e.g. `/sfx`.
 * @param body JSON body to POST; omit for a GET.
 * @param timeoutMs How long to wait for the whole response, body included.
 * @returns The parsed body on success, otherwise the status (null for network errors) and the
 *   bot's own error message where it sent one.
 */
export async function apiRequest<T>(
	conn: Connection,
	path: string,
	body?: JsonObject,
	timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<ApiResult<T>> {
	const request = buildRequest(conn, path, body);
	if ("error" in request) return request;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(request.url, { ...request.init, signal: controller.signal });
		// Read the body inside the timeout too, not just the headers.
		return toResult<T>(response.status, response.ok, await response.text());
	} catch (err) {
		const aborted = err instanceof Error && err.name === "AbortError";
		return { ok: false, status: null, error: aborted ? "Request timed out" : `Network error — ${describeNetworkError(err)}` };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Describes a failed fetch, including the underlying reason. Node's fetch throws a bare
 * "fetch failed" and keeps the useful part (refused connection, DNS failure, TLS error, closed
 * socket) in `cause`.
 * @param err What fetch threw.
 * @returns The error, followed by its cause's code and message in brackets when it has one.
 */
export function describeNetworkError(err: unknown): string {
	const message = String(err);
	const cause = err instanceof Error ? err.cause : undefined;
	if (typeof cause !== "object" || cause === null) return message;
	const { code, message: causeMessage } = cause as { code?: unknown; message?: unknown };
	const text = typeof causeMessage === "string" ? causeMessage : "";
	// Node's messages usually start with the code already ("connect ECONNREFUSED ..."), so only
	// prefix it when they don't.
	const detail = typeof code === "string" && !text.includes(code) ? [code, text].filter(Boolean).join(": ") : text;
	return detail ? `${message} (${detail})` : message;
}

/**
 * Builds the URL and fetch options for a call, or a failure if the settings aren't usable.
 * @param conn Server URL and API key to use.
 * @param path Path under `/api/streamdeck`.
 * @param body JSON body to POST; omit for a GET.
 * @returns The full URL and fetch options carrying the Bearer key, or a failure (null status)
 *   when the Server URL is invalid or the API key is missing.
 */
function buildRequest(conn: Connection, path: string, body?: JsonObject): { url: string; init: RequestInit } | ApiFailure {
	const baseUrl = normalizeServerUrl(conn.serverUrl);
	if (!baseUrl) return { ok: false, status: null, error: "Server URL is not set or invalid" };
	if (!conn.apiKey) return { ok: false, status: null, error: "API key is not set" };

	const headers: Record<string, string> = { Authorization: `Bearer ${conn.apiKey}` };
	if (body) headers["Content-Type"] = "application/json";
	return {
		url: `${baseUrl}/api/streamdeck${path}`,
		init: { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined },
	};
}

/**
 * Turns a response into an {@link ApiResult}. A success must carry JSON — anything else (e.g.
 * a proxy's HTML page) means the Server URL points somewhere other than the bot.
 * @param status HTTP status.
 * @param ok Whether the status is 2xx.
 * @param text The response body.
 * @returns The parsed body on a 2xx JSON response, otherwise a failure with the status and
 *   error text.
 */
function toResult<T>(status: number, ok: boolean, text: string): ApiResult<T> {
	const parsed = parseJson(text);
	if (!ok) return { ok: false, status, error: errorMessage(status, parsed) };
	if (parsed === undefined) {
		return { ok: false, status, error: "Server returned a non-JSON response — check the Server URL" };
	}
	return { ok: true, data: parsed as T };
}

/**
 * Parses `text` as JSON, or returns undefined if it isn't.
 * @param text The raw response body.
 * @returns The parsed value, or undefined when `text` isn't valid JSON.
 */
function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/**
 * The bot's own `error` text when the body carries one, else a generic message for the status.
 * @param status HTTP status of a failed response.
 * @param body The parsed response body, if it was JSON.
 * @returns The body's `error` string, else a message for 401, 403 or 429, else
 *   `Server returned <status>`.
 */
function errorMessage(status: number, body: unknown): string {
	if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
		return body.error;
	}
	switch (status) {
		case 401:
			return "Invalid API key";
		case 403:
			return "API key not approved for this server";
		case 429:
			return "Too many requests — slow down";
		default:
			return `Server returned ${status}`;
	}
}

/**
 * Logs a failed call with the action's name and the bot's error text.
 * @param actionName Label for the log line, e.g. "Play SFX".
 * @param result The failed result.
 */
export function logFailure(actionName: string, result: { status: number | null; error: string }): void {
	const status = result.status === null ? "" : ` (${result.status})`;
	const line = `${actionName}: ${result.error}${status}`;
	if (result.status !== null && result.status < 500) {
		streamDeck.logger.warn(line);
	} else {
		streamDeck.logger.error(line);
	}
}
