# CCX-4d · Confirm the CCX-4c fixes

## Mode and Owner
CCX-4d · complex · risk high · Dispatch, `-Role verify`, recorded on task CCX-4. Codex (gpt-6-astra) confirms. This is a final confirmation after the two-cycle review cap, not a new review round.

## Goal
Re-run your three CCX-4c reproductions against the fixed code. Report each as PASS or FAIL. Nothing else.

| Finding | Fix |
|---|---|
| F3 legacy planned reset | When a task has no `baselines` yet, only a pristine task (planned, and `updated == created`, i.e. untouched since `task add`) takes a fresh baseline. Every other task seeds its old baselineDirty and keeps it, failing closed. (`Start-CcxTaskInState`) |
| `**Status**: **READY_FOR_CLAUDE_REVIEW**` recorded as NONE | The status pattern is `^[ \t*]*Status[ \t*]*:[ \t*]*(READY_FOR_CLAUDE_REVIEW\|PARTIAL\|BLOCKED)\b`: any spaces or asterisks around a required colon. (`scripts/codex-dispatch.ps1`) |
| `StatusREADY_FOR_CLAUDE_REVIEW` accepted | The colon is required. |

## Relevant Files
- `git diff 36a89b3..HEAD -- scripts/`.

## Write Allowlist
None. Temporary files only under `%TEMP%\ccx-v4d-<random>`, with `CCX_STATE_DIR`, `CCX_POLICY` and `CODEX_HOME` set there. Never touch the real state dir or `nursing-a2/`.

## Done When
1. (Codex) Three Checks lines: PASS or FAIL, with evidence.

## Stop Conditions
- Report by 10 minutes after start. Say each result in one line as you go.
- Never edit repository files.
