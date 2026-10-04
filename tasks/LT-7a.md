# Task

## Mode and Owner
LT-7a · normal · risk medium (loading arithmetic; wrong plates in a gym are a safety issue, so exactness matters) · Dispatch in worktree `.ccx-worktrees/codex-LT-7a`, branch `codex/lt-7a`, parallel with LT-0 and LT-1. Codex implements; Claude reviews and commits.

## Goal
Pure plate-loading logic for the barbell simulator: given a target weight, a bar, collars and the plates the gym owns, work out exactly what to load each side, or the nearest loadable weights above and below; format per-side text; build plate-friendly warm-up ladders. Read `lifting-tracker/data/plates.json` (shapes and defaults) and `lifting-tracker/src/core/units.js` (committed; do not edit).

## Write Allowlist
- `lifting-tracker/src/plates/loading.js` (new)
- `lifting-tracker/test/plates/*.test.js` (new)
- No other files. Plain ES modules, no dependencies, no DOM, no `fs`.

## Constraints
- A weight is `{ value, unit }`. Do the arithmetic in the **target's unit** (convert bar, collars and plates into it with `units.js`), so a lb target with lb plates is exact. Treat two weights within **0.005 of that unit** as equal. Never merge units silently: when the bar or any plate used is in a different unit from the target, the result carries `mixedUnits: true`.
- A 45 lb bar is 20.411… kg, never 20 kg; a 45 lb plate is never a 20 kg plate. Do not substitute.
- Plate `count` is the total number of that plate the gym owns (both sides). Available per side = `floor(count / 2)`.
- Collars: `collar = { weight, perSide }` (default from data: 2.5 kg, one per side, i.e. 5 kg total in kg; 0 in lb). `collars: false` (or omitted collar) means none. The loaded total is `bar + collars + 2 * plates-per-side`.
- Pure, deterministic, no mutation. Invalid arguments (non-finite target, negative bar, no plates array) throw `RangeError`. A target below the bar+collars total is not loadable: return `loadable: false` with `reason: 'below-bar'` and nearest above (bar only).
- Search must be exact, not greedy: unbounded greedy fails on limited counts (e.g. only 1 x 15 kg pair and a target needing 2 x 10 + 1 x 5 per side... ensure the DP covers it). Use a bounded DP/search over per-side sums rounded to 0.01 of the unit, plates sorted heaviest first; at most 12 distinct plate sizes; per-side cap = largest sum reachable. Tie-break: fewest plates, then the combination using heavier plates (lexicographic by descending plate size).

## API
```js
loadBar({ target, bar, collar, plates })
// -> { target, loadable, exact, reason, mixedUnits,
//      perSide: [{ plate, count }]            // heaviest first, for the chosen loadable weight
//      loadedTotal: {value, unit},            // bar + collars + 2*perSide
//      difference: number,                    // loadedTotal - target, in target unit (0 when exact)
//      below: { loadedTotal, perSide } | null, above: { loadedTotal, perSide } | null }
perSideText(perSide, unit)       // "2 × 25, 1 × 10, 1 × 2.5 each side"; empty -> "Bar only"
warmupLadder({ top, bar, collar, plates, scheme })
// scheme default: [{ pct: 0, reps: 10, label: 'Bar' }, { pct: 0.4, reps: 5 }, { pct: 0.6, reps: 3 }, { pct: 0.75, reps: 2 }, { pct: 0.9, reps: 1 }]
// -> [{ weight: {value, unit}, reps, perSide, text, pct, requested }] strictly increasing, all < top
```
- `loadBar` when exact: `exact: true`, `below`/`above` equal the exact loading (or null). When not exact: `perSide` is whichever of below/above is nearer to the target (below wins ties), `exact: false`, `difference` signed, and both `below`/`above` are set when they exist.
- `warmupLadder`: each step is `pct * top`, snapped to the nearest loadable weight (ties go down); a `pct: 0` step is the bar plus collars only (no plates); drop any step that snaps to the previous step's weight or to >= top; steps must be strictly increasing. If the top itself is below the bar, return `[]`.

## Worked examples the tests must assert (write the expected values by hand)
Defaults: kg set with plates from `data/plates.json` (counts as given), 20 kg bar, collar 2.5 kg per side.
- Target 100 kg: (100 - 20 - 5) / 2 = 37.5 per side -> 25 + 10 + 2.5 = 37.5; the fewest-plates solutions are `25, 10, 2.5` and `20, 15, 2.5` (3 plates each): tie -> heavier plates first -> `25, 10, 2.5`. Expected text `1 × 25, 1 × 10, 1 × 2.5 each side`; loaded total 100; exact.
- Same target without collars (`collar: null`): (100 - 20) / 2 = 40 per side -> `1 × 25, 1 × 15` (2 plates; beats `2 × 20`: 2 plates too, tie -> heavier first, so `25, 15`). Exact.
- Target 20 kg with collars: below-bar (25 total) -> `loadable: false`, `reason: 'below-bar'`, `above` = bar only (25 kg total).
- Target 21 kg, collars on: not loadable below bar+collars (25); nearest above = bar+collars only; difference 4.
- Unreachable: plates only 25 x 2 (one pair), no collars, bar 20, target 80 -> per side 30 -> reachable per-side sums are 0 and 25 -> below = bar 20 + 2 × 25 = 70 kg; above none -> `above: null`; `perSide` = below; difference -10.
- Limited count: plates 20 x 2 (one pair) and 10 x 4 (two pairs), no collars, bar 20, target 120 -> per side 50 -> `1 × 20, 3 × 10` impossible (only 2 x 10 per side) -> best = `20 + 10 + 10 = 40` per side = 100 total (below) and above = none; assert that the algorithm does not return 3 x 10.
- Fractional: 1.25 plates, target 102.5 with no collars: (102.5 - 20) / 2 = 41.25 per side -> `1 × 25, 1 × 15, 1 × 1.25` exact.
- lb: bar 45 lb, plates 45/35/25/10/5/2.5 lb (counts large), no collar, target 225 lb: (225 - 45) / 2 = 90 per side -> `2 × 45` exact; target 135 lb -> `1 × 45` per side; target 140 lb -> 47.5 per side -> `1 × 45, 1 × 2.5` exact. Result unit lb, `mixedUnits` false.
- Mixed: lb target with the kg bar -> `mixedUnits: true`, and a 45 lb target against a 20 kg bar (no collars, kg plates incl. 0.25 kg) is not "bar only": the bar is 44.0925 lb, so `below.loadedTotal` ≈ 44.0925 lb, `above.loadedTotal` = 20.5 kg ≈ 45.1948 lb (tolerance 1e-3), the nearer is above, so `perSide` is the 0.25 kg pair and `difference` ≈ +0.1948 lb.
- Round trip: for every target from 25 to 300 kg in 2.5 kg steps with default collars and the default plate counts, `loadedTotal` equals `2 * sum(perSide) + bar + collars` and, when `exact`, equals the target within 0.005.
- `perSideText([], 'kg')` = `Bar only`; `perSideText` formats 1.25 as `1.25` and 25 as `25`, never `25.0`.
- Warm-up: top 140 kg, default scheme, collars on, bar 20 kg, plates restricted to 25, 20, 15, 10, 5, 2.5, 1.25 (large counts): the bar step is 25 kg total (bar + collars); 0.4 × 140 = 56 -> per side (56 - 25) / 2 = 15.5, between loadable 15 and 16.25 (15 + 1.25); 15.5 is 0.5 from 15 and 0.75 from 16.25, so it snaps to 15 per side = 55 kg total. Steps strictly increase and stay < 140; add a case where two steps would snap to the same weight and assert the duplicate is dropped.
- Immutability: inputs deep-frozen; function returns fresh objects.

## Out of Scope
Drawing, UI, tapping to add plates (the UI computes totals by calling `loadBar` and a small helper you do not need to write), federation rules, plate colours (data only).

## Done When
- [ ] Every example above has a passing test with hand-derived expected values (Codex runs `node --test test/plates/loading.test.js` from the `lifting-tracker` folder and reports the output).
- [ ] The exhaustive round-trip test over targets passes.
- [ ] No file outside the allowlist changed.
- [ ] Claude spot-checks three expected values by hand and re-runs the suite.

## Verify
```
cd lifting-tracker && node --test test/plates/loading.test.js   # verified 2026-10-04: 23 pass. (`node --test <directory>` fails MODULE_NOT_FOUND on Node 24.)
```

## Stop Conditions
UNKNOWN / CHECKED / NEEDED instead of guessing. If an example above is arithmetically wrong, say so with your corrected hand calculation and use the corrected value (flag it in the report); do not bend the code to a wrong expected value. Two failed repairs on one test: stop.
