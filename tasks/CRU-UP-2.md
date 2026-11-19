# Task CRU-UP-2: a BUSY dispatch must not consume an attempt or approval

Mode: Dispatch, role-swap (Codex planned, Claude implements). Owner: claude. Start HEAD: c2049aa. Worktree `.ccx-worktrees/claude-CRU-UP-2`, branch `claude/cru-up-2`. Risky: dispatch bookkeeping and approval ordering.
Plan brief: `tasks/CRU-UP-2-plan.md`. Codex plan: READY_FOR_CLAUDE_REVIEW, capture `codex-ecd3abdf1f6c42dd8d055a25bd8e502d`. The plan dispatch ran without `-TaskId` from the base checkout, because CRU-UP-1 was still active and both tasks own MEMORY.md; ownership was checked by hand against `ccx task list` first.

## Goal and write allowlist

Exit 6 (BUSY: another write dispatch holds the lock) leaves the task and its approvals exactly as they were. Evidence of the defect: FRICTION.md 2026-10-30 (WP-REEL-1): BUSY was recorded as dispatch 1, effort was raised, and the approved run later hit `maxDispatches`.

Writes: `scripts/codex-dispatch.ps1`, `scripts/test-codex-dispatch.ps1`, `ccx/ARCHITECTURE.md`, `FRICTION.md`, `tasks/CRU-UP-2.md`, `tasks/CRU-UP-2-plan.md`, `MEMORY.md` (checkpoint only).

## Claude's critique of the plan (decisions)

- Claims checked at HEAD: approvals were consumed at `codex-dispatch.ps1:241-245`, the attempt counted at `:252` inside the state transaction, the writer lock opened at `:267`; a planned task was started (status active, baseline) in preflight at `:169`. All as the plan says.
- Accepted: lock first, no rollback. `Invoke-CcxGate` marks an approval `used` and nothing restores it, so a rollback would need new gate code outside the allowlist.
- Accepted: an implement run no longer starts a planned task in preflight (it only asserts ownership there, same exit 7); the start moves into the dispatch-recording transaction, after the lock.
- Changed after Codex's verify run (capture `codex-1cb57b1e736d40caaa04d5b0d6536685`, static finding at the preflight start): my first version still started a planned task in preflight for research and verify. Either role can be given `-Sandbox workspace-write` or `danger-full-access`, which takes the writer lock, so BUSY could leave the task active with a baseline. Now no role starts a task before the lock: preflight asserts ownership for an implement run or a planned task, and the recording transaction starts a planned task for any role. Test: `writable research or verify refused BUSY starts nothing`.
- Callers: the launcher is the only place that consumes dispatch approvals and counts attempts. `Start-CcxTaskInState` is shared (CLI, launcher, worktree add) and unchanged.
- Failure paths: a throw after the lock is taken (approval gone between check and consume, ownership lost, capture directory unusable) reaches the outer `finally`, which deletes the lock while holding the handle. Covered by a test.
- Kept before the lock, so a run that would be refused anyway never waits on or holds it: task-file checks, token budget, route (retry cap, usage limit), missing approvals. Their exit codes are unchanged and tested with a writer held.
- Not changed: route telemetry is still written for a BUSY run (a routing decision was made); changing that means router changes, out of scope.
- Behaviour change to note: a dispatch of any role refused before the lock (exit 8, 4, 10) now leaves a planned task planned. Before, preflight had already made it active. No test or doc relied on the old side effect (the suite passes unchanged apart from the added cases).

## Out of scope

Gate or router APIs, policy, exit codes, provider-error retry accounting (FRICTION 2026-11-05 rows, count 1), real provider calls.

## Verify / Done When

Run from the worktree: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-codex-dispatch.ps1` (policy `verify.stages`, tests-dispatch).

- [x] Held lock returns exit 6 without launching the provider; a planned registered task with a valid full-access approval keeps dispatches 0, status planned, no lastDispatch, no new checkpoint, approval still `approved`, no dispatch telemetry or event; the other writer's lock file survives. (case `busy spends no attempt, approval or task start`)
- [x] BUSY twice, then success: one attempt, one dispatch event and telemetry record, approval used once. (same case)
- [x] BUSY on an already-active task keeps its count and lastDispatch, and the real second attempt still runs. (case `busy on an active task keeps its count and last dispatch`)
- [x] Research and verify run beside a held handle, count no attempt and leave the lock. (case `research and verify run beside a held writer lock`)
- [x] With a writer held, ownership still exits 7, the retry cap 8, a missing approval 10, a recorded usage limit 4; nothing is counted or started. (case `refusals keep their codes while a writer runs`)
- [x] A stale lock is reclaimed and the run counts once. (case `stale lock with a registered task counts once`; the two standalone stale cases are unchanged)
- [x] The lock is gone after a nonzero exit, a missing report, a usage-limit run and a launcher failure after acquisition. (case `lock is released on every failure path`)
- [x] The new cases fail against the old launcher (red run) and pass with the fix (green run).
- [x] Whole suite passes; baseline 51/51. `test-ccx.ps1` and `test-ccx-ops.ps1` are not re-run: neither mentions `codex-dispatch` (grep: 0 matches) and no file they cover changed, so their baseline (34/34, 16/16 at c2049aa's parent tree plus docs) stands.
- [x] Independent Codex `-Role verify` run that tries to break the ordering, then `ccx verify -TaskId CRU-UP-2`, `ccx task review -By codex`, `ccx task done`.

Evidence (Claude, 2026-11-12, run from this worktree):
- Green, final code: `scripts\test-codex-dispatch.ps1` 58/58 passed in 622 s (51 existing, 7 new). Before the role fix: 57/57 with 6 new cases.
- Red: the 57-case test file run against the old launcher (CRU-UP-1 worktree at c2049aa, test file copied in and restored afterwards): 54/57. Failing: `busy spends no attempt, approval or task start` (task started before any lock), `busy on an active task keeps its count and last dispatch` (BUSY consumed an attempt), `refusals keep their codes while a writer runs` (a refusal started a task). The other three new cases pass on the old launcher too: they guard behaviour the change must keep.
- Not shown red: `writable research or verify refused BUSY starts nothing` was added after the red run; the old code started such a task in preflight (same line the first failing case hits).
- Codex verify round 1 (capture `codex-1cb57b1e736d40caaa04d5b0d6536685`): VERIFIED WITH CAVEATS, one static finding (writable research/verify), fixed above. Round 2 (capture `codex-3afe018f247649f9916399db23241594`): VERIFIED WITH CAVEATS, no defect, lock-before-mutation ordering PASS for all writable roles by inspection. Both rounds: every suite BLOCKED in the read-only sandbox (scratch folder under TEMP denied), so the runtime evidence is Claude's runs only (FRICTION.md 2026-11-12).

Untested: two real launchers racing for the lock (the tests hold the lock from the test process); a real provider run.

Stop conditions: the fix needs approval restoration, a core or policy change, or a different exit code; baseline capture would have to change in a way that weakens scope checks.
