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

## Continuation

CRU-UP-4 released `HANDOFF.md` and `scripts/test-ccx-ops.ps1`; the work continues as CRU-VERIFY-3 on this branch (owns now also `scripts/test-ccx-ops.ps1`, `HANDOFF.md`). Added: the ops suite SKIPs its taskkill case when taskkill is denied (`Test-TaskkillDenied`, same probe as the dispatch suite) and its summary counts skips; HANDOFF.md (Launcher option, exit 9, Verifier step 1); FRICTION.md row marked fixed.
Sandbox probe of the other suites, run as `codex.cmd sandbox` in `workspace-write` before the change: `test-ccx` 34/34; `test-ccx-ops` 16/17 (the taskkill case); `test-external-tools` 21/23 (two `claw` wrapper cases: the saved credential cannot be decrypted in the sandbox).

## Verifier brief (dispatch: `-Role verify -Sandbox workspace-write`)

You are in a writable sandbox only so the suites can create scratch folders under TEMP. Do not edit the repository. Run, and report the exact counts, with SKIP kept apart from PASS:
1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx-ops.ps1` (expect 16/17 passed plus 1 skipped, or 17/17 if taskkill works).
2. Read the diff of `scripts/codex-dispatch.ps1` (`Get-RepoSnapshot`, the `$guardNoEdit` blocks) and try to break the guard by reading: a change it would miss (ignored files, a file edited back to identical content, a rename, quoted paths), a way it could fail a clean run, or a way it changes the exit code of a usage-limit or timeout run.
3. Do not run `scripts\test-codex-dispatch.ps1` (800 s); its result is recorded by Claude.

## Verify / Done When

- [x] `scripts/test-codex-dispatch.ps1` passes with the new guard cases (baseline 58/58).
- [x] `test-ccx` 34/34, `test-ccx-ops` 17/17, `test-external-tools` 23/23 still pass when Claude runs them.
- [x] A real `-Role verify -Sandbox workspace-write` dispatch on this task runs `scripts/test-ccx-ops.ps1` itself and reports PASS with its count.
- [x] `FRICTION.md` row updated; `HANDOFF.md` says how the verifier runs suites (after CRU-UP-4).
- [x] `ccx verify`, Codex review, `ccx task done`.

## Results

- Round 1 Codex verify (workspace-write): `test-ccx-ops.ps1` ran inside the sandbox, 16/17 passed, 1 skipped (taskkill denied). It also refuted the guard on quoted paths: fixed (NUL-delimited status).
- Round 2 (capture in the ccx record): refuted on Git's `T` (type change) status having no hash: fixed by accepting any status letter in the parse; probed in memory for ` T`, `T`, `TM`, `MT`, `M README.md`, `?? a b.txt`, renames. The final fix is not re-reviewed by Codex (two review cycles used); `Untested:` the type-change case has no suite case (needs a real typechange; Windows symlink).
- Claude, outside the sandbox: dispatch suite 63/63, ops 17/17, external-tools 23/23, `ccx verify` PASS (tests-ccx, tests-ccx-ops, tests-dispatch).

## Round 2 (verify, after Codex round 1)

Round 1 (capture `codex-b0cc85c3eadb4f24b5cf63e2d1b0ee76`, REFUTED on one point): ops suite 16/17 passed, 1 skipped inside the sandbox (the goal); the guard hashed Git's quoted path as missing. Fixed in 4a1d98b: `Get-RepoSnapshot` now reads `status --porcelain=v1 -z`; new case `guard hashes a path with a space`; dispatch suite 63/63.
Verifier brief, round 2: read-only in effect (the run is `workspace-write` only for TEMP). Do not rerun suites. Read `Get-RepoSnapshot` in `scripts/codex-dispatch.ps1` and try to break the NUL-delimited parsing: rename/copy entries (`R  new`, then old path as its own entry), a first entry whose leading space was trimmed by `Invoke-Git`, non-ASCII paths, an entry that fails the regex. Reproduce only with in-memory string probes (a temporary Git fixture was refused by the approval reviewer last round). Report FAIL only with a reproduction.
