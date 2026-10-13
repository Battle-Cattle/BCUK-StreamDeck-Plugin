import streamDeck, {
	action,
	type KeyDownEvent,
	SingletonAction,
} from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";

interface GlobalSettings extends JsonObject {
	[key: string]: JsonValue;
	host: string;
	port: number;
	apiKey: string;
}

const DEFAULT_GLOBAL: GlobalSettings = {
	host: "localhost",
	port: 3000,
	apiKey: "",
};

const TIMEOUT_MS = 20000;

@action({ UUID: "com.expiredminotaur.bcuk.leave" })
export class LeaveVoiceAction extends SingletonAction {
	private cachedGlobal: GlobalSettings = { ...DEFAULT_GLOBAL };

	constructor() {
		super();
		streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
			this.cachedGlobal = { ...DEFAULT_GLOBAL, ...ev.settings };
		});
		void streamDeck.settings.getGlobalSettings();
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const { host, port, apiKey } = this.cachedGlobal;
		const url = `http://${host}:${port}/api/streamdeck/voice/leave`;

		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
			const response = await fetch(url, {
				method: "POST",
				headers: { Authorization: `Bearer ${apiKey}` },
				signal: controller.signal,
			}).finally(() => clearTimeout(timer));

			if (response.ok) {
				await ev.action.showOk();
				return;
			}

			switch (response.status) {
				case 401:
					streamDeck.logger.error("Leave Voice: Invalid or unapproved API key.");
					break;
				case 503:
					streamDeck.logger.warn("Leave Voice: Bot not in a voice channel.");
					break;
				default:
					streamDeck.logger.error(`Leave Voice: Unexpected status ${response.status}.`);
					break;
			}
			await ev.action.showAlert();
		} catch (err) {
			streamDeck.logger.error(`Leave Voice: Network error — ${err}`);
			await ev.action.showAlert();
		}
	}
}
