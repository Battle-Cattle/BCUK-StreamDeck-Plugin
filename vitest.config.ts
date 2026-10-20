import { defineConfig } from "vitest/config";

export default defineConfig({
	// Lower the action classes' @action decorators the same way rolldown.config.ts does for the
	// build, so tests can import them.
	oxc: { decorator: { legacy: true } },
});
