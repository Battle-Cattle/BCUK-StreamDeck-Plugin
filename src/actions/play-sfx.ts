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
	// Shared by every Play SFX button: the catalog is global to the bot, not per button.
	private triggerCatalog: SfxTrigger[] = [];

	constructor() {
		super();
		streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
			this.cachedGlobal = { ...DEFAULT_GLOBAL, ...ev.settings };
		});
		// Prime the cache immediately so onKeyDown has real settings on first press.
		void streamDeck.settings.getGlobalSettings();
	}

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

	override async onWillAppear(ev: WillAppearEvent<PlaySfxSettings>): Promise<void> {
		const settings = ev.payload.settings as LegacyPlaySfxSettings;
		if (this.triggerCatalog.length === 0 && Array.isArray(settings.cachedTriggers)) {
			this.triggerCatalog = toCatalog(settings.cachedTriggers);
		}
		// Rewrite settings that are missing a command or still carry the legacy catalog, so
		// every later event for this button carries only the command.
		if (!settings.command || "cachedTriggers" in settings) {
			await ev.action.setSettings({ command: settings.command ?? "" });
		}
	}

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

	override async onSendToPlugin(
		ev: SendToPluginEvent<PiToPluginMsg, PlaySfxSettings>,
	): Promise<void> {
		const msg = ev.payload;
		if (msg.event === "refreshCommands") {
			streamDeck.logger.info(`Refresh commands: host=${msg.host} port=${msg.port}`);
			await this.fetchAndPushTriggers(msg.host, msg.port, msg.apiKey);
		}
	}

	private async fetchAndPushTriggers(
		host: string,
		port: number,
		apiKey: string,
	): Promise<void> {
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
