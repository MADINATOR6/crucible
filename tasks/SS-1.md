# Task SS-1: social-studio MVP

Task ID `SS-1`, owner Claude, Codex planned (`tasks/SS-1-plan.md`, report in capture `codex-3c21ce92…`). Requirements: the plan brief's "User requirements" section (user decisions 2026-11-22).

## Write allowlist
`social-studio/**` (new app: `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js`, `icon.svg`, `icons/*.png`, `package.json`, `dev-server.mjs`, `README.md`, `src/**`, `test/**`), `.claude/launch.json` (append a `social-studio` entry), `tasks/SS-1.md`, `tasks/SS-1-plan.md`. Nothing in `lifting-tracker/`, workflow files, policy or CI.

## Plan critique (Claude, against the code)
1. Claims: all four of Codex's reproductions confirmed by reading `importer.js`, `csv.js`, `pipeline.js` (impressions→views alias; `(minutes)` stripped then mapped to hours; duplicate headers overwrite in `Object.fromEntries`; `move()` only resets approval when moving backwards; `matchPost` strips the whole query). The "moving files" were Claude's own SS-1 drafts written while Codex planned; ownership is SS-1.
2. Callers: pure modules have one caller each (the views); tests cover them directly.
3. Failure paths: covered below (malformed CSV, API errors, storage abort, cancel/timeout).
4. Allowlist: accepted with changes below. 5-6: Done When and Verify below; every command exists once the files exist.
7. Size: reduced, see decisions.

## Decisions (accepted / changed from the plan)
- Accepted: separate `impressions` metric; watch time unit read from the header (minutes/hours/seconds) and converted to hours; duplicate headers and unterminated quotes are errors; ragged rows are counted and reported; approval is bound to a fingerprint of hook/draft/caption/hashtags, so any edit after approval blocks Posted; post identity is platform-aware (YouTube keeps `v`, Shorts id; TikTok video id; Instagram `/p|reel/<code>`); Posted needs a URL on the item's own platform; Measured needs a linked measurement; exact reimports (same file hash) are no-ops and later snapshots replace a post's metrics instead of adding; rankings per platform; sample records are labelled SAMPLE and excluded whenever real data exists; SW cache prefix is app-specific and cleanup touches only it; API calls never cached; key stored separately, masked, removable, never exported.
- Changed: no separate `ideas`/`research`/`measurements` stores. `items` carry the idea, goal, evidence references and one platform each ("Copy to another platform" makes a sibling); `findings` hold trends/niches/questions/notes with sources; `runs` log each scout run (time, model, usage, errors, dropped evidence count); `posts` are measurements keyed `platform:identity`; `imports` log file hash, mapping, counts. Smaller, same loop.
- Changed: `pause_turn` auto-continues up to 3 times inside the one user-started run (bounded by `max_uses: 8` searches and `max_tokens`); every continuation re-sends all prior blocks. No automatic retry on errors. A 120 s timeout aborts.
- Changed: one test file per area is not required; `test/*.test.js` with inline synthetic data.
- Deferred (README "Later"): stale-tab revision checks (single user, one device), device install checks beyond the Pixel 5 viewport emulation (needs the user's phone), dev-server unit test.
- Model: `claude-opus-5-5` (claude-api skill default), `web_search_20260209`, raw `fetch` because the app has no build step and no runtime dependencies (AGENTS.md Stack); header `anthropic-dangerous-direct-browser-access: true`.

## Done When
1. `cd social-studio && node --test` passes, covering: CSV quoting/BOM/duplicate headers/unterminated quotes; imports for all three platforms with unknown headers, units, missing values, duplicate file, distinct post identities; scout success, uncited claims dropped, missing dates, malformed JSON, search error inside HTTP 200, 401/429, network failure, cancel, pause_turn; pipeline approval bypass, edited-after-approval, wrong-platform URL, measured without measurement; insights facts vs hypotheses, per-platform ranking, sample exclusion.
2. Browser check (Claude, dev server on 5175, desktop and 375 px): every screen renders its empty state with no console errors; the full loop works on sample data (scout results shown from SAMPLE findings, idea → draft → ready → approve → posted with URL → import synthetic CSV → measured → Results → Turn into idea); reload keeps data; keyboard focus visible; the scout without a key shows an actionable error.
3. No key in exported backup, findings, runs or caches (inspection of `exportAll` and `sw.js`).
4. Live Claude API call: NOT run by Claude (paid, the user's key). Untested → the user, first scout run.
5. Android/iOS install on real devices: Untested → the user.

## Verify
- `cd social-studio && node --test` (this task creates it).
- `node social-studio/dev-server.mjs 5175` via `.claude/launch.json` entry `social-studio`, then the browser checklist above.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 verify -TaskId SS-1` (AGENTS.md Control Plane).

## Stop conditions
A requirement that needs a backend, a dependency or a paid call to verify; any change needed outside the allowlist.

## Review round 1 (Codex verify, REFUTED, 7 findings) — all accepted and fixed
1. Same-title rows overwrote each other → kept apart with `#row` ids and a warning; same linked post twice → last row kept, warned (`importer.js`).
2. Missing metrics became 0 → totals are null when no post reports them; the call-to-action recommendation needs known 0 clicks (`insights.js`).
3. Avg view duration in minutes/hours now converted to seconds; `;`-delimited files read decimal commas; "1,5" in comma files is not guessed (left empty, warned); junk is flagged (`csv.js`, `importer.js`).
4. Marking an item Posted links an already-imported measurement and moves it to Measured (`views/pipeline.js`).
5. SAMPLE items are excluded from hypotheses/recommendations whenever real posts exist (`views/results.js`).
6. A pre-aborted signal never sends a request (`scout.js`).
7. Unsupported audience questions count toward the dropped total (`scout.js`).
INTENT: two old assertions changed with findings 3 and 7 (`toNumber('abc')` is now `undefined` = flagged; dropped count 2→3). TWINS: searched `|| 0` in src — 5 sites, none other treats an unknown metric as 0.
Checks after fixes: `node --test` 25/25; headless Playwright loop (scratchpad `loop.mjs`, mocked API) desktop + Pixel 5 ALL OK; `ccx verify -TaskId SS-1` PASS (secrets false positive fixed by passing `apiKey` shorthand, scanner unchanged).

## Review round 2 (Codex verify, REFUTED, 6 findings) — all accepted and fixed; review cap (2) reached, decided on evidence
1. AI draft saved a stale item snapshot → the flag now travels in a hidden form field; only Save writes (`views/plan.js`).
2. Invalid backup overwrote data → `validateBackup` checks app, version and every record before writing; restore is one IndexedDB transaction (`db.js`).
3. Mixed-currency revenue summed → totals per currency, labelled "mixed currencies" (`views/results.js`).
4. Model-invented source dates kept → evidence dates come only from search-result `page_age`, shown as "page dated" (`scout.js`, `ui.js`).
5. Timeout reset per continuation → one deadline for the whole run (`scout.js`).
6. Text after a closing quote accepted → CSV error (`csv.js`).
INTENT: one old assertion changed with finding 4 (evidence date now equals the search metadata date; new test covers the no-metadata case staying empty). TWINS: searched other `save('items', { ...i` in async handlers — only `aiDraft` awaited a network call before saving.

## Phones (user request 2026-11-22: "make it compatible in phone as well")
Safe-area insets (notch, home bar), 16 px inputs (no iOS zoom), 44 px checkbox labels, bottom-sheet dialogs, stacked board and week on < 700 px, iOS/Android home-screen meta tags, Android CSV MIME types in the file picker, phone share sheet for approved captions (`navigator.share`, hidden where unsupported). Root cause of phone zoom-out fixed: absolutely positioned `.sr` text inside the scrolling board had no positioned ancestor (`.card`, `.col` now `position: relative`).
Checks: `node --test` 29/29. Headless Playwright loop (scratchpad `loop.mjs`, API mocked) ALL OK, 184 checks on desktop 1280, Pixel 5, Galaxy S8 (360 px), iPhone 13 on Chromium and on WebKit (Safari engine; service worker blocked in that run because Playwright cannot route WebKit SW traffic). Per screen: no sideways scroll, touch targets >= 40 px, editor dialog fits. SKIP: keyboard Tab-to-skip-link on WebKit iPhone (no Tab key).
Untested → user: real phones (install to home screen needs HTTPS hosting, not set up), live Claude API call with the user's key. Untested → nobody yet: real platform CSV exports (header aliases are best-effort).

## Security review (automated, before commit)
Stored XSS via a crafted backup: platform values reached HTML attributes unescaped (`views/pipeline.js`, `views/results.js`). Fixed by escaping every such value and by `validateBackup` accepting only tiktok/instagram/youtube, numeric metrics and numeric import counts. TWINS: grepped all `${…}` in views for unescaped data; the rest go through `esc`/`badge`/`opt`/`link`, `setStatus` (textContent) or fixed labels. Tests 29/29; browser loop 184 checks ALL OK; `ccx verify` PASS.

## Acceptance
User accepted and asked to commit on 2026-11-23 after two Codex review rounds (13 findings, all fixed). `ccx task done` refuses without a passing cross-model review and independent verifier, so SS-1 stays open in ccx; the next Codex verify that passes can close it. Not overridden.
