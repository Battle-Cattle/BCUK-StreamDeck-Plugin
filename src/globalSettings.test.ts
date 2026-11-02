import { describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "./test-utils/streamdeckMock";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());

import streamDeck from "@elgato/streamdeck";
import { initGlobalSettings, readGlobalSettings } from "./globalSettings";

describe("readGlobalSettings", () => {
	it("reads a saved Server URL and API key", () => {
		expect(readGlobalSettings({ serverUrl: " https://a.example ", apiKey: "k" }))
			.toEqual({ serverUrl: "https://a.example", apiKey: "k" });
	});

	it("no longer builds a URL from the pre-1.2 host/port fields", () => {
		expect(readGlobalSettings({ host: "bot.lan", port: 3001, apiKey: "k" })).toEqual({ serverUrl: "", apiKey: "k" });
	});
});

describe("initGlobalSettings", () => {
	it("warns when a delivery sends the API key over plain HTTP to another machine", () => {
		initGlobalSettings();
		const onSettings = vi.mocked(streamDeck.settings.onDidReceiveGlobalSettings).mock.calls.at(-1)![0] as (
			ev: { settings: Record<string, unknown> },
		) => void;
		vi.mocked(streamDeck.logger.warn).mockClear();

		onSettings({ settings: { serverUrl: "http://bot.lan:3000", apiKey: "k" } });
		expect(streamDeck.logger.warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("http://bot.lan:3000"));

		onSettings({ settings: { serverUrl: "https://bot.example.com", apiKey: "k" } });
		expect(streamDeck.logger.warn).toHaveBeenCalledTimes(1);
	});
});

describe("initGlobalSettings's initial request", () => {
	// Fresh copies of the module and its streamDeck mock, so no earlier delivery has been cached.
	async function freshApi() {
		vi.resetModules();
		const { default: sd } = await import("@elgato/streamdeck");
		const api = await import("./globalSettings");
		return { sd, api };
	}

	it("uses the reply, without relying on it firing onDidReceiveGlobalSettings", async () => {
		const { sd, api } = await freshApi();
		vi.mocked(sd.settings.getGlobalSettings).mockResolvedValueOnce({ serverUrl: "https://reply.example", apiKey: "r" });
		expect(api.hasGlobalSettings()).toBe(false);
		api.initGlobalSettings();
		await vi.waitFor(() => expect(api.getConnection()).toEqual({ serverUrl: "https://reply.example", apiKey: "r" }));
		expect(api.hasGlobalSettings()).toBe(true);
	});

	it("keeps a save that arrives before the reply", async () => {
		const { sd, api } = await freshApi();
		let reply: ((settings: Record<string, string>) => void) | undefined;
		vi.mocked(sd.settings.getGlobalSettings).mockReturnValueOnce(new Promise((resolve) => { reply = resolve; }) as never);
		api.initGlobalSettings();
		const onSettings = vi.mocked(sd.settings.onDidReceiveGlobalSettings).mock.calls.at(-1)?.[0] as
			| ((ev: { settings: Record<string, unknown> }) => void)
			| undefined;
		if (!onSettings || !reply) throw new Error("initGlobalSettings didn't register a listener and request the settings");
		onSettings({ settings: { serverUrl: "https://saved.example", apiKey: "new" } });
		reply({ serverUrl: "https://stale.example", apiKey: "old" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(api.getConnection()).toEqual({ serverUrl: "https://saved.example", apiKey: "new" });
	});

	it("tells each listener about every delivery", async () => {
		const { sd, api } = await freshApi();
		const listener = vi.fn(() => api.getConnection());
		api.onGlobalSettingsChanged(listener);
		api.initGlobalSettings();
		const onSettings = vi.mocked(sd.settings.onDidReceiveGlobalSettings).mock.calls.at(-1)![0] as (
			ev: { settings: Record<string, unknown> },
		) => void;
		onSettings({ settings: { serverUrl: "https://one.example", apiKey: "1" } });
		onSettings({ settings: { serverUrl: "https://two.example", apiKey: "2" } });
		await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
		expect(listener.mock.results.map((r) => r.value)).toEqual([
			{ serverUrl: "https://one.example", apiKey: "1" },
			{ serverUrl: "https://two.example", apiKey: "2" },
		]);
	});

	it("logs a failed request", async () => {
		const { sd, api } = await freshApi();
		vi.mocked(sd.settings.getGlobalSettings).mockRejectedValueOnce(new Error("socket closed"));
		api.initGlobalSettings();
		await vi.waitFor(() => expect(sd.logger.error).toHaveBeenCalledWith(expect.stringContaining("socket closed")));
	});
});
