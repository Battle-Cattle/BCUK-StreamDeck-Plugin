import streamDeck from "@elgato/streamdeck";
import { initGlobalSettings } from "./api";
import { PlaySfxAction } from "./actions/play-sfx";
import { JoinVoiceAction } from "./actions/join-voice";
import { LeaveVoiceAction } from "./actions/leave-voice";
import { TriggerCommandAction } from "./actions/trigger-command";
import { ToggleCommandAction } from "./actions/toggle-command";

// Keep the pre-3.x settings behaviour: initGlobalSettings() relies on getGlobalSettings() firing
// onDidReceiveGlobalSettings, and the new default would require Stream Deck 7.1+.
streamDeck.settings.useLegacySettingsBehavior = true;
initGlobalSettings();
streamDeck.actions.registerAction(new PlaySfxAction());
streamDeck.actions.registerAction(new JoinVoiceAction());
streamDeck.actions.registerAction(new LeaveVoiceAction());
streamDeck.actions.registerAction(new TriggerCommandAction());
streamDeck.actions.registerAction(new ToggleCommandAction());
streamDeck.connect();
