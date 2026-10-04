# Task

## Mode and Owner
LT-9a · normal · risk medium (these numbers drive loads an athlete will lift) · Dispatch in worktree `.ccx-worktrees/codex-LT-9a`, branch `codex/lt-9a`, parallel with LT-9b. Codex implements; Claude reviews and commits.

## Goal
Implement the athlete model and the template learner exactly as written in `lifting-tracker/GENERATOR.md` (sections "AthleteModel" and "Template"). Read that file first, then `lifting-tracker/src/core/rpe-chart.js`, `sets.js`, `units.js`, `weeks.js` (committed; do not edit) and `lifting-tracker/data/exercises.json` (the catalogue; fields `lift`, `competition`, `variantOf`, `pattern`).

## Write Allowlist
- `lifting-tracker/src/core/athlete.js` (new): `buildAthleteModel`
- `lifting-tracker/src/core/template.js` (new): `learnTemplate`
- `lifting-tracker/test/core/athlete.test.js`, `lifting-tracker/test/core/template.test.js` (new)
- No other files. Plain ES modules, no dependencies, no DOM, no storage, no clock (use `asOf`), Node 18+.

## Constraints
- Pure, deterministic, inputs never mutated (tests deep-freeze inputs). Bad rows (null events, non-finite numbers, unknown units) are skipped, never thrown on. Impossible arguments (`catalogue` missing, bad `asOf` string) throw `RangeError`.
- Dates are `'YYYY-MM-DD'`; do date arithmetic with `weeks.js` helpers (`addDays`, `daysBetween`).
- Follow the rules in GENERATOR.md literally. Where they leave a choice, take the simplest reading and state it in your report (UNKNOWN / CHECKED / NEEDED).
- Programme model fields come from `ARCHITECTURE.md`. A planned set's weight is `set.actualLoad ?? set.load` (`{ value, unit }`, unit kg or lb: convert with `units.js`).

## Worked examples the tests must assert (write expected values by hand)
Catalogue from the committed `exercises.json` (read it in the test).
1. **Chart-based e1RM.** Events: squat `low_bar_squat` on `asOf` minus 10 days: 160 kg x 5 @ RPE 8 -> e1RM = 160 / 0.811 = 197.28...; 165 x 3 @ 7 -> 165 / 0.837 = 197.13...; 150 x 5 @ 7 -> 150 / 0.786 = 190.84... (3 sources). Working e1RM = mean of all three (fewer than 3 is not the case: exactly 3, so the top 3 are all) = (197.2800 + 197.1326 + 190.8397) / 3, capped at 1.04 x median (median 197.1326 -> cap 205.01, not binding) -> round to 0.1 kg = 195.1; `n: 3`, `confidence: 'medium'`. Compute the three e1RMs with full precision in the test and compare to the hand total with a tolerance of 0.05 kg.
2. **No RPE, no source.** A 140 x 5 set with `rpe: null`, and a set with `rpe: 11`, produce no source: squat `e1rmKg: null`, `confidence: 'none'` when they are the only sets.
3. **Variants only when competition sources are scarce.** One competition source (e1RM 200) plus two `high_bar_squat` sources (e1RM 210 and 205): the variants count x 0.95 (199.5, 194.75), so `n: 3`, mean = (200 + 199.5 + 194.75) / 3 = 198.08 -> 198.1, `confidence: 'medium'`. With three competition sources present, variants are ignored (assert n stays 3 and sources contain no `high_bar_squat`).
4. **Cap.** Sources with e1RMs 200, 200, 200, 260, 260, 260 (six): top 3 mean = 260, median = 230, cap = 1.04 x 230 = 239.2, so working e1RM = 239.2. (Build them with load/reps/RPE whose chart e1RMs are exactly these, for example weight = e1RM x pct.)
5. **Window.** A source 60 days old is outside the 8-week window but inside 2 x window: it is used, with confidence one step lower than its count says. A source 200 days old is never used.
6. **Stance.** 12 sumo sets vs 3 conventional sets in the window -> `'sumo'`; equal counts -> `null`.
7. **rpeBias.** With a programme whose completed squat sets have `actualRpe - targetRpe` of +0.5 for 10 sets: bias 0.5; for 7 sets: 0 (fewer than 8); values below -1 clamp to -1.
8. **exercises.** Two sets of `comp_bench` on the same newest date (100 x 5 and 105 x 3): `lastWeightKg` and reps come from the higher-e1RM one (Epley 100 x 5 = 116.67, 105 x 3 = 115.5 -> 100 x 5).

Template examples (build a small Programme by hand with 2 blocks, block 2 having 3 weeks with completed sets):
9. Block choice: the highest-numbered block with at least 2 weeks having a completed set; a block with only one completed week is skipped when an earlier block qualifies; `blockNumber` forces a block.
10. Representative week = second week; slots in order; `slotId` like `d1s1`.
11. Roles and schemes: `low_bar_squat` with sets of 160, 155, 150 kg (3 x 3 @ 7) -> `main`, `family: 'squat'`, scheme `top-backoff`, `sets: 3`, `reps: 3`, `rpe: 7`, `loadKg: 160`; `comp_bench` single set reps 1 -> `singles`; `paused_bench` with 4 equal sets -> `variation`, `straight`; `seated_leg_extension` -> `accessory` with reps `[6, 10]`, `rpe: 11`.
12. `k`: `low_bar_squat` 3 x 3 @ 7 at 160 kg with `referenceE1rm.squat = 200`: `pctSmooth(3, 7) = 0.837`, `k = 160 / (200 * 0.837) = 0.9558...`. Rpe null with load 100 on a 1-rep bench slot, reference 130: pct(1, 7) = 0.892, `k = 100 / (130 * 0.892) = 0.8624...`. `k` clamps: a load that gives 1.3 -> 1.05; 0.3 -> 0.5. Missing reference -> `null`.
13. lb loads convert exactly (225 lb = 102.0582 kg) into `loadKg`.
14. Cues: entry cues plus up to 3 distinct coach comments (cut to 160 chars). Unknown exercise id -> accessory with `family: null`.
15. No usable block (empty programme, blocks without weeks) -> `null`.

## Done When
- [ ] Every example above has a passing test with hand-derived expectations (Codex runs `cd lifting-tracker && node --test test/core/athlete.test.js test/core/template.test.js`).
- [ ] Immutability test with deep-frozen inputs for both functions.
- [ ] No file outside the allowlist changed.
- [ ] Claude re-runs the suite and spot-checks examples 1, 3 and 12 by hand.

## Verify
```
cd lifting-tracker && node --test test/core/athlete.test.js test/core/template.test.js    # not yet run
```

## Stop Conditions
Report UNKNOWN / CHECKED / NEEDED rather than guessing. If an example above is arithmetically wrong, say so with your corrected hand calculation and use the corrected value (flag it). Two failed repairs on one test: stop.
