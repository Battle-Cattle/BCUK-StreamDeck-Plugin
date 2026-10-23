import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "./test-utils/streamdeckMock";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());
vi.mock("./api", () => ({
	apiRequest: vi.fn(),
	getConnection: vi.fn(() => ({ serverUrl: "https://bot.example", apiKey: "k" })),
	logFailure: vi.fn(),
	QUICK_KEY_PRESS_TIMEOUT_MS: 5000,
}));

import { apiRequest, getConnection } from "./api";
import { ADVANCED_COMMAND_LIST_TTL_MS, fetchAdvancedCommandList, invalidateAdvancedCommandList } from "./advancedCommandList";
import { syncToggleState, toggleCommand } from "./advancedCommandKeys";

const connection = { serverUrl: "https://bot.example", apiKey: "k" };
const list = { ok: true, data: { commands: [{ id: 7, name: "Hydrate", isEnabled: true }] } } as const;

/** An apiRequest result that resolves only when `resolve` is called. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => { resolve = r; });
	return { promise, resolve };
}

let keyCount = 0;
function key() {
	return { id: `list-key-${++keyCount}`, showOk: vi.fn(), showAlert: vi.fn(), setState: vi.fn() };
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers();
	invalidateAdvancedCommandList();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("fetchAdvancedCommandList", () => {
	it("makes one request for a page of Toggle keys syncing together", async () => {
		vi.mocked(apiRequest).mockResolvedValue(list);
		const keys = [key(), key(), key(), key(), key()];

		await Promise.all(keys.map((k) => syncToggleState(k, "7")));

		expect(apiRequest).toHaveBeenCalledTimes(1);
		expect(apiRequest).toHaveBeenCalledWith(connection, "/advanced-commands", undefined, 5000);
		for (const k of keys) expect(k.setState).toHaveBeenCalledWith(0);
	});

	it("reuses a successful list within the TTL and fetches again after it", async () => {
		vi.mocked(apiRequest).mockResolvedValue(list);

		await fetchAdvancedCommandList(connection);
		vi.advanceTimersByTime(ADVANCED_COMMAND_LIST_TTL_MS - 1);
		await fetchAdvancedCommandList(connection);
		expect(apiRequest).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(1);
		await fetchAdvancedCommandList(connection);
		expect(apiRequest).toHaveBeenCalledTimes(2);
	});

	it("doesn't reuse a failed request", async () => {
		vi.mocked(apiRequest)
			.mockResolvedValueOnce({ ok: false, status: null, error: "offline" })
			.mockResolvedValueOnce(list);

		const failed = await fetchAdvancedCommandList(connection);
		const retried = await fetchAdvancedCommandList(connection);

		expect(failed.ok).toBe(false);
		expect(retried).toEqual(list);
		expect(apiRequest).toHaveBeenCalledTimes(2);
	});

	it("doesn't share a list between different Server URLs or API keys", async () => {
		vi.mocked(apiRequest).mockResolvedValue(list);

		await fetchAdvancedCommandList(connection);
		await fetchAdvancedCommandList({ ...connection, apiKey: "other" });
		await fetchAdvancedCommandList({ ...connection, serverUrl: "https://other.example" });

		expect(apiRequest).toHaveBeenCalledTimes(3);
	});

	it("fetches again after the list is invalidated, e.g. by a toggle press", async () => {
		vi.mocked(apiRequest).mockResolvedValue(list);

		await fetchAdvancedCommandList(connection);
		invalidateAdvancedCommandList();
		await fetchAdvancedCommandList(connection);

		expect(apiRequest).toHaveBeenCalledTimes(2);
	});

	it("uses the current settings for each sync", async () => {
		vi.mocked(apiRequest).mockResolvedValue(list);
		vi.mocked(getConnection).mockReturnValueOnce({ serverUrl: "https://new.example", apiKey: "k2" });

		await syncToggleState(key(), "7");

		expect(apiRequest).toHaveBeenCalledWith({ serverUrl: "https://new.example", apiKey: "k2" }, "/advanced-commands", undefined, 5000);
	});

	it("joins a request that is still in flight, however long it has taken", async () => {
		const slow = deferred<unknown>();
		vi.mocked(apiRequest).mockReturnValueOnce(slow.promise as never);

		const first = fetchAdvancedCommandList(connection);
		vi.advanceTimersByTime(ADVANCED_COMMAND_LIST_TTL_MS + 1_000);
		const second = fetchAdvancedCommandList(connection);
		slow.resolve(list);

		expect(await first).toEqual(list);
		expect(await second).toEqual(list);
		expect(apiRequest).toHaveBeenCalledTimes(1);
	});

	it("starts the reuse window when the list arrives, not when it was requested", async () => {
		const slow = deferred<unknown>();
		vi.mocked(apiRequest).mockReturnValueOnce(slow.promise as never).mockResolvedValue(list);

		const first = fetchAdvancedCommandList(connection);
		vi.advanceTimersByTime(ADVANCED_COMMAND_LIST_TTL_MS + 1_000);
		slow.resolve(list);
		await first;
		await fetchAdvancedCommandList(connection);

		expect(apiRequest).toHaveBeenCalledTimes(1);
	});

	it("fetches again when a toggle press invalidated the list while a fetch was waiting", async () => {
		const stale = deferred<unknown>();
		const fresh = { ok: true, data: { commands: [{ id: 7, name: "Hydrate", isEnabled: false }] } } as const;
		vi.mocked(apiRequest).mockReturnValueOnce(stale.promise as never).mockResolvedValueOnce(fresh);

		const pending = fetchAdvancedCommandList(connection);
		invalidateAdvancedCommandList();
		stale.resolve(list);

		expect(await pending).toEqual(fresh);
		expect(apiRequest).toHaveBeenCalledTimes(2);
	});

	it("shows a press's new state on another key showing the same command", async () => {
		const stale = deferred<unknown>();
		vi.mocked(apiRequest)
			.mockReturnValueOnce(stale.promise as never) // the other key's sync, sent before the press
			.mockResolvedValueOnce({ ok: true, data: { isEnabled: false } }) // the press
			.mockResolvedValueOnce({ ok: true, data: { commands: [{ id: 7, name: "Hydrate", isEnabled: false }] } });
		const pressed = key();
		const other = key();

		const sync = syncToggleState(other, "7");
		await toggleCommand(pressed, "7");
		stale.resolve(list); // still says enabled
		await sync;

		expect(other.setState).toHaveBeenCalledTimes(1);
		expect(other.setState).toHaveBeenCalledWith(1);
	});
});
