import type { JsonObject, JsonValue } from "@elgato/utils";
import { asObject, asString } from "./json";

/** A voice channel offered in Join Voice's dropdown, tagged with the server it belongs to. */
export interface VoiceChannel extends JsonObject {
	[key: string]: JsonValue;
	id: string;
	name: string;
	guildId: string;
	guildName: string | null;
}

/**
 * Flattens the bot's `guilds: [{ guildId, guildName?, channels: [{ id, name }] }]` listing into
 * one channel list, each tagged with its guild. Malformed entries are skipped.
 * @param raw The `guilds` field of the bot's `/voice/channels` response.
 * @returns Every well-formed channel of every well-formed guild, or an empty list if `raw`
 *   isn't an array.
 */
export function flattenGuildChannels(raw: JsonValue | undefined): VoiceChannel[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((guild) => parseGuild(guild));
}

/**
 * Parses one guild entry into its channels, or none if the entry is malformed.
 * @param raw One entry of the `guilds` list.
 * @returns The guild's well-formed channels tagged with its id and name; empty if it lacks a
 *   `guildId` or `channels` array.
 */
function parseGuild(raw: JsonValue): VoiceChannel[] {
	const guild = asObject(raw);
	const guildId = asString(guild?.guildId);
	const channels = guild?.channels;
	if (!guild || !guildId || !Array.isArray(channels)) return [];
	const guildName = asString(guild.guildName);
	return channels.flatMap((channel) => parseChannel(channel, guildId, guildName));
}

/**
 * Parses one channel entry, returning it as a one-element list, or an empty list if malformed.
 * @param raw One entry of a guild's `channels` list.
 * @param guildId The id of the guild the channel belongs to.
 * @param guildName The guild's name, or null if the bot didn't send one.
 * @returns The channel tagged with its guild, or an empty list when it lacks a string `id` or `name`.
 */
function parseChannel(raw: JsonValue, guildId: string, guildName: string | null): VoiceChannel[] {
	const channel = asObject(raw);
	const id = asString(channel?.id);
	const name = asString(channel?.name);
	return id && name ? [{ id, name, guildId, guildName }] : [];
}
