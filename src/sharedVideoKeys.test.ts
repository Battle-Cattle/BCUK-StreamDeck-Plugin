import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "./test-utils/streamdeckMock";
import { fakeAction } from "./test-utils/actionMocks";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());
vi.mock("./apiClient", async () => (await import("./test-utils/actionMocks")).apiClientModuleMock());
vi.mock("./globalSettings", async () => (await import("./test-utils/actionMocks")).globalSettingsModuleMock());

import streamDeck from "@elgato/streamdeck";
import { apiRequest, logFailure } from "./apiClient";
import { playSharedVideo } from "./sharedVideoKeys";

beforeEach(() => vi.clearAllMocks());

describe("playSharedVideo", () => {
	it("posts the video id and shows OK when overlays were reached", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: { ok: true, triggered: true, reached: 3 } });
		const key = fakeAction();

		await playSharedVideo(key, "7");

		expect(apiRequest).toHaveBeenCalledWith(expect.anything(), "/shared-videos/trigger", { videoId: 7 }, 5000);
		expect(key.showOk).toHaveBeenCalled();
		expect(key.showAlert).not.toHaveBeenCalled();
	});

	it("alerts, without an error log, when the bot's cooldown swallowed the press", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: { ok: true, triggered: false, reason: "cooldown" } });
		const key = fakeAction();

		await playSharedVideo(key, "7");

		expect(streamDeck.logger.info).toHaveBeenCalledWith("Play Shared Video 7: not sent (cooldown).");
		expect(key.showAlert).toHaveBeenCalled();
		expect(key.showOk).not.toHaveBeenCalled();
	});

	it("names a refusal without a reason in the log", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: { ok: true, triggered: false } });

		await playSharedVideo(fakeAction(), "7");

		expect(streamDeck.logger.info).toHaveBeenCalledWith("Play Shared Video 7: not sent (refused).");
	});

	it("alerts when no shared overlay is connected", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: { ok: true, triggered: true, reached: 0 } });
		const key = fakeAction();

		await playSharedVideo(key, "7");

		expect(streamDeck.logger.warn).toHaveBeenCalledWith("Play Shared Video 7: no shared overlay is connected.");
		expect(key.showAlert).toHaveBeenCalled();
		expect(key.showOk).not.toHaveBeenCalled();
	});

	it("alerts when the bot refuses, e.g. the video was disabled or deleted", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: false, status: 404, error: "video_not_found" });
		const key = fakeAction();

		await playSharedVideo(key, "7");

		expect(logFailure).toHaveBeenCalledWith("Play Shared Video 7", expect.objectContaining({ ok: false }));
		expect(key.showAlert).toHaveBeenCalled();
		expect(key.showOk).not.toHaveBeenCalled();
	});

	it.each([undefined, "", "0", "abc", 7])("alerts without calling the bot when no video is set (%j)", async (saved) => {
		const key = fakeAction();

		await playSharedVideo(key, saved);

		expect(apiRequest).not.toHaveBeenCalled();
		expect(streamDeck.logger.warn).toHaveBeenCalledWith("Play Shared Video: no video configured.");
		expect(key.showAlert).toHaveBeenCalled();
	});
});
