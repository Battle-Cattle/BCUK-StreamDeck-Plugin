import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "../test-utils/streamdeckMock";
import { type CatalogSpy, fakeAction, fakeEvent } from "../test-utils/actionMocks";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());
vi.mock("../advancedCommandKeys", () => ({ triggerCommand: vi.fn() }));
const catalogs = vi.hoisted(() => ({ instances: [] as CatalogSpy[] }));
vi.mock("./advancedCommandCatalog", () => ({
	createAdvancedCommandCatalog: () => {
		const catalog = { show: vi.fn(), refresh: vi.fn(), seed: vi.fn() };
		catalogs.instances.push(catalog);
		return catalog;
	},
}));

import { triggerCommand } from "../advancedCommandKeys";
import { TriggerCommandAction } from "./trigger-command";

beforeEach(() => vi.clearAllMocks());

describe("TriggerCommandAction", () => {
	it("fires the button's command on a key press", async () => {
		const action = fakeAction();

		await new TriggerCommandAction().onKeyDown(fakeEvent({ settings: { commandId: "7" } }, action));

		expect(triggerCommand).toHaveBeenCalledWith(action, "7");
	});

	it("gives a new button an empty command, and leaves a configured one alone", async () => {
		const trigger = new TriggerCommandAction();
		const fresh = fakeAction();
		const configured = fakeAction();

		await trigger.onWillAppear(fakeEvent({ settings: {} }, fresh));
		await trigger.onWillAppear(fakeEvent({ settings: { commandId: "7" } }, configured));

		expect(fresh.setSettings).toHaveBeenCalledWith({ commandId: "" });
		expect(configured.setSettings).not.toHaveBeenCalled();
	});

	it("sends its catalog to the property inspector and refreshes it only on request", async () => {
		const trigger = new TriggerCommandAction();
		const catalog = catalogs.instances.at(-1)!;

		await trigger.onPropertyInspectorDidAppear();
		await trigger.onSendToPlugin(fakeEvent({ event: "refreshCommands", serverUrl: "https://bot.example", apiKey: "k" }));
		await trigger.onSendToPlugin(fakeEvent({ event: "other", serverUrl: "x", apiKey: "y" }));

		expect(catalog.show).toHaveBeenCalledTimes(1);
		expect(catalog.refresh).toHaveBeenCalledExactlyOnceWith({ serverUrl: "https://bot.example", apiKey: "k" });
	});
});
