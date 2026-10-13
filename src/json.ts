import type { JsonObject, JsonValue } from "@elgato/utils";

/** Narrows a JSON value to a plain object (not null, not an array), or returns null. */
export function asObject(value: JsonValue | undefined): JsonObject | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/** Returns `value` if it is a string, otherwise null. */
export function asString(value: JsonValue | undefined): string | null {
	return typeof value === "string" ? value : null;
}
