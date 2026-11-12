import { describe, expect, it } from "vitest";
import { isNotReadyEverywhere, parseVideoId, type SharedVideo, toSharedVideos } from "./sharedVideos";

describe("toSharedVideos", () => {
	it("keeps the fields the dropdown uses, including readiness", () => {
		expect(toSharedVideos([{ id: 3, name: "Rickroll", ready: 4, connected: 5, extra: "x" }]))
			.toEqual([{ id: 3, name: "Rickroll", ready: 4, connected: 5 }]);
	});

	it("keeps a video from a bot that doesn't report readiness, with null counts", () => {
		expect(toSharedVideos([{ id: 3, name: "Old" }])).toEqual([{ id: 3, name: "Old", ready: null, connected: null }]);
	});

	it.each([
		[{ id: 3, name: "x", ready: 2 }],
		[{ id: 3, name: "x", connected: 2 }],
		[{ id: 3, name: "x", ready: -1, connected: 2 }],
		[{ id: 3, name: "x", ready: 1.5, connected: 2 }],
		[{ id: 3, name: "x", ready: "2", connected: 2 }],
	])("drops unusable readiness (%j) but keeps the video", (entry) => {
		expect(toSharedVideos([entry])).toEqual([{ id: 3, name: "x", ready: null, connected: null }]);
	});

	it("skips malformed entries and non-array input", () => {
		expect(toSharedVideos([null, { id: "7", name: "x" }, { id: 0, name: "x" }, { id: 1.5, name: "x" }, { id: 3 }, { id: 4, name: "" }, { id: 5, name: "ok" }]))
			.toEqual([{ id: 5, name: "ok", ready: null, connected: null }]);
		expect(toSharedVideos(undefined)).toEqual([]);
		expect(toSharedVideos({ id: 1 })).toEqual([]);
	});
});

describe("parseVideoId", () => {
	it("parses a saved positive id and rejects anything else", () => {
		expect(parseVideoId("7")).toBe(7);
		expect(parseVideoId("")).toBeNull();
		expect(parseVideoId("0")).toBeNull();
		expect(parseVideoId("7a")).toBeNull();
		expect(parseVideoId(7)).toBeNull();
		expect(parseVideoId(undefined)).toBeNull();
	});
});

describe("isNotReadyEverywhere", () => {
	const video = (ready: number | null, connected: number | null): SharedVideo => ({ id: 1, name: "v", ready, connected });

	it("is true only when readiness is known and some connected overlay lacks the video", () => {
		expect(isNotReadyEverywhere(video(4, 5))).toBe(true);
		expect(isNotReadyEverywhere(video(5, 5))).toBe(false);
		expect(isNotReadyEverywhere(video(0, 0))).toBe(false);
		expect(isNotReadyEverywhere(video(null, null))).toBe(false);
	});
});
