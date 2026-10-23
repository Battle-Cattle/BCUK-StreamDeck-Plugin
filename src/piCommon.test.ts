import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "./test-utils/streamdeckMock";
import { globalSettingsCases, loopbackHostCases } from "./test-utils/globalSettingsCases";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());

import { isLoopbackHost, migrateGlobalSettings } from "./api";

type PiCommon = {
	migrateGlobalSettings: (raw: unknown) => { serverUrl: string; apiKey: string };
	isLoopbackUrl: (url: string) => boolean;
};

// Runs pi-common.js as the classic script it is, with just enough DOM for its top-level listeners,
// and returns its function declarations from the script's global scope.
function loadPiCommon(): PiCommon {
	const source = readFileSync(new URL("../com.expiredminotaur.bcuk.sdPlugin/ui/pi-common.js", import.meta.url), "utf8");
	const element = { value: "", textContent: "", addEventListener: () => undefined };
	const context = createContext({ document: { getElementById: () => element }, URL });
	runInContext(source, context);
	return context as unknown as PiCommon;
}

const pi = loadPiCommon();

describe("global settings: plugin and property inspector agree", () => {
	it.each(globalSettingsCases)("$name", ({ raw, expected }) => {
		expect(migrateGlobalSettings(raw)).toEqual(expected);
		// The PI's object comes from another realm, so compare its fields rather than the object.
		expect({ ...pi.migrateGlobalSettings(raw) }).toEqual(expected);
	});
});

describe("loopback detection: plugin and property inspector agree", () => {
	it.each(loopbackHostCases)("%s → %s", (host, loopback) => {
		expect(isLoopbackHost(host)).toBe(loopback);
		expect(pi.isLoopbackUrl(`http://${host}:3000/`)).toBe(loopback);
	});
});

type FakeElement = {
	value: string;
	textContent: string;
	className: string;
	innerHTML: string;
	disabled: boolean;
	children: FakeElement[];
	listeners: Record<string, () => void>;
	appendChild: (child: FakeElement) => void;
	addEventListener: (event: string, listener: () => void) => void;
};

function fakeElement(): FakeElement {
	const el: FakeElement = {
		value: "",
		textContent: "",
		className: "",
		disabled: false,
		children: [],
		listeners: {},
		get innerHTML() {
			return "";
		},
		set innerHTML(_html: string) {
			el.children = [];
		},
		appendChild: (child) => el.children.push(child),
		addEventListener: (event, listener) => {
			el.listeners[event] = listener;
		},
	};
	return el;
}

type CatalogPage = {
	setupCatalogPage: (options: Record<string, unknown>) => { isLoaded: () => boolean };
	handlePluginMessage: (payload: Record<string, unknown>) => void;
	setStatus: (msg: string, isOk?: boolean) => void;
};

// Loads pi-common.js into a page with the given elements (missing ids return null, like a real
// page), with an open socket whose sent messages are recorded.
function loadPage(ids: string[]) {
	const elements = Object.fromEntries(ids.map((id) => [id, fakeElement()]));
	const sent: Array<Record<string, unknown>> = [];
	const source = readFileSync(new URL("../com.expiredminotaur.bcuk.sdPlugin/ui/pi-common.js", import.meta.url), "utf8");
	const context = createContext({
		document: { getElementById: (id: string) => elements[id] ?? null, createElement: () => fakeElement() },
		URL,
		WebSocket: { OPEN: 1 },
		setTimeout: () => 0,
	});
	runInContext(source, context);
	runInContext("ws = { readyState: 1, send: (m) => sentMessages.push(JSON.parse(m)) };", Object.assign(context, { sentMessages: sent }));
	// Looks up one of the page's elements, failing the test if the page wasn't given that id.
	const el = (id: string): FakeElement => {
		const element = elements[id];
		if (!element) throw new Error(`The test page has no #${id}`);
		return element;
	};
	return { pi: context as unknown as CatalogPage, el, sent };
}

const catalogOptions = (render = vi.fn(), onLoaded = vi.fn()) => ({
	selectId: "command",
	placeholder: "— select a command —",
	loadedEvent: "commandsLoaded",
	errorEvent: "commandsError",
	listKey: "commands",
	refreshEvent: "refreshCommands",
	noun: "commands",
	render,
	onLoaded,
});

describe("setupCatalogPage", () => {
	const ids = ["command", "refreshBtn", "status", "serverUrl", "apiKey", "urlWarning"];

	it("fills the dropdown after the placeholder on the loaded message, then re-enables refresh", () => {
		const { pi, el } = loadPage(ids);
		const render = vi.fn();
		const onLoaded = vi.fn();
		const page = pi.setupCatalogPage(catalogOptions(render, onLoaded));
		el("refreshBtn").disabled = true;

		pi.handlePluginMessage({ event: "commandsLoaded", commands: [{ id: 1 }] });

		expect(el("command").children.map((c) => c.textContent)).toEqual(["— select a command —"]);
		expect(render).toHaveBeenCalledWith(el("command"), [{ id: 1 }]);
		expect(onLoaded).toHaveBeenCalled();
		expect(page.isLoaded()).toBe(true);
		expect(el("status").textContent).toBe("Commands loaded.");
		expect(el("refreshBtn").disabled).toBe(false);
	});

	it("shows the error message and re-enables refresh without loading anything", () => {
		const { pi, el } = loadPage(ids);
		const render = vi.fn();
		const page = pi.setupCatalogPage(catalogOptions(render));
		el("refreshBtn").disabled = true;

		pi.handlePluginMessage({ event: "commandsError", error: "Invalid API key" });

		expect(el("status").textContent).toBe("Error: Invalid API key");
		expect(render).not.toHaveBeenCalled();
		expect(page.isLoaded()).toBe(false);
		expect(el("refreshBtn").disabled).toBe(false);
	});

	it("ignores another page's messages", () => {
		const { pi, el } = loadPage(ids);
		const render = vi.fn();
		pi.setupCatalogPage(catalogOptions(render));
		el("refreshBtn").disabled = true;

		pi.handlePluginMessage({ event: "channelsLoaded", channels: [] });

		expect(render).not.toHaveBeenCalled();
		expect(el("refreshBtn").disabled).toBe(true);
	});

	it("saves the form's connection and asks the plugin to refetch with it when refresh is clicked", () => {
		const { pi, el, sent } = loadPage(ids);
		pi.setupCatalogPage(catalogOptions());
		el("serverUrl").value = " https://bot.example ";
		el("apiKey").value = "k";

		const click = el("refreshBtn").listeners.click;
		expect(click).toBeDefined();
		click?.();

		expect(el("refreshBtn").disabled).toBe(true);
		expect(el("status").textContent).toBe("Fetching commands…");
		expect(sent.map((m) => m.event)).toEqual(["setGlobalSettings", "sendToPlugin"]);
		expect({ ...sent[1]?.payload as object }).toEqual({ event: "refreshCommands", serverUrl: "https://bot.example", apiKey: "k" });
	});
});

describe("setStatus", () => {
	it("does nothing on a page without a status line", () => {
		const { pi } = loadPage(["serverUrl", "apiKey", "urlWarning"]);

		expect(() => pi.setStatus("Fetching…")).not.toThrow();
	});
});

