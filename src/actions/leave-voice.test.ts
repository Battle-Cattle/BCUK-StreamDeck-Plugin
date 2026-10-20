import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "../test-utils/streamdeckMock";
import { fakeAction, fakeEvent } from "../test-utils/actionMocks";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());
vi.mock("../api", () => ({
	apiRequest: vi.fn(),
	getConnection: vi.fn(() => ({ serverUrl: "https://bot.example", apiKey: "k" })),
	logFailure: vi.fn(),
	QUICK_KEY_PRESS_TIMEOUT_MS: 5000,
}));

import { apiRequest, logFailure } from "../api";
import { getLastJoinedGuildId, setLastJoinedGuildId } from "../voiceState";
import { LeaveVoiceAction } from "./leave-voice";

beforeEach(() => {
	vi.clearAllMocks();
	setLastJoinedGuildId(null);
});

describe("LeaveVoiceAction", () => {
	it("names the server this Stream Deck last joined, then forgets it", async () => {
		setLastJoinedGuildId("g1");
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: {} });
		const action = fakeAction();

		await new LeaveVoiceAction().onKeyDown(fakeEvent({ settings: {} }, action));

		expect(apiRequest).toHaveBeenCalledWith(expect.anything(), "/voice/leave", { guildId: "g1" }, 5000);
		expect(action.showOk).toHaveBeenCalled();
		expect(getLastJoinedGuildId()).toBeNull();
	});

	it("lets the bot find the key owner's server when none is known", async () => {
		vi.mocked(apiRequest).mockResolvedValue({ ok: true, data: {} });

		await new LeaveVoiceAction().onKeyDown(fakeEvent({ settings: {} }));

		expect(apiRequest).toHaveBeenCalledWith(expect.anything(), "/voice/leave", {}, 5000);
	});

	it("alerts on a failed leave and keeps the server for a retry", async () => {
		setLastJoinedGuildId("g1");
		vi.mocked(apiRequest).mockResolvedValue({ ok: false, status: null, error: "timeout" });
		const action = fakeAction();

		await new LeaveVoiceAction().onKeyDown(fakeEvent({ settings: {} }, action));

		expect(action.showAlert).toHaveBeenCalled();
		expect(logFailure).toHaveBeenCalledWith("Leave Voice", expect.objectContaining({ ok: false }));
		expect(getLastJoinedGuildId()).toBe("g1");
	});
});
