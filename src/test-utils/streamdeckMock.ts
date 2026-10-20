import { vi } from "vitest";

/**
 * A stand-in for `@elgato/streamdeck`'s module surface used by the plugin's source files.
 * @returns The module's exports: a `default` streamDeck object of `vi.fn()` spies, a no-op
 *   `action` decorator and an empty `SingletonAction` class.
 */
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
