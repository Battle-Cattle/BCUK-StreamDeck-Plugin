import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readJson = (path: string): Record<string, unknown> =>
	JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as Record<string, unknown>;

describe("version", () => {
	it("keeps package.json in step with the manifest version", () => {
		const manifestVersion = String(readJson("../com.expiredminotaur.bcuk.sdPlugin/manifest.json").Version);
		const packageVersion = String(readJson("../package.json").version);

		// The manifest uses Stream Deck's four-part form (major.minor.patch.build); npm uses semver.
		expect(manifestVersion).toBe(`${packageVersion}.0`);
	});
});
