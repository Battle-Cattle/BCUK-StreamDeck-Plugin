import { vi } from "vitest";

/** A stand-in for the `ev.action` a Stream Deck event carries. */
export function fakeAction(isKey = true) {
	return {
		showOk: vi.fn(),
		showAlert: vi.fn(),
		setSettings: vi.fn(),
		setState: vi.fn(),
		isKey: () => isKey,
	};
}

/** A Stream Deck event for `action` with these per-button settings (or a property inspector payload). */
export function fakeEvent<T>(payload: T, action = fakeAction()) {
	return { action, payload } as never;
}

/** What a mocked `InspectorCatalog` records: one entry per catalog an action created. */
export interface CatalogSpy {
	show: ReturnType<typeof vi.fn>;
	refresh: ReturnType<typeof vi.fn>;
	seed: ReturnType<typeof vi.fn>;
}
