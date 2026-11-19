Follow HANDOFF.md, Planner instruction (it replaces the Researcher instruction for this task).

# CRU-UP-2 plan brief

Plan only; do not edit files. Risky task (dispatch bookkeeping and approval ordering): an independent verifier run will try to break the result.

## Goal

A dispatch refused with exit 6 BUSY (another write dispatch holds the lock) must not consume an implementation attempt or an approval. Today it does: FRICTION.md, 2026-10-30 row for WP-REEL-1, where BUSY was recorded as dispatch 1, effort was raised, and the task later hit `maxDispatches` without the approved run ever happening.

## User requirements

- Smallest correct change to `scripts/codex-dispatch.ps1`. Decide between (a) taking the writer lock before approvals are consumed and the attempt is recorded, and (b) rolling the attempt and approval back on exit 6. Say which and why, with the failure modes of each.
- Keep: the atomic open-for-write lock, stale-lock recovery, lock release on every exit path, read-only roles taking no lock and no attempt, all exit codes unchanged.
- Tests extend the existing harness in `scripts/test-codex-dispatch.ps1` (synthetic state, fake provider). No new runner, no real provider call.

## Known constraints

- Windows PowerShell 5.1, ASCII-only `.ps1`.
- Observed at HEAD 8cfae9b: required approvals are gated at `scripts/codex-dispatch.ps1:241-245`; the attempt is counted inside `Invoke-CcxLocked` at `:247-263` (`$task.dispatches++` at `:252`, also checkpoint, status active, lastDispatch); the writer lock is only opened at `:267-279`. Check these and everything between them yourself.
- Other things happen in that window (route, effort escalation, usage-limit deferral, budget checks). The plan must say which of them a BUSY refusal may still do and which it must not.
- `ccx gate` consumes an approval when it passes: confirm from the code whether a consumed approval can be restored, or whether the lock must simply come first.

## Questions

1. Exact current order of: ownership check, route, budget and retry-cap checks, approval gates, attempt count, writer lock, provider launch. With path:line.
2. Which order makes BUSY free of side effects, and what must still be refused before the lock is taken (so a task that would be refused anyway does not hold the lock)?
3. What state does a BUSY refusal leave today (dispatches, checkpoints, lastDispatch, status, effort escalation, telemetry, consumed approvals)? What should it leave after the fix?
4. Which existing tests cover the lock (`test-codex-dispatch.ps1`, the 'live writer lock' case and the registered-task cases) and what new assertions are needed: BUSY with a registered task leaves dispatches and approvals untouched; a later success counts once; stale lock recovers; failure paths release the lock; research and verify still consume no attempt; approval and ownership refusals unchanged.
5. Risks: lock held while waiting on anything slow, a refusal path that leaks the lock, double counting on retry.

## Relevant paths

- `scripts/codex-dispatch.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/ccx-core.ps1` (gate, approvals, `Invoke-CcxLocked`), `ccx/ARCHITECTURE.md` (dispatch section), `FRICTION.md`

## Allowlist to plan within

`scripts/codex-dispatch.ps1`, `scripts/test-codex-dispatch.ps1`, `ccx/ARCHITECTURE.md`, `FRICTION.md`, `tasks/CRU-UP-2.md`, `MEMORY.md` (checkpoint only).
