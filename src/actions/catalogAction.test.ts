import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "../test-utils/streamdeckMock";
import { catalogMock, fakeEvent } from "../test-utils/actionMocks";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());

import streamDeck from "@elgato/streamdeck";
import type { InspectorCatalog } from "../inspectorCatalog";
import { CatalogAction } from "./catalogAction";

class TestAction extends CatalogAction<{ commandId: string }, string> {
	constructor(catalog: InspectorCatalog<string>) {
		super(catalog, "refreshThings");
	}
}

const catalog = catalogMock();

beforeEach(() => vi.clearAllMocks());

describe("CatalogAction", () => {
	it("sends the catalog when the property inspector appears", async () => {
		await new TestAction(catalog as never).onPropertyInspectorDidAppear();

		expect(catalog.show).toHaveBeenCalled();
	});

	it("refreshes with the inspector's Server URL and API key on its refresh event", async () => {
		await new TestAction(catalog as never).onSendToPlugin(
			fakeEvent({ event: "refreshThings", serverUrl: "https://bot.example", apiKey: "k" }),
		);

		expect(catalog.refresh).toHaveBeenCalledWith({ serverUrl: "https://bot.example", apiKey: "k" });
	});

	it.each([
		["no Server URL", { event: "refreshThings", apiKey: "k" }],
		["a non-string API key", { event: "refreshThings", serverUrl: "https://bot.example", apiKey: 5 }],
	])("logs and ignores a refresh with %s", async (_name, payload) => {
		await new TestAction(catalog as never).onSendToPlugin(fakeEvent(payload));
		expect(catalog.refresh).not.toHaveBeenCalled();
		expect(streamDeck.logger.warn).toHaveBeenCalledWith(expect.stringContaining("refreshThings"));
	});

	it.each([["null", null], ["missing", undefined], ["an array", ["refreshThings"]], ["a string", "refreshThings"]])("ignores a message whose payload is %s", async (_name, payload) => {
		await expect(new TestAction(catalog as never).onSendToPlugin(fakeEvent(payload))).resolves.toBeUndefined();
		expect(catalog.refresh).not.toHaveBeenCalled();
	});

	it("ignores any other inspector message", async () => {
		await new TestAction(catalog as never).onSendToPlugin(
			fakeEvent({ event: "refreshCommands", serverUrl: "https://bot.example", apiKey: "k" }),
		);

		expect(catalog.refresh).not.toHaveBeenCalled();
	});
});
