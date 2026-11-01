import type { JsonObject, JsonValue } from "@elgato/utils";
import { action, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { fillMissingSettings } from "../buttonSettings";
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

@action({ UUID: "com.expiredminotaur.bcuk.join" })
export class JoinVoiceAction extends CatalogAction<JoinVoiceSettings, VoiceChannel> {
	/** Creates the action with its voice channel dropdown list. */
	constructor() {
		super(
			new InspectorCatalog<VoiceChannel>({
				label: "channels",
				path: "/voice/channels",
				parse: (body) => (Array.isArray(body.guilds) ? flattenGuildChannels(body.guilds) : null),
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
	 * Gives a button whatever channel or server field it lacks, so later events carry the expected
	 * shape.
	 * @param ev The appearance event, carrying the button's saved settings (`{}` on a new button).
	 */
	override async onWillAppear(ev: WillAppearEvent<JoinVoiceSettings>): Promise<void> {
		await fillMissingSettings(ev.action, ev.payload.settings, { channelId: "", guildId: "" });
	}
}
