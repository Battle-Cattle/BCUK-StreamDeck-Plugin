import type { JsonObject, JsonValue } from "@elgato/utils";
import streamDeck from "@elgato/streamdeck";
import { apiRequest, type Connection, getConnection, logFailure } from "./api";

/** How one action's dropdown list is fetched from the bot and sent to its property inspector. */
export interface InspectorCatalogOptions<T extends JsonValue> {
	/** Label for log lines, e.g. "commands". */
	label: string;
	/** API path to fetch, under `/api/streamdeck`. */
	path: string;
	/** Extracts the list from the response body, dropping malformed entries. */
	parse: (body: JsonObject) => T[];
	/** Message event names the property inspector listens for, and the payload key for the list. */
	loadedEvent: string;
	errorEvent: string;
	listKey: string;
}

/**
 * An in-memory list (SFX commands, voice channels) shared by every button of one action and
 * shown in its property inspector's dropdown. Kept here rather than in per-button settings,
 * which Stream Deck re-sends with every key press.
 */
export class InspectorCatalog<T extends JsonValue> {
	private items: T[] = [];

	/** @param options How the list is fetched and delivered. */
	constructor(private readonly options: InspectorCatalogOptions<T>) {}

	/** Seeds the list (e.g. from legacy per-button settings) when nothing has been loaded yet. */
	seed(items: T[]): void {
		if (this.items.length === 0) this.items = items;
	}

	/**
	 * Called when a property inspector opens: sends the loaded list, or fetches it first if
	 * nothing has been loaded since the plugin started and an API key is configured.
	 */
	async show(): Promise<void> {
		if (this.items.length > 0) {
			await this.send({ event: this.options.loadedEvent, [this.options.listKey]: this.items });
			return;
		}
		const conn = getConnection();
		if (conn.apiKey) await this.refresh(conn);
	}

	/**
	 * Fetches the list from the bot, keeps it, and sends it (or the error) to the inspector.
	 * @param conn Server URL and API key to use, normally the inspector's current form values.
	 */
	async refresh(conn: Connection): Promise<void> {
		const { label, path, parse, loadedEvent, errorEvent, listKey } = this.options;
		const result = await apiRequest<JsonObject>(conn, path);
		if (!result.ok) {
			logFailure(`Fetch ${label}`, result);
			await this.send({ event: errorEvent, error: result.error });
			return;
		}
		this.items = parse(result.data);
		streamDeck.logger.info(`Fetched ${this.items.length} ${label}`);
		await this.send({ event: loadedEvent, [listKey]: this.items });
	}

	/** Sends a message to the property inspector that's currently open. */
	private async send(message: JsonObject): Promise<void> {
		await streamDeck.ui.sendToPropertyInspector(message);
	}
}
