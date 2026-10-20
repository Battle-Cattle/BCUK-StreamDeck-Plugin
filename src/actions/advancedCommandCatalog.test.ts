import { describe, expect, it, vi } from "vitest";

const created = vi.hoisted(() => ({ options: [] as Record<string, unknown>[] }));
vi.mock("../inspectorCatalog", () => ({
	InspectorCatalog: class {
		constructor(options: Record<string, unknown>) {
			created.options.push(options);
		}
	},
}));

import { createAdvancedCommandCatalog } from "./advancedCommandCatalog";

type Options = {
	path: string;
	parse: (body: Record<string, unknown>) => unknown;
	key: (command: { id: number }) => string;
	loadedEvent: string;
	errorEvent: string;
	listKey: string;
};

describe("createAdvancedCommandCatalog", () => {
	it("reads /advanced-commands into the commandsLoaded/commandsError messages", () => {
		createAdvancedCommandCatalog();
		const options = created.options.at(-1) as Options;

		expect(options.path).toBe("/advanced-commands");
		expect(options.loadedEvent).toBe("commandsLoaded");
		expect(options.errorEvent).toBe("commandsError");
		expect(options.listKey).toBe("commands");
		expect(options.key({ id: 7 })).toBe("7");
	});

	it("parses the commands list, and rejects a body without one", () => {
		createAdvancedCommandCatalog();
		const options = created.options.at(-1) as Options;

		expect(options.parse({ commands: [{ id: 7, name: "Hydrate", trigger: "!hydrate", isEnabled: true }] }))
			.toEqual([expect.objectContaining({ id: 7, name: "Hydrate" })]);
		expect(options.parse({})).toBeNull();
		expect(options.parse({ commands: "nope" })).toBeNull();
	});

	it("gives each action its own catalog", () => {
		const before = created.options.length;

		createAdvancedCommandCatalog();
		createAdvancedCommandCatalog();

		expect(created.options.length).toBe(before + 2);
	});
});
