import {
	action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { AdvancedCommand } from "../advancedCommands";
import { forgetKey, syncToggleState, toggleCommand } from "../advancedCommandKeys";
import { type CommandSettings, createAdvancedCommandCatalog } from "./advancedCommandCatalog";
import { CatalogAction } from "./catalogAction";

@action({ UUID: "com.expiredminotaur.bcuk.command-toggle" })
export class ToggleCommandAction extends CatalogAction<CommandSettings, AdvancedCommand> {
	/** Creates the action with its advanced-command dropdown list. */
	constructor() {
		super(createAdvancedCommandCatalog(), "refreshCommands");
	}

	/**
	 * Flips the button's advanced command on or off (see `toggleCommand`).
	 * @param ev The key press, carrying the button's saved command id.
	 */
	override async onKeyDown(ev: KeyDownEvent<CommandSettings>): Promise<void> {
		await toggleCommand(ev.action, ev.payload.settings.commandId);
	}

	/**
	 * Shows the command's current state when the key appears (e.g. after switching pages).
	 * @param ev The appearance event, carrying the button's saved command id (missing on a new button).
	 */
	override async onWillAppear(ev: WillAppearEvent<CommandSettings>): Promise<void> {
		if (!("commandId" in ev.payload.settings)) {
			await ev.action.setSettings({ commandId: "" });
			return;
		}
		if (ev.action.isKey()) await syncToggleState(ev.action, ev.payload.settings.commandId);
	}

	/**
	 * Stops tracking the key's state syncs once it's gone (see `forgetKey`).
	 * @param ev The disappearance event, carrying the action instance.
	 */
	override onWillDisappear(ev: WillDisappearEvent<CommandSettings>): void {
		forgetKey(ev.action.id);
	}

	/**
	 * Shows the newly chosen command's state when the property inspector changes it.
	 * @param ev The settings event, carrying the newly saved command id.
	 */
	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<CommandSettings>): Promise<void> {
		if (ev.action.isKey()) await syncToggleState(ev.action, ev.payload.settings.commandId);
	}
}
