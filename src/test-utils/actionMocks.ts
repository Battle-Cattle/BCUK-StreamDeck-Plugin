import { vi } from "vitest";

/**
 * A stand-in for the `ev.action` a Stream Deck event carries.
 * @param isKey What `isKey()` returns: true for a keypad key, false for a dial.
 * @param id The action instance's id.
 * @returns An object whose `showOk`, `showAlert`, `setSettings` and `setState` are `vi.fn()` spies.
 */
export function fakeAction(isKey = true, id = "action-1") {
	return {
		id,
		showOk: vi.fn(),
		showAlert: vi.fn(),
		setSettings: vi.fn(),
		setState: vi.fn(),
		isKey: () => isKey,
	};
}

/**
 * A Stream Deck event for `action` with these per-button settings (or a property inspector payload).
 * @param payload The event's `payload`, e.g. `{ settings }` or an inspector message.
 * @param action The event's `action`; defaults to a fresh {@link fakeAction} key.
 * @returns The event, typed as `never` so it can be passed to any handler.
 */
export function fakeEvent<T>(payload: T, action = fakeAction()) {
	return { action, payload } as never;
}

/** What a mocked `InspectorCatalog` records: one entry per catalog an action created. */
export interface CatalogSpy {
	show: ReturnType<typeof vi.fn>;
	refresh: ReturnType<typeof vi.fn>;
	seed: ReturnType<typeof vi.fn>;
}

/**
 * A fresh mocked catalog: `show`, `refresh` and `seed` are `vi.fn()` spies.
 * @returns The spy object, shaped like an `InspectorCatalog`.
 */
export function catalogMock(): CatalogSpy {
	return { show: vi.fn(), refresh: vi.fn(), seed: vi.fn() };
}

/**
 * A `vi.mock("../inspectorCatalog", ...)` module whose `InspectorCatalog` records each instance.
 * `vi.mock` factories are hoisted, so call this from `async () => (await import(...)).…`.
 * @param instances Where each constructed catalog is pushed (create it with `vi.hoisted`).
 * @returns The mocked module.
 */
export function inspectorCatalogModuleMock(instances: CatalogSpy[]) {
	return {
		InspectorCatalog: class implements CatalogSpy {
			show = vi.fn();
			refresh = vi.fn();
			seed = vi.fn();
			constructor() {
				instances.push(this);
			}
		},
	};
}

/**
 * A `vi.mock("../api", ...)` module: `apiRequest` and `logFailure` spies, a fixed connection and the
 * quick key-press timeout (5000). `vi.mock` factories are hoisted, so call this from
 * `async () => (await import(...)).apiModuleMock()`.
 * @returns The mocked module.
 */
export function apiModuleMock() {
	return {
		apiRequest: vi.fn(),
		getConnection: vi.fn(() => ({ serverUrl: "https://bot.example", apiKey: "k" })),
		logFailure: vi.fn(),
		QUICK_KEY_PRESS_TIMEOUT_MS: 5000,
	};
}

