# CLAUDE.md

Guidance for working in this repo.

## What this repo is

`BCUK-StreamDeck-Plugin` is a Stream Deck plugin that controls the BCUK bot ([`BCUK-Bot-4`](https://github.com/Battle-Cattle/BCUK-Bot-4)) through the bot's `/api/streamdeck` routes (`src/web/routes/streamdeck*.ts` there). The README lists the actions and how releases work.

- **`src/`**: the plugin's TypeScript, bundled by rolldown into `com.expiredminotaur.bcuk.sdPlugin/bin`. `plugin.ts` is the entry point. `globalSettings.ts` holds the global settings (Server URL + API key), `serverUrl.ts` normalises and checks the Server URL, and `apiClient.ts` is the HTTP client. `actions/` has one file per Stream Deck action. Logic is kept out of the action classes where possible (`sfxTriggers.ts`, `voiceChannels.ts`, `advancedCommands.ts`, …) so it can be tested.
- **`src/test-utils/`**: shared test fixtures, including `streamdeckMock.ts`, a stand-in for `@elgato/streamdeck`.
- **`com.expiredminotaur.bcuk.sdPlugin/`**: the plugin bundle. It holds `manifest.json`, the icons (`imgs/`, regenerated with `npm run placeholders`), and the property-inspector pages in `ui/`. The pages are classic `<script>` pages with no bundler. `pi-common.js` is the shared WebSocket and settings plumbing.
- **API changes go in both repos.** A change to a `/api/streamdeck` route in `BCUK-Bot-4` has to stay compatible with released plugin versions, or ship with a plugin update. The bot's web panel always links to the latest release.

## Node/npm version

CI (`.github/workflows/ci.yml`) uses the latest Node `24.x` (`check-latest: true`, so it never falls back to an older release cached on the runner), the version Stream Deck runs the plugin on (`Nodejs.Version` in the manifest, which needs Stream Deck 7.1 or later). `engines` in `package.json` asks for 24.22.1 or later, the release with the October 2026 security fixes, and npm warns (`EBADENGINE`) on anything older. A newer Node also works locally. Don't pick a dev dependency whose `engines` drops the runtime's Node. `@types/node` stays on 24 to match it, and `.github/dependabot.yml` ignores its majors. If `npm ci` fails with lockfile errors, check `node -v`/`npm -v` before changing the lockfile.

In cloud sessions, the "Cloud with Network" environment's setup script has already run `npm ci` under Node 24, so `node_modules` is in place. Your shell still starts on the sandbox's default Node, so switch before running anything: `source /opt/nvm/nvm.sh && nvm use 24`.

## ALWAYS: Before committing

Run the fast checks on what you changed. CI (`.github/workflows/ci.yml`) runs typecheck, the full lint, tests with coverage, the build and a pack dry run on every push, so don't repeat its full run locally:

```bash
npm run typecheck
npx vitest run --changed origin/main   # only the tests that import a changed file
npx eslint $(git diff --name-only --diff-filter=d origin/main -- '*.ts' '*.js' '*.html')
```

`--changed` follows imports from the changed files, so it misses tests that depend on something indirectly. **Run the full `npm test` instead** when the change touches `src/test-utils/`, `manifest.json`, `package.json`/`package-lock.json`, or a `tsconfig*`/`vitest*`/`eslint` config. Run `npm run build` too when the change touches `rolldown.config.ts`, the decorators, or the `@elgato/streamdeck` version.

**CI is the gate, not the local run.** A PR isn't done until CI is green. If it fails, reproduce the failing check locally, fix it, and show it passing before pushing again.

When a release is part of the change, bump `Version` in `manifest.json` and `version` in `package.json` together (`npm version X.Y.Z --no-git-tag-version`). `version.test.ts` fails if they drift apart.

---

## Code standards

These match `BCUK-Bot-4`'s `CLAUDE.md`, so every BCUK repo follows the same rules.

### Lint

`eslint.config.js` is a port of BCUK-Bot-4's config; keep the two in step when a shared rule changes. Everything below marked as a rule is enforced there, in `src/`, the property inspector's scripts (including the inline `<script>`s, via `eslint-plugin-html`) and `scripts/`. Its errors aren't optional: fix the code, don't disable the rule.

### TypeScript

- `strict` and `noUncheckedIndexedAccess` are on (`items[0]` is `T | undefined`: guard it). Don't add `any` (use `unknown` and narrow it). Don't use `!` unless a nearby check guarantees the value, and add a comment that names the check.
- Type what can actually arrive. A property inspector message or a new button's settings are whatever JSON Stream Deck delivers, so type them that loosely (e.g. `Partial<…>` for settings that may be `{}`) rather than as the ideal shape. `@typescript-eslint/no-unnecessary-condition` flags a guard that the types say is always true.
- Handle every promise: `await` it, return it, or mark it `void` where fire-and-forget is intended (as `initGlobalSettings` does with `getGlobalSettings()`). An unhandled rejection in a key handler leaves the key with no alert. (Rule: `no-floating-promises`.)
- Log with `streamDeck.logger`, not `console.*`. (Rule: `no-console`; `rolldown.config.ts` is the exception.)
- Never log the API key or a full Server URL. Log only the URL's origin, as the plain-HTTP warning in `serverUrl.ts` does.

### Complexity

Qlty reports function complexity, too many returns, deep nesting, long parameter lists and duplication (see PR Reviews (Qlty) below). ESLint enforces the same limits locally, as in `BCUK-Bot-4`: cognitive complexity ≤ 15, cyclomatic complexity ≤ 12, at most 5 parameters, nesting depth ≤ 3. When a function grows past them, extract helpers or a module.

### Tests

- Every new function or behaviour change **must** include or update a Vitest test in a co-located `*.test.ts` file next to the source file.
- When modifying existing behaviour, update affected tests before committing. Never leave a passing-but-wrong test.
- A fix for a bug or a review finding gets a test that fails without the fix.
- Mock `@elgato/streamdeck` with `src/test-utils/streamdeckMock.ts` rather than writing a new mock in each file. For an action class, `src/test-utils/actionMocks.ts` has a fake `ev.action` and event (see `src/actions/*.test.ts`).
- `vitest.config.ts` lowers the `@action` decorators the same way `rolldown.config.ts` does. Change both together.
- Run the tests for what you changed before committing (see "ALWAYS: Before committing" for when that means the full suite), and make sure CI's full run passes.

### Docstrings

- All functions **must** have a JSDoc comment describing what they do, their parameters and return value. This covers exported functions, internal helpers, class methods and module-level arrow functions. One line is enough for simple cases. Exported types, interfaces and constants get one too. The property-inspector scripts in `ui/` and `scripts/` follow the same rule; being plain JavaScript, their JSDoc may carry types. Each parameter gets an `@param` and a function that returns a value gets an `@returns`, each with a description that says what the value is, not just its name; no `{type}` in TypeScript. A destructured parameter needs only its root `@param`. (Rules: `jsdoc/require-jsdoc`, `jsdoc/require-param`/`require-returns` with their `-description` rules, plus `jsdoc/check-param-names` for stale `@param`s.)
- In the property inspector, a name one script uses from another (pi-common.js's helpers, a page's `onButtonSettings`/`onPluginMessage`) goes in a `/* global … */` header at the top of the script that uses it.
- When you change a function's signature or behaviour, update its JSDoc to match. Stale docs are worse than no docs.
- **Test files (`*.test.ts`) are exempt.** Test-local helpers and `describe`/`it`/`vi.mock` callbacks don't need JSDoc. A descriptive `it('...')` name documents the behaviour instead. Source files still follow the rule above.
- **Concise inline callbacks** (`.map()` mappers, event listeners wired inline, a `setTimeout` callback, a `catch` handler) don't need a separate JSDoc block. Add a short inline comment only when the behaviour isn't obvious from the code.

## PR Reviews (Qlty)

Qlty's PR comments (code smells such as file/function complexity, too many returns, duplication, plus diff-coverage gaps) are this repo's standards, not optional suggestions. **Never dismiss, defer or resolve a Qlty finding without fixing it**, and never reply that it "stays as is" or belongs in a follow-up. Fix every finding in the same PR, whether it's an inline review comment or a row in the "new issues" or coverage summary:
- **Complexity, returns or structure:** refactor (extract helpers or a module) until the metric is under the threshold, keeping behaviour unchanged and tests green.
- **Uncovered new lines:** add tests that cover them.

After pushing, check that Qlty's next analysis no longer lists the finding.

## PR Reviews (CodeRabbit)

CodeRabbit reviews each push to a non-draft PR (marking a draft ready triggers one by itself). It's rate-limited per developer and **never retries on its own**. Only when a comment says "Review limit reached" with a wait time: wait that long, then post exactly one `@coderabbitai review` (only what changed since the last review), or `@coderabbitai full review` when the last Merge Risk was 🟡 Moderate or higher or the changes since are large. Any other "skipped" reason (draft, no new commits) needs no action.

**Merge Risk:** after every review, read the **Merge Risk** line in CodeRabbit's "📝 Walkthrough" comment, which is rewritten in place each time, not just the inline comments. A caveat under it is a real concern even at 🔵 Low: fix it, or post one PR comment saying why it's acceptable, before treating the PR as mergeable. After pushing a fix, say what the risk was and which commit fixes it in a comment tagging `@coderabbitai`; if the risk was 🟡 Moderate or higher, the re-review must be a `@coderabbitai full review`. Repeat until a review comes back with the risk resolved or explicitly accepted. [BCUK-Bot-4 PR #612](https://github.com/Battle-Cattle/BCUK-Bot-4/pull/612) shows the full pattern. This applies to any PR you're driving to green.

**Don't thrash:** never push while a review is in progress (it fails with "head commit changed"), and never re-trigger while rate-limited or in progress. A rate-limit reply only reports the remaining cooldown.
