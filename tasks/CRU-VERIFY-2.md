# Task CRU-VERIFY-2: a Codex verify dispatch can run the PowerShell suites

Mode: Dispatch, Claude implements (no Codex plan: the option space was settled by a direct probe, below). Owner: claude. Start HEAD: d6a93f7. Worktree `.ccx-worktrees/claude-CRU-VERIFY-2`, branch `claude/cru-verify-2`. Medium risk: launcher behaviour for a writable verifier.
Registered first as CRU-VERIFY-1 (abandoned): its owns list named `HANDOFF.md`, which CRU-UP-4 holds. The `HANDOFF.md` text goes in after CRU-UP-4 releases it (see Open).

## Evidence

`codex.cmd sandbox -c 'sandbox_mode="..."' -- powershell.exe ...` creating a folder under `%TEMP%` and one under the working directory (run 2026-11-12):

| sandbox | `%TEMP%` | working directory |
| --- | --- | --- |
| read-only | denied | denied |
| workspace-write | allowed | allowed |

So option (a), a scratch root the suites take from an env var inside the worktree, cannot work: the read-only sandbox writes nowhere. Option (b), a `workspace-write` verify dispatch, is the only one that does not weaken the sandbox. Direct run of `scripts/test-ccx-ops.ps1` under `workspace-write`: see Results.

## Goal and write allowlist

A verify (or research) dispatch given `-Sandbox workspace-write` can create the suites' scratch folders. Because that sandbox can also edit the repo, the launcher fails any non-implement run in a writable sandbox whose working tree changed (exit 9, `NO-EDIT VIOLATION`, changed lines listed). The suites keep their own safety checks unchanged.

Writes: `scripts/codex-dispatch.ps1`, `scripts/test-codex-dispatch.ps1`, `FRICTION.md`, `ccx/ARCHITECTURE.md`, `tasks/CRU-VERIFY-2.md`.

## Out of scope

`danger-full-access`, any sandbox or permission change, `ccx/policy.json`, the suites' scratch roots (left as `%TEMP%`), the other three suites' code.

## Verify / Done When

- [ ] `scripts/test-codex-dispatch.ps1` passes with the new guard cases (baseline 58/58).
- [ ] `test-ccx` 34/34, `test-ccx-ops` 17/17, `test-external-tools` 23/23 still pass when Claude runs them.
- [ ] A real `-Role verify -Sandbox workspace-write` dispatch on this task runs `scripts/test-ccx-ops.ps1` itself and reports PASS with its count.
- [ ] `FRICTION.md` row updated; `HANDOFF.md` says how the verifier runs suites (after CRU-UP-4).
- [ ] `ccx verify`, Codex review, `ccx task done`.

## Open

- `HANDOFF.md` (Verifier instruction: suites need `-Sandbox workspace-write`; launcher notes: the guard and exit 9 for verify) waits on CRU-UP-4.
