import type { JsonObject, JsonValue } from "@elgato/utils";
import { asObject, asString } from "./json";

/** One enabled shared video, as offered in the Play Shared Video dropdown. */
export interface SharedVideo extends JsonObject {
	[key: string]: JsonValue;
	id: number;
	name: string;
	/** Connected shared overlays that have the video stored, or null from a bot that doesn't report it. */
	ready: number | null;
	/** Shared overlays connected right now, or null from a bot that doesn't report it. */
	connected: number | null;
}

/**
 * Reads a non-negative whole number from an optional readiness field.
 * @param value The field from the bot's response.
 * @returns The count, or null when it's missing or not a non-negative integer.
 */
function toCount(value: JsonValue | undefined): number | null {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Reduces the bot's `/shared-videos` listing to the fields the plugin uses, dropping anything
 * malformed. `ready` and `connected` are additive fields, so an older bot's entries (without them)
 * are kept, with both counts null; a count that is only half there is dropped as unusable.
 * @param raw The `videos` field of the bot's response.
 * @returns The well-formed videos (positive integer id and non-empty name), or an empty list if
 *   `raw` isn't an array.
 */
export function toSharedVideos(raw: JsonValue | undefined): SharedVideo[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((item) => {
		const video = asObject(item);
		const id = video?.id;
		const name = asString(video?.name);
		if (typeof id !== "number" || !Number.isInteger(id) || id <= 0 || !name) return [];
		const ready = toCount(video?.ready);
		const connected = toCount(video?.connected);
		const both = ready !== null && connected !== null;
		return [{ id, name, ready: both ? ready : null, connected: both ? connected : null }];
	});
}

/**
 * Parses a button's saved video id (stored as a string, the dropdown's value).
 * @param value The saved setting.
 * @returns The id, or null when none is chosen.
 */
export function parseVideoId(value: JsonValue | undefined): number | null {
	const id = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Whether some connected overlay doesn't have the video stored yet. Such a video still plays (the
 * overlay downloads it at full speed instead), but it may start late there.
 * @param video The video.
 * @returns True when readiness is known, an overlay is connected and not all of them have it.
 */
export function isNotReadyEverywhere(video: SharedVideo): boolean {
	return video.ready !== null && video.connected !== null && video.connected > 0 && video.ready < video.connected;
}
