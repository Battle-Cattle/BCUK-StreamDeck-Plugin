import type { JsonObject, JsonValue } from "@elgato/utils";
import streamDeck, {
	action,
	type KeyDownEvent,
	type PropertyInspectorDidAppearEvent,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";

interface PlaySfxSettings extends JsonObject {
	[key: string]: JsonValue;
	command: string;
	cachedTriggers: SfxTrigger[];
}

interface SfxTrigger extends JsonObject {
	[key: string]: JsonValue;
	triggerId: string;
	triggerCommand: string;
	description: string | null;
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
	cachedTriggers: [],
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
		if (!ev.payload.settings.command) {
			await ev.action.setSettings({ ...DEFAULT_SETTINGS, ...ev.payload.settings });
		}
	}

	override async onPropertyInspectorDidAppear(
		ev: PropertyInspectorDidAppearEvent<PlaySfxSettings>,
	): Promise<void> {
		const settings = await ev.action.getSettings();
		const triggers = settings.cachedTriggers ?? [];
		if (triggers.length > 0) {
			await streamDeck.ui.sendToPropertyInspector({
				event: "commandsLoaded",
				triggers,
			} satisfies PluginToPiMsg);
		}
	}

	override async onSendToPlugin(
		ev: SendToPluginEvent<PiToPluginMsg, PlaySfxSettings>,
	): Promise<void> {
		const msg = ev.payload;
		if (msg.event === "refreshCommands") {
			streamDeck.logger.info(`Refresh commands: host=${msg.host} port=${msg.port}`);
			await this.fetchAndPushTriggers(ev.action, msg.host, msg.port, msg.apiKey);
		}
	}

	private async fetchAndPushTriggers(
		actionRef: Parameters<PlaySfxAction["onSendToPlugin"]>[0]["action"],
		host: string,
		port: number,
		apiKey: string,
	): Promise<void> {
		const url = `http://${host}:${port}/api/streamdeck/sfx`;
		streamDeck.logger.info(`Fetching triggers from ${url}`);

		try {
			const settings = await actionRef.getSettings();
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

			const data = (await response.json()) as { ok: boolean; triggers: SfxTrigger[] };
			const triggers = data.triggers ?? [];

			streamDeck.logger.info(`Triggers received: ${triggers.length}`);

			await actionRef.setSettings({ ...settings, cachedTriggers: triggers });
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
