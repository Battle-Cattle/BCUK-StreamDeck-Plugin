import type { JsonObject, JsonValue } from "@elgato/utils";
import streamDeck from "@elgato/streamdeck";
import { type Connection, warnIfInsecure } from "./serverUrl";

/** Plugin-wide settings shared by every action, edited from any action's property inspector. */
export interface GlobalSettings extends JsonObject {
	[key: string]: JsonValue;
	serverUrl: string;
	apiKey: string;
}

let globalSettings: GlobalSettings = { serverUrl: "", apiKey: "" };
let globalSettingsLoaded = false;
const globalSettingsListeners = new Set<() => void>();

/**
 * Starts tracking the global settings. Call once, before `streamDeck.connect()`. Stream Deck sends
 * them in reply to the initial request and again whenever a property inspector saves, so the cached
 * copy stays current.
 */
export function initGlobalSettings(): void {
	streamDeck.settings.onDidReceiveGlobalSettings((ev) => applyGlobalSettings(ev.settings));
	streamDeck.settings.getGlobalSettings().then(
		// A save that arrived while the request was in flight is newer, so the reply mustn't replace it.
		(settings) => {
			if (!globalSettingsLoaded) applyGlobalSettings(settings);
		},
		(err: unknown) => streamDeck.logger.error(`Couldn't read the global settings: ${String(err)}`),
	);
}

/**
 * Caches a delivery of the global settings and tells the listeners.
 * @param raw The settings as stored by Stream Deck.
 */
function applyGlobalSettings(raw: JsonObject): void {
	globalSettings = readGlobalSettings(raw);
	globalSettingsLoaded = true;
	warnIfInsecure(globalSettings.serverUrl);
	for (const listener of globalSettingsListeners) listener();
}

/**
 * Whether the global settings have been received from Stream Deck yet.
 * @returns True once the first global-settings delivery has arrived.
 */
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

/**
 * The current connection details from the global settings.
 * @returns The saved Server URL and API key (empty strings until they're set or received).
 */
export function getConnection(): Connection {
	return { serverUrl: globalSettings.serverUrl, apiKey: globalSettings.apiKey };
}

/**
 * Reads raw global settings, ignoring fields of the wrong type.
 * @param raw Settings as stored by Stream Deck.
 * @returns The trimmed Server URL and the API key, each empty if unset.
 */
export function readGlobalSettings(raw: JsonObject): GlobalSettings {
	return {
		serverUrl: typeof raw.serverUrl === "string" ? raw.serverUrl.trim() : "",
		apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
	};
}
