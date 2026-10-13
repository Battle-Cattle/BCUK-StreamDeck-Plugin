import { describe, expect, it } from "vitest";
import { toSfxTriggers } from "./sfxTriggers";

describe("toSfxTriggers", () => {
	it("keeps only the command and category of each trigger", () => {
		const raw = [
			{ triggerId: "1", triggerCommand: "!boom", categoryName: "Effects", files: [{ id: 1, file: "a.mp3" }] },
			{ triggerId: "2", triggerCommand: "!horn", categoryName: null },
		];
		expect(toSfxTriggers(raw)).toEqual([
			{ triggerCommand: "!boom", categoryName: "Effects" },
			{ triggerCommand: "!horn", categoryName: null },
		]);
	});

	it("skips malformed entries and non-array input", () => {
		expect(toSfxTriggers([null, "x", { triggerCommand: 5 }, { triggerCommand: "!ok" }]))
			.toEqual([{ triggerCommand: "!ok", categoryName: null }]);
		expect(toSfxTriggers(undefined)).toEqual([]);
		expect(toSfxTriggers({ triggers: [] })).toEqual([]);
	});
});
