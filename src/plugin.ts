import streamDeck from "@elgato/streamdeck";
import { initGlobalSettings } from "./api";
import { PlaySfxAction } from "./actions/play-sfx";
import { JoinVoiceAction } from "./actions/join-voice";
import { LeaveVoiceAction } from "./actions/leave-voice";
import { TriggerCommandAction } from "./actions/trigger-command";
import { ToggleCommandAction } from "./actions/toggle-command";
import { StartRaffleAction } from "./actions/start-raffle";

initGlobalSettings();
streamDeck.actions.registerAction(new PlaySfxAction());
streamDeck.actions.registerAction(new JoinVoiceAction());
streamDeck.actions.registerAction(new LeaveVoiceAction());
streamDeck.actions.registerAction(new TriggerCommandAction());
streamDeck.actions.registerAction(new ToggleCommandAction());
streamDeck.actions.registerAction(new StartRaffleAction());
streamDeck.connect().catch((err: unknown) => {
	streamDeck.logger.error(`Couldn't connect to Stream Deck: ${err instanceof Error ? err.message : String(err)}`);
});
