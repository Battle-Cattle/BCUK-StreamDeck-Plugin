import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "./test-utils/streamdeckMock";
import { fakeAction } from "./test-utils/actionMocks";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());
vi.mock("./api", async () => (await import("./test-utils/actionMocks")).apiModuleMock());

import streamDeck from "@elgato/streamdeck";
import { apiRequest, logFailure } from "./api";
import { startRaffle } from "./raffleKeys";

beforeEach(() => vi.clearAllMocks());

describe("startRaffle", () => {
	it("posts the trimmed amount and shows OK", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: { ok: true, amount: 1000 } });
		const key = fakeAction();

		await startRaffle(key, " 1K ");

		expect(apiRequest).toHaveBeenCalledWith(expect.anything(), "/raffle", { amount: "1K" }, 5000);
		expect(key.showOk).toHaveBeenCalled();
	});

	it("alerts when the bot refuses, e.g. a raffle is already running", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: false, status: 409, error: "raffle_already_running" });
		const key = fakeAction();

		await startRaffle(key, "100");

		expect(logFailure).toHaveBeenCalledWith("Start Raffle 100", expect.objectContaining({ ok: false }));
		expect(key.showAlert).toHaveBeenCalled();
	});

	it.each([undefined, "", "   "])("alerts without calling the bot when no amount is set (%j)", async (amount) => {
		const key = fakeAction();

		await startRaffle(key, amount);

		expect(apiRequest).not.toHaveBeenCalled();
		expect(streamDeck.logger.warn).toHaveBeenCalledWith("Start Raffle: no amount configured.");
		expect(key.showAlert).toHaveBeenCalled();
	});
});
