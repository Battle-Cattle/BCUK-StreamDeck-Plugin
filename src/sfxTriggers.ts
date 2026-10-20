import type { JsonObject, JsonValue } from "@elgato/utils";
import { asObject, asString } from "./json";

/**
 * The fields Play SFX's dropdown needs; the bot's listing also includes each trigger's files,
 * description etc., which the plugin never uses.
 */
export interface SfxTrigger extends JsonObject {
	[key: string]: JsonValue;
	triggerCommand: string;
	categoryName: string | null;
}

/**
 * Reduces a trigger listing (from the bot, or legacy per-button settings) to the fields the
 * property inspector uses, dropping anything malformed.
 * @param raw The `triggers` field of the bot's `/sfx` response, or a legacy `cachedTriggers`.
 * @returns Entries with a non-empty `triggerCommand` (category null when missing), or an empty
 *   list if `raw` isn't an array.
 */
export function toSfxTriggers(raw: JsonValue | undefined): SfxTrigger[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((item) => {
		const trigger = asObject(item);
		const triggerCommand = asString(trigger?.triggerCommand);
		return triggerCommand ? [{ triggerCommand, categoryName: asString(trigger?.categoryName) }] : [];
	});
}
