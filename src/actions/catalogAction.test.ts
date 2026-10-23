import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDeckModuleMock } from "../test-utils/streamdeckMock";
import { catalogMock, fakeEvent } from "../test-utils/actionMocks";

vi.mock("@elgato/streamdeck", () => streamDeckModuleMock());

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

	it("ignores any other inspector message", async () => {
		await new TestAction(catalog as never).onSendToPlugin(
			fakeEvent({ event: "refreshCommands", serverUrl: "https://bot.example", apiKey: "k" }),
		);

		expect(catalog.refresh).not.toHaveBeenCalled();
	});
});
