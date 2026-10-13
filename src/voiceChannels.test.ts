import { describe, expect, it } from "vitest";
import { flattenGuildChannels } from "./voiceChannels";

describe("flattenGuildChannels", () => {
	it("flattens the bot's per-guild listing, tagging each channel with its guild", () => {
		const guilds = [
			{ guildId: "1", channels: [{ id: "10", name: "General" }, { id: "11", name: "Gaming" }] },
			{ guildId: "2", guildName: "Other", channels: [{ id: "20", name: "Lobby" }] },
		];
		expect(flattenGuildChannels(guilds)).toEqual([
			{ id: "10", name: "General", guildId: "1", guildName: null },
			{ id: "11", name: "Gaming", guildId: "1", guildName: null },
			{ id: "20", name: "Lobby", guildId: "2", guildName: "Other" },
		]);
	});

	it("skips malformed guilds and channels", () => {
		const guilds = [
			null,
			{ guildId: 3, channels: [] },
			{ guildId: "4", channels: "nope" },
			{ guildId: "5", channels: [{ id: "50" }, { id: "51", name: "Ok" }, ["x"]] },
		];
		expect(flattenGuildChannels(guilds)).toEqual([{ id: "51", name: "Ok", guildId: "5", guildName: null }]);
	});

	it("returns nothing for a response without a guilds array", () => {
		expect(flattenGuildChannels(undefined)).toEqual([]);
	});
});
