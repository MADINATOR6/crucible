# Task

## Mode and Owner
LT-9b verification · risk high · Codex verifier (read-only). The generator was written by a Claude agent while Codex was out of usage; you are the independent check. Claude owns fixes and commits.

## Goal
Try to break `lifting-tracker/src/core/generator.js` (latest commit on branch `codex/lt-9b`). Contract: `lifting-tracker/GENERATOR.md` (Generator, Progression, Focus semantics, Volume and warnings, Rationale, reviseBlock) and `tasks/LT-9b.md` (22 worked examples). Use synthetic fixtures only; never read any .xlsx or private folder.

## Attacks
1. Re-derive by hand 6 of the worked examples (your choice, including at least one each of: maintenance 19, return 20, bias 7, deload 6) and check the code's output matches the spec formulas exactly (2.5 kg rounding with ties up via `roundToStep`, `pctSmooth`).
2. Formula audit: read generator.js and list every place it deviates from GENERATOR.md (even if the test passes), with file:line.
3. Edge cases: `weeks` 1..8 and 52; template with one slot, with zero slots, with only accessories, with an unknown exercise id; `daysPerWeek` 1, 3, 7 against 4-day and 1-day templates; `deloadWeek: 'all'` with `weeks: 3`; `rotate` 0 and 1 with patterns that have no alternatives; athlete with all `e1rmKg: null`; `rpeBias` outside +-0.5 (clamp); rpe 11 accessories in deload; focus `peak` with a 3-week block; `maintenance` with `weeks: 2`; `return` with `weeks: 1` (n = 1 division); `specialise` on a lift absent from the template; seeds with unicode; very long template (30 slots).
4. Output sanity: for every generated block, every set must have finite numbers, `index` 1-based and contiguous, loads multiples of 2.5 kg or null, `repsMin <= repsMax`, `targetRpe` within 5..11 or null, week numbers 1..n contiguous, day numbers contiguous from 1, no duplicate exercise within one day unless the template had it, no NaN anywhere (walk the whole block recursively).
5. Round-trip: pass generated blocks through `sanitizeProgramme` from `lifting-tracker/src/store/programme-schema.js` (`{ ...programme, blocks: [block] }`) and confirm nothing is dropped (sets, gen metadata, generated metadata) and the result is idempotent.
6. Immutability and determinism with frozen inputs; same seed twice equal; different seeds change only rotation choices.
7. `reviseBlock`: input unchanged; completed sets never touched; accessories never touched; family with null e1RM unchanged; a revise with the same e1RM as generation changes nothing; changes list matches the diff exactly (compare the two blocks yourself).
8. Safety: any scenario where the generator could prescribe a load above the athlete's e1RM, a load for an RPE below 6, more than 6 sets, or a negative/zero set count. Report each with the exact options.

## Write Allowlist
None. Never edit, create or delete repository files.

## Verify
```
cd lifting-tracker && node --test test/core/generator.test.js
```

## Report
Per problem: reproduction (exact options and fixture), expected, observed, `file:line`, severity. Status READY_FOR_CLAUDE_REVIEW when finished.
