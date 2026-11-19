Follow HANDOFF.md, Planner instruction (it replaces the Researcher instruction for this task), but the deliverable
here is a review, not a plan. Never edit, create or delete repository files.

# LT-SMOKE-1 review brief: browser smoke tests for lifting-tracker

## What I did
`node --test` covers the app's logic, but its UI suites assert against hand-written stub elements
(`lifting-tracker/test/ui/usability.test.js:22-33`), so nothing exercised the real app before a push republished
it to GitHub Pages. I added a Playwright smoke suite and made it gate the publish.

Changed (uncommitted at the time of writing; `git status` and `git diff` show them):
- `lifting-tracker/playwright.config.js` (new): two projects, desktop Chrome and a Pixel 5 viewport; own dev server
  on port 5174; `workers: 1`.
- `lifting-tracker/e2e/smoke.spec.js` (new): 5 tests — app starts and shows the current set; a logged set survives a
  reload; every view renders with no console errors and no sideways scroll; the service worker installs and the app
  opens offline; a backup exports and restores from the file it wrote.
- `lifting-tracker/package.json`: `@playwright/test` 1.56.1 as a devDependency, `test:e2e` script. Plus a new
  `lifting-tracker/package-lock.json`.
- `.github/workflows/pages.yml`: a `Browser smoke test` step between the existing tests and the publish, and a
  traces artifact on failure.
- `lifting-tracker/dev-server.mjs`: `.webp` and `.glb` MIME types, so a local run matches what Pages serves.
- `.gitignore`: `node_modules/`, `lifting-tracker/test-results/`, `lifting-tracker/playwright-report/`.
- Docs: `AGENTS.md` Commands, `CLAUDE.md` publish paragraph, `lifting-tracker/README.md` Run it.

Evidence: `cd lifting-tracker && node --test` → 410 pass, 1 skip. `npx.cmd playwright test` → 10 passed (5 × 2
projects), about 17-20 s. Teeth check: forcing `openStore` to return the in-memory store (`src/store/db.js:72-74`)
made "a logged set is still there after a reload" fail with "Received string: 0 of 7 sets"; the edit was reverted
and both suites are green again.

## What I want from you
1. Attack the suite's value: which of the 5 tests would pass while the real app is broken, and which real breakage
   would still slip through to the live site? Name the gap and the smallest test that would close it.
2. False confidence and flakiness: anything in the spec that is timing-dependent, order-dependent, or asserts on
   text that could change for an innocent reason. `expect(errors).toEqual([])` on console errors — too strict, or
   right?
3. The CI step: `npm ci` plus `npx playwright install --with-deps chromium` on every push that touches
   `lifting-tracker/`. Is anything there wrong, slow for no reason, or able to block a publish spuriously? Note
   that this workflow is also the publish.
4. Check nothing published changes: the `Collect the app's runtime files` step must still copy only app files, and
   no app runtime file changed, so `sw.js` VERSION and `APP_VERSION` are deliberately NOT bumped. Confirm or refute.
5. Privacy: the suite drives the built-in example programme. Confirm no athlete data, no network calls to anything
   but 127.0.0.1, and nothing private in the new files.

Ground every claim in path:line. Mark anything you could not check UNKNOWN / CHECKED / NEEDED. Report findings by
severity with a concrete retest criterion for each. Do not propose new features; this is a review of these changes.

## Constraints
- The app keeps no build step and one runtime dependency (three.js, 3D only). Playwright is development-only.
- Must stay useful for both Android and iOS; today the suite runs Chromium only (desktop + Pixel 5 viewport).
  Say plainly whether a WebKit project is worth its install cost in CI.
- Verify commands that exist: `cd lifting-tracker && node --test`, `cd lifting-tracker && npx.cmd playwright test`.
