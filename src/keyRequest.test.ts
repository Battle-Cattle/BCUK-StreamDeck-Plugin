import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "./test-utils/streamdeckMock";
import { fakeAction } from "./test-utils/actionMocks";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());
vi.mock("./api", async () => (await import("./test-utils/actionMocks")).apiModuleMock());

import streamDeck from "@elgato/streamdeck";
import { apiRequest, logFailure } from "./api";
import { alertNotConfigured, pressRequest } from "./keyRequest";

beforeEach(() => vi.clearAllMocks());

describe("alertNotConfigured", () => {
	it("logs the warning and shows an alert", async () => {
		const key = fakeAction();

		await alertNotConfigured(key, "Play SFX: no command configured.");

		expect(streamDeck.logger.warn).toHaveBeenCalledWith("Play SFX: no command configured.");
		expect(key.showAlert).toHaveBeenCalled();
		expect(key.showOk).not.toHaveBeenCalled();
	});
});

describe("pressRequest", () => {
	it("posts the body with the given timeout, runs onOk with the response, then shows OK", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: { joined: true } });
		const key = fakeAction();
		const order: string[] = [];
		const onOk = vi.fn(() => order.push("onOk"));
		key.showOk.mockImplementation(() => order.push("showOk"));

		const result = await pressRequest(key, { label: "Join Voice", path: "/voice/join", body: { channelId: "c1" }, timeoutMs: 5000, onOk });

		expect(apiRequest).toHaveBeenCalledWith({ serverUrl: "https://bot.example", apiKey: "k" }, "/voice/join", { channelId: "c1" }, 5000);
		expect(onOk).toHaveBeenCalledWith({ joined: true });
		expect(order).toEqual(["onOk", "showOk"]);
		expect(result).toEqual({ ok: true, data: { joined: true } });
	});

	it("leaves the timeout off when none is given, so the API default applies", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: {} });

		await pressRequest(fakeAction(), { label: "Join Voice", path: "/voice/join", body: { channelId: "c1" } });

		expect(vi.mocked(apiRequest).mock.calls[0]).toHaveLength(3);
	});

	it("logs a failure under its label and shows an alert, without running onOk", async () => {
		const failure = { ok: false as const, status: 404, error: "Not found" };
		vi.mocked(apiRequest).mockResolvedValue(failure);
		const key = fakeAction();
		const onOk = vi.fn();

		const result = await pressRequest(key, { label: 'Play SFX "!clap"', path: "/sfx", body: { command: "!clap" }, onOk });

		expect(logFailure).toHaveBeenCalledWith('Play SFX "!clap"', failure);
		expect(key.showAlert).toHaveBeenCalled();
		expect(key.showOk).not.toHaveBeenCalled();
		expect(onOk).not.toHaveBeenCalled();
		expect(result).toBe(failure);
	});
});
