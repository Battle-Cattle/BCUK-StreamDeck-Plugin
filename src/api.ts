import type { JsonObject, JsonValue } from "@elgato/utils";
import streamDeck from "@elgato/streamdeck";

/**
 * Plugin-wide settings shared by every action, edited from any action's property inspector.
 * `host`/`port` are the pre-1.2 fields, still read so existing installs keep working until the
 * user saves a Server URL.
 */
export interface GlobalSettings extends JsonObject {
	[key: string]: JsonValue;
	serverUrl: string;
	apiKey: string;
}

/** Connection details for one request: the bot's base URL and the Bearer key to send. */
export interface Connection {
	serverUrl: string;
	apiKey: string;
}

/** Outcome of a call to the bot: its JSON body on success, or the status and error text. */
export type ApiResult<T> =
	| { ok: true; data: T }
	| { ok: false; status: number | null; error: string };

const REQUEST_TIMEOUT_MS = 20_000;

let globalSettings: GlobalSettings = { serverUrl: "", apiKey: "" };

/**
 * Starts tracking the global settings. Call once, before `streamDeck.connect()`. Stream Deck
 * re-sends them whenever a property inspector saves, so the cached copy stays current.
 */
export function initGlobalSettings(): void {
	streamDeck.settings.onDidReceiveGlobalSettings<JsonObject>((ev) => {
		globalSettings = migrateGlobalSettings(ev.settings);
	});
	void streamDeck.settings.getGlobalSettings();
}

/** The current connection details from the global settings. */
export function getConnection(): Connection {
	return { serverUrl: globalSettings.serverUrl, apiKey: globalSettings.apiKey };
}

/**
 * Reads raw global settings, falling back to the legacy `host`/`port` pair (always plain HTTP,
 * as the old plugin did) when no `serverUrl` has been saved yet.
 * @param raw Settings as stored by Stream Deck.
 */
export function migrateGlobalSettings(raw: JsonObject): GlobalSettings {
	const apiKey = typeof raw.apiKey === "string" ? raw.apiKey : "";
	if (typeof raw.serverUrl === "string" && raw.serverUrl.trim()) {
		return { serverUrl: raw.serverUrl.trim(), apiKey };
	}
	if (typeof raw.host === "string" && raw.host.trim()) {
		const port = typeof raw.port === "number" ? raw.port : 3000;
		return { serverUrl: `http://${raw.host.trim()}:${port}`, apiKey };
	}
	return { serverUrl: "", apiKey };
}

/**
 * Normalises a user-entered server URL into a base URL with no trailing slash. A bare host
 * (no scheme) is assumed to be HTTPS.
 * @param input The Server URL as typed, e.g. `bot.example.com` or `http://192.168.1.5:3000`.
 * @returns The base URL, or null if it isn't a valid http(s) URL.
 */
export function normalizeServerUrl(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	let url: URL;
	try {
		url = new URL(withScheme);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * Calls the bot's Stream Deck API and parses its `{ ok, error }` JSON envelope.
 * @param conn Server URL and API key to use.
 * @param path Path under `/api/streamdeck`, e.g. `/sfx`.
 * @param body JSON body to POST; omit for a GET.
 * @returns The parsed body on success, otherwise the status (null for network errors) and the
 *   bot's own error message where it sent one.
 */
export async function apiRequest<T>(conn: Connection, path: string, body?: JsonObject): Promise<ApiResult<T>> {
	const baseUrl = normalizeServerUrl(conn.serverUrl);
	if (!baseUrl) return { ok: false, status: null, error: "Server URL is not set or invalid" };
	if (!conn.apiKey) return { ok: false, status: null, error: "API key is not set" };

	const headers: Record<string, string> = { Authorization: `Bearer ${conn.apiKey}` };
	if (body) headers["Content-Type"] = "application/json";

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(`${baseUrl}/api/streamdeck${path}`, {
			method: body ? "POST" : "GET",
			headers,
			body: body ? JSON.stringify(body) : undefined,
			signal: controller.signal,
		});
		// Read the body inside the timeout too, not just the headers.
		const text = await response.text();
		const parsed = parseJson(text);
		if (response.ok) {
			if (parsed === undefined) {
				return { ok: false, status: response.status, error: "Server returned a non-JSON response — check the Server URL" };
			}
			return { ok: true, data: parsed as T };
		}
		return { ok: false, status: response.status, error: errorMessage(response.status, parsed) };
	} catch (err) {
		const aborted = err instanceof Error && err.name === "AbortError";
		return { ok: false, status: null, error: aborted ? "Request timed out" : `Network error — ${String(err)}` };
	} finally {
		clearTimeout(timer);
	}
}

/** Parses `text` as JSON, or returns undefined if it isn't. */
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
