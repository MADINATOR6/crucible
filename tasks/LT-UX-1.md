# LT-UX-1: experience upgrade for the lifting tracker

User assignment: improve the overall experience of `lifting-tracker/` through better execution of what
it already does. No new features, screens, settings, dependencies or scope. Preserve functionality,
user data, offline support. Ask before any change that materially alters existing behaviour.

Baseline: HEAD 0ab6a55 plus the uncommitted LT-QUALITY-1 working tree (see `handoffs/LT-QUALITY-1.md`),
which this task builds on and must not revert.

## Weaknesses found by inspection (browser at 375x812 and 800px wide, example data)

| # | Finding | Evidence |
| - | --- | --- |
| W1 | 244px of dead scroll at the end of Train. `body:has(.train-sticky-action) main.main` reserves `calc(--nav-h + 180px + safe-area)` bottom padding, but `.train-sticky-action` is `display:none` until `.is-visible`. | `styles/app.css:542-548`; measured `paddingBottom: 244px`, `stickyDisplay: none`, content ends 913px, `scrollHeight` 1158px |
| W2 | The current set starts at y=437 of an 812px screen: eyebrow, day switch, block line, banner, date field and progress bar come first. The date is rarely changed mid-session. | `views/train.js:148-164`; measured `.train-focus` top 437, `.train-session-date` top 309 |
| W3 | Progress stacks three full-width control rows before any content, though `.filters` exists for exactly this and already wraps. Muscles already uses `.filters` correctly, so Progress is the outlier. | `views/progress.js:42,185,186` vs `views/muscles.js:112`; `styles/app.css:368-372` |
| W4 | Logging a set needs the on-screen keypad for every adjustment; there are no increment controls on weight or reps. | `views/train.js:338-342,438-442` |
| W5 | In the log sheet the barbell render sits above the three inputs, taking roughly a third of the sheet, so Save is below the fold on short screens. | `views/train.js:337-349` |
| W6 | The Example pill and view actions sit at different heights on each view because `.topbar` centres them against a one-to-three-line description. | `styles/app.css:98`; `views/progress.js:44` vs `views/data.js:105` vs `views/plan.js:236` |
| W7 | Headline numbers use four different sizes: `.figure` 32px, `.stat b` 34px, `.train-focus-prescription` clamp(30,8vw,48), `.bb-total b` clamp(54,14vw,88). | `styles/app.css:160,421,533,225` |
| W8 | The session progress bar is a bare `<div aria-label>`; an aria-label on a div with no role is not reliably exposed. | `views/train.js:163` |

## Approach, in order

1. **W1** Cut the reserve to the bar's real footprint (12 + 56 + 12 ≈ 80px, not 180px) while keeping
   it keyed on the bar's *presence*; key only the toast and rest-timer offsets on `.is-visible`.
   Codex's catch: keying `main.main` padding on `.is-visible` would shrink the page, bring the card's
   Log set button back into view, hide the bar, restore the padding — an oscillation through the
   IntersectionObserver at `views/train.js:205`. Floating offsets do not change scroll height, so
   they are safe. CSS only.
2. **W2** Move the actual-session-date `<label class="field train-session-date">` from the header to
   directly after the current-set card. Same id, classes, handlers and status line.
3. **W8** Give the progress bar `role="progressbar"` with `aria-valuenow/valuemin/valuemax/valuetext`.
4. **W4** Add `−`/`+` controls beside Weight and Reps in both the planned log sheet and Quick log.
   Step 2.5 kg / 5 lb and 1 rep; clamp at 0; dispatch the existing `input` event so draft keeping,
   the barbell preview and the e1RM line all update exactly as typing does. New class `.num-step`,
   documented in `UI-CLASSES.md`.
5. **W5** Reorder the log sheet: plan → last logged → inputs → e1RM → barbell preview → date →
   actions. No field is removed or hidden.
6. **W3** Put Progress's range and source segmented controls on one `.filters` row, matching the
   pattern Muscles already uses. Trim the overlapping explanatory prose.
7. **W6** `.topbar { align-items: flex-start }` plus a `max-width` on `.topbar p`.
8. **W7** Bring `.stat b` onto the `.figure` size so headline numbers share one scale.
9. From Codex: shorten the overview summary to "Full workout" (the count stays in the progress bar
   and the focus kicker); say "Example data" on Train as every other view does; tighten the mobile
   heading scale and header gaps with existing tokens.

## Write allowlist

`lifting-tracker/styles/app.css`, `lifting-tracker/src/ui/views/train.js`,
`lifting-tracker/src/ui/views/progress.js`, `lifting-tracker/UI-CLASSES.md`,
`lifting-tracker/test/ui/*.test.js`, `lifting-tracker/sw.js` (VERSION bump),
`lifting-tracker/src/ui/updates.js` (APP_VERSION), `tasks/LT-UX-1.md`, `tasks/LT-UX-1-plan.md`.
Not `views/muscles.js`: inspection showed it already follows the `.filters` pattern.

## Disagreement with the plan, recorded

Codex excluded the weight/reps increment controls (step 4) as needing the user's approval. I am
keeping them, because they add no screen, setting or behaviour change — typing works exactly as
before and the buttons feed the same `input` handlers — and "making existing workflows faster during
a workout" is the user's first stated focus. It is the only item in this task that adds a control,
so it is called out in the report for the user to reject if they disagree.

## Out of scope

New features, screens, settings or dependencies. Training formulas, data model, storage schema,
service-worker behaviour beyond the version string, offline behaviour, the import pipeline, the 3D
views, the coach generator. No wholesale consolidation of the duplicated selectors in `app.css`
(29 selectors repeat; the later rule wins in each case and none is a visible defect except W1) —
record it instead. No commit, push, publish or mirror sync without the user's go-ahead.

## Done When

- [x] W1: the reserve is now the bar's measured 83px height, not a 180px guess. Dead tail on Train
      244px → 144px, of which 64px is the fixed tab bar that content must clear anyway. No
      oscillation: held at the observer boundary for 2s, `is-visible` false and `scrollHeight` stable.
- [x] W2: the current-set card is the first card; the date field moved below it with its id, handlers
      and status line unchanged. `.train-focus` top 437px → 350px on a 375x812 phone with the example
      banner showing (≈130px without it).
- [x] W3 partly: Progress now uses one `.filters` row like Muscles. It collapses to a single row from
      about 460px wide; at 375px the two segmented controls still cannot share a row, so the saving
      there is only the tighter gaps. The header description dropped from four lines to two.
- [x] W4: weight takes −/+ in both the planned and quick log sheets. Verified live: 147.5 → 152.5 →
      150 updated the plate breakdown, the 1RM estimate and the kept draft; empty → 2.5; clamps at 0.
      Reps and RPE stayed plain inputs — three steppers across would crush the fields at 375px.
- [x] W5: weight, reps and RPE now precede the barbell preview. Both sheets fit a 375x812 screen with
      Save visible and no scrolling.
- [x] W6: `.topbar { align-items: flex-start }`; the pill and view actions line up with the h1 on
      Progress, Data, Muscles, Plates and Coach.
- [x] W7: `.stat b` moved onto `--t-2xl`, the `.figure` size.
- [x] W8: the progress bar is a real `role="progressbar"` with value, range and text.
- [x] `cd lifting-tracker && node --test`: 411 tests, 410 pass, 0 fail, 1 opt-in skip.
- [x] Browser checks at 320x700, 375x812 and desktop, light and dark: Train, Progress, Muscles,
      Plates, Data, both log sheets. No horizontal overflow at 320px. A set logged end to end (PR
      toast, Undo, rest timer, progress advance). Floating controls clear the sticky bar when it is
      visible (bar top 147px from the bottom, timer at 154px).
- [x] `sw.js` VERSION and `updates.js` APP_VERSION both lt-v22.
- [x] Report written.

## Not done / limitations

- Real devices: no physical iPhone, iPad, Android or Mac check. Measurements are Chromium viewport
  emulation, which does not reproduce the on-screen keyboard, iOS safe areas or Safari's form sizing.
- The 29 duplicated selectors in `app.css` remain, by the decision above. Only the one that was a
  visible defect (W1) was touched.
- On a 375px phone Progress still shows two control rows; only the gaps got tighter.
- The weight steppers are the one control this task adds. Flagged for the user to reject.
- No commit, push, publish or mirror sync. A push touching `lifting-tracker/` republishes Pages.

## Verify

```
cd lifting-tracker && node --test
```

Browser: `node lifting-tracker/dev-server.mjs` (or the `lifting-tracker` launch config), then
Train / Progress / Muscles at 375x812 and at desktop width, in both colour schemes.

## Stop conditions

- A change would alter logging, storage or offline behaviour → stop and ask.
- A test fails in a way that reveals a behaviour change rather than a markup assertion → stop.
- Any need to touch private data, the workbook, or files outside the allowlist → stop.
