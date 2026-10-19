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

/** Default timeout for a call, generous enough for Join Voice (the bot allows 30s to connect). */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Timeout for a key press that should answer almost at once (Play SFX, Leave Voice), so an
 * unreachable server shows the alert on the key within a few seconds instead of twenty.
 */
export const QUICK_KEY_PRESS_TIMEOUT_MS = 5_000;

let globalSettings: GlobalSettings = { serverUrl: "", apiKey: "" };
let globalSettingsLoaded = false;
// The last Server URL warned about as plain HTTP to another machine, so a settings re-send doesn't
// repeat the warning.
const warnedInsecureUrls = new Set<string>();
const globalSettingsListeners = new Set<() => void>();

/**
 * Starts tracking the global settings. Call once, before `streamDeck.connect()`. Stream Deck
 * re-sends them whenever a property inspector saves, so the cached copy stays current.
 */
export function initGlobalSettings(): void {
	streamDeck.settings.onDidReceiveGlobalSettings<JsonObject>((ev) => {
		globalSettings = migrateGlobalSettings(ev.settings);
		globalSettingsLoaded = true;
		warnIfInsecure(globalSettings.serverUrl);
		for (const listener of globalSettingsListeners) listener();
	});
	void streamDeck.settings.getGlobalSettings();
}

/** Whether the global settings have been received from Stream Deck yet. */
export function hasGlobalSettings(): boolean {
	return globalSettingsLoaded;
}

/**
 * Registers a callback run after each global-settings delivery (startup and every save).
 * @param listener Called with no arguments; read the new values with {@link getConnection}.
 */
export function onGlobalSettingsChanged(listener: () => void): void {
	globalSettingsListeners.add(listener);
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
 * Logs a warning (once per URL) when the Server URL sends the API key over plain HTTP to another
 * machine, e.g. after migrating pre-1.2 `host`/`port` settings, which were always plain HTTP. The
 * property inspector shows the same warning, but only while it's open.
 * The URL is logged as normalized for requests, so any credentials or query in the setting stay
 * out of the log.
 * @param serverUrl The Server URL in use.
 */
function warnIfInsecure(serverUrl: string): void {
	const url = normalizeServerUrl(serverUrl);
	if (!url || !isPlainHttpToRemote(serverUrl) || warnedInsecureUrls.has(url)) return;
	warnedInsecureUrls.add(url);
	streamDeck.logger.warn(
		`Server URL ${url} uses plain HTTP to another machine, so the API key is sent unencrypted. Use https:// if the bot has it.`,
	);
}

/**
 * Whether a Server URL sends requests over plain HTTP to a host other than this machine.
 * @param serverUrl The Server URL as saved.
 * @returns True for `http://` to a non-loopback host; false for https, loopback or an invalid URL.
 */
export function isPlainHttpToRemote(serverUrl: string): boolean {
	const baseUrl = normalizeServerUrl(serverUrl);
	if (!baseUrl) return false;
	const url = new URL(baseUrl);
	return url.protocol === "http:" && !isLoopbackHost(url.hostname);
}

/**
 * Normalises a user-entered server URL into a base URL with no trailing slash. A bare host
 * (no scheme) is assumed to be HTTPS, except a loopback address (`localhost:3000`,
 * `127.0.0.1:3000`), where plain HTTP never leaves the machine. Anything else, a LAN address
 * included, only gets plain HTTP when `http://` is typed out, so the API key is never sent
 * unencrypted over a network by default.
 * @param input The Server URL as typed, e.g. `bot.example.com` or `http://192.168.1.5:3000`.
 * @returns The base URL, or null if it isn't a valid http(s) URL.
 */
export function normalizeServerUrl(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `${defaultScheme(trimmed)}://${trimmed}`;
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
 * The scheme to assume for a Server URL typed without one: `http` for a loopback host,
 * `https` for anything else.
 * @param schemeless The Server URL as typed, without a scheme.
 */
function defaultScheme(schemeless: string): "http" | "https" {
	let host: string;
	try {
		host = new URL(`http://${schemeless}`).hostname;
	} catch {
		return "https";
	}
	return isLoopbackHost(host) ? "http" : "https";
}

/**
 * Whether a hostname is loopback (`localhost`, `127.x.x.x`, `[::1]`), so plain HTTP to it never
 * leaves the machine.
 * @param host A URL hostname.
 */
export function isLoopbackHost(host: string): boolean {
	return host === "localhost" || host === "[::1]" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

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
 */
function toResult<T>(status: number, ok: boolean, text: string): ApiResult<T> {
	const parsed = parseJson(text);
	if (!ok) return { ok: false, status, error: errorMessage(status, parsed) };
	if (parsed === undefined) {
		return { ok: false, status, error: "Server returned a non-JSON response — check the Server URL" };
	}
	return { ok: true, data: parsed as T };
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
