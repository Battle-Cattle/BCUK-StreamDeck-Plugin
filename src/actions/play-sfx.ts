import type { JsonObject, JsonValue } from "@elgato/utils";
import { action, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { QUICK_KEY_PRESS_TIMEOUT_MS } from "../apiClient";
import { InspectorCatalog } from "../inspectorCatalog";
import { alertNotConfigured, pressRequest } from "../keyRequest";
import { fillMissingSettings } from "../buttonSettings";
import { type SfxTrigger, toSfxTriggers } from "../sfxTriggers";
import { CatalogAction } from "./catalogAction";

// Only the chosen command lives in per-button settings. Stream Deck sends a button's full
// settings with every keyDown/keyUp/willAppear event, so anything stored here is re-sent (and
// re-parsed) on every press. The trigger list for the dropdown lives in `catalog` instead.
interface PlaySfxSettings extends JsonObject {
	[key: string]: JsonValue;
	command: string;
}

@action({ UUID: "com.expiredminotaur.bcuk.play" })
export class PlaySfxAction extends CatalogAction<PlaySfxSettings, SfxTrigger> {
	/** Creates the action with its SFX command dropdown list. */
	constructor() {
		super(
			new InspectorCatalog<SfxTrigger>({
				label: "commands",
				path: "/sfx",
				parse: (body) => (Array.isArray(body.triggers) ? toSfxTriggers(body.triggers) : null),
				loadedEvent: "commandsLoaded",
				errorEvent: "commandsError",
				listKey: "triggers",
			}),
			"refreshCommands",
		);
	}

	/**
	 * Plays the button's configured command on the bot, showing OK or an alert on the key.
	 * @param ev The key press, carrying the button's chosen SFX command.
	 */
	override async onKeyDown(ev: KeyDownEvent<PlaySfxSettings>): Promise<void> {
		const { command } = ev.payload.settings;
		if (!command) {
			await alertNotConfigured(ev.action, "Play SFX: no command configured.");
			return;
		}
		await pressRequest(ev.action, { label: `Play SFX "${command}"`, path: "/sfx", body: { command }, timeoutMs: QUICK_KEY_PRESS_TIMEOUT_MS });
	}

	/**
	 * Gives a new button an empty command setting, so later events carry the expected shape.
	 * @param ev The appearance event, carrying the button's saved settings (`{}` on a new button).
	 */
	override async onWillAppear(ev: WillAppearEvent<PlaySfxSettings>): Promise<void> {
		await fillMissingSettings(ev.action, ev.payload.settings, { command: "" });
	}
}
