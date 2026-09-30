# CCX-4b · Re-verify the fixes for the CCX-4 findings

## Mode and Owner
CCX-4b · complex · risk high · Dispatch, `-Role verify`, recorded on task CCX-4 (second review cycle of 2). Codex (gpt-6-astra, high) re-verifies. Claude fixes and commits.

## Goal
Your CCX-4 run confirmed five defects. Claude has fixed them, each with a regression test. Re-run your own reproductions against the fixed code and try to break each fix once more. Nothing else.

| Finding | Fix | Where |
|---|---|---|
| F1 | Redaction removes the whole PEM block (to END or to end of text). Command-stage output is redacted as whole text before it is split into lines. | `ccx/policy.json` redaction pattern 0, `Protect-CcxText -Full`, `Invoke-CcxCommandStage` |
| F2 | Verification checks every owned file (tracked and untracked), not only changed ones. | `Invoke-CcxVerify` |
| F3 | baselineDirty is computed only on the first start, or when a task moves to another worktree. A restart keeps it. | `Start-CcxTaskInState` |
| F4 | merge-check lists changes with `--no-renames`, so a rename's deleted source is scope-checked. | `Invoke-CcxCmdMergeCheck` |
| F5 | The launcher always evaluates the route, so caps, deferral and refusals apply. Explicit `-Effort`/`-Model` only replace the model and effort. | `scripts/codex-dispatch.ps1` |

Also changed: `verify`-type tasks require deterministic checks plus a cross-model review, but no verifier of their own (policy `taskTypes.verify.verification`).

## Relevant Files
- `git diff 940f915..HEAD -- scripts/ ccx/`.
- Your CCX-4 reproductions under `%TEMP%\ccx-v4-894e5d7c51d14af798650105c3ec07dd`, if they are still there.

## Write Allowlist
None. The same rules as CCX-4:
- Temporary files only under `%TEMP%\ccx-v4b-<random>`.
- Set `CCX_STATE_DIR`, `CCX_POLICY` and `CODEX_HOME` there.
- Never touch the real state dir or `nursing-a2/`.

## Done When
1. (Codex) Each of F1-F5 has a Checks line: PASS (the original reproduction and one variation no longer break it) or FAIL (a reproduction), with evidence.
2. (Codex) Any regression the fix introduced in adjacent behaviour, with a reproduction.

## Verify
Targeted reproductions only. Do not run the full suites: Claude has run them.

## Stop Conditions
- Report by 20 minutes after start. Say each confirmed result in one line in your progress messages as you go.
- Never edit repository files.
