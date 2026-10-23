import type { JsonObject, JsonValue } from "@elgato/utils";
import { action, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { InspectorCatalog } from "../inspectorCatalog";
import { alertNotConfigured, pressRequest } from "../keyRequest";
import { flattenGuildChannels, type VoiceChannel } from "../voiceChannels";
import { setLastJoinedGuildId } from "../voiceState";
import { CatalogAction } from "./catalogAction";

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

@action({ UUID: "com.expiredminotaur.bcuk.join" })
export class JoinVoiceAction extends CatalogAction<JoinVoiceSettings, VoiceChannel> {
	/** Creates the action with its voice channel dropdown list. */
	constructor() {
		super(
			new InspectorCatalog<VoiceChannel>({
				label: "channels",
				path: "/voice/channels",
				parse: (body) => (Array.isArray(body.guilds) ? flattenGuildChannels(body.guilds) : null),
				key: (channel) => channel.id,
				loadedEvent: "channelsLoaded",
				errorEvent: "channelsError",
				listKey: "channels",
			}),
			"refreshChannels",
		);
	}

	/**
	 * Tells the bot to join the button's configured channel, showing OK or an alert.
	 * @param ev The key press, carrying the button's chosen channel and guild.
	 */
	override async onKeyDown(ev: KeyDownEvent<JoinVoiceSettings>): Promise<void> {
		const { channelId, guildId } = ev.payload.settings;
		if (!channelId) {
			await alertNotConfigured(ev.action, "Join Voice: no channel configured.");
			return;
		}
		await pressRequest(ev.action, {
			label: "Join Voice",
			path: "/voice/join",
			body: { channelId },
			onOk: () => setLastJoinedGuildId(guildId || null),
		});
	}

	/**
	 * Migrates a button's settings to hold only its channel and server, dropping legacy lists.
	 * Settings already in that shape (even with no channel chosen yet) are left alone, so an
	 * unconfigured button isn't rewritten every time it appears. Unlike Play SFX, a legacy list
	 * isn't seeded into the catalog: the oldest saved lists have no server on each channel (which
	 * Leave Voice needs), and the inspector fetches a fresh list when it opens anyway.
	 * @param ev The appearance event, carrying the button's saved (possibly empty or legacy) settings.
	 */
	override async onWillAppear(ev: WillAppearEvent<JoinVoiceSettings>): Promise<void> {
		// A new button's settings are `{}`, so any field may be missing.
		const settings = ev.payload.settings as Partial<LegacyJoinVoiceSettings>;
		if (!("channelId" in settings) || !("guildId" in settings) || "cachedChannels" in settings) {
			await ev.action.setSettings({ channelId: settings.channelId ?? "", guildId: settings.guildId ?? "" });
		}
	}
}
