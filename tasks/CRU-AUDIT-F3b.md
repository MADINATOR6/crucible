# Task CRU-AUDIT-F3b: verify names a missing baseline

Mode: Dispatch, role-swap. Owner: claude. Worktree `.ccx-worktrees/claude-CRU-AUDIT-F3b`, branch `claude/cru-audit-f3b`. Source: finding F3 in `tasks/CRU-AUDIT-1.md` (Codex-reviewed, capture `codex-4a15919f72ff4d44898aa93f3d8278b1`). Risky: verification gate.

## Goal and write allowlist

`ccx verify -TaskId <id>`, scope stage: when the task has no baseline for the checkout it is verified in (activated by `task update -Status active`, or never started), say `run ccx task start -Id <id>` instead of listing every unrelated dirty file. Repair already exists (`task start` takes the first baseline); only the message was missing. FRICTION 2026-11-06 and 2026-11-10.

Writes: `scripts/ccx-ops.ps1`, `scripts/test-ccx.ps1`, `tasks/CRU-AUDIT-F3b.md`. (`scripts/test-ccx-ops.ps1` is owned by active CRU-UP-4, so the case lives in `test-ccx.ps1`, which has the CLI and a git fixture; the ARCHITECTURE and FRICTION notes are written once, in the closing docs task, because CRU-VERIFY-2 owns those files.)

Added 2026-11-14 (cleanup session, same two files): the stale scan skips the missing worktree of a `done` or `abandoned` task. Finished tasks keep their old worktree path, and once the folder is removed every tick raised a "worktree is missing" warning nobody could act on (N-0308 to N-0314). Open tasks are still flagged. `task update -Worktree ''` cannot clear the path because `powershell -File` drops empty arguments, and state is never hand-edited.

## Decisions

- Exit code unchanged (verify still exits 1 on a scope FAIL); no gate loosened; no baseline is ever recaptured by verify. `task update` is untouched (Codex: it sets `-Worktree` after the status handling, so a start inside it could baseline the wrong root).
- Legacy tasks whose `baselines` is not a dictionary keep the old behaviour (fail closed with the file list).

## Done When

- [x] New case fails on the old code (red) and passes with the fix (green). Stale-scan red: main's `Invoke-CcxStaleScan` flags a done task's missing worktree (in-process check, 2026-11-14).
- [x] `test-ccx.ps1` passes in full: 36/36 (34 baseline plus both new cases), 873 s.
- [x] `test-ccx-ops.ps1` still passes: 17/17.
- [x] Codex `-Role verify` (capture codex-5df1292b, static): no defects; runtime evidence above is Claude's. Then `ccx verify -TaskId`, review, `task done`.

Untested: a real never-dispatched task in a worktree (the fix keys on the same root string `Start-CcxTaskInState` uses).

## Verifier request (read-only, static; do not edit)

Review `git diff` of this worktree against HEAD (scripts/ccx-ops.ps1 scope branch, scripts/test-ccx.ps1 new case). Try to break it: a baseline key mismatch (case, trailing slash, worktree vs main root) that would make a started task show the new message; a legacy task shape; an effect on `ccx verify` without `-TaskId`; the `-Stage` filter; exit codes; any path where verify now recaptures or hides violations. Report `Status:`, findings with line evidence, and `Untested:`. The suites are running on Claude's side (test-ccx, test-ccx-ops); you cannot run them in your sandbox.
