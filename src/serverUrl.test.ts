import { describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "./test-utils/streamdeckMock";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());

import streamDeck from "@elgato/streamdeck";
import { connectionKey, isLoopbackHost, isPlainHttpToRemote, normalizeServerUrl, warnIfInsecure } from "./serverUrl";

describe("normalizeServerUrl", () => {
	it("assumes https for a bare host", () => {
		expect(normalizeServerUrl("bot.example.com")).toBe("https://bot.example.com");
	});

	it("keeps an explicit http scheme and port", () => {
		expect(normalizeServerUrl(" http://192.168.1.5:3000/ ")).toBe("http://192.168.1.5:3000");
	});

	it("keeps a sub-path without its trailing slash", () => {
		expect(normalizeServerUrl("https://example.com/bot/")).toBe("https://example.com/bot");
	});

	it("assumes plain http only for a bare loopback address, where it never leaves the machine", () => {
		expect(normalizeServerUrl("localhost:3000")).toBe("http://localhost:3000");
		expect(normalizeServerUrl("127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
		expect(normalizeServerUrl("[::1]:3000")).toBe("http://[::1]:3000");
	});

	it("assumes https for a bare LAN or public address, so the key isn't sent unencrypted by default", () => {
		expect(normalizeServerUrl("192.168.1.5:3000")).toBe("https://192.168.1.5:3000");
		expect(normalizeServerUrl("10.0.0.2:3000")).toBe("https://10.0.0.2:3000");
		expect(normalizeServerUrl("203.0.113.7")).toBe("https://203.0.113.7");
	});

	it("rejects blanks, non-http schemes and garbage", () => {
		expect(normalizeServerUrl("")).toBeNull();
		expect(normalizeServerUrl("ftp://example.com")).toBeNull();
		expect(normalizeServerUrl("http://")).toBeNull();
	});

	it("assumes https, then rejects, a bare host that can't be parsed", () => {
		expect(normalizeServerUrl("bad host:3000")).toBeNull();
	});
});

describe("isLoopbackHost", () => {
	it("recognises localhost, 127.x.x.x and [::1]", () => {
		for (const host of ["localhost", "[::1]", "127.0.0.1", "127.1.2.3"]) {
			expect(isLoopbackHost(host), host).toBe(true);
		}
	});

	it("rejects LAN and public addresses and names", () => {
		for (const host of ["bot.example.com", "192.168.0.10", "10.1.2.3", "172.16.0.1", "8.8.8.8", "localhost.example.com", "128.0.0.1"]) {
			expect(isLoopbackHost(host), host).toBe(false);
		}
	});
});

describe("connectionKey", () => {
	it("treats cosmetic Server URL differences as the same bot", () => {
		expect(connectionKey({ serverUrl: "bot.example.com", apiKey: "k" }))
			.toBe(connectionKey({ serverUrl: "https://bot.example.com/", apiKey: "k" }));
	});

	it("tells different bots and keys apart", () => {
		const base = connectionKey({ serverUrl: "https://a.example", apiKey: "k" });
		expect(connectionKey({ serverUrl: "https://b.example", apiKey: "k" })).not.toBe(base);
		expect(connectionKey({ serverUrl: "https://a.example", apiKey: "k2" })).not.toBe(base);
	});

	it("falls back to the raw text for an invalid Server URL", () => {
		expect(connectionKey({ serverUrl: "ftp://x", apiKey: "k" })).toBe("ftp://x\nk");
	});
});

describe("isPlainHttpToRemote", () => {
	it("flags plain HTTP to another machine", () => {
		expect(isPlainHttpToRemote("http://192.168.1.5:3000")).toBe(true);
		expect(isPlainHttpToRemote("http://bot.lan:3000")).toBe(true);
	});

	it("allows https, any loopback address, and an unset or invalid URL", () => {
		expect(isPlainHttpToRemote("https://bot.example.com")).toBe(false);
		expect(isPlainHttpToRemote("http://127.0.0.2:3000")).toBe(false);
		expect(isPlainHttpToRemote("http://localhost:3000")).toBe(false);
		expect(isPlainHttpToRemote("http://[::1]:3000")).toBe(false);
		expect(isPlainHttpToRemote("")).toBe(false);
		expect(isPlainHttpToRemote("ftp://bot")).toBe(false);
	});
});

describe("warnIfInsecure", () => {
	it("warns once when the API key would go over plain HTTP to another machine", () => {
		vi.mocked(streamDeck.logger.warn).mockClear();

		warnIfInsecure("http://bot.lan:3000");
		warnIfInsecure("http://bot.lan:3000/");
		expect(streamDeck.logger.warn).toHaveBeenCalledTimes(1);
		expect(vi.mocked(streamDeck.logger.warn).mock.calls[0]![0]).toContain("http://bot.lan:3000");

		warnIfInsecure("https://bot.example.com");
		warnIfInsecure("");
		expect(streamDeck.logger.warn).toHaveBeenCalledTimes(1);
	});

	it("warns once per URL even when switching back, and keeps credentials out of the log", () => {
		vi.mocked(streamDeck.logger.warn).mockClear();

		warnIfInsecure("http://user:secret@a.lan:3000/hook/pathsecret?token=t");
		warnIfInsecure("http://b.lan:3000");
		warnIfInsecure("http://user:secret@a.lan:3000/hook/pathsecret?token=t");
		expect(streamDeck.logger.warn).toHaveBeenCalledTimes(2);
		const first = vi.mocked(streamDeck.logger.warn).mock.calls[0]![0] as string;
		expect(first).toContain("http://a.lan:3000");
		expect(first).not.toContain("secret");
		expect(first).not.toContain("token");
		expect(first).not.toContain("pathsecret");
	});
});
