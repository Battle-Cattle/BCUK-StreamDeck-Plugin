import { action, type KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import { QUICK_KEY_PRESS_TIMEOUT_MS } from "../api";
import { pressRequest } from "../keyRequest";
import { getLastJoinedGuildId, setLastJoinedGuildId } from "../voiceState";

@action({ UUID: "com.expiredminotaur.bcuk.leave" })
export class LeaveVoiceAction extends SingletonAction {
	/**
	 * Tells the bot to leave voice, showing OK or an alert on the key.
	 * @param ev The key press, whose key shows the result.
	 */
	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		// Name the guild this Stream Deck last joined when we know it; otherwise the bot leaves
		// whichever server the key owner is currently in voice in.
		const guildId = getLastJoinedGuildId();
		await pressRequest(ev.action, {
			label: "Leave Voice",
			path: "/voice/leave",
			body: guildId ? { guildId } : {},
			timeoutMs: QUICK_KEY_PRESS_TIMEOUT_MS,
			onOk: () => setLastJoinedGuildId(null),
		});
	}
}
