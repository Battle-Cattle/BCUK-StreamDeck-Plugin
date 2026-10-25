import { action, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { startRaffle } from "../raffleKeys";

/**
 * Start Raffle's per-button settings: `{}` before the property inspector saves any, and the amount
 * is whatever JSON was stored (the inspector saves a string; `startRaffle` checks it).
 */
export type RaffleSettings = Partial<{ amount: JsonValue }>;

/** The prize a new Start Raffle key starts with. */
const DEFAULT_AMOUNT = "100";

@action({ UUID: "com.expiredminotaur.bcuk.raffle" })
export class StartRaffleAction extends SingletonAction<RaffleSettings> {
	/**
	 * Starts a raffle for the key's configured amount, or the default when the key has never had
	 * one (a press can arrive before `onWillAppear`'s default reaches the settings). A blank amount
	 * that was saved on purpose is passed through, so it still gets the "no amount" alert.
	 * @param ev The key press, carrying the button's settings.
	 */
	override async onKeyDown(ev: KeyDownEvent<RaffleSettings>): Promise<void> {
		const { amount } = ev.payload.settings;
		await startRaffle(ev.action, amount === undefined ? DEFAULT_AMOUNT : amount);
	}

	/**
	 * Gives a new key the default amount, so it works before its settings are opened.
	 * @param ev The appearing key, carrying the button's settings.
	 */
	override async onWillAppear(ev: WillAppearEvent<RaffleSettings>): Promise<void> {
		if (!("amount" in ev.payload.settings)) await ev.action.setSettings({ amount: DEFAULT_AMOUNT });
	}
}
