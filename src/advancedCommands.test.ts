import { describe, expect, it } from "vitest";
import { parseCommandId, toAdvancedCommands } from "./advancedCommands";

describe("toAdvancedCommands", () => {
	it("keeps the fields the dropdown uses", () => {
		expect(toAdvancedCommands([
			{ id: 7, name: "Hydrate", trigger: "!hydrate", pointCost: 100, isEnabled: true, extra: "x" },
			{ id: 8, name: "Lights", trigger: null, isEnabled: false },
		])).toEqual([
			{ id: 7, name: "Hydrate", trigger: "!hydrate", pointCost: 100, isEnabled: true },
			{ id: 8, name: "Lights", trigger: null, pointCost: 0, isEnabled: false },
		]);
	});

	it("skips malformed entries and non-array input", () => {
		expect(toAdvancedCommands([null, { id: "7", name: "x" }, { id: 0, name: "x" }, { id: 1.5, name: "x" }, { id: 3 }, { id: 4, name: "ok" }]))
			.toEqual([{ id: 4, name: "ok", trigger: null, pointCost: 0, isEnabled: false }]);
		expect(toAdvancedCommands(undefined)).toEqual([]);
	});
});

describe("parseCommandId", () => {
	it("parses a saved positive id and rejects anything else", () => {
		expect(parseCommandId("7")).toBe(7);
		expect(parseCommandId("")).toBeNull();
		expect(parseCommandId("0")).toBeNull();
		expect(parseCommandId("7a")).toBeNull();
		expect(parseCommandId(7)).toBeNull();
		expect(parseCommandId(undefined)).toBeNull();
	});
});
