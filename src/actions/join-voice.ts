import type { JsonObject, JsonValue } from "@elgato/utils";
import streamDeck, {
	action,
	type KeyDownEvent,
	type PropertyInspectorDidAppearEvent,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";

interface JoinVoiceSettings extends JsonObject {
	[key: string]: JsonValue;
	channelId: string;
	cachedChannels: VoiceChannel[];
}

interface VoiceChannel extends JsonObject {
	[key: string]: JsonValue;
	id: string;
	name: string;
}

interface GlobalSettings extends JsonObject {
	[key: string]: JsonValue;
	host: string;
	port: number;
	apiKey: string;
}

type PiToPluginMsg = { event: "refreshChannels"; host: string; port: number; apiKey: string };

interface PluginToPiMsg extends JsonObject {
	[key: string]: JsonValue;
	event: string;
	channels?: VoiceChannel[];
	error?: string;
}

const DEFAULT_SETTINGS: JoinVoiceSettings = {
	channelId: "",
	cachedChannels: [],
};

const DEFAULT_GLOBAL: GlobalSettings = {
	host: "localhost",
	port: 3000,
	apiKey: "",
};

const TIMEOUT_MS = 20000;

@action({ UUID: "com.expiredminotaur.bcuk.join" })
export class JoinVoiceAction extends SingletonAction<JoinVoiceSettings> {
	private cachedGlobal: GlobalSettings = { ...DEFAULT_GLOBAL };

	constructor() {
		super();
		streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
			this.cachedGlobal = { ...DEFAULT_GLOBAL, ...ev.settings };
		});
		void streamDeck.settings.getGlobalSettings();
	}

	override async onKeyDown(ev: KeyDownEvent<JoinVoiceSettings>): Promise<void> {
		const { channelId } = { ...DEFAULT_SETTINGS, ...ev.payload.settings };
		const { host, port, apiKey } = this.cachedGlobal;

		if (!channelId) {
			streamDeck.logger.warn("Join Voice: no channel configured.");
			await ev.action.showAlert();
			return;
		}

		const url = `http://${host}:${port}/api/streamdeck/voice/join`;

		try {
			const response = await fetchWithTimeout(
				url,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${apiKey}`,
					},
					body: JSON.stringify({ channelId }),
				},
				TIMEOUT_MS,
			);

			if (response.ok) {
				await ev.action.showOk();
				return;
			}

			switch (response.status) {
				case 401:
					streamDeck.logger.error("Join Voice: Invalid or unapproved API key.");
					await ev.action.showAlert();
					break;
				case 404:
					streamDeck.logger.error(`Join Voice: Channel not found — "${channelId}".`);
					await ev.action.showAlert();
					break;
				case 503:
					streamDeck.logger.warn("Join Voice: Bot not ready or already in a channel.");
					await ev.action.showAlert();
					break;
				default:
					streamDeck.logger.error(`Join Voice: Unexpected status ${response.status}.`);
					await ev.action.showAlert();
					break;
			}
		} catch (err) {
			streamDeck.logger.error(`Join Voice: Network error — ${err}`);
			await ev.action.showAlert();
		}
	}

	override async onWillAppear(ev: WillAppearEvent<JoinVoiceSettings>): Promise<void> {
		if (!ev.payload.settings.channelId) {
			await ev.action.setSettings({ ...DEFAULT_SETTINGS, ...ev.payload.settings });
		}
	}

	override async onPropertyInspectorDidAppear(
		ev: PropertyInspectorDidAppearEvent<JoinVoiceSettings>,
	): Promise<void> {
		const settings = await ev.action.getSettings();
		const channels = settings.cachedChannels ?? [];
		if (channels.length > 0) {
			await streamDeck.ui.sendToPropertyInspector({
				event: "channelsLoaded",
				channels,
			} satisfies PluginToPiMsg);
		}
	}

	override async onSendToPlugin(
		ev: SendToPluginEvent<PiToPluginMsg, JoinVoiceSettings>,
	): Promise<void> {
		const msg = ev.payload;
		if (msg.event === "refreshChannels") {
			streamDeck.logger.info(`Refresh channels: host=${msg.host} port=${msg.port}`);
			await this.fetchAndPushChannels(ev.action, msg.host, msg.port, msg.apiKey);
		}
	}

	private async fetchAndPushChannels(
		actionRef: Parameters<JoinVoiceAction["onSendToPlugin"]>[0]["action"],
		host: string,
		port: number,
		apiKey: string,
	): Promise<void> {
		const url = `http://${host}:${port}/api/streamdeck/voice/channels`;
		streamDeck.logger.info(`Fetching channels from ${url}`);

		try {
			const settings = await actionRef.getSettings();
			const response = await fetchWithTimeout(
				url,
				{ headers: { Authorization: `Bearer ${apiKey}` } },
				TIMEOUT_MS,
			);

			streamDeck.logger.info(`Channel fetch status: ${response.status}`);

			if (!response.ok) {
				await streamDeck.ui.sendToPropertyInspector({
					event: "channelsError",
					error: `Server returned ${response.status}`,
				} satisfies PluginToPiMsg);
				return;
			}

			const contentType = response.headers.get("content-type") ?? "";
			if (!contentType.includes("application/json")) {
				await streamDeck.ui.sendToPropertyInspector({
					event: "channelsError",
					error: `Server returned non-JSON response — check host/port settings`,
				} satisfies PluginToPiMsg);
				return;
			}

			const data = (await response.json()) as { channels: VoiceChannel[] };
			const channels = data.channels ?? [];

			streamDeck.logger.info(`Channels received: ${channels.length}`);

			await actionRef.setSettings({ ...settings, cachedChannels: channels });
			await streamDeck.ui.sendToPropertyInspector({
				event: "channelsLoaded",
				channels,
			} satisfies PluginToPiMsg);
		} catch (err) {
			streamDeck.logger.error(`Channel fetch error: ${err}`);
			await streamDeck.ui.sendToPropertyInspector({
				event: "channelsError",
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
