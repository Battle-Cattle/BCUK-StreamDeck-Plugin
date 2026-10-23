import type { JsonObject, JsonValue } from "@elgato/utils";
import { type SendToPluginEvent, SingletonAction } from "@elgato/streamdeck";
import type { InspectorCatalog } from "../inspectorCatalog";

/**
 * A message from the property inspector. Its payload is whatever JSON the page sent, so the
 * handler checks `event` rather than trusting it.
 */
export type PiToPluginMsg = { event: string; serverUrl: string; apiKey: string };

/**
 * An action whose property inspector shows a dropdown filled from the bot (SFX commands, voice
 * channels, advanced commands): it sends the list when the inspector opens and refetches it when
 * the inspector asks. Subclasses add only their key handling.
 */
export abstract class CatalogAction<TSettings extends JsonObject, TItem extends JsonValue> extends SingletonAction<TSettings> {
	/**
	 * @param catalog The action's dropdown list, shared by all of its buttons.
	 * @param refreshEvent The inspector's refresh message name, e.g. "refreshCommands".
	 */
	protected constructor(
		protected readonly catalog: InspectorCatalog<TItem>,
		private readonly refreshEvent: string,
	) {
		super();
	}

	/** Sends the list to a newly opened property inspector, fetching it first if needed. */
	override async onPropertyInspectorDidAppear(): Promise<void> {
		await this.catalog.show();
	}

	/**
	 * Handles the property inspector's refresh request, fetching with the Server URL and API key
	 * in its form (which may not be saved yet).
	 * @param ev The inspector's message: its event name and the Server URL and API key in its form.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<PiToPluginMsg, TSettings>): Promise<void> {
		if (ev.payload.event === this.refreshEvent) {
			await this.catalog.refresh({ serverUrl: ev.payload.serverUrl, apiKey: ev.payload.apiKey });
		}
	}
}
