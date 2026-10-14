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
import { type SfxTrigger, toSfxTriggers } from "../sfxTriggers";

// Only the chosen command lives in per-button settings. Stream Deck sends a button's full
// settings with every keyDown/keyUp/willAppear event, so anything stored here is re-sent (and
// re-parsed) on every press. The trigger list for the dropdown lives in `catalog` instead.
interface PlaySfxSettings extends JsonObject {
	[key: string]: JsonValue;
	command: string;
}

// Settings saved by plugin versions <= 1.1.0, which stored the whole trigger catalog on every
// button. Read only so onWillAppear can migrate them away.
interface LegacyPlaySfxSettings extends PlaySfxSettings {
	cachedTriggers?: JsonValue;
}

type PiToPluginMsg = { event: "refreshCommands"; serverUrl: string; apiKey: string };

@action({ UUID: "com.expiredminotaur.bcuk.play" })
export class PlaySfxAction extends SingletonAction<PlaySfxSettings> {
	private readonly catalog = new InspectorCatalog<SfxTrigger>({
		label: "commands",
		path: "/sfx",
		parse: (body) => (Array.isArray(body.triggers) ? toSfxTriggers(body.triggers) : null),
		key: (trigger) => trigger.triggerCommand,
		loadedEvent: "commandsLoaded",
		errorEvent: "commandsError",
		listKey: "triggers",
	});

	/** Plays the button's configured command on the bot, showing OK or an alert on the key. */
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

	/**
	 * Migrates a button's settings to hold only its command, folding any legacy per-button
	 * trigger list into the shared catalog first.
	 */
	override async onWillAppear(ev: WillAppearEvent<PlaySfxSettings>): Promise<void> {
		const settings = ev.payload.settings as LegacyPlaySfxSettings;
		this.catalog.seed(toSfxTriggers(settings.cachedTriggers));
		// Rewrite settings that are missing a command or still carry the legacy catalog, so
		// every later event for this button carries only the command.
		if (!settings.command || "cachedTriggers" in settings) {
			await ev.action.setSettings({ command: settings.command ?? "" });
		}
	}

	/** Sends the catalog to a newly opened property inspector, fetching it first if needed. */
	override async onPropertyInspectorDidAppear(): Promise<void> {
		await this.catalog.show();
	}

	/** Handles the property inspector's "Refresh Commands" request. */
	override async onSendToPlugin(ev: SendToPluginEvent<PiToPluginMsg, PlaySfxSettings>): Promise<void> {
		if (ev.payload.event === "refreshCommands") {
			await this.catalog.refresh({ serverUrl: ev.payload.serverUrl, apiKey: ev.payload.apiKey });
		}
	}
}
