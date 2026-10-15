import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "./test-utils/streamdeckMock";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());
vi.mock("./api", () => ({
	apiRequest: vi.fn(),
	getConnection: vi.fn(() => ({ serverUrl: "https://bot.example", apiKey: "k" })),
	logFailure: vi.fn(),
	QUICK_KEY_PRESS_TIMEOUT_MS: 5000,
}));

import { apiRequest, logFailure } from "./api";
import { stateFor, syncToggleState, toggleCommand, triggerCommand } from "./advancedCommandKeys";

function key() {
	return { showOk: vi.fn(), showAlert: vi.fn(), setState: vi.fn() };
}

beforeEach(() => vi.clearAllMocks());

describe("triggerCommand", () => {
	it("fires the saved command and shows OK", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: {} });
		const k = key();
		await triggerCommand(k, "7");
		expect(apiRequest).toHaveBeenCalledWith(expect.anything(), "/advanced-commands/trigger", { commandId: 7 }, 5000);
		expect(k.showOk).toHaveBeenCalled();
	});

	it("alerts without a command, and on a failed request", async () => {
		const unset = key();
		await triggerCommand(unset, "");
		expect(unset.showAlert).toHaveBeenCalled();
		expect(apiRequest).not.toHaveBeenCalled();

		vi.mocked(apiRequest).mockResolvedValue({ ok: false, status: 409, error: "command_disabled" });
		const failed = key();
		await triggerCommand(failed, "7");
		expect(failed.showAlert).toHaveBeenCalled();
		expect(logFailure).toHaveBeenCalled();
	});
});

describe("toggleCommand", () => {
	it("maps enabled to state 0 and disabled to state 1", () => {
		expect(stateFor(true)).toBe(0);
		expect(stateFor(false)).toBe(1);
	});

	it("toggles the command and shows its new state", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: { isEnabled: false } });
		const k = key();
		await toggleCommand(k, "7");
		expect(apiRequest).toHaveBeenCalledWith(expect.anything(), "/advanced-commands/enabled", { commandId: 7 }, 5000);
		expect(k.setState).toHaveBeenCalledWith(1);
		expect(k.showOk).toHaveBeenCalled();
	});

	it("alerts when the response lacks the new state, fails, or no command is set", async () => {
		vi.mocked(apiRequest).mockResolvedValueOnce({ ok: true, data: {} });
		const noState = key();
		await toggleCommand(noState, "7");
		expect(noState.showAlert).toHaveBeenCalled();
		expect(noState.setState).not.toHaveBeenCalled();

		vi.mocked(apiRequest).mockResolvedValueOnce({ ok: false, status: 404, error: "command_not_found" });
		const failed = key();
		await toggleCommand(failed, "7");
		expect(failed.showAlert).toHaveBeenCalled();

		const unset = key();
		await toggleCommand(unset, undefined);
		expect(unset.showAlert).toHaveBeenCalled();
		expect(apiRequest).toHaveBeenCalledTimes(2);
	});
});

describe("syncToggleState", () => {
	it("shows the command's current state", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: { commands: [{ id: 7, name: "Hydrate", isEnabled: true }] } });
		const k = key();
		await syncToggleState(k, "7");
		expect(apiRequest).toHaveBeenCalledWith(expect.anything(), "/advanced-commands", undefined, 5000);
		expect(k.setState).toHaveBeenCalledWith(0);
	});

	it("leaves the key alone when unset, gone or unreachable", async () => {
		const unset = key();
		await syncToggleState(unset, "");
		expect(apiRequest).not.toHaveBeenCalled();

		vi.mocked(apiRequest).mockResolvedValueOnce({ ok: true, data: { commands: [] } });
		const gone = key();
		await syncToggleState(gone, "7");
		expect(gone.setState).not.toHaveBeenCalled();

		vi.mocked(apiRequest).mockResolvedValueOnce({ ok: false, status: null, error: "offline" });
		const offline = key();
		await syncToggleState(offline, "7");
		expect(offline.setState).not.toHaveBeenCalled();
		expect(logFailure).toHaveBeenCalled();
	});
});
