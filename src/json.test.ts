import { describe, expect, it } from "vitest";
import { asObject, asString } from "./json";

describe("asObject", () => {
	it("accepts plain objects only", () => {
		expect(asObject({ a: 1 })).toEqual({ a: 1 });
		expect(asObject(null)).toBeNull();
		expect(asObject([1])).toBeNull();
		expect(asObject("x")).toBeNull();
		expect(asObject(undefined)).toBeNull();
	});
});

describe("asString", () => {
	it("accepts strings only", () => {
		expect(asString("x")).toBe("x");
		expect(asString(1)).toBeNull();
		expect(asString(undefined)).toBeNull();
	});
});
