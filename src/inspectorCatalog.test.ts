import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "./test-utils/streamdeckMock";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());
vi.mock("./api", () => ({
	apiRequest: vi.fn(),
	getConnection: vi.fn(),
	logFailure: vi.fn(),
}));

import streamDeck from "@elgato/streamdeck";
import { apiRequest, getConnection, logFailure } from "./api";
import { InspectorCatalog } from "./inspectorCatalog";

const send = vi.mocked(streamDeck.ui.sendToPropertyInspector);
const conn = { serverUrl: "https://bot.example", apiKey: "k" };

function makeCatalog() {
	return new InspectorCatalog<string>({
		label: "things",
		path: "/things",
		parse: (body) => (Array.isArray(body.things) ? body.things.filter((t): t is string => typeof t === "string") : []),
		key: (thing) => thing,
		loadedEvent: "thingsLoaded",
		errorEvent: "thingsError",
		listKey: "things",
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(getConnection).mockReturnValue(conn);
});

describe("InspectorCatalog", () => {
	it("fetches, keeps and sends the parsed list", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: { things: ["a", 1, "b"] } });
		const catalog = makeCatalog();
		await catalog.refresh(conn);
		expect(apiRequest).toHaveBeenCalledWith(conn, "/things");
		expect(send).toHaveBeenLastCalledWith({ event: "thingsLoaded", things: ["a", "b"] });

		// A later inspector open re-sends the kept list without fetching again.
		await catalog.show();
		expect(apiRequest).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenLastCalledWith({ event: "thingsLoaded", things: ["a", "b"] });
	});

	it("sends the bot's error to the inspector and logs it", async () => {
		const failure = { ok: false as const, status: 403, error: "Key not approved for any guild" };
		vi.mocked(apiRequest).mockResolvedValue(failure);
		await makeCatalog().refresh(conn);
		expect(logFailure).toHaveBeenCalledWith("Fetch things", failure);
		expect(send).toHaveBeenCalledWith({ event: "thingsError", error: "Key not approved for any guild" });
	});

	it("fetches on first show when a key is configured", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: { things: ["x"] } });
		await makeCatalog().show();
		expect(apiRequest).toHaveBeenCalledWith(conn, "/things");
	});

	it("does nothing on first show without an API key", async () => {
		vi.mocked(getConnection).mockReturnValue({ serverUrl: "https://bot.example", apiKey: "" });
		await makeCatalog().show();
		expect(apiRequest).not.toHaveBeenCalled();
		expect(send).not.toHaveBeenCalled();
	});

	it("merges seeded items from several legacy buttons without duplicates", async () => {
		const catalog = makeCatalog();
		catalog.seed(["a", "b"]);
		catalog.seed(["b", "c"]);
		await catalog.show();
		expect(apiRequest).not.toHaveBeenCalled();
		expect(send).toHaveBeenLastCalledWith({ event: "thingsLoaded", things: ["a", "b", "c"] });
	});

	it("refetches when the server URL or API key has changed since the list was loaded", async () => {
		vi.mocked(apiRequest).mockResolvedValueOnce({ ok: true, data: { things: ["old"] } });
		const catalog = makeCatalog();
		await catalog.refresh(conn);

		const newConn = { serverUrl: "https://other.example", apiKey: "k2" };
		vi.mocked(getConnection).mockReturnValue(newConn);
		vi.mocked(apiRequest).mockResolvedValueOnce({ ok: true, data: { things: ["new"] } });
		await catalog.show();
		expect(apiRequest).toHaveBeenLastCalledWith(newConn, "/things");
		expect(send).toHaveBeenLastCalledWith({ event: "thingsLoaded", things: ["new"] });
	});

	it("drops a stale list without fetching when the new connection has no key", async () => {
		vi.mocked(apiRequest).mockResolvedValueOnce({ ok: true, data: { things: ["old"] } });
		const catalog = makeCatalog();
		await catalog.refresh(conn);
		send.mockClear();

		vi.mocked(getConnection).mockReturnValue({ serverUrl: "https://other.example", apiKey: "" });
		await catalog.show();
		expect(apiRequest).toHaveBeenCalledTimes(1);
		expect(send).not.toHaveBeenCalled();
	});
});
