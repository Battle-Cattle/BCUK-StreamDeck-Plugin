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

let keyCount = 0;
function key(id = `key-${++keyCount}`) {
	return { id, showOk: vi.fn(), showAlert: vi.fn(), setState: vi.fn() };
}

/** An apiRequest result that resolves only when `resolve` is called, to control completion order. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => { resolve = r; });
	return { promise, resolve };
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

	it("discards a sync superseded by a newer sync for another command", async () => {
		const stale = deferred<unknown>();
		const fresh = deferred<unknown>();
		vi.mocked(apiRequest).mockReturnValueOnce(stale.promise as never).mockReturnValueOnce(fresh.promise as never);
		const k = key();

		const first = syncToggleState(k, "7");
		const second = syncToggleState(k, "8");
		fresh.resolve({ ok: true, data: { commands: [{ id: 8, name: "Stretch", isEnabled: false }] } });
		await second;
		stale.resolve({ ok: true, data: { commands: [{ id: 7, name: "Hydrate", isEnabled: true }] } });
		await first;

		expect(k.setState).toHaveBeenCalledTimes(1);
		expect(k.setState).toHaveBeenCalledWith(1);
	});

	it("discards a sync that finishes after a key press", async () => {
		const stale = deferred<unknown>();
		vi.mocked(apiRequest)
			.mockReturnValueOnce(stale.promise as never)
			.mockResolvedValueOnce({ ok: true, data: { isEnabled: false } });
		const k = key();

		const sync = syncToggleState(k, "7");
		await toggleCommand(k, "7");
		stale.resolve({ ok: true, data: { commands: [{ id: 7, name: "Hydrate", isEnabled: true }] } });
		await sync;

		expect(k.setState).toHaveBeenCalledTimes(1);
		expect(k.setState).toHaveBeenCalledWith(1);
	});

	it("keeps a toggle's response from overwriting the state of a newly selected command", async () => {
		const pressed = deferred<unknown>();
		vi.mocked(apiRequest)
			.mockReturnValueOnce(pressed.promise as never)
			.mockResolvedValueOnce({ ok: true, data: { commands: [{ id: 8, name: "Stretch", isEnabled: false }] } });
		const k = key();

		const press = toggleCommand(k, "7");
		await syncToggleState(k, "8");
		pressed.resolve({ ok: true, data: { isEnabled: true } });
		await press;

		expect(k.setState).toHaveBeenCalledTimes(1);
		expect(k.setState).toHaveBeenCalledWith(1);
		expect(k.showOk).toHaveBeenCalled();
	});

	it("tracks keys independently", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: { commands: [{ id: 7, name: "Hydrate", isEnabled: true }] } });
		const a = key();
		const b = key();
		await Promise.all([syncToggleState(a, "7"), syncToggleState(b, "7")]);
		expect(a.setState).toHaveBeenCalledWith(0);
		expect(b.setState).toHaveBeenCalledWith(0);
	});
});
