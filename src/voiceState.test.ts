import { describe, expect, it } from "vitest";
import { getLastJoinedGuildId, setLastJoinedGuildId } from "./voiceState";

describe("voiceState", () => {
	it("starts unknown, remembers the last joined guild, and can be cleared", () => {
		expect(getLastJoinedGuildId()).toBeNull();

		setLastJoinedGuildId("g1");
		expect(getLastJoinedGuildId()).toBe("g1");

		setLastJoinedGuildId("g2");
		expect(getLastJoinedGuildId()).toBe("g2");

		setLastJoinedGuildId(null);
		expect(getLastJoinedGuildId()).toBeNull();
	});
});
