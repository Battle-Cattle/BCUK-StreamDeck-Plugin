import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "../test-utils/streamdeckMock";
import { type CatalogSpy, fakeAction, fakeEvent } from "../test-utils/actionMocks";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());
vi.mock("../api", async () => (await import("../test-utils/actionMocks")).apiModuleMock());
const catalogs = vi.hoisted(() => ({ instances: [] as CatalogSpy[] }));
vi.mock("../inspectorCatalog", async () => (await import("../test-utils/actionMocks")).inspectorCatalogModuleMock(catalogs.instances));

import { apiRequest, logFailure } from "../api";
import { getLastJoinedGuildId, setLastJoinedGuildId } from "../voiceState";
import { JoinVoiceAction } from "./join-voice";

beforeEach(() => {
	vi.clearAllMocks();
	setLastJoinedGuildId(null);
});

describe("JoinVoiceAction", () => {
	it("joins the configured channel and remembers its server for Leave Voice", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: {} });
		const action = fakeAction();

		await new JoinVoiceAction().onKeyDown(fakeEvent({ settings: { channelId: "c1", guildId: "g1" } }, action));

		expect(apiRequest).toHaveBeenCalledWith(expect.anything(), "/voice/join", { channelId: "c1" });
		expect(action.showOk).toHaveBeenCalled();
		expect(getLastJoinedGuildId()).toBe("g1");
	});

	it("alerts without a channel, without calling the bot", async () => {
		const action = fakeAction();

		await new JoinVoiceAction().onKeyDown(fakeEvent({ settings: { channelId: "", guildId: "" } }, action));

		expect(action.showAlert).toHaveBeenCalled();
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it("alerts on a failed join and keeps the previous server", async () => {
		setLastJoinedGuildId("g0");
		vi.mocked(apiRequest).mockResolvedValue({ ok: false, status: 404, error: "not_found" });
		const action = fakeAction();

		await new JoinVoiceAction().onKeyDown(fakeEvent({ settings: { channelId: "c1", guildId: "g1" } }, action));

		expect(action.showAlert).toHaveBeenCalled();
		expect(logFailure).toHaveBeenCalledWith("Join Voice", expect.objectContaining({ ok: false }));
		expect(getLastJoinedGuildId()).toBe("g0");
	});

	it("forgets the server after joining a channel saved without one", async () => {
		setLastJoinedGuildId("g0");
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: {} });

		await new JoinVoiceAction().onKeyDown(fakeEvent({ settings: { channelId: "c1", guildId: "" } }));

		expect(getLastJoinedGuildId()).toBeNull();
	});

	it.each([
		["a new button", {}, { channelId: "", guildId: "" }],
		["a pre-1.2 button with its channel list", { channelId: "c1", guildId: "g1", cachedChannels: [] }, { channelId: "c1", guildId: "g1" }],
		["a button saved without its server", { channelId: "c1" }, { channelId: "c1", guildId: "" }],
	])("migrates %s to the current settings shape", async (_name, settings, expected) => {
		const action = fakeAction();

		await new JoinVoiceAction().onWillAppear(fakeEvent({ settings }, action));

		expect(action.setSettings).toHaveBeenCalledWith(expected);
	});

	it("drops a legacy channel list without seeding the catalog from it", async () => {
		const join = new JoinVoiceAction();
		const catalog = catalogs.instances.at(-1)!;
		const cachedChannels = [{ id: "c1", name: "General" }];

		await join.onWillAppear(fakeEvent({ settings: { channelId: "c1", guildId: "g1", cachedChannels } }));

		expect(catalog.seed).not.toHaveBeenCalled();
	});

	it("leaves current settings alone, even with no channel chosen", async () => {
		const action = fakeAction();

		await new JoinVoiceAction().onWillAppear(fakeEvent({ settings: { channelId: "", guildId: "" } }, action));

		expect(action.setSettings).not.toHaveBeenCalled();
	});

	it("sends its catalog to the property inspector and refreshes it on request", async () => {
		const join = new JoinVoiceAction();
		const catalog = catalogs.instances.at(-1)!;

		await join.onPropertyInspectorDidAppear();
		await join.onSendToPlugin(fakeEvent({ event: "refreshChannels", serverUrl: "https://new.example", apiKey: "k2" }));
		await join.onSendToPlugin(fakeEvent({ event: "somethingElse", serverUrl: "x", apiKey: "y" }));

		expect(catalog.show).toHaveBeenCalledTimes(1);
		expect(catalog.refresh).toHaveBeenCalledTimes(1);
		expect(catalog.refresh).toHaveBeenCalledWith({ serverUrl: "https://new.example", apiKey: "k2" });
	});
});
