import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { streamDeckModuleMock } from "./test-utils/streamdeckMock";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());

import { apiRequest, isLoopbackHost, migrateGlobalSettings, normalizeServerUrl } from "./api";

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

describe("migrateGlobalSettings", () => {
	it("prefers a saved serverUrl", () => {
		expect(migrateGlobalSettings({ serverUrl: "https://a.example", host: "old", port: 1, apiKey: "k" }))
			.toEqual({ serverUrl: "https://a.example", apiKey: "k" });
	});

	it("builds a plain-HTTP URL from legacy host/port", () => {
		expect(migrateGlobalSettings({ host: "bot.lan", port: 3001, apiKey: "k" }))
			.toEqual({ serverUrl: "http://bot.lan:3001", apiKey: "k" });
	});

	it("defaults the legacy port to 3000 and tolerates empty settings", () => {
		expect(migrateGlobalSettings({ host: "bot.lan" }).serverUrl).toBe("http://bot.lan:3000");
		expect(migrateGlobalSettings({})).toEqual({ serverUrl: "", apiKey: "" });
	});
});

describe("apiRequest", () => {
	let server: http.Server;
	let baseUrl: string;
	const seen: { method?: string; url?: string; auth?: string; body?: string } = {};

	beforeAll(async () => {
		server = http.createServer((req, res) => {
			let body = "";
			req.on("data", (c) => { body += c; });
			req.on("end", () => {
				Object.assign(seen, { method: req.method, url: req.url, auth: req.headers.authorization, body });
				const send = (status: number, payload: string, type = "application/json") => {
					res.writeHead(status, { "Content-Type": type });
					res.end(payload);
				};
				if (req.url === "/api/streamdeck/ok") send(200, JSON.stringify({ ok: true, value: 1 }));
				else if (req.url === "/api/streamdeck/forbidden") send(403, JSON.stringify({ ok: false, error: "Key not approved for this guild" }));
				else if (req.url === "/api/streamdeck/limited") send(429, "Too many requests", "text/plain");
				else if (req.url === "/api/streamdeck/slow") setTimeout(() => send(200, JSON.stringify({ ok: true })), 300);
				else send(200, "<html>proxy page</html>", "text/html");
			});
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

	it("POSTs JSON with the Bearer key and returns the parsed body", async () => {
		const result = await apiRequest(
			{ serverUrl: `${baseUrl}/`, apiKey: "secret" },
			"/ok",
			{ command: "!ding" },
		);
		expect(result).toEqual({ ok: true, data: { ok: true, value: 1 } });
		expect(seen).toMatchObject({ method: "POST", url: "/api/streamdeck/ok", auth: "Bearer secret", body: '{"command":"!ding"}' });
	});

	it("GETs when there is no body", async () => {
		await apiRequest({ serverUrl: baseUrl, apiKey: "secret" }, "/ok");
		expect(seen.method).toBe("GET");
	});

	it("surfaces the bot's own error text", async () => {
		expect(await apiRequest({ serverUrl: baseUrl, apiKey: "k" }, "/forbidden"))
			.toEqual({ ok: false, status: 403, error: "Key not approved for this guild" });
	});

	it("falls back to a status message when the error body isn't JSON", async () => {
		expect(await apiRequest({ serverUrl: baseUrl, apiKey: "k" }, "/limited"))
			.toEqual({ ok: false, status: 429, error: "Too many requests — slow down" });
	});

	it("treats a non-JSON success (e.g. a proxy page) as a failure", async () => {
		const result = await apiRequest({ serverUrl: baseUrl, apiKey: "k" }, "/elsewhere");
		expect(result.ok).toBe(false);
		expect(!result.ok && result.error).toMatch(/non-JSON/);
	});

	it("reports missing settings without making a request", async () => {
		expect(await apiRequest({ serverUrl: "", apiKey: "k" }, "/ok")).toMatchObject({ ok: false, status: null, error: "Server URL is not set or invalid" });
		expect(await apiRequest({ serverUrl: baseUrl, apiKey: "" }, "/ok")).toMatchObject({ ok: false, status: null, error: "API key is not set" });
	});

	it("gives up after the per-call timeout", async () => {
		expect(await apiRequest({ serverUrl: baseUrl, apiKey: "k" }, "/slow", undefined, 50))
			.toEqual({ ok: false, status: null, error: "Request timed out" });
	});

	it("reports network errors with a null status", async () => {
		const result = await apiRequest({ serverUrl: "http://127.0.0.1:1", apiKey: "k" }, "/ok");
		expect(result).toMatchObject({ ok: false, status: null });
		expect(!result.ok && result.error).toMatch(/^Network error/);
	});
});
