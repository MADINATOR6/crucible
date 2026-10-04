# Task

## Mode and Owner
LT-0 re-verification · risk high · Codex verifier (read-only). Claude fixed the findings from the first verifier run and committed the result on branch `codex/lt-0`.

## Goal
Independently try to break `lifting-tracker/src/import/programme.js` again, with fixes applied. Read `tasks/LT-0.md` for the contract and `lifting-tracker/ARCHITECTURE.md` for the model. Use only synthetic in-memory workbooks (`lifting-tracker/test/helpers/make-xlsx.js`). Never read any real workbook or any `.xlsx` on disk.

## Findings to re-check (from the first run)
1. Phone redaction: `Call + 61 499 888 777`, `Call +(61) 499 888 777`, `Call 0412 345 678` and long digit runs must come out as `[redacted]` with a `redacted_number` warning, anywhere free text is imported (goal, instructions, comments, sheet names, file name). Also try shapes the fix may still miss (for example `04 1234 5678`, `+61-4-1234-5678`, `(03) 9999 1234`, digits split by newlines) and report which survive.
2. A partial or shifted header row (only some header names present, columns offset) is honoured: reps, RPE and load land in the right columns and `source.col` is the Reps column.
3. A bodyweight line that also carries a performance note keeps the note text; a pure bodyweight line is not kept as a set comment.
4. No hard-coded athlete name in `programme.js`.

## New attacks to try
- Day headers at the same column as a Week label; two groups sharing a column; an `Average Morning BW` label with a non-numeric neighbour; a set row whose first column is a number; a block sheet with 200 weeks of empty groups (performance); date-reps with day > month; `Week 0`; duplicated `Day 1` headers in one group; very long cell text (the 200-character evidence limit).

## Write Allowlist
None. Never edit, create or delete repository files.

## Verify
```
cd lifting-tracker && node --test
```
(run from the `lifting-tracker` folder; `node --test <directory>` fails on Node 24)

## Report
For each problem: reproduction (input, expected, observed), `file:line`, severity. Status READY_FOR_CLAUDE_REVIEW when finished, whatever you found.
