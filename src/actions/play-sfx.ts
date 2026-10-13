import type { JsonObject, JsonValue } from "@elgato/utils";
import streamDeck, {
	action,
	type KeyDownEvent,
	type PropertyInspectorDidAppearEvent,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import { apiRequest, type Connection, getConnection, logFailure } from "../api";

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

type PiToPluginMsg = { event: "refreshCommands"; serverUrl: string; apiKey: string };

interface PluginToPiMsg extends JsonObject {
	[key: string]: JsonValue;
	event: string;
	triggers?: SfxTrigger[];
	error?: string;
}

@action({ UUID: "com.expiredminotaur.bcuk.play" })
export class PlaySfxAction extends SingletonAction<PlaySfxSettings> {
	// Shared by every Play SFX button: the catalog is global to the bot, not per button.
	private triggerCatalog: SfxTrigger[] = [];

	override async onKeyDown(ev: KeyDownEvent<PlaySfxSettings>): Promise<void> {
		const { command } = ev.payload.settings;
		if (!command) {
			streamDeck.logger.warn("Play SFX: no command configured.");
			await ev.action.showAlert();
			return;
		}

		const result = await apiRequest(getConnection(), "/sfx", { command });
		if (result.ok) {
			await ev.action.showOk();
			return;
		}
		logFailure(`Play SFX "${command}"`, result);
		await ev.action.showAlert();
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
		_ev: PropertyInspectorDidAppearEvent<PlaySfxSettings>,
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
		const conn = getConnection();
		if (conn.apiKey) {
			await this.fetchAndPushTriggers(conn);
		}
	}

	override async onSendToPlugin(
		ev: SendToPluginEvent<PiToPluginMsg, PlaySfxSettings>,
	): Promise<void> {
		if (ev.payload.event === "refreshCommands") {
			await this.fetchAndPushTriggers({ serverUrl: ev.payload.serverUrl, apiKey: ev.payload.apiKey });
		}
	}

	/** Fetches the bot's SFX catalog, keeps it in memory and sends it to the property inspector. */
	private async fetchAndPushTriggers(conn: Connection): Promise<void> {
		const result = await apiRequest<{ triggers?: JsonValue }>(conn, "/sfx");
		if (!result.ok) {
			logFailure("Fetch commands", result);
			await streamDeck.ui.sendToPropertyInspector({
				event: "commandsError",
				error: result.error,
			} satisfies PluginToPiMsg);
			return;
		}

		this.triggerCatalog = toCatalog(result.data.triggers);
		streamDeck.logger.info(`Triggers received: ${this.triggerCatalog.length}`);
		await streamDeck.ui.sendToPropertyInspector({
			event: "commandsLoaded",
			triggers: this.triggerCatalog,
		} satisfies PluginToPiMsg);
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
