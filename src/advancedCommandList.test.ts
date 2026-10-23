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
import { syncToggleState } from "./advancedCommandKeys";

const connection = { serverUrl: "https://bot.example", apiKey: "k" };
const list = { ok: true, data: { commands: [{ id: 7, name: "Hydrate", isEnabled: true }] } } as const;

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
});
