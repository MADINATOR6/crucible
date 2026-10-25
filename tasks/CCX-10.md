# CCX-10: verifier dispatches take a baseline; owned folders keep their slash

## Mode and owner
CCX-10 · normal · risk medium (control plane) · Dispatch in its own worktree. Codex implements; Claude reviews and owns all Git. From FRICTION.md (2026-10-25, LT-UI-3V row).

## Goal
Two false scope failures stop happening: (1) a `-Role verify` (or `research`) dispatch for a registered task leaves the task without a baseline, so `ccx verify` blames the user's unrelated uncommitted files; (2) `task add -Owns some/folder` without a trailing `/` makes every file inside that folder a scope violation.

## Relevant files
- `scripts/codex-dispatch.ps1` (around the `if ($Role -eq 'implement')` block that calls `Start-CcxTaskInState` for planned tasks).
- `scripts/ccx-core.ps1` (`Start-CcxTaskInState`, `Test-CcxPathOwned`, the `task add` command and its `-Owns` parsing, `ConvertTo-CcxOwnedPath`).
- `scripts/test-ccx.ps1`, `scripts/test-codex-dispatch.ps1` (existing suites and their mocks), `ccx/ARCHITECTURE.md`, `FRICTION.md`.

## Write allowlist
`scripts/codex-dispatch.ps1`, `scripts/ccx-core.ps1`, `scripts/test-ccx.ps1`, `scripts/test-codex-dispatch.ps1`, `ccx/ARCHITECTURE.md`, `FRICTION.md`.

## Resolved rules
1. Dispatch: for any role with a registered task (`-TaskId`), a task in `planned` status is started (baseline taken) before Codex runs, exactly as implement does today. Keep the implement-only checks (owner must be codex, budget/retry caps) as they are; a verify or research dispatch must not count toward the implement retry cap.
2. `task add`: an `-Owns` entry that names an existing directory in the repo and lacks a trailing `/` is stored with the `/` added, and the command prints one line saying so (`Owns: treated folder 'x' as 'x/'`). Entries that don't exist yet are kept as given.
3. FRICTION.md: update the LT-UI-3V row's fix column to say what was fixed and set the count's note; don't delete rows.
4. `ccx/ARCHITECTURE.md`: one sentence each for rules 1 and 2 where dispatch roles and ownership are described.

## Verify
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx.ps1` and `scripts\test-codex-dispatch.ps1` pass, with new cases: a verify-role dispatch on a planned task records a baseline and its later `verify` ignores pre-existing unrelated dirty files; `task add -Owns <existing folder>` stores it with a trailing slash; a not-yet-existing path is unchanged.
- PowerShell 5.1 parse check of the changed scripts.

## Stop conditions
Stop and report (UNKNOWN / CHECKED / NEEDED) if a change would weaken ownership or scope enforcement for implement dispatches, or the tests need real Codex/network access.
