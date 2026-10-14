import { action, type KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import { apiRequest, getConnection, logFailure } from "../api";
import { getLastJoinedGuildId, setLastJoinedGuildId } from "../voiceState";

@action({ UUID: "com.expiredminotaur.bcuk.leave" })
export class LeaveVoiceAction extends SingletonAction {
	/** Tells the bot to leave voice, showing OK or an alert on the key. */
	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		// Name the guild this Stream Deck last joined when we know it; otherwise the bot leaves
		// whichever server the key owner is currently in voice in.
		const guildId = getLastJoinedGuildId();
		const result = await apiRequest(getConnection(), "/voice/leave", guildId ? { guildId } : {});
		if (result.ok) {
			setLastJoinedGuildId(null);
			await ev.action.showOk();
			return;
		}
		logFailure("Leave Voice", result);
		await ev.action.showAlert();
	}
}
