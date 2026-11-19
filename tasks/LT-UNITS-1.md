# Task LT-UNITS-1: dedicated unit test for core/units.js

Mode: Dispatch, role-swap trial (Codex planned, Claude implements). Owner: claude. Start HEAD: 43bbbeb.
Plan brief: `tasks/LT-UNITS-1-plan.md`. Codex plan: READY_FOR_CLAUDE_REVIEW, capture `codex-cb634b8f56694ef8acb24714a4495b9e`.

## Goal and write allowlist

Directly test every export of `lifting-tracker/src/core/units.js` with synthetic values. Test-only: no runtime change, no `sw.js` bump.

Writes: `lifting-tracker/test/core/units.test.js` (new). Task files: `tasks/LT-UNITS-1.md`, `tasks/LT-UNITS-1-plan.md`.

## Claude's critique of the plan (decisions)

- Accepted: cover all seven exports; independent expected values; `RangeError` for invalid input, including `convert(1, 'x', 'x')` (unit check runs before the same-unit shortcut, units.js:12-13).
- Tried and dropped: a `round1(0.15)` case meant to exercise the `Number.EPSILON` nudge (units.js:20). Running it showed `Math.round(0.15 * 10) / 10` is already 0.2, and a search of every two-decimal value from 0.05 to 20.04 found none where the nudge changes the result. The nudge is harmless; there is no case worth pinning.
- Added: `formatWeight` never prints `-0` for a tiny negative value.
- Not tested, recorded as a finding: `round1` rounds halves toward +infinity (`round1(-1.25) === -1.2`, `round1(1.25) === 1.3`). Corrected after Codex verify: negatives do reach it, through the weekly trend slopes in `coach.js:108,256` (for example bodyweight loss per week). The effect is display-only: a half rounds up in value, so -1.25 shows as -1.2 where 1.25 shows as 1.3, at most 0.1 off in the shown digit, and tiny negative slopes print as "0". No runtime defect; locking in either behaviour is premature, so it stays untested.
- Dropped as low value: separate "frozen weight object" case; `toKg` only reads two fields.

## Out of scope

Runtime fixes, caller changes, dependencies, fixtures, workflow edits, `sw.js`.

## Verify / Done When

From `lifting-tracker/`, with `LT_REAL_WORKBOOK` unset:

- [x] `node --test test/core/units.test.js` passes; it imports all seven exports. (Claude: 6/6 pass, 2026-11-02)
- [x] `node --test` full suite passes. (Claude: 411 tests, 410 pass, 1 opt-in skip, 0 fail)
- [x] Diff touches only the allowlist. (Claude: the three task-owned paths are the only new files)
- [x] Codex `-Role verify` run (capture `codex-2a4d8a37488c43d09771175154e7a11b`): 6/6 and full suite PASS, extra attacks PASS, one low finding (the negatives rationale above, corrected). Then `ccx verify`, `ccx task review -By codex`, `ccx task done`. (Codex, then Claude)

Stop conditions: a test exposes a runtime bug (report, do not fix); the test path gets edited by another task; scope must grow.
