Follow HANDOFF.md, Planner instruction (it replaces the Researcher instruction for this task).

# LT-UNITS-1 plan brief

Trial of the 2026-11-01 role swap (Codex plans, Claude implements). Plan only; do not edit files.

## Goal

Give `lifting-tracker/src/core/units.js` a dedicated unit test. No test file imports it directly today (`grep "core/units.js" lifting-tracker/test` finds nothing).

## User requirements

- Small and low risk: a test-only change. No runtime app file changes, so no `sw.js` VERSION bump.
- Synthetic values only. Tests run with `cd lifting-tracker && node --test`.
- If a test exposes a real bug in `units.js`, report it as a finding; fixing it is out of scope for this task.

## Known constraints

- Plain JS ES modules, `node:test` and `node:assert/strict`, matching the style of existing files in `lifting-tracker/test/core/`.
- The working tree holds unrelated uncommitted edits (other tasks). The allowlist must avoid them.
- Do not pass a directory to `node --test` (AGENTS.md, Commands).

## Relevant paths

- `lifting-tracker/src/core/units.js` (module under test)
- `lifting-tracker/test/core/calculations.test.js` (style reference)
- Callers of `units.js` in `lifting-tracker/src/` (to judge which behaviours matter)
