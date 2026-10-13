import type { JsonObject, JsonValue } from "@elgato/utils";
import streamDeck, {
	action,
	type KeyDownEvent,
	type PropertyInspectorDidAppearEvent,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";

// Only the chosen command lives in per-button settings. Stream Deck sends a button's full
// settings with every keyDown/keyUp/willAppear event, so anything stored here is re-sent (and
// re-parsed) on every press. The trigger list used by the property inspector's dropdown is kept
// in memory instead (see `triggerCatalog`).
interface PlaySfxSettings extends JsonObject {
	[key: string]: JsonValue;
	command: string;
}

// Settings saved by plugin versions <= 1.1.0, which stored the whole trigger catalog on every
// button. Read only so onWillAppear can migrate them away.
interface LegacyPlaySfxSettings extends PlaySfxSettings {
	cachedTriggers?: JsonValue;
}

// The fields the property inspector's dropdown needs; the bot's listing also includes each
// trigger's files, description etc., which the plugin never uses.
interface SfxTrigger extends JsonObject {
	[key: string]: JsonValue;
	triggerCommand: string;
	categoryName: string | null;
}

interface GlobalSettings extends JsonObject {
	[key: string]: JsonValue;
	host: string;
	port: number;
	apiKey: string;
}

type PiToPluginMsg = { event: "refreshCommands"; host: string; port: number; apiKey: string };

interface PluginToPiMsg extends JsonObject {
	[key: string]: JsonValue;
	event: string;
	triggers?: SfxTrigger[];
	error?: string;
}

const DEFAULT_SETTINGS: PlaySfxSettings = {
	command: "",
};

const DEFAULT_GLOBAL: GlobalSettings = {
	host: "localhost",
	port: 3000,
	apiKey: "",
};

const TIMEOUT_MS = 20000;

@action({ UUID: "com.expiredminotaur.bcuk.play" })
export class PlaySfxAction extends SingletonAction<PlaySfxSettings> {
	private cachedGlobal: GlobalSettings = { ...DEFAULT_GLOBAL };
	private globalSettingsLoaded = false;
	// Bumped whenever the connection changes, so a fetch started for the old one can't
	// overwrite the cleared catalog when it completes.
	private connectionGeneration = 0;
	// Shared by every Play SFX button: the catalog is global to the bot, not per button.
	private triggerCatalog: SfxTrigger[] = [];

	/** Tracks the plugin-wide connection settings and primes them for the first key press. */
	constructor() {
		super();
		streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
			const next = { ...DEFAULT_GLOBAL, ...ev.settings };
			// A list fetched from a different bot or with a different key is no longer valid. The
			// first delivery only replaces the defaults, so it keeps lists migrated from buttons.
			if (this.globalSettingsLoaded && !sameConnection(this.cachedGlobal, next)) {
				this.triggerCatalog = [];
				this.connectionGeneration++;
			}
			this.cachedGlobal = next;
			this.globalSettingsLoaded = true;
		});
		// Prime the cache immediately so onKeyDown has real settings on first press.
		void streamDeck.settings.getGlobalSettings();
	}

	/** Plays the button's configured command on the bot, showing OK or an alert on the key. */
	override async onKeyDown(ev: KeyDownEvent<PlaySfxSettings>): Promise<void> {
		const { command } = { ...DEFAULT_SETTINGS, ...ev.payload.settings };
		const { host, port, apiKey } = this.cachedGlobal;

		if (!command) {
			streamDeck.logger.warn("Play SFX: no command configured.");
			await ev.action.showAlert();
			return;
		}

		const url = `http://${host}:${port}/api/streamdeck/sfx`;

		try {
			const response = await fetchWithTimeout(
				url,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${apiKey}`,
					},
					body: JSON.stringify({ command }),
				},
				TIMEOUT_MS,
			);

			if (response.ok) {
				await ev.action.showOk();
				return;
			}

			switch (response.status) {
				case 401:
					streamDeck.logger.error("Play SFX: Invalid or unapproved API key.");
					await ev.action.showAlert();
					break;
				case 404:
					streamDeck.logger.error(`Play SFX: Command not found — "${command}".`);
					await ev.action.showAlert();
					break;
				case 503:
					streamDeck.logger.warn("Play SFX: Bot not connected to voice channel.");
					await ev.action.setState(0);
					await ev.action.showAlert();
					break;
				default:
					streamDeck.logger.error(`Play SFX: Unexpected status ${response.status}.`);
					await ev.action.setState(0);
					await ev.action.showAlert();
					break;
			}
		} catch (err) {
			streamDeck.logger.error(`Play SFX: Network error — ${err}`);
			await ev.action.setState(0);
			await ev.action.showAlert();
		}
	}

	/**
	 * Migrates a button's settings to hold only its command, folding any legacy per-button
	 * trigger list into the shared in-memory catalog first.
	 */
	override async onWillAppear(ev: WillAppearEvent<PlaySfxSettings>): Promise<void> {
		const settings = ev.payload.settings as LegacyPlaySfxSettings;
		this.triggerCatalog = mergeTriggers(this.triggerCatalog, toCatalog(settings.cachedTriggers));
		// Rewrite settings that are missing a command or still carry the legacy catalog, so
		// every later event for this button carries only the command.
		if (!settings.command || "cachedTriggers" in settings) {
			await ev.action.setSettings({ command: settings.command ?? "" });
		}
	}

	/** Sends the catalog to a newly opened property inspector, fetching it first if empty. */
	override async onPropertyInspectorDidAppear(
		ev: PropertyInspectorDidAppearEvent<PlaySfxSettings>,
	): Promise<void> {
		if (this.triggerCatalog.length > 0) {
			await streamDeck.ui.sendToPropertyInspector({
				event: "commandsLoaded",
				triggers: this.triggerCatalog,
			} satisfies PluginToPiMsg);
			return;
		}
		// Nothing loaded since the plugin started: fetch it now if a key is configured, so the
		// dropdown isn't empty until the user clicks Refresh.
		const { host, port, apiKey } = this.cachedGlobal;
		if (apiKey) {
			await this.fetchAndPushTriggers(host, port, apiKey);
		}
	}

	/** Handles the property inspector's "Refresh Commands" request. */
	override async onSendToPlugin(
		ev: SendToPluginEvent<PiToPluginMsg, PlaySfxSettings>,
	): Promise<void> {
		const msg = ev.payload;
		if (msg.event === "refreshCommands") {
			streamDeck.logger.info(`Refresh commands: host=${msg.host} port=${msg.port}`);
			await this.fetchAndPushTriggers(msg.host, msg.port, msg.apiKey);
		}
	}

	/** Fetches the bot's SFX catalog, keeps it in memory and sends it to the property inspector. */
	private async fetchAndPushTriggers(
		host: string,
		port: number,
		apiKey: string,
	): Promise<void> {
		const generation = this.connectionGeneration;
		const url = `http://${host}:${port}/api/streamdeck/sfx`;
		streamDeck.logger.info(`Fetching triggers from ${url}`);

		try {
			const response = await fetchWithTimeout(
				url,
				{ headers: { Authorization: `Bearer ${apiKey}` } },
				TIMEOUT_MS,
			);

			streamDeck.logger.info(`Trigger fetch status: ${response.status}`);

			if (!response.ok) {
				await streamDeck.ui.sendToPropertyInspector({
					event: "commandsError",
					error: `Server returned ${response.status}`,
				} satisfies PluginToPiMsg);
				return;
			}

			const contentType = response.headers.get("content-type") ?? "";
			if (!contentType.includes("application/json")) {
				await streamDeck.ui.sendToPropertyInspector({
					event: "commandsError",
					error: `Server returned non-JSON response — check host/port settings`,
				} satisfies PluginToPiMsg);
				return;
			}

			const data = (await response.json()) as { ok: boolean; triggers?: JsonValue };
			const triggers = toCatalog(data.triggers);

			streamDeck.logger.info(`Triggers received: ${triggers.length}`);
			// Only drop it if the connection changed since and this response isn't for the new
			// one (a Refresh carries the inspector's new values, which may beat their settings echo).
			const current = sameConnection(this.cachedGlobal, { host, port, apiKey });
			if (generation !== this.connectionGeneration && !current) {
				streamDeck.logger.info("Discarding triggers fetched for a previous connection.");
				return;
			}

			this.triggerCatalog = triggers;
			await streamDeck.ui.sendToPropertyInspector({
				event: "commandsLoaded",
				triggers,
			} satisfies PluginToPiMsg);
		} catch (err) {
			streamDeck.logger.error(`Trigger fetch error: ${err}`);
			await streamDeck.ui.sendToPropertyInspector({
				event: "commandsError",
				error: String(err),
			} satisfies PluginToPiMsg);
		}
	}
}

/**
 * Reduces a trigger listing (from the bot, or legacy per-button settings) to the fields the
 * property inspector uses, dropping anything malformed.
 */
function toCatalog(raw: JsonValue | undefined): SfxTrigger[] {
	if (!Array.isArray(raw)) return [];
	const triggers: SfxTrigger[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object" || Array.isArray(item)) continue;
		const { triggerCommand, categoryName } = item;
		if (typeof triggerCommand !== "string") continue;
		triggers.push({
			triggerCommand,
			categoryName: typeof categoryName === "string" ? categoryName : null,
		});
	}
	return triggers;
}

/**
 * Adds `extra` triggers not already in `existing` (matched by command), keeping existing order.
 * Each legacy button carried its own snapshot of the catalog, so later buttons can add entries.
 */
function mergeTriggers(existing: SfxTrigger[], extra: SfxTrigger[]): SfxTrigger[] {
	const seen = new Set(existing.map((t) => t.triggerCommand));
	return [...existing, ...extra.filter((t) => !seen.has(t.triggerCommand))];
}

/** Whether two global-settings snapshots point at the same bot with the same key. */
function sameConnection(a: GlobalSettings, b: GlobalSettings): boolean {
	return a.host === b.host && a.port === b.port && a.apiKey === b.apiKey;
}

/** `fetch` that aborts after `timeoutMs`. */
async function fetchWithTimeout(
	url: string,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}
