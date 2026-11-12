import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "../test-utils/streamdeckMock";
import { type CatalogSpy, fakeAction, fakeEvent } from "../test-utils/actionMocks";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());
vi.mock("../sharedVideoKeys", () => ({ playSharedVideo: vi.fn() }));
const catalogs = vi.hoisted(() => ({ instances: [] as CatalogSpy[], options: [] as { parse: (body: object) => unknown; path: string }[] }));
vi.mock("../inspectorCatalog", async () => {
	const { catalogMock } = await import("../test-utils/actionMocks");
	return {
		InspectorCatalog: class {
			show;
			refresh;
			constructor(options: { parse: (body: object) => unknown; path: string }) {
				const spy = catalogMock();
				this.show = spy.show;
				this.refresh = spy.refresh;
				catalogs.instances.push(spy);
				catalogs.options.push(options);
			}
		},
	};
});

import { playSharedVideo } from "../sharedVideoKeys";
import { PlaySharedVideoAction } from "./play-shared-video";

beforeEach(() => vi.clearAllMocks());

describe("PlaySharedVideoAction", () => {
	it("plays the button's video on a key press", async () => {
		const action = fakeAction();

		await new PlaySharedVideoAction().onKeyDown(fakeEvent({ settings: { videoId: "7" } }, action));

		expect(playSharedVideo).toHaveBeenCalledWith(action, "7");
	});

	it("passes a new button's empty settings through, for the key to alert on", async () => {
		const action = fakeAction();

		await new PlaySharedVideoAction().onKeyDown(fakeEvent({ settings: {} }, action));

		expect(playSharedVideo).toHaveBeenCalledWith(action, undefined);
	});

	it("gives a new button an empty video, and leaves a configured one alone", async () => {
		const play = new PlaySharedVideoAction();
		const fresh = fakeAction();
		const configured = fakeAction();

		await play.onWillAppear(fakeEvent({ settings: {} }, fresh));
		await play.onWillAppear(fakeEvent({ settings: { videoId: "7" } }, configured));

		expect(fresh.setSettings).toHaveBeenCalledWith({ videoId: "" });
		expect(configured.setSettings).not.toHaveBeenCalled();
	});

	it("fetches /shared-videos and parses its list, or reports a body without one", () => {
		new PlaySharedVideoAction();
		const { parse, path } = catalogs.options.at(-1)!;

		expect(path).toBe("/shared-videos");
		expect(parse({ videos: [{ id: 2, name: "Clip", ready: 1, connected: 2 }, { id: 0 }] })).toEqual([{ id: 2, name: "Clip", ready: 1, connected: 2 }]);
		expect(parse({})).toBeNull();
	});

	it("sends its catalog to the property inspector and refreshes it only on request", async () => {
		const play = new PlaySharedVideoAction();
		const catalog = catalogs.instances.at(-1)!;

		await play.onPropertyInspectorDidAppear();
		await play.onSendToPlugin(fakeEvent({ event: "refreshVideos", serverUrl: "https://bot.example", apiKey: "k" }));
		await play.onSendToPlugin(fakeEvent({ event: "refreshCommands", serverUrl: "x", apiKey: "y" }));

		expect(catalog.show).toHaveBeenCalledTimes(1);
		expect(catalog.refresh).toHaveBeenCalledExactlyOnceWith({ serverUrl: "https://bot.example", apiKey: "k" });
	});
});
