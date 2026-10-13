import { exec } from "node:child_process";
import path from "node:path";
import url from "node:url";
import { defineConfig } from "rolldown";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.expiredminotaur.bcuk";

export default defineConfig({
	input: "src/plugin.ts",
	output: {
		file: `${sdPlugin}.sdPlugin/bin/plugin.js`,
		sourcemap: isWatching,
		sourcemapPathTransform: (rel, mapPath) =>
			url.pathToFileURL(path.resolve(path.dirname(mapPath), rel)).href,
		minify: !isWatching,
	},
	transform: { decorator: { legacy: true } },
	platform: "node",
	resolve: { conditionNames: ["node"] },
	plugins: [
		{
			name: "watch-externals",
			buildStart() {
				this.addWatchFile(`${sdPlugin}.sdPlugin/manifest.json`);
			},
			buildEnd() {
				if (isWatching) {
					exec(`streamdeck restart ${sdPlugin}`, (err, out, stderr) => {
						if (out) console.log(out.trim());
						if (stderr) console.error(stderr.trim());
					});
				}
			},
		},
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({
					fileName: "package.json",
					source: `{"type":"module"}`,
					type: "asset",
				});
			},
		},
	],
});
