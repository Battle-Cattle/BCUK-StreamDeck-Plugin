import type { JsonObject } from "@elgato/utils";

/** The part of a Stream Deck action instance that saves its per-button settings. */
export interface SettingsKey<T extends JsonObject> {
	setSettings(settings: T): Promise<void>;
}

/**
 * Gives a button any of `defaults`' fields its settings lack (a new button's settings are `{}`), so
 * later events carry the expected shape. Settings that already have every field are left alone, so
 * an unconfigured button isn't rewritten each time it appears.
 * @param key The button whose settings to fill in.
 * @param settings The button's saved settings, possibly missing fields.
 * @param defaults The value for each field the settings must have.
 * @returns True if the settings were missing a field and have been saved with the defaults.
 */
export async function fillMissingSettings<T extends JsonObject>(
	key: SettingsKey<T>,
	settings: Partial<T>,
	defaults: T,
): Promise<boolean> {
	if (Object.keys(defaults).every((field) => field in settings)) return false;
	await key.setSettings({ ...defaults, ...settings });
	return true;
}
