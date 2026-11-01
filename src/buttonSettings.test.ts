import { describe, expect, it, vi } from "vitest";
import { fillMissingSettings } from "./buttonSettings";

function fakeKey() {
	return { setSettings: vi.fn(() => Promise.resolve()) };
}

describe("fillMissingSettings", () => {
	it("gives a new button every default", async () => {
		const key = fakeKey();
		expect(await fillMissingSettings(key, {}, { channelId: "", guildId: "" })).toBe(true);
		expect(key.setSettings).toHaveBeenCalledWith({ channelId: "", guildId: "" });
	});

	it("keeps the fields a button already has and fills in the rest", async () => {
		const key = fakeKey();
		expect(await fillMissingSettings(key, { channelId: "c1" }, { channelId: "", guildId: "" })).toBe(true);
		expect(key.setSettings).toHaveBeenCalledWith({ channelId: "c1", guildId: "" });
	});

	it("leaves settings that have every field alone, even blank ones", async () => {
		const key = fakeKey();
		expect(await fillMissingSettings(key, { channelId: "", guildId: "" }, { channelId: "", guildId: "" })).toBe(false);
		expect(key.setSettings).not.toHaveBeenCalled();
	});
});
