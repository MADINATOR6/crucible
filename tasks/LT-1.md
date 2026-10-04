# Task

## Mode and Owner
LT-1 · normal · risk medium (calculation correctness; no personal data) · Dispatch in worktree `.ccx-worktrees/codex-LT-1`, branch `codex/lt-1`, parallel with LT-0 and LT-7a. Codex implements; Claude reviews and commits. Its calculations are the contract for the UI, so the tests are the contract.

## Goal
Pure core logic for the lifting tracker: estimated 1RM, working-set normalisation, PR detection, Monday-to-Sunday week bucketing, weekly hard sets per muscle (with contributors), estimated session dates, main-lift running bests, and planned-versus-actual RPE. Read `lifting-tracker/ARCHITECTURE.md` ("Logged-workout model", "Calculation contracts"), `lifting-tracker/src/core/units.js` (committed; do not edit) and `lifting-tracker/data/exercises.json`.

## Write Allowlist
- `lifting-tracker/src/core/e1rm.js`, `sets.js`, `prs.js`, `weeks.js`, `muscles.js`, `schedule.js`, `lifts.js`, `rpe.js` (all new)
- `lifting-tracker/test/core/*.test.js` (new)
- No other files. No dependencies, no DOM, no storage, no `fs`/`Buffer` in `src/`.

## Constraints
- Plain JavaScript ES modules, Node 18+ compatible, browser compatible.
- All maths in kg via `units.js`. Dates are `'YYYY-MM-DD'` strings; do date arithmetic with `Date.UTC` so time zones never shift a date. No `Date.now()`/clock reads inside logic (inject if needed).
- Pure functions, no mutation of inputs, deterministic output order (sort explicitly).
- Invalid input returns `null` or is skipped as documented; never throw for bad set data, but throw `RangeError` for impossible API arguments (unknown unit, malformed date string).

## API and Resolved Rules

### e1rm.js
`estimate1RM(weightKg, reps)` -> number | null. Epley: `w * (1 + reps / 30)`; `reps === 1` returns `w` exactly; `reps` must be an integer 1..12; `weightKg` must be > 0 and finite; else `null`. `roundForDisplay(kg, unit)` -> number rounded to 1 decimal in the display unit (via `units.js`).

### sets.js
A **set event** is `{ date, exerciseId, weightKg, reps, rpe, isWarmup, order, source }` where `source` is `'logged'` or `'programme'`.
- `fromLoggedSet(loggedSet, session)` -> set event (`weightKg = toKg(weight)`, date from the session, `order` from the set).
- `fromProgrammeSets(programme, dateFor)` -> set events for **completed** planned sets only. `dateFor({blockNumber, weekNumber, dayNumber})` returns a date or null (null -> skip the set). A completed planned set uses `actualReps` if present; otherwise, if reps are a single number (`repsMin === repsMax`), it uses that; if reps are a range and `actualReps` is null the set has no determinable reps and is skipped; weight = `actualLoad` if present else `load`; skip sets with no weight; `rpe` = `actualRpe`; `isWarmup` false.
- `workingSets(events)` -> only events with `isWarmup === false`, `reps >= 1` integer, `weightKg > 0`, finite.
- `sortEvents(events)`: by `date`, then `order`, then input position (stable).

### prs.js
`detectPRs(events)` -> array of `{ date, exerciseId, type: 'e1rm'|'single'|'repsAtWeight', value, weightKg, reps, order, previousBest }` in chronological order. Per exercise and per type (use `workingSets` + `sortEvents`):
- First qualifying working set is the baseline and never a PR.
- A later set is a PR only if it **strictly** beats the best so far (e1RM values within 1e-9 of the best are a tie); ties are not PRs; a set can be a PR in several types at once (emit one record per type).
- `e1rm`: `estimate1RM` value (events with reps > 12 do not participate). `single`: only `reps === 1`, compared by weight. `repsAtWeight`: key = weight rounded to 0.01 kg; compared by reps within the same key; the first set at a new weight key is that key's baseline (no PR).
- Editing history: the function is a pure function of the whole event list, so recomputation after an edit or delete is just calling it again; the tests must show that deleting the old best moves the PR.

### weeks.js
`mondayOf('YYYY-MM-DD')` -> the Monday (Mon-Sun weeks). `addDays(date, n)`. `weekKey(date)` = `mondayOf(date)`. `daysBetween(a, b)`.

### muscles.js
`weeklyHardSets(events, catalogue, weekStart)` where `weekStart` is a Monday: counts only working sets dated in `[weekStart, weekStart + 6 days]` whose `exerciseId` is in the catalogue. Returns `{ weekStart, muscles: { <muscle>: { sets: number, contributors: [{ exerciseId, sets, contribution }] } } }` with all 17 catalogue muscles present (0 when untouched). Primary counts `catalogue.weights.primary` per set, secondary `catalogue.weights.secondary`. `contributors` sorted by `contribution` descending, then `exerciseId`. Unknown exercise ids are reported in a top-level `unknownExerciseIds: [...]`, not counted.

### schedule.js
`estimateDates({ startDate, weeks, dayWeekdays })` -> `Map` keyed `'<weekNumber>:<dayNumber>'` -> `'YYYY-MM-DD'`. `startDate` must be a Monday (else `RangeError`); `weeks` = array of week numbers (week n starts `startDate + 7*(n - 1)`); `dayWeekdays` maps day number -> ISO weekday 1 (Mon) .. 7 (Sun); default `{1:1, 2:2, 3:4, 4:5}`. Result date = week start + (weekday - 1) days. All dates are estimates; the UI labels them.

### lifts.js
`runningBests(events, catalogue, { basis = 'e1rm' })` -> array of `{ date, squat, bench, deadlift, total }` (kg or null), one row per date on which any **competition** main-lift working set (catalogue `lift` set and `competition: true`) occurred, carrying forward each lift's best-so-far; `total` is the sum only when all three are non-null, else null. Basis `'e1rm'` uses `estimate1RM` (reps 1..12); basis `'single'` uses heaviest 1-rep sets only. Rows sorted by date.

### rpe.js
`rpeDeltas(programme)` -> `{ perSet: [{ blockNumber, weekNumber, dayNumber, exerciseId, setIndex, target, actual, delta }], perExercise: { <exerciseId>: { sets, meanDelta } } }` for planned sets where both `targetRpe` and `actualRpe` are numbers and `targetRpe <= 10` and `actualRpe <= 10` (RPE 11 failure markers are excluded). `delta = actual - target`. `meanDelta` rounded to 2 decimals.

## Worked examples the tests must assert
- `estimate1RM(100, 5)` = 116.666… (assert `Math.abs(x - 350/3) < 1e-9`), displayed 116.7; `(140, 1)` = 140 exactly; `(100, 12)` = 140; `(100, 13)` null; `(100, 0)`, `(0, 5)`, `(-5, 5)`, `(100, 2.5)`, `(NaN, 3)` null.
- PRs: events (same exercise, 2026-01-05..): 100x5, 100x5 (tie), 102.5x5, 100x6, 120x1, 120x1, 122.5x1. e1RM values: 116.67, 116.67, 119.58, 120.00, 120, 120, 122.5. Expected `e1rm` PRs: 102.5x5 (119.58 > 116.67); 100x6 (120.00 > 119.58); 122.5x1 (122.5 > 120.00); the 120x1 single does NOT beat 120.00 (tie, not a PR), the second 120x1 is a tie; `single` baseline is the first 120x1 (no PR), the repeat is a tie, 122.5x1 is a PR; `repsAtWeight` at 100 kg: 100x5 baseline, tie (not a PR), 100x6 is a PR; 102.5 and 120 and 122.5 first-at-key = baselines. Write the expected arrays out by hand in the test, not by calling the implementation.
- Warm-up exclusion: a 140x1 warm-up never produces a PR or a bests row.
- Weeks: `mondayOf('2026-10-04')` (Sunday) = `'2026-09-28'`; `mondayOf('2026-10-05')` = `'2026-10-05'`; year boundary `mondayOf('2026-01-01')` = `'2025-12-29'`.
- Muscles: 3 working sets `low_bar_squat` + 2 working sets `hack_squat` in one week -> quads 5, glutes 4, adductors 2.5, hamstrings 1.5, lower_back 1.5, abs 1.5, all other muscles 0; quads contributors `[ {low_bar_squat, 3, 3}, {hack_squat, 2, 2} ]`; a set dated on the next Monday is excluded; a warm-up is excluded; unknown id reported.
- Schedule: `startDate '2026-10-05'`, weeks `[1,2]`, default weekdays: week 2 day 3 = `'2026-10-15'`; week 1 day 1 = `'2026-10-05'`; non-Monday start throws.
- `runningBests`: squat 150x1 on day 1, bench 100x1 on day 2, deadlift 180x1 on day 3 -> rows: day1 total null; day2 total null; day3 total 430; a later 155x1 squat raises squat and total to 435; a paused-bench (non-competition variant) 110x1 never changes `bench`.
- Programme conversion: planned set with reps range and no actual reps is skipped; with `actualReps 8` and `actualLoad 140 kg` becomes a 140 kg x 8 event; a not-completed set is skipped.
- Immutability test: deep-freeze inputs and run every function.

## Out of Scope
UI, storage, plates, import, scoring formulas (Wilks/DOTS/IPF GL), bodyweight trends.

## Done When
- [ ] Every function and example above has a passing test (Codex runs `node --test lifting-tracker/test/core`; reports command and output).
- [ ] Expected values in tests are hand-derived (Claude spot-checks the PR sequence and muscle totals).
- [ ] No file outside the allowlist changed (`git status`; Claude checks).
- [ ] `node --test lifting-tracker/test` from repo root passes (Claude re-runs after merging with the other lifting-tracker tasks).

## Verify
```
node --test lifting-tracker/test/core     # not yet run
```

## Stop Conditions
Report UNKNOWN / CHECKED / NEEDED instead of guessing if a rule is ambiguous. Two failed repairs on the same test: stop and report.
