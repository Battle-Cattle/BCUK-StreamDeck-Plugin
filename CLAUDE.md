# CLAUDE.md

Guidance for working in this repo.

## What this repo is

`BCUK-StreamDeck-Plugin` is a Stream Deck plugin that controls the BCUK bot ([`BCUK-Bot-4`](https://github.com/Battle-Cattle/BCUK-Bot-4)) through the bot's `/api/streamdeck` routes (`src/web/routes/streamdeck*.ts` there). The README lists the actions and how releases work.

- **`src/`**: the plugin's TypeScript, bundled by rolldown into `com.expiredminotaur.bcuk.sdPlugin/bin`. `plugin.ts` is the entry point. `api.ts` holds the global settings (Server URL + API key) and the HTTP client. `actions/` has one file per Stream Deck action. Logic is kept out of the action classes where possible (`sfxTriggers.ts`, `voiceChannels.ts`, `advancedCommands.ts`, …) so it can be tested.
- **`src/test-utils/`**: shared test fixtures, including `streamdeckMock.ts`, a stand-in for `@elgato/streamdeck`.
- **`com.expiredminotaur.bcuk.sdPlugin/`**: the plugin bundle. It holds `manifest.json`, the icons (`imgs/`, regenerated with `npm run placeholders`), and the property-inspector pages in `ui/`. The pages are classic `<script>` pages with no bundler. `pi-common.js` is the shared WebSocket and settings plumbing.
- **API changes go in both repos.** A change to a `/api/streamdeck` route in `BCUK-Bot-4` has to stay compatible with released plugin versions, or ship with a plugin update. The bot's web panel always links to the latest release.

## Node/npm version

CI (`.github/workflows/ci.yml`) uses Node `20.x`. `sharp` (used by `npm run placeholders`) needs Node 20.9 or later. A newer Node also works for `npm ci`/`npm test`. If `npm ci` fails with lockfile errors, check `node -v`/`npm -v` before changing the lockfile.

## ALWAYS: Before committing

```bash
npm run typecheck && npm test && npm run build
```

When a release is part of the change, bump `Version` in `manifest.json` and `version` in `package.json` together (`npm version X.Y.Z --no-git-tag-version`). `version.test.ts` fails if they drift apart.

---

## Code standards

These match `BCUK-Bot-4`'s `CLAUDE.md`, so every BCUK repo follows the same rules.

### TypeScript

- `strict` is on, from `@tsconfig/node20`. Don't add `any` (use `unknown` and narrow it). Don't use `!` unless a nearby check guarantees the value, and add a comment that names the check.
- Handle every promise: `await` it, return it, or mark it `void` where fire-and-forget is intended (as `initGlobalSettings` does with `getGlobalSettings()`). An unhandled rejection in a key handler leaves the key with no alert.
- Log with `streamDeck.logger`, not `console.*`.
- Never log the API key or a full Server URL. Log only the URL's origin, as the plain-HTTP warning in `api.ts` does.

### Complexity

Qlty reports function complexity, too many returns, deep nesting, long parameter lists and duplication (see PR Reviews (Qlty) below). Write code that stays under the limits from the start: cognitive complexity ≤ 15, cyclomatic complexity ≤ 12, at most 5 parameters, nesting depth ≤ 3. These are the same limits `BCUK-Bot-4` enforces with ESLint. When a function grows past them, extract helpers or a module.

### Tests

- Every new function or behaviour change **must** include or update a Vitest test in a co-located `*.test.ts` file next to the source file.
- When modifying existing behaviour, update affected tests before committing. Never leave a passing-but-wrong test.
- A fix for a bug or a review finding gets a test that fails without the fix.
- Mock `@elgato/streamdeck` with `src/test-utils/streamdeckMock.ts` rather than writing a new mock in each file.
- Run `npm test` and confirm all tests pass before committing.

### Docstrings

- All functions **must** have a JSDoc comment describing what they do, their parameters and return value. This covers exported functions, internal helpers, class methods and module-level arrow functions. One line is enough for simple cases. Exported types, interfaces and constants get one too. The property-inspector scripts in `ui/` follow the same rule (they currently use `//` comments; use `/** */` for new or changed functions).
- When you change a function's signature or behaviour, update its JSDoc to match. Stale docs are worse than no docs.
- **Test files (`*.test.ts`) are exempt.** Test-local helpers and `describe`/`it`/`vi.mock` callbacks don't need JSDoc. A descriptive `it('...')` name documents the behaviour instead. Source files still follow the rule above.
- **Concise inline callbacks** (`.map()` mappers, event listeners wired inline, a `setTimeout` callback, a `catch` handler) don't need a separate JSDoc block. Add a short inline comment only when the behaviour isn't obvious from the code.

## PR Reviews (Qlty)

Qlty's PR comments (code smells such as file/function complexity, too many returns, duplication, plus diff-coverage gaps) are this repo's standards, not optional suggestions. **Never dismiss, defer or resolve a Qlty finding without fixing it**, and never reply that it "stays as is" or belongs in a follow-up. Fix every finding in the same PR, whether it's an inline review comment or a row in the "new issues" or coverage summary:
- **Complexity, returns or structure:** refactor (extract helpers or a module) until the metric is under the threshold, keeping behaviour unchanged and tests green.
- **Uncovered new lines:** add tests that cover them.

After pushing, check that Qlty's next analysis no longer lists the finding.

## PR Reviews (CodeRabbit)

CodeRabbit auto-reviews pushes but is rate-limited per developer; a rate-limited push gets a "Review limit reached" comment with a wait time and no actual diff review. **It never auto-retries** once the cooldown passes — a manual trigger is required every time, even if you just wait it out. After the wait time shown in the rate-limit comment has elapsed, post a PR comment:

- **`@coderabbitai review`** — reviews only what changed since the last review. Default choice.
- **`@coderabbitai full review`** — re-reviews the entire PR from scratch. Use this instead when the last review's **Merge Risk** (see below) was 🟡 Moderate or higher, when it surfaced a lot of issues, or when the intervening changes are large.

**The manual comment is ONLY for the rate-limit case above.** Do not post it reactively for other "review skipped" reasons:
- **"Review skipped: Draft detected"** — expected while the PR is a draft. Marking the PR ready for review (`draft: false`) auto-triggers a review on its own; no comment needed. Only manually trigger if, after going ready, no review shows up within a few minutes.
- **"No new commits to review since the last review"** — CodeRabbit is up to date; nothing to do.

If unsure which case a "skipped"/"no review" comment falls into, check whether it names a wait time (rate-limit → wait then trigger) or a different reason (draft/no-new-commits → no action).

**Merge Risk field:** CodeRabbit's main "📝 Walkthrough" comment is a living comment — every review (including the automatic first one) rewrites it in place, and it carries a **Merge Risk** line (e.g. `**Merge Risk:** _🔵 Low_ · up to \`a5ac9\``). Treat this as a required read, not decoration:
- After every review finishes, re-read the walkthrough comment for the current Merge Risk line and any caveat attached to it — don't stop at the inline/actionable comments.
- A caveat under the Merge Risk line is a real concern even when the badge is "Low" — CodeRabbit is flagging it, not blocking on it. Either fix it and push, or post one PR comment explaining why it's acceptable/out of scope, before treating the PR as mergeable.
- When you push a fix for a Merge Risk caveat, say so in a PR comment (what the risk was, which commit fixes it) tagging `@coderabbitai` so it lands in CodeRabbit's own thread and context — e.g. "@coderabbitai — fixed the race described above in `<commit>`...". This gives the next re-review and human reviewers the context, and lets CodeRabbit re-assess the same concern.
- When the Merge Risk was 🟡 Moderate or higher, the re-review after your fix must be a **`@coderabbitai full review`**, not an incremental `@coderabbitai review` — CodeRabbit acknowledging the fix in its thread (or marking the inline comments "Addressed") is not a re-review. If the push was rate-limited, wait out the cooldown and trigger the full review then.
- This can take more than one round: a fix can surface a narrower version of the same risk on re-review. Keep fixing and re-commenting (tagging `@coderabbitai` each time) until a review comes back with the risk resolved or explicitly accepted, not just re-labeled "Low" without comment.
- See BCUK-Bot-4 PR #612 (https://github.com/Battle-Cattle/BCUK-Bot-4/pull/612, "Forward all streamer events to the companion app") for the full pattern: an initial Low-risk walkthrough flagged a token-revocation race → fixed and commented → re-review found a narrower race in the same area → fixed and commented again → final re-review confirmed Low risk with the residual tradeoff explicitly accepted → only then marked ready for merge.
- This applies to any PR you're driving to green, not just ones you opened — a rising or unresolved Merge Risk is a signal to keep working the PR, not to wait on reviewers.

**Avoid re-triggering thrash:**
- **Never push a new commit while a review is in progress** — the in-flight review fails outright ("head commit changed during the review") and wastes the attempt. Wait for the review to finish (or fail/rate-limit) before pushing again.
- **Never re-trigger `@coderabbitai review` while already rate-limited or still in progress.** Each rate-limit reply just reports the currently remaining cooldown (it doesn't reset or extend it) — retrying early is simply wasted, not counterproductive. Wait out the countdown, trigger exactly once, then leave it alone until it either posts real findings or rate-limits again.
