import type { JsonObject } from "@elgato/utils";

/** One stored-settings input and the connection both implementations must read from it. */
export interface GlobalSettingsCase {
	/** What the case covers. */
	name: string;
	/** The global settings as Stream Deck stored them. */
	raw: JsonObject;
	/** The Server URL and API key both implementations must return. */
	expected: { serverUrl: string; apiKey: string };
}

/**
 * Cases for reading global settings, run against both the plugin's readGlobalSettings
 * (src/globalSettings.ts) and the property inspector's copy (ui/pi-common.js), so the two can't drift apart.
 */
export const globalSettingsCases: GlobalSettingsCase[] = [
	{ name: "empty settings", raw: {}, expected: { serverUrl: "", apiKey: "" } },
	{
		name: "a saved serverUrl and API key",
		raw: { serverUrl: "https://a.example", apiKey: "k" },
		expected: { serverUrl: "https://a.example", apiKey: "k" },
	},
	{
		name: "a saved serverUrl is trimmed",
		raw: { serverUrl: "  https://a.example  ", apiKey: "k" },
		expected: { serverUrl: "https://a.example", apiKey: "k" },
	},
	{ name: "a blank serverUrl stays empty", raw: { serverUrl: "   ", apiKey: "k" }, expected: { serverUrl: "", apiKey: "k" } },
	{
		name: "the old host/port fields are no longer read",
		raw: { host: "bot.lan", port: 3001, apiKey: "k" },
		expected: { serverUrl: "", apiKey: "k" },
	},
	{
		name: "non-string values are ignored",
		raw: { serverUrl: 5, apiKey: 7 },
		expected: { serverUrl: "", apiKey: "" },
	},
];

/** Hostnames and whether each is loopback, run against isLoopbackHost and the PI's isLoopbackUrl. */
export const loopbackHostCases: [host: string, loopback: boolean][] = [
	["localhost", true],
	["[::1]", true],
	["127.0.0.1", true],
	["127.1.2.3", true],
	["bot.example.com", false],
	["192.168.0.10", false],
	["10.1.2.3", false],
	["172.16.0.1", false],
	["8.8.8.8", false],
	["localhost.example.com", false],
	["128.0.0.1", false],
	["[::2]", false],
];
