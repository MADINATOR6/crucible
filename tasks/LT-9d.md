# Task

## Mode and Owner
LT-9d · risk high · Codex verifier (read-only) on the current `main` checkout. Claude owns fixes and commits.

## Goal
Independently attack the block generator feature as it stands on `main`: `lifting-tracker/src/core/generator.js` (generateBlock, reviseBlock), `athlete.js`, `template.js`, `request.js`, `coach.js`, and how they are saved and revised (`src/ui/state.js` addBlock/replaceBlock/removeBlock/programmeMerged, `src/store/programme-schema.js`). Contract: `lifting-tracker/GENERATOR.md`. Earlier reviews already found and fixed: schema dropping `gen.exposure`, return-block revise jumping to full loads, logged sets ignored by revise, stale revisions, logs attaching to reused block numbers, thin-data and contradictory coach advice. Do not re-report those unless they still reproduce. Use synthetic fixtures (`lifting-tracker/src/ui/example-data.js`); never read any .xlsx or private folder.

## Attacks
1. Property tests (write throwaway scripts in a temp dir, not in the repo): for random valid options (focus x weeks 3..8 x daysPerWeek 1..7 x progression x rotate x deloadWeek x seed) over 3 different templates, every generated block must satisfy: finite numbers; loads null or multiples of 2.5 and never above the athlete e1RM of that family; sets 1..6 for main/variation slots the generator touched; RPE 6..11; contiguous week/day/set numbering; no NaN; deterministic for a seed; passes `sanitizeProgramme` unchanged (idempotent) with every `gen` and `generated` field kept; `reviseBlock` with the same athlete from week 1 changes nothing.
2. Request parser: 100 phrasings (typos, mixed case, other word orders, numbers as words, negations like "not maintenance", "no deload", conflicting goals); report any that produce a wrong or dangerous option (for example `focus` from a negated word).
3. Coach: feed 30 synthetic histories (rising, flat, falling, noisy, gaps, deload weeks, one lift only, lb data) and report advice that is wrong, contradictory, or unsupported by its own evidence lines.
4. Volume and rotation: for rotate 0..1 every swap stays in the same movement pattern and never duplicates an exercise within a day; muscle volume warnings match the numbers.
5. Anything that could harm an athlete: a load or set count that looks unsafe for the stated focus (for example the first week of a return block, a deload block at full intensity).

## Write Allowlist
None. Never edit, create or delete repository files (temp scripts outside the repo only).

## Verify
```
cd lifting-tracker && node --test
```

## Report
Per problem: reproduction (exact options and fixture), expected, observed, `file:line`, severity. Status READY_FOR_CLAUDE_REVIEW when finished.
