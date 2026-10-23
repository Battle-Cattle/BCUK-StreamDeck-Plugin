import { action, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import type { AdvancedCommand } from "../advancedCommands";
import { triggerCommand } from "../advancedCommandKeys";
import { type CommandSettings, createAdvancedCommandCatalog } from "./advancedCommandCatalog";
import { CatalogAction } from "./catalogAction";

@action({ UUID: "com.expiredminotaur.bcuk.command" })
export class TriggerCommandAction extends CatalogAction<CommandSettings, AdvancedCommand> {
	/** Creates the action with its advanced-command dropdown list. */
	constructor() {
		super(createAdvancedCommandCatalog(), "refreshCommands");
	}

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
}
