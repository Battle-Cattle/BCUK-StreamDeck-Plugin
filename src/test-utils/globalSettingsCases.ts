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
 * Cases for reading global settings, run against both the plugin's migrateGlobalSettings
 * (src/api.ts) and the property inspector's copy (ui/pi-common.js), so the two can't drift apart.
 */
export const globalSettingsCases: GlobalSettingsCase[] = [
	{ name: "empty settings", raw: {}, expected: { serverUrl: "", apiKey: "" } },
	{
		name: "a saved serverUrl wins over legacy host/port",
		raw: { serverUrl: "https://a.example", host: "old", port: 1, apiKey: "k" },
		expected: { serverUrl: "https://a.example", apiKey: "k" },
	},
	{
		name: "a saved serverUrl is trimmed",
		raw: { serverUrl: "  https://a.example  ", apiKey: "k" },
		expected: { serverUrl: "https://a.example", apiKey: "k" },
	},
	{
		name: "a blank serverUrl falls back to legacy host/port",
		raw: { serverUrl: "   ", host: "bot.lan", port: 3001 },
		expected: { serverUrl: "http://bot.lan:3001", apiKey: "" },
	},
	{
		name: "legacy host/port becomes a plain-HTTP URL",
		raw: { host: "bot.lan", port: 3001, apiKey: "k" },
		expected: { serverUrl: "http://bot.lan:3001", apiKey: "k" },
	},
	{ name: "the legacy host is trimmed", raw: { host: " bot.lan " }, expected: { serverUrl: "http://bot.lan:3000", apiKey: "" } },
	{ name: "the legacy port defaults to 3000", raw: { host: "bot.lan" }, expected: { serverUrl: "http://bot.lan:3000", apiKey: "" } },
	{
		name: "a non-numeric legacy port defaults to 3000",
		raw: { host: "bot.lan", port: "3001" },
		expected: { serverUrl: "http://bot.lan:3000", apiKey: "" },
	},
	{ name: "a blank legacy host is ignored", raw: { host: "  ", port: 3001 }, expected: { serverUrl: "", apiKey: "" } },
	{
		name: "non-string values are ignored",
		raw: { serverUrl: 5, host: true, apiKey: 7 },
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
