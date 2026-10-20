import { vi } from "vitest";

/** A stand-in for `@elgato/streamdeck`'s module surface used by the plugin's source files. */
export function streamDeckModuleMock() {
	const streamDeck = {
		logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		settings: { onDidReceiveGlobalSettings: vi.fn(), getGlobalSettings: vi.fn() },
		ui: { sendToPropertyInspector: vi.fn() },
		actions: { registerAction: vi.fn() },
		connect: vi.fn(() => Promise.resolve()),
	};
	return {
		default: streamDeck,
		action: () => (target: unknown) => target,
		SingletonAction: class {},
	};
}
