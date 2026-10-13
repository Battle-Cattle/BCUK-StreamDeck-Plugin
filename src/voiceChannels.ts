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
 */
export function flattenGuildChannels(raw: JsonValue | undefined): VoiceChannel[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((guild) => parseGuild(guild));
}

/** Parses one guild entry into its channels, or none if the entry is malformed. */
function parseGuild(raw: JsonValue): VoiceChannel[] {
	const guild = asObject(raw);
	const guildId = asString(guild?.guildId);
	const channels = guild?.channels;
	if (!guild || !guildId || !Array.isArray(channels)) return [];
	const guildName = asString(guild.guildName);
	return channels.flatMap((channel) => parseChannel(channel, guildId, guildName));
}

/** Parses one channel entry, returning it as a one-element list, or an empty list if malformed. */
function parseChannel(raw: JsonValue, guildId: string, guildName: string | null): VoiceChannel[] {
	const channel = asObject(raw);
	const id = asString(channel?.id);
	const name = asString(channel?.name);
	return id && name ? [{ id, name, guildId, guildName }] : [];
}
