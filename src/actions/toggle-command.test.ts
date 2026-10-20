import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "../test-utils/streamdeckMock";
import { type CatalogSpy, fakeAction, fakeEvent } from "../test-utils/actionMocks";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());
vi.mock("../advancedCommandKeys", () => ({ toggleCommand: vi.fn(), syncToggleState: vi.fn(), triggerCommand: vi.fn() }));
const catalogs = vi.hoisted(() => ({ instances: [] as CatalogSpy[] }));
vi.mock("./advancedCommandCatalog", () => ({
	createAdvancedCommandCatalog: () => {
		const catalog = { show: vi.fn(), refresh: vi.fn(), seed: vi.fn() };
		catalogs.instances.push(catalog);
		return catalog;
	},
}));

import { syncToggleState, toggleCommand } from "../advancedCommandKeys";
import { ToggleCommandAction } from "./toggle-command";

beforeEach(() => vi.clearAllMocks());

describe("ToggleCommandAction", () => {
	it("toggles the button's command on a key press", async () => {
		const action = fakeAction();

		await new ToggleCommandAction().onKeyDown(fakeEvent({ settings: { commandId: "7" } }, action));

		expect(toggleCommand).toHaveBeenCalledWith(action, "7");
	});

	it("shows the command's state when a key appears", async () => {
		const action = fakeAction();

		await new ToggleCommandAction().onWillAppear(fakeEvent({ settings: { commandId: "7" } }, action));

		expect(syncToggleState).toHaveBeenCalledWith(action, "7");
		expect(action.setSettings).not.toHaveBeenCalled();
	});

	it("gives a new button an empty command instead of syncing", async () => {
		const action = fakeAction();

		await new ToggleCommandAction().onWillAppear(fakeEvent({ settings: {} }, action));

		expect(action.setSettings).toHaveBeenCalledWith({ commandId: "" });
		expect(syncToggleState).not.toHaveBeenCalled();
	});

	it("doesn't sync a dial, which has no on/off state to show", async () => {
		const toggle = new ToggleCommandAction();

		await toggle.onWillAppear(fakeEvent({ settings: { commandId: "7" } }, fakeAction(false)));
		await toggle.onDidReceiveSettings(fakeEvent({ settings: { commandId: "8" } }, fakeAction(false)));

		expect(syncToggleState).not.toHaveBeenCalled();
	});

	it("shows the newly chosen command's state", async () => {
		const action = fakeAction();

		await new ToggleCommandAction().onDidReceiveSettings(fakeEvent({ settings: { commandId: "8" } }, action));

		expect(syncToggleState).toHaveBeenCalledWith(action, "8");
	});

	it("sends its catalog to the property inspector and refreshes it only on request", async () => {
		const toggle = new ToggleCommandAction();
		const catalog = catalogs.instances.at(-1)!;

		await toggle.onPropertyInspectorDidAppear();
		await toggle.onSendToPlugin(fakeEvent({ event: "refreshCommands", serverUrl: "https://bot.example", apiKey: "k" }));
		await toggle.onSendToPlugin(fakeEvent({ event: "other", serverUrl: "x", apiKey: "y" }));

		expect(catalog.show).toHaveBeenCalledTimes(1);
		expect(catalog.refresh).toHaveBeenCalledExactlyOnceWith({ serverUrl: "https://bot.example", apiKey: "k" });
	});
});
