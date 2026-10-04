# LT-1 · Lifting tracker core: units, estimated 1RM, PRs, weekly muscle sets

## Mode and Owner
LT-1 · normal · risk low · Dispatch. Codex implements (confirm with `ccx route -TaskId LT-1`). Claude reviews the diff, re-runs the tests and commits. Cross-model review: Claude reviews, because Codex is the author.

Run in a new project repo made from this template (`BOOTSTRAP.md`), not in `claude-codex-collab`. Fill `AGENTS.md` Project, Stack and Commands for that repo only from commands that have actually run.

## Goal
The pure logic every later block depends on, with no UI and no storage: kg and lb handling, estimated 1RM, PR detection, and weekly sets per muscle (the numbers behind the heat map). Nothing here touches the DOM, the network or disk apart from reading one JSON data file.

Product direction (for context, not for this task): a powerlifting-focused log for phone and PC, with a body heat map, built block by block. This task is block 1 of 8: core logic, storage and backup, workout logging, heat map, history, training blocks, offline install, meet tools.

## Resolved Rules
1. **Stack.** Plain JavaScript ES modules, no build step, no dependencies, tests with Node's built-in runner. ASSUMPTION: Node 18 or later is installed; stop if `node --version` says otherwise.
2. **Units.** Weights are stored as `{ value, unit }` where `unit` is `"kg"` or `"lb"`, exactly as the user entered them. All maths converts to kg using `1 lb = 0.45359237 kg` (the exact legal definition). Never convert a stored value in place, so a logged 225 lb stays 225 lb.
3. **Display rounding.** Convert back to the user's chosen unit only for display, to 1 decimal place, half away from zero. Do not round inside the maths.
4. **Estimated 1RM (e1RM).** Epley: `w × (1 + reps ÷ 30)`, with `reps = 1` returning `w` unchanged. It is an approximation and is least reliable above about 10 reps. Return `null` (not a number) for `reps > 12` and for `reps < 1`, so later blocks can say "too many reps to estimate".
5. **Working vs warm-up.** Each set has `type: "warmup" | "working"`. Only working sets count for e1RM, PRs and volume.
6. **PR types** (per exercise id): (a) best e1RM, (b) heaviest weight for a single rep, (c) most reps at an exact weight. The first working set for an exercise sets the baseline and is never a PR. After that, a set is a PR only if it beats every earlier working set for that exercise; ties are not PRs. Compare in kg using exact arithmetic on the stored values, so 100 kg and 220.462... lb do not both claim the PR by float noise: compare after rounding to 6 decimal places in kg.
7. **Muscle map.** `data/muscle-map.json` maps each exercise id to muscles with a weight of `1` (primary) or `0.5` (secondary). The weights are the author's estimates, not research findings, and are meant to be edited by the user. The file also lists the muscle regions used by the heat map (see below). Unknown exercise id: contribute nothing and report the id in a `warnings` array. Do not guess.
8. **Weekly sets per muscle.** For each muscle, the sum over working sets in the week of the exercise's weight for that muscle. A week runs Monday 00:00 to Sunday 23:59 in the user's local time; the caller passes the Monday date. Dates are `yyyy-MM-dd` strings.
9. **Muscle regions** (17): chest, front_delts, side_delts, rear_delts, traps, lats, upper_back, lower_back, biceps, triceps, forearms, abs, glutes, quads, hamstrings, adductors, calves.
10. **Starter exercises** in the map: back_squat, pause_squat, front_squat, bench_press, close_grip_bench, overhead_press, deadlift, deficit_deadlift, romanian_deadlift, barbell_row, pull_up, hip_thrust.

## Relevant Files
Read-only: `AGENTS.md`, `HANDOFF.md`.

## Write Allowlist
- `src/core/units.js`
- `src/core/e1rm.js`
- `src/core/prs.js`
- `src/core/volume.js`
- `data/muscle-map.json`
- `test/units.test.js`, `test/e1rm.test.js`, `test/prs.test.js`, `test/volume.test.js`
- `package.json` only if needed to declare `"type": "module"`; no dependencies, no scripts beyond `test`.

## Worked examples (use as test cases)
- `100 lb` to kg: 100 × 0.45359237 = **45.359237 kg**. `45 lb` = **20.41165665 kg**.
- `100 kg × 5`: 100 × (1 + 5/30) = 116.666… = **116.7 kg** displayed.
- `225 lb × 5`: 225 lb = 102.05828325 kg; × (1 + 5/30) = 119.067997… kg, displays **119.1 kg**; in lb the same set is 225 × 1.16667 = **262.5 lb**.
- `140 kg × 1` = **140 kg**. `100 kg × 13` and `100 kg × 0` return **null**.
- PRs: working sets in order 100×5, 105×5, 105×5, 110×3 (all kg). e1RM PR on set 2 and set 4 only (set 3 ties set 2). Check set 4: 110 × 1.1 = 121.0 versus set 2: 105 × 1.16667 = 122.5. So set 4 is **not** an e1RM PR, but it **is** a heaviest-weight PR (110 beats 105). Set 1 is the baseline and no PR. Tests must assert exactly this.
- Weekly sets: 3 working back_squat sets plus 2 warm-up sets in the week → quads **3**, glutes **3**, adductors **1.5** if the map gives back_squat quads 1, glutes 1, adductors 0.5. Warm-ups add nothing.
- Unknown exercise id `"zercher"` → no muscle contributions, one entry in `warnings`.

## Constraints
- Smallest correct change. No UI, storage, charts, scoring formulas or programming logic in this task.
- Do not touch `ccx/`, `scripts/`, `.codex/`, `.claude/`, `AGENTS.md`, `HANDOFF.md`, `TASK.md` or `MEMORY.md`.
- No floating-point surprises: no `toFixed` inside calculations, only in display helpers, and test the 6-decimal comparison rule explicitly.
- Synthetic data only. No real training logs in the repo.
- Competition scoring (Wilks, DOTS, IPF GL) is out of scope until its coefficients are verified from the official source.

## Out of Scope
Storage, backup, UI, SVG, charts, rep-range recommendations, RPE tables, programming blocks, plate maths, body weight tracking.

## Done When
1. (Codex) All four test files exist and pass, covering every worked example above, both units, the null cases, tie handling, warm-up exclusion, unknown exercise warnings and the Monday week boundary (a set on Sunday 23:59 versus Monday 00:00).
2. (Codex) `data/muscle-map.json` parses, contains all 17 regions and all 12 starter exercises, and every muscle named in an exercise exists in the region list (a test checks this).
3. (Codex) `git diff --check` exits 0 and `git status --short` shows only allowlisted paths.
4. (Claude) Re-runs the tests and confirms the pass count matches the report.
5. (Claude) Reads the diff against Resolved Rules 2, 4, 6 and 8, and tries two inputs the tests miss (for example `0.5 kg × 30` and a leap-day week).
6. (Claude) `ccx verify -TaskId LT-1`, `ccx task review -Id LT-1 -Result pass -By claude`, `ccx task done -Id LT-1`, then commit.

## Verify
None of these has run; the files do not exist yet. Use explicit file names, because `node --test` pointed at a bare directory failed in an earlier trial in this workflow.
```powershell
node --version
node --test test\units.test.js test\e1rm.test.js test\prs.test.js test\volume.test.js
git diff --check
git status --short
```
Expected: no failing test, exit 0.

## Stop Conditions
- A check still fails after one focused repair: stop and report UNKNOWN / CHECKED / NEEDED.
- Node is older than 18, or missing: stop and report.
- A rule above conflicts with a worked example: stop and ask. Do not choose.
- Codex exits 4 (usage limit): do not retry; note the reset time and let ccx defer.
