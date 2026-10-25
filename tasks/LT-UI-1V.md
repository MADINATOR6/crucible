# LT-UI-1V: verify the phase 0 and phase 1 UI work (read-only)

## Mode and owner
LT-UI-1V · verify role · read-only. Claude wrote the code under test; Codex tries to break it. Do not edit, create or delete repository files. Temporary files only under `%TEMP%`. Synthetic data only.

## Change under test
`git diff 9c37068^ 30fad64 -- lifting-tracker/` (phase 0: design tokens and `UI-CLASSES.md`; phase 1: `src/ui/views/train.js`, `src/ui/dom.js`, `styles/app.css`). `src/core/session.js` and `state.js` came from LT-UI-1 and are only context here.

## What it should do
- Train opens on `app.nextSession()` the first time it renders; afterwards it keeps the user's chosen day. The header button opens a picker sheet (block, week, day; a "Next session" button).
- Each set is one `li.list-row`. Its `.main` button opens the existing log sheet. Its `.check-btn` (`data-done`) logs the set as planned via `app.logAsPlanned` when not done, or opens the log sheet when it's already done.
- A one-tap log shows a toast with an Undo action (8 s) that calls `app.deleteSet` on the new set, and starts the rest timer.
- A set with no planned weight or reps (`RangeError` from `logAsPlanned`) falls back to the log sheet.
- `toast(message, ms, action)` in `dom.js` stays backward compatible with `toast(message)` and `toast(message, ms)`.
- All user and workbook text reaching markup goes through `esc()`.

## Verify commands
- `cd lifting-tracker && node --test` (expect 259 pass, 1 skip).
- `node --check lifting-tracker/src/ui/views/train.js` and the same for `lifting-tracker/src/ui/dom.js`.

## Attack
- Escaping: exercise names, superset groups, cues, coach and athlete comments, block names and `repsRaw` containing `<img onerror>`, quotes or `&` (read the template paths; build a small synthetic programme in a temp script if that helps).
- Planned values: sets with only a `loadRange`, no load, `repsMin` null with `repsRaw`, lb units, warm-up rows.
- State: the programme changes (import or a block removed) while `ui.train` points at a block, week or day that no longer exists; a block with no weeks; a week with no days; a day with no entries.
- Double taps on `.check-btn` (`guarded` must stop double logging); Undo clicked after the toast has gone; a toast's action button when `action` is omitted.
- Accessibility: every interactive element has an accessible name; `aria-pressed` reflects done; the picker's chips are buttons.
- CSS: any class used in `train.js` that isn't defined in `app.css` or listed in `UI-CLASSES.md`; any inline `style` other than the progress width.

## Report
HANDOFF.md Verifier instruction and Report format. Each problem gets a reproduction, file:line and severity.
