import type { JsonObject, JsonValue } from "@elgato/utils";
import streamDeck, { type SendToPluginEvent, SingletonAction } from "@elgato/streamdeck";
import type { InspectorCatalog } from "../inspectorCatalog";
import { asObject } from "../json";

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
	 * in its form (which may not be saved yet). Any other message is ignored, and a refresh without
	 * both fields as strings is logged and ignored.
	 * @param ev The inspector's message. Its payload is whatever JSON the page sent (or none), so it
	 *   and each of its fields (event name, Server URL, API key) are checked before use.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, TSettings>): Promise<void> {
		const payload = asObject(ev.payload);
		const event = payload?.event;
		const serverUrl = payload?.serverUrl;
		const apiKey = payload?.apiKey;
		if (event !== this.refreshEvent) return;
		if (typeof serverUrl !== "string" || typeof apiKey !== "string") {
			streamDeck.logger.warn(`Ignoring ${this.refreshEvent}: the message had no Server URL or API key.`);
			return;
		}
		await this.catalog.refresh({ serverUrl, apiKey });
	}
}
