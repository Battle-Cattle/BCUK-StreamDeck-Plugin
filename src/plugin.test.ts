import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "./test-utils/streamdeckMock";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());
vi.mock("./api", () => ({ initGlobalSettings: vi.fn() }));
vi.mock("./actions/play-sfx", () => ({ PlaySfxAction: class {} }));
vi.mock("./actions/join-voice", () => ({ JoinVoiceAction: class {} }));
vi.mock("./actions/leave-voice", () => ({ LeaveVoiceAction: class {} }));
vi.mock("./actions/trigger-command", () => ({ TriggerCommandAction: class {} }));
vi.mock("./actions/toggle-command", () => ({ ToggleCommandAction: class {} }));

import streamDeck from "@elgato/streamdeck";
import { initGlobalSettings } from "./api";

/** Imports plugin.ts afresh, so its start-up code runs again, and waits for its connect handling. */
async function startPlugin(): Promise<void> {
	vi.resetModules();
	await import("./plugin");
	// Let the connect() promise settle and its catch handler run.
	await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(streamDeck.connect).mockResolvedValue();
});

describe("plugin start-up", () => {
	it("registers every action, then connects", async () => {
		await startPlugin();

		expect(initGlobalSettings).toHaveBeenCalledOnce();
		expect(streamDeck.actions.registerAction).toHaveBeenCalledTimes(5);
		expect(streamDeck.connect).toHaveBeenCalledOnce();
		expect(streamDeck.logger.error).not.toHaveBeenCalled();
	});

	it("logs a connection failure's message", async () => {
		vi.mocked(streamDeck.connect).mockRejectedValue(new Error("socket closed"));

		await startPlugin();

		expect(streamDeck.logger.error).toHaveBeenCalledWith("Couldn't connect to Stream Deck: socket closed");
	});

	it("logs a non-Error rejection as text", async () => {
		vi.mocked(streamDeck.connect).mockRejectedValue("port in use");

		await startPlugin();

		expect(streamDeck.logger.error).toHaveBeenCalledWith("Couldn't connect to Stream Deck: port in use");
	});
});
