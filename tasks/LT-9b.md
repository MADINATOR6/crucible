# Task

## Mode and Owner
LT-9b · complex · risk medium-high (it prescribes the loads and exercises an athlete will train with) · Dispatch in worktree `.ccx-worktrees/codex-LT-9b`, branch `codex/lt-9b`, parallel with LT-9a. Codex implements; Claude reviews, commits, and a Codex verifier attacks it afterwards.

## Goal
Implement `generateBlock` and `reviseBlock` exactly as specified in `lifting-tracker/GENERATOR.md` (sections "Generator", "Volume and warnings", "Rationale" and "reviseBlock"). Read that file first, then `lifting-tracker/src/core/rpe-chart.js`, `attempts.js` (`roundToStep`), `muscles.js`, `units.js` (committed; do not edit), `lifting-tracker/ARCHITECTURE.md` ("Programme model") and `lifting-tracker/data/exercises.json`. `buildAthleteModel` and `learnTemplate` are being written in parallel by LT-9a; **do not import them**: your tests build `AthleteModel` and `Template` fixtures by hand in the shapes GENERATOR.md defines.

## Write Allowlist
- `lifting-tracker/src/core/generator.js` (new)
- `lifting-tracker/test/core/generator.test.js` (new)
- No other files. Plain ES modules, no dependencies, no DOM, no storage, no `Date.now()` (take `now`), no `Math.random()` (use the seeded hash), Node 18+.

## Constraints
- Pure and deterministic: same inputs and seed -> deep-equal output (apart from `generated.at` which comes from `now`). Inputs are never mutated (tests deep-freeze them). Return fresh objects.
- Impossible arguments throw `RangeError` (missing `catalogue`/`template`/`athlete`, `weeks` not an integer, unknown `focus`/`progression`/`deloadWeek`, `daysPerWeek` not an integer from 1 to 7, `rotate` outside 0..1). Unknown exercise ids in a template slot are kept as accessories with their own name.
- The rules in GENERATOR.md ("Dropping days") apply to any smaller count; larger than the template adds a warning and keeps the template's days.
- Follow the formulas literally, including rounding to 2.5 kg with `roundToStep` and the chart via `pctSmooth`. Where GENERATOR.md leaves a choice, take the simplest reading and report it as UNKNOWN / CHECKED / NEEDED.
- Output blocks must satisfy the Programme model so the existing app views can render them: every week has `days[].entries[].sets[]` with all planned-set fields (`index` 1-based, `repsMin/repsMax/repsRaw`, `targetRpe`, `load`, `loadRange: null`, `actualRpe/actualReps/actualLoad: null`, `coachComment/athleteComment: null`, `completed: false`, `source`, `warnings: []`) plus `gen`.
- Export: `generateBlock`, `reviseBlock`, `fnv1a` (the hash, for tests), `projectedE1rm(athleteE1rm, progression, focus, week)` (the `E(f, w)` helper).

## Worked examples the tests must assert (hand-derived; write them out in the test, not by calling the code)
Fixture A: catalogue = the committed `exercises.json`; athlete e1RMs squat 180, bench 130, deadlift 220, all `confidence: 'high'`, `rpeBias` all 0, `exercises: {}`; template with one day and one main slot: `low_bar_squat`, scheme `top-backoff`, `sets: 3`, `reps: 3`, `rpe: 7`, `k: 1`, plus (second test) a second day slot `low_bar_squat` straight 2 x 4 @ 7 `k: 1`. Options: 5 weeks, focus strength, progression standard (g = 0.004), `deloadWeek: 'none'`.
1. Primary squat slot, week 1: RPE 7, `pctSmooth(3, 7) = 0.837`, E = 180 -> 150.66 -> top 150; back-offs 150.66 x 0.97 = 146.14 -> 145 and 150.66 x 0.94 = 141.62 -> 142.5.
2. Week 2: RPE 7.5 (pct 0.85), E = 180.72 -> 153.61 -> 152.5; back-offs 149.0 -> 150 and 144.4 -> 145.
3. Week 3: RPE 8 (0.863), E = 181.4429 -> 156.59 -> 157.5. Weeks 4 and 5: RPE stays 8 (r0 + 1 cap), E = 182.1687 and 182.897 -> both 157.5.
4. Labels: week 1 `Week 1 - 180/130/220 [530kg]`; week 2 `Week 2 - 180/130/220 [530kg]` (E(squat, 2) = 180.72 -> 180, bench 130.52 -> 130, deadlift 220.88 -> 220); week 3 `Week 3 - 182.5/130/222.5 [535kg]`. `week.target` holds the same numbers.
5. Secondary squat slot (the 2 x 4 @ 7 one): the primary slot is the one with the lowest reps (3 < 4); the 4-rep slot holds all 5 weeks at 180 x pctSmooth(4, 7) = 180 x 0.811 = 145.98 -> 145 (`kind: 'straight'`).
6. Deload: with `weeks: 6`, `deloadWeek: 'last'`: week 6 of the 3-set slot has `max(1, round(3 x 0.6)) = 2` sets, `rpe = max(6, 8 - 1) = 7`, label `Week 6 - Deload`, uses E(squat, 5) (no extra drift), and the 3-set top/back-off becomes top + 1 back-off.
7. Bias: bench slot `comp_bench` top-backoff 3 sets x 4 reps @ 8 (`k: 1`), bench e1RM 130: with `rpeBias.bench = -0.5` the chart RPE is 8.5 (pctSmooth(4, 8.5) = 0.85 -> 110.5 -> 110); with bias 0: pctSmooth(4, 8) = 0.837 -> 108.81 -> 110; with bias +0.5: RPE 7.5 -> 0.824 -> 107.12 -> 107.5. Assert 110 / 110 / 107.5 at week 1.
8. `k` and variations: `paused_bench` variation straight 3 x 5 @ 8 with `k: 0.95`, bench 130: 130 x pctSmooth(5, 8) x 0.95 = 130 x 0.811 x 0.95 = 100.16 -> 100 in week 1.
9. Missing e1RM: athlete bench `e1rmKg: null` -> every bench-family load is `null`, a warning names bench, accessories keep loads, no throw. The label omits the `- ...` part when no family has an e1RM; otherwise a missing lift is shown as `-` (for example `Week 1 - 180/-/220 [400kg]`) and the total adds only the known lifts.
10. Accessories: `seated_hamstring_curl` slot 2 x [6, 10] @ 11 with `loadKg: 60`, athlete `exercises.seated_hamstring_curl.lastWeightKg = 65` -> 65 every week (rotate 0), `repsMin 6, repsMax 10, repsRaw '6-10'`, `targetRpe 11`, cue about the top of the range present; with no athlete history -> 60; with neither -> `load: null` plus the cue `Find a load that reaches the target effort inside the rep range.`
11. Rotation (`rotate: 1`, accessories: `seated_leg_extension` (pattern quad-isolation, only member), `seated_hamstring_curl` (hamstring-curl, alternative `lying_leg_curl`), `cable_tricep_pushdown` (triceps; alternatives `overhead_cable_tricep_extension`, `skullcrusher`)): `seated_leg_extension` stays (no alternative); hamstring curl becomes `lying_leg_curl`; tricep slot becomes a triceps-pattern alternative not already in the block; an alternative the athlete has done recently (present in `athlete.exercises`) is chosen only when no never-done one exists; rotation is deterministic for a seed and changes for another seed only in which slots are rotated. `fnv1a('')` = 0x811c9dc5 = 2166136261 and `fnv1a('a')` = 0xe40c292c = 3826002220: assert these.
12. Drop a day: template with 4 days (D1: main squat + variation + 2 accessories; D2: main bench + variation + accessory; D3: main deadlift + variation + 2 accessories; D4: main bench single + accessory) and `daysPerWeek: 3`: scores 3+2+2=7, 3+2+1=6, 7, 3+1=4 -> remove D4; its accessory pattern absent elsewhere is moved to the day with the fewest slots (D2); days renumbered 1..3; rationale mentions both. `daysPerWeek: 5` with a 4-day template keeps 4 days and warns.
13. Stance: `deadliftStance: 'sumo'` swaps `conventional_deadlift` -> `sumo_deadlift`; `'conventional'` swaps `sumo_deadlift` back; `tempo_to_knee_deadlift` <-> `tempo_to_knee_sumo_deadlift`; `cluster_sumo_deadlift` is left; `null` leaves everything.
14. Focus `volume`: main/variation straight and top-backoff slots gain one set in weeks 2..n-1, never above 6; focus `peak` final non-deload week: singles at RPE 9, variations/accessories lose one set (min 1).
15. Volume: for fixture A plus a `seated_leg_extension` 2-set accessory, week-1 quads = squat 3 sets x 1 + extension 2 x 1 = 5, glutes 3, adductors 1.5 (3 x 0.5) ...; `volume.perWeek.length === weeks`, and a muscle changing by more than 25% versus the template's week produces the stated warning text.
16. reviseBlock: generate 5 weeks, mark every set of week 1 `completed: true`, call `reviseBlock` with `fromWeek: 2` and a new squat e1RM of 190: week 2 primary top load = 190 x 0.85 -> 161.5 -> 162.5 (E at fromWeek has no drift); week 3 = 190 x 1.004 x 0.863 = 164.6 -> 165; week 1 sets and accessories unchanged; `changes` lists each altered set with `from`, `to`; the input block is not mutated. A family with `e1rmKg: null` leaves loads unchanged.
17. Determinism and immutability; `generated` metadata holds the options, `fromBlock`, `athleteAsOf`, `e1rmStart`, `confidence`; every set has `gen`; no set is `completed`.
18. Validation: each bad argument throws `RangeError` with a useful message.

19. **Maintenance** (fixture A, `focus: 'maintenance'`, `weeks: 4`, defaults otherwise): g = 0 so E stays 180 in every week and every label is `Week w - 180/130/220 [530kg]`. The 3 x 3 @ 7 primary slot becomes 2 sets x 3 reps (`max(2, round(3 x 0.67))`), RPE 7.5 flat: `pctSmooth(3, 7.5) = 0.85`, 180 x 0.85 = 153.0 -> 152.5 top; back-off 153.0 x 0.97 = 148.41 -> 147.5. Weeks 1-3 identical. Week 4 check-in: top set 1 rep @ RPE 8: 180 x 0.922 = 165.96 -> 165, `kind: 'top'`, `reps: 1`; back-off unchanged (3 reps, 147.5). With `checkIn: false` week 4 equals week 3. With `weeks: 2` there is no check-in. Reductions: a template slot list of main squat (primary), main squat (secondary), main squat (third), two `paused_bench`-style variations of one family, and 5 accessories on one day yields: primary + first secondary only; one variation with `max(2, round(sets x 0.5))` sets; at most 3 accessories on that day (first of each distinct pattern first), each with `max(1, sets - 1)` sets and rpe 11 -> 9, 9 -> 8. Default `daysPerWeek` is 3 (a 4-day template drops one day by the normal rule), default `rotate` 0.5, `deloadWeek` 'none'. No "volume changes" / "under 6 sets" warnings are produced; the rationale contains a sentence stating the intent and the reduction.
20. **Return** (fixture A, `focus: 'return'`, `layoffWeeks: 6`, `weeks: 4`): s = max(0.8, 1 - 0.06) = 0.94; E(squat, w) = 180 x (0.94, 0.96, 0.98, 1.0) = 169.2, 172.8, 176.4, 180; RPE = min(8, max(6, 7 - 1) + 0.5 x (w - 1)) = 6, 6.5, 7, 7.5. Week 1: sets reduced 3 -> 2; top 3 reps @ 6: `pctSmooth(3, 6) = 0.811`, 169.2 x 0.811 = 137.22 -> 137.5; back-off 137.22 x 0.97 = 133.10 -> 132.5. Week 2 also has 2 sets; week 3 has 3 sets: RPE 7 (0.837), 176.4 x 0.837 = 147.65 -> 147.5. `layoffWeeks: 30` -> s = max(0.8, 0.7) = 0.8. `layoffWeeks` outside 1..52 or not an integer -> `RangeError`.
21. **Specialise**: `focus: 'specialise'` without `emphasis` -> `RangeError`; with `emphasis: 'bench'`, `weeks: 5`: bench main and variation slots gain one set in weeks 2..4 (never above 6), squat/deadlift variation slots lose one set (min 1) in every week; rationale names bench.
22. `emphasis` given with another focus is ignored; invalid `emphasis` or `checkIn` types throw `RangeError`.
## Done When
- [ ] Every example above has a passing test (Codex runs `cd lifting-tracker && node --test test/core/generator.test.js` and reports the output).
- [ ] Output of `generateBlock` for fixture A passes a structural check: every week has days with entries and sets of the full planned-set shape.
- [ ] No file outside the allowlist changed.
- [ ] Claude spot-checks examples 1, 7 and 16, re-runs the suite, reviews the diff, and a Codex verifier run attacks the result.

## Verify
```
cd lifting-tracker && node --test test/core/generator.test.js    # not yet run
```

## Stop Conditions
Report UNKNOWN / CHECKED / NEEDED rather than guessing. If an example above is arithmetically wrong, say so with your corrected hand calculation and use the corrected value (flag it). Two failed repairs on one test: stop.
