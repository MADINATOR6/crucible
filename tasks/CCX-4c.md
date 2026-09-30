# CCX-4c · Re-verify the remaining CCX-4 fixes

## Mode and Owner
CCX-4c · complex · risk high · Dispatch, `-Role verify`, recorded on task CCX-4. Codex (gpt-6-astra, high) re-verifies. Claude fixes and commits.

## Goal
CCX-4b confirmed F2 and F4 fixed, and found F3 incomplete. It hit the usage limit before reaching F1 and F5. Try once more to break these four fixes, plus one small fix found in between. Nothing else.

| Item | Fix | Where |
|---|---|---|
| F1 | Redaction removes whole PEM blocks, to END or to end of text. Command output is redacted as one text before the line split. | policy redaction pattern 0; `Protect-CcxText -Full`; `Invoke-CcxCommandStage` |
| F3 (+ your CCX-4b residuals) | One baseline per worktree, keyed by its normalized path and taken the first time the task starts there. Restarts, resets to `planned`, naming the same root with `-Worktree`, and moving away and back reuse it. Tasks started before the change seed it from their existing baseline. | `Start-CcxTaskInState` |
| F5 | The launcher always evaluates the route with `-TaskId`. Explicit `-Effort`/`-Model` only replace the model and effort, so caps, deferral and refusals still apply. | `scripts/codex-dispatch.ps1` |
| Status parse | A report line such as `**Status:** **READY_FOR_CLAUDE_REVIEW**` is parsed; before, it was recorded as NONE. | `scripts/codex-dispatch.ps1` |

## Relevant Files
- `git diff 019026c..HEAD -- scripts/ ccx/`.
- Your reproductions under `%TEMP%\ccx-v4-*` and `%TEMP%\ccx-v4b-*`, if they are still there.

## Write Allowlist
None. Temporary files only under `%TEMP%\ccx-v4c-<random>`, with `CCX_STATE_DIR`, `CCX_POLICY` and `CODEX_HOME` set there. Never touch the real state dir or `nursing-a2/`.

## Done When
1. (Codex) One Checks line for each of F1, F3 (every residual path, plus moving away and back), F5 and Status parse: PASS or FAIL, with evidence.
2. (Codex) Any regression the fixes introduced in adjacent behaviour.

## Verify
Targeted reproductions only. Claude has run the full suites.

## Stop Conditions
- Report by 20 minutes after start. Say each result in one line in your progress messages as you go; the launcher prints the last one if the usage limit cuts you off.
- Never edit repository files.
