import { defineConfig } from "vitest/config";

export default defineConfig({
	// Lower the action classes' @action decorators the same way rolldown.config.ts does for the
	// build, so tests can import them.
	oxc: { decorator: { legacy: true } },
	test: {
		// `npm run test:coverage` (CI) writes coverage/lcov.info, which CI uploads to Qlty.
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/test-utils/**"],
		},
	},
});
