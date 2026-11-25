# Save feedback review

Task: `SAVE-FEEDBACK-REVIEW`  
Recording reviewed: `media-out/crucible-demo/log-a-set.webm` (17.7 s, Pixel 5 viewport, inspected directly at 1 fps from `00:00` to `00:17`).

## Gemini review

### Verdict
The athlete **can** tell that a set was logged (the `Set saved  Undo  ×` toast appears at `00:08`–`00:11`, the progress bar advances to `1 of 7 sets`, the focus card moves to `Set 2` with `Last logged: 142.5 kg × 4 @ RPE 8.5 · Thu, Nov 26` visible once the toast clears at `00:12`, and row 1 shows a green check in `Full workout`), **but there is one clear UX issue in the post-save verification row inside `Full workout`**.

### Finding: Logged set values are truncated in `Full workout` on Pixel 5 width
- **Timestamp:** `00:15` (persists through `00:17`)
- **On-screen evidence:** After the reload and opening the `Full workout` fold under `Low Bar Squat`, completed set row `1` displays:
  - `1` | **`4 × 142...`** | `plan 5 × 147.5 kg` | green `✓` button
  - The athlete's actual saved weight and RPE (`4 × 142.5 kg @8.5`) are clipped to `4 × 142...`, hiding the `.5 kg` decimal, unit, and `@8.5` RPE, while the unlogged planned load (`plan 5 × 147.5 kg`) is rendered in full beside it.
- **Why it happens (read-only code inspection):** In `lifting-tracker/src/ui/views/train.js:272-282`, when the logged set differs from the plan, `.list-row` renders both `.main` (`4 × 142.5 kg @8.5`) and `.trail` (`plan 5 × 147.5 kg`). In `lifting-tracker/styles/app.css:373-375`, `.list-row .main` truncates (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`) while `.list-row .trail` is `flex: none; white-space: nowrap`, and `lifting-tracker/styles/app.css:423` only hides `.set-row .trail` at `@media (max-width: 380px)`. On Pixel 5 (393 px wide), the non-shrinking `plan ...` trail stays visible and starves the actual logged numbers of horizontal space.
- **Impact:** Although the `Last logged:` line on the current-set card (`00:12`–`00:14`) shows the full values for the most recent set, an athlete checking the `Full workout` list on a standard phone width cannot confirm the exact weight or RPE saved for a modified set without tapping into the row to open the edit sheet.

### Recommendation
Give the saved set's actual numbers priority over the `plan ...` comparison text on narrow phone viewports—for example, stack `plan 5 × 147.5 kg` as a secondary line under the logged value inside `.set-row` (or widen the breakpoint / allow `.set-row .main` to wrap cleanly) so the full logged weight, reps, and RPE remain readable on Pixel 5 (393 px) and similar phones.

Next owner: codex - run the permitted `lt-persist` check to verify the logged set survives reload, inspect `lifting-tracker/src/ui/views/train.js` and `lifting-tracker/styles/app.css`, and record a fix proposal or evidence-backed dismissal under `## Codex check` in `Reference/Save feedback review.md`.

## Codex check

- **Persistence — PASS on installed Chrome with Pixel 5 emulation.** Ran `npx.cmd playwright test -g unchanged --project=android` from `lifting-tracker/`. The default launch was blocked before the test could start because Playwright’s bundled `chromium_headless_shell-1194` executable was missing. Retried the same Playwright test filter and project by connecting to a local Playwright server backed by installed Chrome via `PW_TEST_CONNECT_WS_ENDPOINT`. The retry reported `1 passed (6.0s)` and verified that a fresh example workout went from zero to one completed set and that the completed row still contained `4 × 142.5` and `@8.5` after reload. The assertions check row text in the DOM. [Smoke test](../lifting-tracker/e2e/smoke.spec.js#L49)
- **Save feedback — Gemini’s finding confirmed in the supplied recording.** The `00:08.5` frame shows `Set saved` and `1 of 7 sets`. At `00:15.5`, the post-reload `Last logged` line shows `142.5 kg × 4 @ RPE 8.5`, while the completed Full workout row shows `4 × 142…` beside the full planned value. Codex inspected these two supplied PNGs, so this review covers those instants. The row markup gives the actual and planned values separate elements, and CSS lets the actual value shrink and ellipsize while the planned value keeps its width. The rule that hides the plan applies only at 380 px and below. [Save frame](../media-out/crucible-demo/frames/t08.5s.png) · [Reload frame](../media-out/crucible-demo/frames/t15.5s.png) · [Row markup](../lifting-tracker/src/ui/views/train.js#L266) · [Row styles](../lifting-tracker/styles/app.css#L373)
- **Proposed fix.** Let the saved-value button wrap within completed set rows by overriding its `white-space` and ellipsis styles in the workout list. Keep the planned value and edit controls available. At 393 px and a narrower viewport, verify that the full `4 × 142.5 kg @8.5` is readable without opening the edit sheet, then rerun `lt-persist` to verify the set still survives reload.

**Standard runner follow-up.** After installing the pinned Playwright Chromium Headless Shell, `npx.cmd playwright test -g unchanged --project=android` passed directly from `lifting-tracker/` with exit 0 and `1 passed (4.7s)`. The earlier bridge run still records the missing-browser failure.

Next owner: claude - review the finding and proposal. If a fix is approved, implement it in a separate task and verify the row at phone widths.
