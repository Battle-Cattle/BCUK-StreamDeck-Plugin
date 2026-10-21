import type { JsonObject, JsonValue } from "@elgato/utils";
import {
	action,
	type KeyDownEvent,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import { triggerCommand } from "../advancedCommandKeys";
import { createAdvancedCommandCatalog } from "./advancedCommandCatalog";

// Per-button settings: just the chosen command's id (as the dropdown's string value). The
// command list lives in `catalog` — see play-sfx.ts for why.
interface CommandSettings extends JsonObject {
	[key: string]: JsonValue;
	commandId: string;
}

// A message from the property inspector. Its payload is whatever JSON the page sent, so the
// handler checks `event` rather than trusting it to be "refreshCommands".
type PiToPluginMsg = { event: string; serverUrl: string; apiKey: string };

@action({ UUID: "com.expiredminotaur.bcuk.command" })
export class TriggerCommandAction extends SingletonAction<CommandSettings> {
	private readonly catalog = createAdvancedCommandCatalog();

	/**
	 * Fires the button's advanced command on the bot for free (see `triggerCommand`).
	 * @param ev The key press, carrying the button's saved command id.
	 */
	override async onKeyDown(ev: KeyDownEvent<CommandSettings>): Promise<void> {
		await triggerCommand(ev.action, ev.payload.settings.commandId);
	}

	/**
	 * Gives a new button an empty command setting, so later events carry the expected shape.
	 * @param ev The appearance event, carrying the button's saved settings (`{}` on a new button).
	 */
	override async onWillAppear(ev: WillAppearEvent<CommandSettings>): Promise<void> {
		if (!("commandId" in ev.payload.settings)) {
			await ev.action.setSettings({ commandId: "" });
		}
	}

	/** Sends the command list to a newly opened property inspector, fetching it first if needed. */
	override async onPropertyInspectorDidAppear(): Promise<void> {
		await this.catalog.show();
	}

	/**
	 * Handles the property inspector's "Refresh Commands" request.
	 * @param ev The inspector's message: its event name and the Server URL and API key in its form.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<PiToPluginMsg, CommandSettings>): Promise<void> {
		if (ev.payload.event === "refreshCommands") {
			await this.catalog.refresh({ serverUrl: ev.payload.serverUrl, apiKey: ev.payload.apiKey });
		}
	}
}
