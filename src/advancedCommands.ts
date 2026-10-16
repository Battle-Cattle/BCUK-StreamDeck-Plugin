import type { JsonObject, JsonValue } from "@elgato/utils";
import { asObject, asString } from "./json";

/** One of the key owner's advanced commands, as offered in the Trigger/Toggle Command dropdowns. */
export interface AdvancedCommand extends JsonObject {
	[key: string]: JsonValue;
	id: number;
	name: string;
	trigger: string | null;
	pointCost: number;
	isEnabled: boolean;
}

/**
 * Reduces the bot's `/advanced-commands` listing to the fields the plugin uses, dropping
 * anything malformed.
 * @param raw The `commands` field of the bot's response.
 */
export function toAdvancedCommands(raw: JsonValue | undefined): AdvancedCommand[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((item) => {
		const command = asObject(item);
		const id = command?.id;
		const name = asString(command?.name);
		if (typeof id !== "number" || !Number.isInteger(id) || id <= 0 || !name) return [];
		const pointCost = command?.pointCost;
		return [{
			id,
			name,
			trigger: asString(command?.trigger),
			pointCost: typeof pointCost === "number" ? pointCost : 0,
			isEnabled: command?.isEnabled === true,
		}];
	});
}

/**
 * Parses a button's saved command id (stored as a string, the dropdown's value).
 * @param value The saved setting.
 * @returns The id, or null when none is chosen.
 */
export function parseCommandId(value: JsonValue | undefined): number | null {
	const id = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}
