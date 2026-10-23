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
