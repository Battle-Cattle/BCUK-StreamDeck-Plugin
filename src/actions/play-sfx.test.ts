import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "../test-utils/streamdeckMock";
import { type CatalogSpy, fakeAction, fakeEvent } from "../test-utils/actionMocks";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());
vi.mock("../apiClient", async () => (await import("../test-utils/actionMocks")).apiClientModuleMock());
vi.mock("../globalSettings", async () => (await import("../test-utils/actionMocks")).globalSettingsModuleMock());
const catalogs = vi.hoisted(() => ({ instances: [] as CatalogSpy[] }));
vi.mock("../inspectorCatalog", async () => (await import("../test-utils/actionMocks")).inspectorCatalogModuleMock(catalogs.instances));

import { apiRequest, logFailure } from "../apiClient";
import { PlaySfxAction } from "./play-sfx";

beforeEach(() => vi.clearAllMocks());

describe("PlaySfxAction", () => {
	it("plays the configured command with the quick timeout", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: {} });
		const action = fakeAction();

		await new PlaySfxAction().onKeyDown(fakeEvent({ settings: { command: "!clap" } }, action));

		expect(apiRequest).toHaveBeenCalledWith(expect.anything(), "/sfx", { command: "!clap" }, 5000);
		expect(action.showOk).toHaveBeenCalled();
	});

	it("alerts without a command, without calling the bot", async () => {
		const action = fakeAction();

		await new PlaySfxAction().onKeyDown(fakeEvent({ settings: { command: "" } }, action));

		expect(action.showAlert).toHaveBeenCalled();
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it("alerts and logs a failed play", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: false, status: 404, error: "unknown_command" });
		const action = fakeAction();

		await new PlaySfxAction().onKeyDown(fakeEvent({ settings: { command: "!gone" } }, action));

		expect(action.showAlert).toHaveBeenCalled();
		expect(logFailure).toHaveBeenCalledWith('Play SFX "!gone"', expect.objectContaining({ ok: false }));
	});

	it("gives a new button an empty command, and leaves a current one alone", async () => {
		const sfx = new PlaySfxAction();
		const fresh = fakeAction();
		const current = fakeAction();

		await sfx.onWillAppear(fakeEvent({ settings: {} }, fresh));
		await sfx.onWillAppear(fakeEvent({ settings: { command: "" } }, current));

		expect(fresh.setSettings).toHaveBeenCalledWith({ command: "" });
		expect(current.setSettings).not.toHaveBeenCalled();
	});

	it("sends its catalog to the property inspector and refreshes it only on request", async () => {
		const sfx = new PlaySfxAction();
		const catalog = catalogs.instances.at(-1)!;

		await sfx.onPropertyInspectorDidAppear();
		await sfx.onSendToPlugin(fakeEvent({ event: "refreshCommands", serverUrl: "https://bot.example", apiKey: "k" }));
		await sfx.onSendToPlugin(fakeEvent({ event: "refreshChannels", serverUrl: "x", apiKey: "y" }));

		expect(catalog.show).toHaveBeenCalledTimes(1);
		expect(catalog.refresh).toHaveBeenCalledExactlyOnceWith({ serverUrl: "https://bot.example", apiKey: "k" });
	});
});
