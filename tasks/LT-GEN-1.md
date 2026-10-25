# LT-GEN-1: the block generator speaks powerlifting

## Mode and owner
LT-GEN-1 · complex · risk medium (training-programming logic) · Dispatch in its own worktree. Codex implements; Claude reviews, tests real requests, styles and owns all Git. Synthetic data only: never read the athlete's workbook or anything under `lifting-tracker/private/`.

## Goal
On Plan, the athlete types requests the way a lifter or coach talks and gets that block. The acceptance example: **"top single block 4 days a week"** produces a strength block on 4 days where each competition lift's main exposure is a top single at RPE 8 (rising week to week) followed by back-off sets, with the understood list and summary saying so. Everything the text sets is also settable in Plan's Settings, and the block's "Why it looks like this" explains each choice.

## Relevant files
- `lifting-tracker/src/core/request.js` (`interpretRequest`: patterns, negation guards, `settle`, `buildSummary`, the fixed `ORDER`), `test/core/request.test.js`.
- `lifting-tracker/src/core/generator.js` (`resolve`, `liftSets`, `accessoryEntry`, `dropDays`, `blockRationale`, `generateBlock`), `test/core/generator.test.js`. Main-lift slots have `role` (`main`, `variation`, `accessory`), `primary` (the heavier exposure of a family), `family`, `scheme` (`straight`, `top-backoff`, `singles`, learned in `src/core/template.js`), `reps`, `rpe`, `sets`, `k`.
- `lifting-tracker/src/ui/views/plan.js` (request box, `understood` list, Settings fold, the options passed to `generateBlock`), `test/ui/plan-flow.test.js`.
- `lifting-tracker/GENERATOR.md` (the generator's documentation), `README.md` (Plan section), `UI-CLASSES.md` (contract; no CSS changes).

## Write allowlist
`lifting-tracker/src/core/request.js`, `src/core/generator.js`, `src/ui/views/plan.js`, `test/core/request.test.js`, `test/core/generator.test.js`, `test/ui/plan-flow.test.js`, `GENERATOR.md`, `README.md`. Nothing else (no CSS, no `sw.js`, no new modules).

## Resolved rules

### A. New options (generator)
All optional; when absent the generator behaves exactly as today (every existing test passes unchanged).
1. `style`: `'auto'` (default: the template's scheme, as now), `'top-single'`, `'top-set'`, `'sets-across'`, `'singles'`, `'heavy-light'`. Applies to competition-lift `main` slots only.
   - **top-single**: the primary exposure of each family is 1 × 1 at RPE 8 in weeks 1–2, 8.5 in weeks 3–4, 9 from week 5 (peak focus: 9 in the final full week), then back-off sets (rule 2). A family's other (secondary) exposures become sets across of 4 × 4 at RPE 7.
   - **top-set**: as top-single but the top set has `topReps` reps (default 3; 1–6 allowed) at RPE 8 → 8.5 → 9 on the same week steps.
   - **sets-across**: every main exposure is `sets` × `reps` at one load (defaults 4 × 5; primary at RPE 7.5 rising 0.5 every two weeks to at most 8.5, secondary at RPE 7).
   - **singles**: the existing `singles` scheme for primary exposures (default 5 singles), secondaries as sets across 3 × 4 at RPE 7.
   - **heavy-light**: primary exposure = top set of 2 at RPE 8 → 9 plus back-offs; secondary = 4 × 6 at RPE 6.5. If a family has only one exposure a week, say so in the rationale and treat it as top-set.
   Loads come from the existing maths (`unrounded` with the RPE chart, the athlete's e1RM, bias, ceiling and `settle`), so nothing is planned above an all-out set.
2. `backoff`: `{ sets, reps, drop }` for top-single, top-set and heavy-light. Defaults: top-single 3 × 3 at `drop` 0.10; top-set 3 × `topReps` at 0.08; heavy-light 3 × 3 at 0.10. Back-off load = top-set load × (1 − drop), rounded with `settle`; `sets` 1–6, `reps` 1–10, `drop` 0.03–0.30. Back-off sets carry `gen.kind = 'backoff'` and a target RPE estimated from the chart for that load (rounded to 0.5, never above the top set's).
3. `rpeCap` (a number 6–10 or null): no competition-lift or variation set is planned above it (loads recomputed at the capped RPE). Accessories keep their targets. Rationale line names the cap.
4. `accessories`: `'normal'` (default), `'more'` (+1 set each, at most 5), `'minimal'` (at most 2 accessory exercises a day, the ones that hit the most-needed muscles, sets −1, at least 1), `'none'` (no accessories).
5. `variations`: `'keep'` (default) or `'competition-only'` (variation slots are dropped; the family's primary main exposure gets one extra back-off set, at most 6).
6. More days than the template: when `daysPerWeek` exceeds the template's days, add days instead of warning. Each added day holds a light exposure of the competition lifts with the fewest weekly exposures (bench first on ties, then squat, then deadlift; two lifts a day, 3 × 4 at RPE 6.5, sets across) plus up to two accessories from the template that aren't already on that day. Rationale: "Added day N: light bench and squat, because you asked for D days and your last block had T."
7. Block name: when `name` is not given and `style` isn't `auto`, the name says it ("Top single block", "Top set block", "Sets across block", "Singles block", "Heavy and light block").
8. `blockRationale` gets one plain line per non-default option (style with its numbers, back-offs, cap, accessories, variations, added days), e.g. "Top single: work up to one heavy single at RPE 8 (rising to 9 by week 5), then 3 back-off sets of 3 about 10% lighter." Determinism holds: same inputs and seed, same block.

### B. Request vocabulary (`interpretRequest`)
9. New keys, added to `ORDER` after `daysPerWeek`: `style`, `topReps`, `backoff`, `rpeCap`, `accessories`, `variations`. Each `understood` entry keeps `because` quoting the words. Negation guards apply as for the existing keys ("no top singles" sets nothing and says so in `unclear`).
10. Phrases (normalised text; plural and spelling variants such as back-off / backoff / back off, single / singles):
   - top-single: "top single(s)", "heavy single(s)", "daily single", "work up to a single", "single at/@ rpe N" (also sets the starting RPE when N is 7–9.5: store it as `topRpe` and let the generator use it for week 1, rising 0.5 per two weeks, capped at 9.5).
   - top-set: "top set(s)", "top triple" (topReps 3), "top double" (2), "top set of N" / "top N" with N 2–6.
   - sets-across: "sets across", "straight sets", "N x M" / "NxM" / "N sets of M" (sets N 2–10, reps M 1–12; keep them as `sets`/`reps` on the option, e.g. `style: 'sets-across'` plus `setsAcross: { sets, reps }`), "volume sets of M".
   - singles: "singles" / "EMOM singles" / "cluster singles" when not preceded by "top" or "heavy".
   - heavy-light: "heavy (and|/) light", "heavy light", "dup", "daily undulating", "undulating".
   - backoff: "N back-off sets", "back-offs of M", "back-off sets of M", "back-offs at P%" (drop = 1 − P/100 when P is 60–97) or "P% back-offs", "drop P%" / "minus P%" (drop = P/100 when P is 3–30).
   - rpeCap: "cap (at) rpe N", "rpe N cap", "max rpe N", "rpe N max", "nothing above rpe N", "no more than rpe N", "keep (it|everything) under rpe N" (N 6–10); "no grinders" / "no grinding" → 8.5.
   - accessories: "no accessories" → none; "minimal / few / light / less / fewer accessories", "just the main lifts" → minimal; "more / extra accessories", "more accessory work" → more.
   - variations: "comp lifts only", "competition lifts only", "just the comp lifts", "only sbd", "just the big three", "no variations" → competition-only.
   - focus synonyms: "intensification", "intensity block", "realisation/realization block", "heavy block" → strength; "accumulation", "hypertrophy block", "off season", "offseason", "gpp" → volume; "meet prep", "comp prep", "mock meet", "test week", "max out", "maxing out", "openers" → peak; "pivot block", "low fatigue" → maintenance.
   - A style with no focus means focus `strength`, reported as "Strength block (top single implies a strength focus)".
   - Lifts: "sbd" and "big three" mean all three; "pulls" means deadlift (for the existing "bring up my …" emphasis rule too).
   - Not supported yet, reported in `unclear` instead of guessed: per-lift frequency ("bench 3 times a week"), AMRAP, wave / pyramid loading, percentage programs by name (5/3/1, Sheiko, Smolov): "I can't build that yet; set it in Settings or describe the sets".
11. `buildSummary` mentions the new options in plain words, e.g. "Strength block, top single then 3 back-offs of 3, 4 days a week."

### C. Plan view
12. Settings fold gets, in the existing `.grid.cols-2` with `.field` labels: "Main-lift style" (Auto (like my last block) / Top single + back-offs / Top set + back-offs / Sets across / Singles / Heavy and light); "Top set reps" (only for top-set); "Back-offs" (sets, reps, % lighter, only for styles that have them); "Sets × reps" (only sets-across); "RPE cap" (None / 8 / 8.5 / 9); "Accessories" (Normal / More / Minimal / None); "Variations" (Keep / Competition lifts only). The settings summary lists the non-default ones. "Understand" fills them from the text exactly like the existing fields.
13. The request box placeholder becomes 'e.g. "top single block, 4 days a week, 6 weeks"'.

### D. Docs
14. `GENERATOR.md`: a section "Block styles and powerlifting terms" with a table of every phrase family → option → what the generator builds; `README.md` Plan section: two example requests.

## Verify
- `cd lifting-tracker && node --test` (baseline: 291 pass, 1 skip; may only go up; no existing assertion changed).
- `request.test.js`: at least 30 new phrase cases, including: "top single block 4 days a week" → `{ focus: 'strength', style: 'top-single', daysPerWeek: 4 }`; "top triple and 3 back-offs at 90%"; "5x5 volume block 6 weeks"; "heavy single @ rpe 8 then back-offs of 3"; "dup, cap rpe at 8.5"; "no grinders"; "minimal accessories"; "comp lifts only"; "mock meet in 3 weeks"; "accumulation block"; negations ("no top singles", "not 5x5"); unsupported ("bench 3x a week", "531") land in `unclear`.
- `generator.test.js`: each style's set structure, reps, RPE progression by week and loads ≤ ceiling; back-off count/reps/drop; `rpeCap`; each `accessories` value; `competition-only`; adding days (3-day template, `daysPerWeek: 4` → 4 days, light exposures as specified); deload week with a style (top single at RPE 7, 1–2 back-offs); determinism.
- `plan-flow.test.js`: "top single block 4 days a week" → interpret → generate with a synthetic athlete and template → 4 days, each family's primary exposure starts with a single at RPE 8 then back-offs; the summary and rationale mention it.
- `git diff --check`.

## Done When
1. (Codex) Rules 1–8 with tests. 2. (Codex) Rules 9–11 with tests. 3. (Codex) Rules 12–13. 4. (Codex) Rule 14. 5. (Codex) Report: anything not built, classes wanted, sample outputs for three requests (structure only). 6. (Claude) Review, real-request testing, styling, commit.

## Stop conditions
Stop and report (UNKNOWN / CHECKED / NEEDED) if a rule would change the output for existing options, plan above an all-out set, or needs a file outside the allowlist.
