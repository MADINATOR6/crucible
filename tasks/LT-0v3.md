# Task

## Mode and Owner
LT-0 final verification · risk high · Codex verifier (read-only). Third and last verifier run (review cap): Claude fixed both P1 findings from run 2 and added regression tests; the fix is the latest commit on branch `codex/lt-0`.

## Goal
Independently confirm or refute the two fixes in `lifting-tracker/src/import/programme.js`. Synthetic in-memory workbooks only (`lifting-tracker/test/helpers/make-xlsx.js`). Never read any real workbook or `.xlsx` on disk. Contract: `tasks/LT-0.md`.

## Checks
1. Phone redaction: try every shape you can think of in every imported free-text location (block goal, additional instructions, coach and athlete comments, exercise-column cues, sheet name, file name, overview comments, report `warnings[].raw`, `unparsedCells[].raw`): `04 1234 5678`, `(03) 9999 1234`, `0412\n345\n678`, `+61\n499\n888\n777`, `+61-4-1234-5678`, `+61 (0)4 1234 5678`, `1300 123 456`, `61 4 1234 5678` (no plus), digits separated by non-breaking spaces or tabs, 11-digit unbroken runs. Report each that survives with the exact output. Also report false positives: ordinary loads or rep lists (`100 120 140`, `60 80 100 120 then 140 x 5`, `3 x 8 @ 7 / 4 x 6 @ 8`, RPE strings) that get redacted.
2. Partial header rows: only some header names present with shifted columns and any mix of blank, placeholder `-`, label (`Exercise`) and other cells in that row, in any group (not just the first); header text with different case or surrounding spaces. A row that merely contains the word `Load` in a coach comment must not be treated as a header.
3. Run `cd lifting-tracker && node --test`.

## Write Allowlist
None. Never edit, create or delete repository files.

## Report
Per problem: reproduction (input, expected, observed), `file:line`, severity. Status READY_FOR_CLAUDE_REVIEW when finished.
