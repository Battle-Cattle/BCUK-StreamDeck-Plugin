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
import { setLastJoinedGuildId } from "../voiceState";

// Per-button settings: just the chosen channel (and its guild, so Leave Voice can target it).
// The channel list for the dropdown is kept in memory, not here — see play-sfx.ts for why.
interface JoinVoiceSettings extends JsonObject {
	[key: string]: JsonValue;
	channelId: string;
	guildId: string;
}

// Settings saved by plugin versions <= 1.1.x, which stored the channel list on every button.
interface LegacyJoinVoiceSettings extends JoinVoiceSettings {
	cachedChannels?: JsonValue;
}

interface VoiceChannel extends JsonObject {
	[key: string]: JsonValue;
	id: string;
	name: string;
	guildId: string;
	guildName: string | null;
}

type PiToPluginMsg = { event: "refreshChannels"; serverUrl: string; apiKey: string };

interface PluginToPiMsg extends JsonObject {
	[key: string]: JsonValue;
	event: string;
	channels?: VoiceChannel[];
	error?: string;
}

@action({ UUID: "com.expiredminotaur.bcuk.join" })
export class JoinVoiceAction extends SingletonAction<JoinVoiceSettings> {
	private channelCatalog: VoiceChannel[] = [];

	override async onKeyDown(ev: KeyDownEvent<JoinVoiceSettings>): Promise<void> {
		const { channelId, guildId } = ev.payload.settings;
		if (!channelId) {
			streamDeck.logger.warn("Join Voice: no channel configured.");
			await ev.action.showAlert();
			return;
		}

		const result = await apiRequest(getConnection(), "/voice/join", { channelId });
		if (result.ok) {
			setLastJoinedGuildId(guildId || null);
			await ev.action.showOk();
			return;
		}
		logFailure("Join Voice", result);
		await ev.action.showAlert();
	}

	override async onWillAppear(ev: WillAppearEvent<JoinVoiceSettings>): Promise<void> {
		const settings = ev.payload.settings as LegacyJoinVoiceSettings;
		if (!settings.channelId || "cachedChannels" in settings) {
			await ev.action.setSettings({ channelId: settings.channelId ?? "", guildId: settings.guildId ?? "" });
		}
	}

	override async onPropertyInspectorDidAppear(
		_ev: PropertyInspectorDidAppearEvent<JoinVoiceSettings>,
	): Promise<void> {
		if (this.channelCatalog.length > 0) {
			await streamDeck.ui.sendToPropertyInspector({
				event: "channelsLoaded",
				channels: this.channelCatalog,
			} satisfies PluginToPiMsg);
			return;
		}
		const conn = getConnection();
		if (conn.apiKey) {
			await this.fetchAndPushChannels(conn);
		}
	}

	override async onSendToPlugin(
		ev: SendToPluginEvent<PiToPluginMsg, JoinVoiceSettings>,
	): Promise<void> {
		if (ev.payload.event === "refreshChannels") {
			await this.fetchAndPushChannels({ serverUrl: ev.payload.serverUrl, apiKey: ev.payload.apiKey });
		}
	}

	/** Fetches the voice channels of every server the key is approved for and sends them to the PI. */
	private async fetchAndPushChannels(conn: Connection): Promise<void> {
		const result = await apiRequest<{ guilds?: JsonValue }>(conn, "/voice/channels");
		if (!result.ok) {
			logFailure("Fetch channels", result);
			await streamDeck.ui.sendToPropertyInspector({
				event: "channelsError",
				error: result.error,
			} satisfies PluginToPiMsg);
			return;
		}

		this.channelCatalog = flattenGuildChannels(result.data.guilds);
		streamDeck.logger.info(`Channels received: ${this.channelCatalog.length}`);
		await streamDeck.ui.sendToPropertyInspector({
			event: "channelsLoaded",
			channels: this.channelCatalog,
		} satisfies PluginToPiMsg);
	}
}

/**
 * Flattens the bot's `guilds: [{ guildId, guildName?, channels: [{ id, name }] }]` listing into
 * one channel list, each tagged with its guild. Malformed entries are skipped.
 */
export function flattenGuildChannels(raw: JsonValue | undefined): VoiceChannel[] {
	if (!Array.isArray(raw)) return [];
	const channels: VoiceChannel[] = [];
	for (const guild of raw) {
		if (!guild || typeof guild !== "object" || Array.isArray(guild)) continue;
		const { guildId, guildName, channels: guildChannels } = guild;
		if (typeof guildId !== "string" || !Array.isArray(guildChannels)) continue;
		for (const ch of guildChannels) {
			if (!ch || typeof ch !== "object" || Array.isArray(ch)) continue;
			if (typeof ch.id !== "string" || typeof ch.name !== "string") continue;
			channels.push({
				id: ch.id,
				name: ch.name,
				guildId,
				guildName: typeof guildName === "string" ? guildName : null,
			});
		}
	}
	return channels;
}
