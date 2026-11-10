# LT-CALORIE-2 review 2, plus LT-COMPAT-1 (UI compatibility fixes)

Role: verifier. Read-only. Do not edit, stage or commit anything. Working tree on HEAD f770d80.
Scope is `git diff -- lifting-tracker`. This is the second and last review cycle for LT-CALORIE-2.

## Part A: the fixes for your three findings (tasks/LT-CALORIE-2.md, Status)

1. Float rounding on delete then Undo: `sameKcal` in `lifting-tracker/src/ui/state.js` is now a 0.005 kcal
   tolerance instead of rounding to 2 dp.
2. `setDayFinished(date, finished, today = todayIso())` refuses `date >= today`. INTENT: the old test
   "a day with no food, today, or a stray date cannot be confirmed" permitted today, against Done When;
   it now asserts the refusal.
3. `sanitizeFinishedDays` uses `MAX_DAY_KCAL` (200,000) and `setDayFinished` runs the same sanitiser before
   writing, so anything that saves also reloads.

Regression tests: `test/ui/state.test.js`, the three tests after "a food log speaks for a day only once…".
TWINS: `sameKcal` has one caller (`dayFinished`); the 20,000 cap had one twin, the per-entry cap in
`sanitizeIntake`, which is correct as a per-entry limit and unchanged.

Attack: can the tolerance let a real edit through as "same total"? Does the default `today` make any
existing caller or test depend on the wall clock in a way that will start failing later?

## Part B: LT-COMPAT-1, small UI fixes found in a phone-viewport audit (not from your plan)

- `src/ui/dom.js` `openSheet`: a `CloseWatcher` per sheet where the browser has one, so Android's back
  gesture closes the top sheet. Before, back navigated the page behind and left the sheet open over the
  wrong view (reproduced in a browser with `history.back()`). Checked in Chromium: with the existing Escape
  handler calling `preventDefault`, a second stacked watcher does not also fire, so Escape still closes one
  sheet. Test: `test/ui/interaction.test.js`, "Android's back gesture closes only the top sheet…".
- `src/ui/app.js` `applyTheme`: the `theme-color` metas follow a manually chosen theme. INTENT:
  `test/ui/navigation.test.js`'s document stub returned the nav links for every selector; it now returns
  none for `meta…`, with no assertion changed.
- `styles/app.css`: solid fallbacks declared before `color-mix()` where losing the declaration hurt
  legibility (tab bar, banner, done rows, rest-timer buttons, body silhouette fill, 3D tips),
  `-webkit-backdrop-filter`, a `vh` fallback before the sheet's `dvh` max-height, `overscroll-behavior:
  contain` on sheets, the page behind a sheet does not scroll under 900 px, and "+ Log" no longer wraps.

Attack: any case where `CloseWatcher` closes a sheet it should not, leaks a watcher, or breaks a sheet that
re-renders its content; any CSS fallback that changes how a current browser renders.

## Evidence so far

`node --test`: 421 tests, 420 pass, 1 opt-in skip. `npx.cmd playwright test`: 14 passed, 1 skipped.
Not verified: a physical Android back gesture; any iPhone older than the Playwright WebKit build.

Report: findings by severity with file:line, a verdict for each part. No code edits.
