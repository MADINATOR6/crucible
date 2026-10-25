# LT-UI-5: tidy Plates, Data, Plan and the meet planner

## Mode and owner
LT-UI-5 · normal · risk low · Dispatch in its own worktree. Codex implements the markup; Claude owns `styles/app.css` (the classes below already exist), styles, reviews and owns all Git. Phase 4 of the lifting-tracker UI upgrade (`prompts/lifting-tracker-ui-upgrade.md`): every screen uses the shared class contract, so spacing and type match. Synthetic data only.

## Goal
On a 375 px phone these four screens look like Train, Muscles and Progress: no one-off inline styles, content before settings, list rows instead of ad-hoc boxes, and the Plan screen short enough that "Generate" is not 3,000 px down.

## Relevant files
- `lifting-tracker/src/ui/views/plates.js`, `data.js`, `plan.js`, `meet.js`.
- `lifting-tracker/UI-CLASSES.md` (the contract; read it first) and `styles/app.css` (read only).
- `src/ui/views/train.js` and `progress.js` (read only): the house style (`.list` / `.list-row`, `details.options`, `.section-h`, `.row.end` with `.field.grow`).

## Write allowlist
`lifting-tracker/src/ui/views/plates.js`, `data.js`, `plan.js`, `meet.js`, new `test/ui/contract.test.js`. Nothing else: no CSS, no `barbell.js` / `barbell3d.js`, no core logic, no docs.

## Resolved rules

### Everywhere (the four files)
1. No `style="…"` left except data-driven values: a plate's colour on `.disc` (`background` and `color`) and `.progress-track` widths. Map the rest:
   - card and block spacing `margin-top:14px` / `16px` → `.mt-4`; `10px` / `12px` → `.mt-3`; `6px` / `8px` → `.mt-2`; `margin-bottom:8px` → `.mb-2`.
   - `color:var(--warn|good|bad)` → `.tone-warn` / `.tone-good` / `.tone-bad`; `text-align:center` → `.center`.
   - a field that shares a row (`flex:1;min-width:…`) → `.field.grow`, its row → `.row.end` (drop `align-self:end` on the button).
   - `.medal` with an inline background → `.medal.plain`; checkbox `width:auto;min-height:0` → nothing (a global rule covers it); `label.btn` `cursor:pointer` → nothing.
   - danger buttons (`border-color` / `color` `var(--bad)`) → `.btn.danger`.
   - `ul` with `padding-left:18px` → `ul.bullets`; the bordered box (`padding:12px;border:1px solid var(--line-strong)`) → `.panel`; `overflow-x:auto` → `.scroll-x`; the 92 px table input → `.input-narrow`; `.banner` with `display:block` → `.banner.block`.
   - `h3` margins → drop them, or `.mt-4` where a gap above is needed.
   If something has no class, name it in the report instead of inventing CSS.
2. Keep every `id`, `data-*` hook, event binding, accessible name, text and behaviour. Escaping stays as it is (`esc()` on all user and workbook text).

### Plates (`plates.js`, below the bar card) and meet planner (`meet.js`)
3. Warm-up ladder: `ol.list` of `li.list-row`: `.lead` = `<span class="medal plain">N</span>`; `.main` = `<b>72 kg × 5</b>` with the plate text as `<small>`; then the existing `.btn small` Load button (keep `data-ladder`).
4. "Load a weight" and "Bar & collars" stay side by side on wide screens (`.grid.cols-2`); the result line under the target uses `.mt-3`, not inline margins. Meet planner: same replacements; keep its "suggestion only" pill and every input id.

### Data (`data.js`)
5. Backup buttons (Export backup, Export sets, Restore backup) in one wrapping `.row` instead of one per line. "Delete all my data…" uses `.btn.danger`. Error and warning lines use the tone classes.

### Plan (`plan.js`)
6. Coach's review: keep the headline and the confidence wording, but each finding becomes `details.coach-find.sev-*`, closed by default, with `<summary>` = the title plus its pill (Worth fixing / Going well / …); the evidence list (`ul.bullets`), "Do this", confidence and the finding's action button sit inside. The first "What to improve" finding starts open. "More notes" stays a fold.
7. "What do you need?": unchanged controls (text box, Understand, goal chips), but the Settings card moves inside it as `details.options` with summary "Settings · ${a short list of the values that are not auto, or 'all automatic'}" and the same fields in a `.grid.cols-2` (two columns on wide screens, one on phones).
8. "What I'm basing it on": keep the table, inside `.scroll-x`, with the "From" text moved under the lift name as `<small class="muted">` so the table has four columns: Lift, Working e1RM, Confidence, Your e1RM (the override input, `.input-narrow`). The Generate button follows it as now.
9. The generated-block result, warnings and "Your generated blocks" list: same class replacements; the generated-blocks rows become `ol.list` > `li.list-row` (`.main` = block name with `<small>` details, then the existing buttons).

### Contract test
10. New `test/ui/contract.test.js`: reads every file in `src/ui/views/` and fails on a `style="` whose value isn't one of the allowed data-driven forms (a `background:`/`color:` pair on `.disc`, `width:` on a progress bar, `--chart-h` / `top:` / `left:` only in `charts.js`, which is not a view). List each offending file and snippet in the failure message. It must pass after rules 1–9.

## Out of scope
CSS, Train/Muscles/Progress, the barbell drawings, core logic, docs.

## Verify
- `cd lifting-tracker && node --test` (baseline: 278 pass, 1 skip; the count may only go up).
- `node --check` on the four views.
- `git diff --check`.
- In a browser if you can (`node lifting-tracker/dev-server.mjs`); otherwise say so. Plan only shows its full screen after a non-example programme is loaded: in the console, `await __app.setProgramme({ ...__app.programme, isExample: false })`, and `await __app.useExample()` afterwards.

## Done When
1. (Codex) Rules 1–2 across the four files.
2. (Codex) Rules 3–5 (Plates, meet, Data).
3. (Codex) Rules 6–9 (Plan).
4. (Codex) Rule 10, passing.
5. (Codex) The report lists any class it wanted but didn't have, and any inline style left with the reason.
6. (Claude) Styling, browser check at 375 px and desktop in both themes, review, commit.

## Stop conditions
Stop and report (UNKNOWN / CHECKED / NEEDED) if a rule would drop information or a control the screens have today, or needs a file outside the allowlist.
