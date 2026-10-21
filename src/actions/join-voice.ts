import type { JsonObject, JsonValue } from "@elgato/utils";
import streamDeck, {
	action,
	type KeyDownEvent,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import { apiRequest, getConnection, logFailure } from "../api";
import { InspectorCatalog } from "../inspectorCatalog";
import { flattenGuildChannels, type VoiceChannel } from "../voiceChannels";
import { setLastJoinedGuildId } from "../voiceState";

// Per-button settings: just the chosen channel (and its guild, so Leave Voice can target it).
// The channel list for the dropdown lives in `catalog`, not here — see play-sfx.ts for why.
interface JoinVoiceSettings extends JsonObject {
	[key: string]: JsonValue;
	channelId: string;
	guildId: string;
}

// Settings saved by plugin versions <= 1.1.x, which stored the channel list on every button.
interface LegacyJoinVoiceSettings extends JoinVoiceSettings {
	cachedChannels?: JsonValue;
}

// A message from the property inspector. Its payload is whatever JSON the page sent, so the
// handler checks `event` rather than trusting it to be "refreshChannels".
type PiToPluginMsg = { event: string; serverUrl: string; apiKey: string };

@action({ UUID: "com.expiredminotaur.bcuk.join" })
export class JoinVoiceAction extends SingletonAction<JoinVoiceSettings> {
	private readonly catalog = new InspectorCatalog<VoiceChannel>({
		label: "channels",
		path: "/voice/channels",
		parse: (body) => (Array.isArray(body.guilds) ? flattenGuildChannels(body.guilds) : null),
		key: (channel) => channel.id,
		loadedEvent: "channelsLoaded",
		errorEvent: "channelsError",
		listKey: "channels",
	});

	/**
	 * Tells the bot to join the button's configured channel, showing OK or an alert.
	 * @param ev The key press, carrying the button's chosen channel and guild.
	 */
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

	/**
	 * Migrates a button's settings to hold only its channel and server, dropping legacy lists.
	 * Settings already in that shape (even with no channel chosen yet) are left alone, so an
	 * unconfigured button isn't rewritten every time it appears.
	 * @param ev The appearance event, carrying the button's saved (possibly empty or legacy) settings.
	 */
	override async onWillAppear(ev: WillAppearEvent<JoinVoiceSettings>): Promise<void> {
		// A new button's settings are `{}`, so any field may be missing.
		const settings = ev.payload.settings as Partial<LegacyJoinVoiceSettings>;
		if (!("channelId" in settings) || !("guildId" in settings) || "cachedChannels" in settings) {
			await ev.action.setSettings({ channelId: settings.channelId ?? "", guildId: settings.guildId ?? "" });
		}
	}

	/** Sends the channel list to a newly opened property inspector, fetching it first if needed. */
	override async onPropertyInspectorDidAppear(): Promise<void> {
		await this.catalog.show();
	}

	/**
	 * Handles the property inspector's "Refresh Channels" request.
	 * @param ev The inspector's message: its event name and the Server URL and API key in its form.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<PiToPluginMsg, JoinVoiceSettings>): Promise<void> {
		if (ev.payload.event === "refreshChannels") {
			await this.catalog.refresh({ serverUrl: ev.payload.serverUrl, apiKey: ev.payload.apiKey });
		}
	}
}
