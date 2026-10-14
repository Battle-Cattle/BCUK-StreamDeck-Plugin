import streamDeck from "@elgato/streamdeck";
import { initGlobalSettings } from "./api";
import { PlaySfxAction } from "./actions/play-sfx";
import { JoinVoiceAction } from "./actions/join-voice";
import { LeaveVoiceAction } from "./actions/leave-voice";

initGlobalSettings();
streamDeck.actions.registerAction(new PlaySfxAction());
streamDeck.actions.registerAction(new JoinVoiceAction());
streamDeck.actions.registerAction(new LeaveVoiceAction());
streamDeck.connect();
