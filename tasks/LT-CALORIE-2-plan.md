Follow HANDOFF.md, Planner instruction (it replaces the Researcher instruction for this task).

# LT-CALORIE-2 plan brief: let the food log feed measured maintenance safely

## Goal

Close the gap left by commit `4219713`: a finished day whose only record is the food log still feeds the
measured maintenance with its completeness unknown, so an athlete who logs breakfast and nothing else for
two weeks can still be shown a 500 kcal maintenance and eat to it.

## What the previous change settled

Read `src/ui/state.js` `app.eatingTarget` and its comment. Calories typed with a weigh-in beat that date's
food log, because the typed figure is a claim about the whole day and the log carries nothing that says
whether it is one. Today is excluded from both sources. You verified in review that no magnitude rule can
tell a complete day from a fragment, and that deriving the threshold from the profile made the same history
change value when the profile was filled in. Do not propose either again.

## User requirement

The athlete marks a day's food log as finished, and only finished days feed the measured maintenance in
place of a typed figure. One decision per day, visible in the Body view, reversible.

## What the plan must resolve

1. Where the marker lives. It is per date, not per entry, and a day has many entries. Candidates I can see:
   a new `meta` key beside `intake` and `activities`; a field on `settings`; something on the intake records
   themselves. Weigh the cost each carries in `src/store/backup.js` (buildBackup, validateBackup, snapshot,
   counts, and whether `BACKUP_VERSION` must go 3 → 4), in `src/store/programme-schema.js` (a sanitizer, a
   cap), and in `src/ui/state.js` (load, save, accessor). Say which is smallest and still correct, and what
   an older app restoring a newer backup would lose.
2. What a finished day means for `app.eatingTarget`. Precedence between a finished log, an unfinished log
   and a typed figure for the same date, and whether an unfinished day should feed anything at all.
3. What happens to a marked day that is then edited — food added or removed after it was marked finished.
4. Whether existing stored data needs a migration, or whether absent means unfinished and that is enough.
5. Where the control goes in the Body view's food log card and what it says. The card is `mealsCard` in
   `src/ui/views/body.js`; the day it shows is `b.date`, which can be any past date, not just today.
   Today cannot be marked finished, because today is excluded from maintenance anyway.

## Known constraints

- Offline PWA, plain ES modules, no build step. Nothing may be added to the published runtime dependencies.
- Restore must stay hostile-input safe: everything sanitised before it reaches the database, applied in one
  transaction (`src/store/backup.js` header comment).
- `src/ui/state.js` and any file under `src/` is published, so `sw.js` `VERSION` and `src/ui/updates.js`
  `APP_VERSION` must be bumped together (currently lt-v23). Say so in Done When.
- Synthetic test data only. The athlete's workbook is private and never reaches a test or a prompt.
- Verify commands that exist: `cd lifting-tracker && node --test` (413 tests, 1 opt-in skip) and
  `cd lifting-tracker && npx.cmd playwright test` (14 passing, 1 skipped). No linter is configured.

## Relevant paths

`src/ui/state.js` (`app.eatingTarget`, `app.intakeTotals`, `addIntake`/`deleteIntake`, the `createApp` load),
`src/ui/views/body.js` (`mealsCard`, its bindings), `src/store/programme-schema.js` (`sanitizeIntake`,
`MAX_INTAKE`, `sanitizeSettings`), `src/store/backup.js`, `src/core/targets.js` (`maintenance`),
`test/ui/state.test.js`, `test/store/backup.test.js`, `test/store/schema.test.js`, `sw.js`,
`src/ui/updates.js`.

## Out of scope

The saved-meal integrity bug (`src/ui/views/body.js:240`, `src/core/foods.js:58-64`). Any change to how
maintenance itself is computed in `src/core/targets.js`.
