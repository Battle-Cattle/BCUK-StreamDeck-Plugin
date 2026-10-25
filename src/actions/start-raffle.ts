import { action, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import { startRaffle } from "../raffleKeys";

/** Start Raffle's per-button settings, which may be `{}` before the property inspector saves any. */
export type RaffleSettings = Partial<{ amount: string }>;

/** The prize a new Start Raffle key starts with. */
const DEFAULT_AMOUNT = "100";

@action({ UUID: "com.expiredminotaur.bcuk.raffle" })
export class StartRaffleAction extends SingletonAction<RaffleSettings> {
	/**
	 * Starts a raffle for the key's configured amount.
	 * @param ev The key press, carrying the button's settings.
	 */
	override async onKeyDown(ev: KeyDownEvent<RaffleSettings>): Promise<void> {
		await startRaffle(ev.action, ev.payload.settings.amount);
	}

	/**
	 * Gives a new key the default amount, so it works before its settings are opened.
	 * @param ev The appearing key, carrying the button's settings.
	 */
	override async onWillAppear(ev: WillAppearEvent<RaffleSettings>): Promise<void> {
		if (!("amount" in ev.payload.settings)) await ev.action.setSettings({ amount: DEFAULT_AMOUNT });
	}
}
