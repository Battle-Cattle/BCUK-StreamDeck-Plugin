import type { JsonObject, JsonValue } from "@elgato/utils";

/**
 * Narrows a JSON value to a plain object (not null, not an array), or returns null.
 * @param value Any JSON value, or undefined for a missing field.
 * @returns `value` as an object, or null when it's missing, null, a primitive or an array.
 */
export function asObject(value: JsonValue | undefined): JsonObject | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/**
 * Returns `value` if it is a string, otherwise null.
 * @param value Any JSON value, or undefined for a missing field.
 * @returns `value` when it's a string (even empty), otherwise null.
 */
export function asString(value: JsonValue | undefined): string | null {
	return typeof value === "string" ? value : null;
}
