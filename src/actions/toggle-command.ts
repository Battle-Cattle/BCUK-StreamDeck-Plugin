import type { JsonObject, JsonValue } from "@elgato/utils";
import {
	action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import { syncToggleState, toggleCommand } from "../advancedCommandKeys";
import { createAdvancedCommandCatalog } from "./advancedCommandCatalog";

interface CommandSettings extends JsonObject {
	[key: string]: JsonValue;
	commandId: string;
}

type PiToPluginMsg = { event: "refreshCommands"; serverUrl: string; apiKey: string };

@action({ UUID: "com.expiredminotaur.bcuk.command-toggle" })
export class ToggleCommandAction extends SingletonAction<CommandSettings> {
	private readonly catalog = createAdvancedCommandCatalog();

	/** Flips the button's advanced command on or off (see `toggleCommand`). */
	override async onKeyDown(ev: KeyDownEvent<CommandSettings>): Promise<void> {
		await toggleCommand(ev.action, ev.payload.settings.commandId);
	}

	/** Shows the command's current state when the key appears (e.g. after switching pages). */
	override async onWillAppear(ev: WillAppearEvent<CommandSettings>): Promise<void> {
		if (!("commandId" in ev.payload.settings)) {
			await ev.action.setSettings({ commandId: "" });
			return;
		}
		if (ev.action.isKey()) await syncToggleState(ev.action, ev.payload.settings.commandId);
	}

	/** Shows the newly chosen command's state when the property inspector changes it. */
	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<CommandSettings>): Promise<void> {
		if (ev.action.isKey()) await syncToggleState(ev.action, ev.payload.settings.commandId);
	}

	/** Sends the command list to a newly opened property inspector, fetching it first if needed. */
	override async onPropertyInspectorDidAppear(): Promise<void> {
		await this.catalog.show();
	}

	/** Handles the property inspector's "Refresh Commands" request. */
	override async onSendToPlugin(ev: SendToPluginEvent<PiToPluginMsg, CommandSettings>): Promise<void> {
		if (ev.payload.event === "refreshCommands") {
			await this.catalog.refresh({ serverUrl: ev.payload.serverUrl, apiKey: ev.payload.apiKey });
		}
	}
}
