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
	label: string;
	textContent: string;
	className: string;
	innerHTML: string;
	disabled: boolean;
	children: FakeElement[];
	readonly options: FakeElement[];
	listeners: Record<string, () => void>;
	appendChild: (child: FakeElement) => void;
	addEventListener: (event: string, listener: () => void) => void;
};

function fakeElement(): FakeElement {
	const el: FakeElement = {
		value: "",
		label: "",
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
		// Like a real <select>'s, includes the options inside its <optgroup>s.
		get options() {
			return el.children.flatMap((child) => (child.children.length > 0 ? child.options : [child]));
		},
		appendChild: (child) => el.children.push(child),
		addEventListener: (event, listener) => {
			el.listeners[event] = listener;
		},
	};
	return el;
}

type CatalogPage = {
	setupCatalogPage: (options: Record<string, unknown>) => { isLoaded: () => boolean; redraw: () => void };
	handlePluginMessage: (payload: Record<string, unknown>) => void;
	setStatus: (msg: string, isOk?: boolean) => void;
};

// Loads pi-common.js into a page with the given elements (missing ids return null, like a real
// page), with an open socket whose sent messages are recorded, then runs the page's own script.
function loadPage(ids: string[], pageScript = "") {
	const elements = Object.fromEntries(ids.map((id) => [id, fakeElement()]));
	const sent: Array<Record<string, unknown>> = [];
	// Pending setTimeout callbacks by id, so a test can fire them or see them cancelled.
	const timers = new Map<number, () => void>();
	let nextTimer = 1;
	const source = readFileSync(new URL("../com.expiredminotaur.bcuk.sdPlugin/ui/pi-common.js", import.meta.url), "utf8");
	const context = createContext({
		document: { getElementById: (id: string) => elements[id] ?? null, createElement: () => fakeElement() },
		URL,
		WebSocket: { OPEN: 1 },
		setTimeout: (callback: () => void) => {
			timers.set(nextTimer, callback);
			return nextTimer++;
		},
		clearTimeout: (id: number) => timers.delete(id),
	});
	runInContext(source, context);
	runInContext("ws = { readyState: 1, send: (m) => sentMessages.push(JSON.parse(m)) };", Object.assign(context, { sentMessages: sent }));
	runInContext(pageScript, context);
	// Looks up one of the page's elements, failing the test if the page wasn't given that id.
	const el = (id: string): FakeElement => {
		const element = elements[id];
		if (!element) throw new Error(`The test page has no #${id}`);
		return element;
	};
	// Fires every pending timer, as if their delays had all passed.
	const runTimers = () => {
		const pending = [...timers.values()];
		timers.clear();
		for (const callback of pending) callback();
	};
	return { pi: context as unknown as CatalogPage, el, sent, runTimers };
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

	it("renders the last loaded list again on redraw, and does nothing before one has loaded", () => {
		const { pi, el } = loadPage(ids);
		const render = vi.fn();
		const page = pi.setupCatalogPage(catalogOptions(render));

		page.redraw();
		expect(render).not.toHaveBeenCalled();

		pi.handlePluginMessage({ event: "commandsLoaded", commands: [{ id: 1 }] });
		el("command").children.push(fakeElement());
		page.redraw();

		expect(render).toHaveBeenCalledTimes(2);
		expect(render).toHaveBeenLastCalledWith(el("command"), [{ id: 1 }]);
		expect(el("command").children.map((c) => c.textContent)).toEqual(["— select a command —"]);
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

	it("clears a success message once its delay passes", () => {
		const { pi, el, runTimers } = loadPage(["status", "serverUrl", "apiKey", "urlWarning"]);

		pi.setStatus("Commands loaded.", true);
		runTimers();

		expect(el("status").textContent).toBe("");
		expect(el("status").className).toBe("");
	});

	it("doesn't let an earlier success message's timer clear a newer message", () => {
		const { pi, el, runTimers } = loadPage(["status", "serverUrl", "apiKey", "urlWarning"]);

		pi.setStatus("Commands loaded.", true);
		pi.setStatus("No commands match.");
		runTimers();

		expect(el("status").textContent).toBe("No commands match.");
	});
});


describe("matchesFilter", () => {
	const { matchesFilter } = loadPiCommon() as unknown as {
		matchesFilter: (filter: string, ...fields: Array<string | null | undefined>) => boolean;
	};

	it.each([
		["", true],
		["  ", true],
		["clap", true],
		["!CLAP", true],
		["  Cla ", true],
		["memes", true],
		["boo", false],
		["!", true],
	])("%j → %s", (filter, expected) => {
		expect(matchesFilter(filter, "!clap", "Memes")).toBe(expected);
	});

	it("skips missing fields", () => {
		expect(matchesFilter("x", null, undefined)).toBe(false);
	});
});

describe("groupByField", () => {
	const { groupByField } = loadPiCommon() as unknown as {
		groupByField: (items: Array<Record<string, unknown>>, key: string) => Array<{ label: string | null; items: unknown[] }>;
	};

	it("keeps the list's order, with uncategorised items last", () => {
		const a1 = { c: "A", n: 1 };
		const none1 = { c: null, n: 2 };
		const b1 = { c: "B", n: 3 };
		const a2 = { c: "A", n: 4 };
		const none2 = { c: "", n: 5 };
		const groups = groupByField([a1, none1, b1, a2, none2], "c");

		expect(groups.map((g) => ({ label: g.label, items: [...g.items] }))).toEqual([
			{ label: "A", items: [a1, a2] },
			{ label: "B", items: [b1] },
			{ label: null, items: [none1, none2] },
		]);
	});

	it("returns no groups for an empty list", () => {
		expect(groupByField([], "c")).toHaveLength(0);
	});
});

describe("Play SFX page", () => {
	const html = readFileSync(new URL("../com.expiredminotaur.bcuk.sdPlugin/ui/play-sfx.html", import.meta.url), "utf8");
	// The page's own script is its one bare <script> (pi-common.js is loaded with a src).
	const scriptStart = html.indexOf("<script>") + "<script>".length;
	const inline = html.slice(scriptStart, html.indexOf("</script>", scriptStart));
	const ids = ["command", "filter", "refreshBtn", "status", "serverUrl", "apiKey", "urlWarning"];
	const triggers = [
		{ triggerCommand: "!airhorn", categoryName: null },
		{ triggerCommand: "!boo", categoryName: "Crowd" },
		{ triggerCommand: "!clap", categoryName: "Crowd" },
		{ triggerCommand: "!bonk", categoryName: "Memes" },
	];

	function openPage(savedCommand = "") {
		const page = loadPage(ids, inline);
		const pi = page.pi as CatalogPage & { onButtonSettings: (s: Record<string, unknown>) => void };
		pi.onButtonSettings({ command: savedCommand });
		pi.handlePluginMessage({ event: "commandsLoaded", triggers });
		// Types in the search box.
		const type = (text: string) => {
			page.el("filter").value = text;
			page.el("filter").listeners.input?.();
		};
		const groups = () =>
			page.el("command").children.slice(1).map((g) => [g.label, ...g.children.map((o) => o.textContent)]);
		const saved = () => page.sent.filter((m) => m.event === "setSettings").map((m) => ({ ...(m.payload as object) }));
		return { ...page, type, groups, saved };
	}

	it("groups the commands by category, uncategorised last", () => {
		const { groups } = openPage();

		expect(groups()).toEqual([
			["Crowd", "!boo", "!clap"],
			["Memes", "!bonk"],
			["Other", "!airhorn"],
		]);
	});

	it("lists only the commands matching the search, and says how many", () => {
		const { type, groups, el, saved } = openPage();

		type("bo");

		expect(groups()).toEqual([
			["Crowd", "!boo"],
			["Memes", "!bonk"],
		]);
		expect(el("status").textContent).toBe("2 of 4 commands match.");
		expect(saved()).toEqual([]);
	});

	it("matches on the category too", () => {
		const { type, groups } = openPage();

		type("crowd");

		expect(groups()).toEqual([["Crowd", "!boo", "!clap"]]);
	});

	it("picks and saves the command when only one matches", () => {
		const { type, el, saved } = openPage();

		type("cla");

		expect(el("command").value).toBe("!clap");
		expect(saved()).toEqual([{ command: "!clap" }]);
		expect(el("status").textContent).toBe("1 of 4 commands match.");
	});

	it("keeps the saved command listed when the search hides it", () => {
		const { type, groups, el, saved } = openPage("!bonk");

		type("zzz");

		expect(groups()).toEqual([["Memes", "!bonk"]]);
		expect(el("command").value).toBe("!bonk");
		expect(el("status").textContent).toBe("No commands match.");
		expect(saved()).toEqual([]);
	});

	it("restores the full list and clears the status when the search is cleared", () => {
		const { type, groups, el } = openPage();

		type("boo");
		type("");

		expect(groups()).toHaveLength(3);
		expect(el("status").textContent).toBe("");
	});

	it("applies a search typed before the list loaded once it arrives", () => {
		const page = loadPage(ids, inline);
		const pi = page.pi as CatalogPage & { onButtonSettings: (s: Record<string, unknown>) => void };
		pi.onButtonSettings({ command: "" });
		page.el("filter").value = "cla";
		page.el("filter").listeners.input?.();

		pi.handlePluginMessage({ event: "commandsLoaded", triggers });

		expect(page.el("command").value).toBe("!clap");
		expect(page.el("status").textContent).toBe("1 of 4 commands match.");
		const saved = page.sent.filter((m) => m.event === "setSettings").map((m) => ({ ...(m.payload as object) }));
		expect(saved).toEqual([{ command: "!clap" }]);
	});

	it("keeps \"Commands loaded.\" when the list arrives with a blank search", () => {
		const { el } = openPage();

		expect(el("status").textContent).toBe("Commands loaded.");
	});

	it("lists a saved command in its category when settings arrive after a search hid it", () => {
		const { pi, type, groups, el } = openPage();
		type("zzz");

		(pi as CatalogPage & { onButtonSettings: (s: Record<string, unknown>) => void }).onButtonSettings({ command: "!bonk" });

		expect(groups()).toEqual([["Memes", "!bonk"]]);
		expect(el("command").value).toBe("!bonk");
	});

	it("ignores the search box until the list has loaded", () => {
		const page = loadPage(ids, inline);
		page.el("filter").value = "boo";
		page.el("filter").listeners.input?.();

		expect(page.el("command").children).toHaveLength(0);
		expect(page.el("status").textContent).toBe("");
	});

	it("saves a command picked from the dropdown", () => {
		const { el, saved } = openPage();

		el("command").value = "!boo";
		el("command").listeners.change?.();

		expect(saved()).toEqual([{ command: "!boo" }]);
	});
});
