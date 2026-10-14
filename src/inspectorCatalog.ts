import type { JsonObject, JsonValue } from "@elgato/utils";
import streamDeck from "@elgato/streamdeck";
import {
	apiRequest,
	type Connection,
	getConnection,
	hasGlobalSettings,
	logFailure,
	onGlobalSettingsChanged,
} from "./api";

/** How one action's dropdown list is fetched from the bot and sent to its property inspector. */
export interface InspectorCatalogOptions<T extends JsonValue> {
	/** Label for log lines, e.g. "commands". */
	label: string;
	/** API path to fetch, under `/api/streamdeck`. */
	path: string;
	/**
	 * Extracts the list from the response body, dropping malformed entries; returns null when
	 * the body has no list at all, which is reported as an error instead of an empty list.
	 */
	parse: (body: JsonObject) => T[] | null;
	/** Identifies an entry, for merging lists seeded from several legacy buttons. */
	key: (item: T) => string;
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
	// The connection `items` were fetched with, or null for items seeded from legacy button
	// settings (which predate any connection change, so they're accepted as-is).
	private loadedFor: string | null = null;
	// Bumped per fetch, so only the newest of overlapping fetches is applied.
	private latestRequest = 0;
	// Set when an inspector opened before the global settings had arrived (just after
	// startup), so there was no API key to fetch with; the first delivery then fetches.
	private awaitingSettings = false;

	/** @param options How the list is fetched and delivered. */
	constructor(private readonly options: InspectorCatalogOptions<T>) {
		onGlobalSettingsChanged(() => {
			const conn = getConnection();
			if (!this.awaitingSettings || !conn.apiKey || this.items.length > 0) return;
			this.awaitingSettings = false;
			void this.refresh(conn);
		});
	}

	/**
	 * Adds entries from legacy per-button settings that aren't already in the list (matched by
	 * `key`). Each legacy button carried its own snapshot, so later buttons can add entries.
	 */
	seed(items: T[]): void {
		// A list fetched from the bot is authoritative; legacy lists on buttons that appear later
		// (e.g. on another page) mustn't add stale entries to it.
		if (this.loadedFor !== null) return;
		const { key } = this.options;
		const seen = new Set(this.items.map(key));
		this.items = [...this.items, ...items.filter((item) => !seen.has(key(item)))];
	}

	/**
	 * Called when a property inspector opens: sends the loaded list, or fetches it first if
	 * nothing has been loaded since the plugin started and an API key is configured.
	 */
	async show(): Promise<void> {
		const conn = getConnection();
		// A list fetched from a different bot or with a different key is no longer valid.
		if (this.loadedFor !== null && this.loadedFor !== connectionId(conn)) {
			this.items = [];
			this.loadedFor = null;
		}
		if (this.items.length > 0) {
			await this.send({ event: this.options.loadedEvent, [this.options.listKey]: this.items });
			return;
		}
		if (conn.apiKey) {
			await this.refresh(conn);
		} else if (!hasGlobalSettings()) {
			this.awaitingSettings = true;
		}
	}

	/**
	 * Fetches the list from the bot, keeps it, and sends it (or the error) to the inspector.
	 * @param conn Server URL and API key to use, normally the inspector's current form values.
	 */
	async refresh(conn: Connection): Promise<void> {
		const { label, path, parse, loadedEvent, errorEvent, listKey } = this.options;
		const request = ++this.latestRequest;
		const startedUnder = connectionId(getConnection());
		const result = await apiRequest<JsonObject>(conn, path);
		// A newer fetch has started since (e.g. Refresh while the auto-fetch was pending).
		if (request !== this.latestRequest) return;
		// The saved connection changed while this was in flight, and this response isn't for the
		// new one: drop it rather than show another bot's list. (A Refresh carries the inspector's
		// new values, which can arrive before their settings echo, so those are still accepted.)
		const current = connectionId(getConnection());
		if (current !== startedUnder && current !== connectionId(conn)) {
			streamDeck.logger.info(`Discarding ${label} fetched for a previous connection`);
			return;
		}
		if (!result.ok) {
			logFailure(`Fetch ${label}`, result);
			await this.send({ event: errorEvent, error: result.error });
			return;
		}
		const items = parse(result.data);
		if (items === null) {
			logFailure(`Fetch ${label}`, { status: null, error: `Server response had no ${label} list` });
			await this.send({ event: errorEvent, error: `Server response had no ${label} list — check the Server URL` });
			return;
		}
		this.items = items;
		this.loadedFor = connectionId(conn);
		streamDeck.logger.info(`Fetched ${this.items.length} ${label}`);
		await this.send({ event: loadedEvent, [listKey]: this.items });
	}

	/** Sends a message to the property inspector that's currently open. */
	private async send(message: JsonObject): Promise<void> {
		await streamDeck.ui.sendToPropertyInspector(message);
	}
}

/** Identifies the bot and key a list was fetched with. */
function connectionId(conn: Connection): string {
	return `${conn.serverUrl}\n${conn.apiKey}`;
}
