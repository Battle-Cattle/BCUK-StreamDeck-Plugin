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
