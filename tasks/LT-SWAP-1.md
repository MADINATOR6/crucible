# Task: session swaps (LT-SWAP-1)

Mode: Dispatch, normal risk. Owner: Claude (implements). Plan written by Claude: this ran in a cloud session, where the Codex launcher and ccx (PowerShell, Windows) are not available, so there is no Codex plan or Codex review yet.

## Goal

Flexible sessions in `lifting-tracker/` (README "Further product work": flexible session scheduling/substitutions):

1. Swap a planned exercise for a similar one, for one planned session or every time it is planned.
2. Skip a session (or the rest of one) so the next session moves on, with un-skip.
3. Train a week's days in any order: a never-started day earlier in the current week stays owed.

## Write allowlist

`lifting-tracker/src/core/swaps.js` (new), `src/core/session.js`, `src/store/programme-schema.js`, `src/ui/state.js`, `src/ui/views/train.js`, `src/ui/views/muscles.js`, `src/ui/updates.js`, `styles/app.css`, `sw.js`, `test/core/swaps.test.js` (new), `test/core/session.test.js`, `test/ui/swaps.test.js` (new), `e2e/smoke.spec.js`, `README.md`, `ARCHITECTURE.md`, and this file.

Out of scope: storage schema version, backup format, generator and coach formulas, any network use.

## Done When

- [x] A substituted set ticks off the planned set and counts only for the substitute (events, PRs, muscles); the merged programme carries no numbers for the planned lift.
- [x] The planned weight is never logged under a substitute (one-tap tick opens the form; `logAsPlanned` refuses).
- [x] Swaps and skips survive a reload and a backup round trip, are sanitised, and never follow a replaced block or cross from example data to an imported programme.
- [x] `nextSession` returns a postponed day, passes over skipped days, and keeps older gaps as history; existing session tests unchanged and passing.
- [x] `sw.js` `VERSION` and `APP_VERSION` bumped together (lt-v27, after merging main at lt-v26); the new module is precached.
- [x] `node --test` green; browser smoke tests green on desktop Chrome and the Pixel 5 viewport, including a new swap and skip flow.
- [x] After main's LT-BLOCK-1 (Progress reads the merged programme): a swapped set is an event for the substitute in `fromProgrammeSets`, never the planned load for the planned lift (`src/core/sets.js`, added to the allowlist).
- [ ] Codex review of the diff (`-Role verify`), recorded with `ccx task review -By codex`. Not possible from the cloud session.
- [ ] Physical-phone check (README, Samsung workout check) after publishing.

## Verify

```
cd lifting-tracker && node --test
cd lifting-tracker && npx playwright test
```

## Stop conditions

Any change that would alter stored sets or sessions, the backup schema, or a training or nutrition formula.
