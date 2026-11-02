import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { streamDeckModuleMock } from "./test-utils/streamdeckMock";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());

import streamDeck from "@elgato/streamdeck";
import { apiRequest, describeNetworkError, logFailure } from "./apiClient";

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
				else if (req.url === "/api/streamdeck/unauthorized") send(401, "Unauthorized", "text/plain");
				else if (req.url === "/api/streamdeck/not-approved") send(403, JSON.stringify({ ok: false }));
				else if (req.url === "/api/streamdeck/broken") send(500, "Internal error", "text/plain");
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

	it("falls back to a message for each status the bot answers without an error text", async () => {
		expect(await apiRequest({ serverUrl: baseUrl, apiKey: "k" }, "/unauthorized"))
			.toEqual({ ok: false, status: 401, error: "Invalid API key" });
		expect(await apiRequest({ serverUrl: baseUrl, apiKey: "k" }, "/not-approved"))
			.toEqual({ ok: false, status: 403, error: "API key not approved for this server" });
		expect(await apiRequest({ serverUrl: baseUrl, apiKey: "k" }, "/broken"))
			.toEqual({ ok: false, status: 500, error: "Server returned 500" });
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
		expect(!result.ok && result.error).toBe("Network error — TypeError: fetch failed (bad port)");
	});
});

describe("describeNetworkError", () => {
	it("appends the cause's message, which already names the code", () => {
		const cause = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:3000"), { code: "ECONNREFUSED" });
		expect(describeNetworkError(new TypeError("fetch failed", { cause }))).toBe(
			"TypeError: fetch failed (connect ECONNREFUSED 10.0.0.5:3000)",
		);
	});

	it("prefixes the code when the cause's message doesn't include it", () => {
		const cause = Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" });
		expect(describeNetworkError(new TypeError("fetch failed", { cause }))).toBe(
			"TypeError: fetch failed (UND_ERR_SOCKET: other side closed)",
		);
	});

	it("uses the code alone when the cause has no message", () => {
		const cause = Object.assign(new Error(""), { code: "ECONNRESET" });
		expect(describeNetworkError(new TypeError("fetch failed", { cause }))).toBe("TypeError: fetch failed (ECONNRESET)");
	});

	it("falls back to the error itself when there is no cause", () => {
		expect(describeNetworkError(new TypeError("fetch failed"))).toBe("TypeError: fetch failed");
		expect(describeNetworkError("boom")).toBe("boom");
	});
});

describe("logFailure", () => {
	beforeEach(() => {
		vi.mocked(streamDeck.logger.warn).mockClear();
		vi.mocked(streamDeck.logger.error).mockClear();
	});

	it("warns about a 4xx, with the status after the bot's error text", () => {
		logFailure("Play SFX", { status: 403, error: "Key not approved" });
		expect(streamDeck.logger.warn).toHaveBeenCalledExactlyOnceWith("Play SFX: Key not approved (403)");
		expect(streamDeck.logger.error).not.toHaveBeenCalled();
	});

	it("logs a 5xx as an error", () => {
		logFailure("Join Voice", { status: 502, error: "Server returned 502" });
		expect(streamDeck.logger.error).toHaveBeenCalledExactlyOnceWith("Join Voice: Server returned 502 (502)");
		expect(streamDeck.logger.warn).not.toHaveBeenCalled();
	});

	it("logs a network error, which has no status, as an error", () => {
		logFailure("Leave Voice", { status: null, error: "Request timed out" });
		expect(streamDeck.logger.error).toHaveBeenCalledExactlyOnceWith("Leave Voice: Request timed out");
		expect(streamDeck.logger.warn).not.toHaveBeenCalled();
	});
});
