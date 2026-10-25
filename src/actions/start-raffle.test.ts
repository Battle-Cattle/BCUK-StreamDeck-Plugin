import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "../test-utils/streamdeckMock";
import { fakeAction, fakeEvent } from "../test-utils/actionMocks";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());
vi.mock("../raffleKeys", () => ({ startRaffle: vi.fn() }));

import { startRaffle } from "../raffleKeys";
import { StartRaffleAction } from "./start-raffle";

beforeEach(() => vi.clearAllMocks());

describe("StartRaffleAction", () => {
	it("starts a raffle for the button's amount on a key press", async () => {
		const action = fakeAction();

		await new StartRaffleAction().onKeyDown(fakeEvent({ settings: { amount: "1K" } }, action));

		expect(startRaffle).toHaveBeenCalledWith(action, "1K");
	});

	it("gives a new button the default amount, and leaves a configured one alone", async () => {
		const raffle = new StartRaffleAction();
		const fresh = fakeAction();
		const configured = fakeAction();

		await raffle.onWillAppear(fakeEvent({ settings: {} }, fresh));
		await raffle.onWillAppear(fakeEvent({ settings: { amount: "500" } }, configured));

		expect(fresh.setSettings).toHaveBeenCalledWith({ amount: "100" });
		expect(configured.setSettings).not.toHaveBeenCalled();
	});
});
