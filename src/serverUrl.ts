import streamDeck from "@elgato/streamdeck";

/** Connection details for one request: the bot's base URL and the Bearer key to send. */
export interface Connection {
	serverUrl: string;
	apiKey: string;
}

// Every Server URL already warned about as plain HTTP to another machine, so a settings re-send (or
// switching back to one) doesn't repeat the warning.
const warnedInsecureUrls = new Set<string>();

/**
 * Logs a warning (once per URL) when the Server URL sends the API key over plain HTTP to another
 * machine. The property inspector shows the same warning, but only while it's open.
 * Only the URL's origin is logged, so credentials, a query or a token in the path stay out of
 * the log.
 * @param serverUrl The Server URL in use.
 */
export function warnIfInsecure(serverUrl: string): void {
	const baseUrl = normalizeServerUrl(serverUrl);
	if (!baseUrl || warnedInsecureUrls.has(baseUrl)) return;
	const url = new URL(baseUrl);
	if (!isPlainHttpUrlToRemote(url)) return;
	warnedInsecureUrls.add(baseUrl);
	streamDeck.logger.warn(
		`Server URL ${url.origin} uses plain HTTP to another machine, so the API key is sent unencrypted. Use https:// if the bot has it.`,
	);
}

/**
 * Whether a Server URL sends requests over plain HTTP to a host other than this machine.
 * @param serverUrl The Server URL as saved.
 * @returns True for `http://` to a non-loopback host; false for https, loopback or an invalid URL.
 */
export function isPlainHttpToRemote(serverUrl: string): boolean {
	const baseUrl = normalizeServerUrl(serverUrl);
	return baseUrl !== null && isPlainHttpUrlToRemote(new URL(baseUrl));
}

/**
 * Whether a parsed URL is plain HTTP to a host other than this machine.
 * @param url A normalised Server URL.
 * @returns True for `http:` to a non-loopback host.
 */
function isPlainHttpUrlToRemote(url: URL): boolean {
	return url.protocol === "http:" && !isLoopbackHost(url.hostname);
}

/**
 * Identifies the bot and key a request or list belongs to, so a settings change doesn't reuse a
 * result fetched for another bot or key. The Server URL is normalised first, so a cosmetic edit
 * (a trailing slash, an explicit default scheme) still counts as the same bot.
 * @param conn Server URL and API key.
 * @returns The normalised Server URL (or the raw one if it's invalid) and the API key, joined by a
 *   newline, for equality checks.
 */
export function connectionKey(conn: Connection): string {
	return `${normalizeServerUrl(conn.serverUrl) ?? conn.serverUrl}\n${conn.apiKey}`;
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
 * @returns `http` for a loopback host, otherwise `https` (including when the host can't be parsed).
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
 * @returns True for `localhost`, `[::1]` or a `127.x.x.x` address.
 */
export function isLoopbackHost(host: string): boolean {
	return host === "localhost" || host === "[::1]" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}
