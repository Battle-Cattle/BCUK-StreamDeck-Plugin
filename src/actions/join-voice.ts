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

type PiToPluginMsg = { event: "refreshChannels"; serverUrl: string; apiKey: string };

@action({ UUID: "com.expiredminotaur.bcuk.join" })
export class JoinVoiceAction extends SingletonAction<JoinVoiceSettings> {
	private readonly catalog = new InspectorCatalog<VoiceChannel>({
		label: "channels",
		path: "/voice/channels",
		parse: (body) => flattenGuildChannels(body.guilds),
		loadedEvent: "channelsLoaded",
		errorEvent: "channelsError",
		listKey: "channels",
	});

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

	override async onPropertyInspectorDidAppear(): Promise<void> {
		await this.catalog.show();
	}

	override async onSendToPlugin(ev: SendToPluginEvent<PiToPluginMsg, JoinVoiceSettings>): Promise<void> {
		if (ev.payload.event === "refreshChannels") {
			await this.catalog.refresh({ serverUrl: ev.payload.serverUrl, apiKey: ev.payload.apiKey });
		}
	}
}
