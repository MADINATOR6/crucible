Follow HANDOFF.md, Planner instruction (it replaces the Researcher instruction for this task).

# UPGRADE-2 plan brief: Obsidian quality of life and the review pack

Codex's weekly limit is nearly spent: read only what the plan needs. Source: `handoffs/UPGRADE-ux-review.md` (Gemini, quotes checked). Claude's review of it: its item 3 is already fixed (`scripts/ccx-core.ps1:459`), so it is out.

## Goal
Plan three small changes, naming one owner per file:
A. **UX #1, new brief modal** (`.obsidian/plugins/crucible/main.js` `NewBriefModal`, `create`; `scripts/crucible.ps1` `Invoke-New` lines ~119-160): the modal also asks for the work type (the `-Type` `crucible.ps1 new` already takes; offer the types a brief may use, from `ccx/policy.json` `taskTypes` or Test-Brief's rules) and the output file (`owns:`), so a new brief can launch without hand-editing YAML. Say whether `owns` should go through a new `crucible.ps1 new -Owns` parameter or Obsidian's `processFrontMatter`; prefer the one that keeps validation in one place. Claude implements this one (judgement).
B. **UX #2, board declutter** (`scripts/crucible.ps1` `Invoke-Board` ~396-440): Board.md shows briefs first; "Other open ccx tasks (not briefs)" and raw ccx notices move to a generated `Status/Terminal.md` linked in one footer line; notices for tasks already done or abandoned are dropped. Approvals stay on Board (they need the user).
C. **Review pack**: `scripts/crucible.ps1 review-pack -TaskId <id>` writes `handoffs/<id>-review.md` holding: the diff range (task's start HEAD from its first dispatch/baseline record, or `-Base <ref>`, to HEAD), changed paths, the task file path, the HANDOFF.md Plan critique checklist, the `Untested:` lines from the task's latest report if one is recorded, and a reviewer checklist read from `Reference/Review checklist.md` (Gemini writes that file; the command must still work when it is missing). The user opens the pack in the Antigravity IDE for a blind review. It never calls `agy` or any model. Find where a task's start HEAD and latest report live in ccx state or `Status/.runs/`; if no start HEAD is recorded, say so and require `-Base`.

B and C share `scripts/crucible.ps1`: plan them as one Codex implement task. A touches `main.js` (Claude) and possibly `crucible.ps1`: if so, sequence it after B+C, or keep A inside main.js only.

Tests: `scripts/test-crucible.ps1` (policy verify stage `tests-crucible`). Name new cases per change, with what each asserts. No test can drive Obsidian: say what Claude checks by hand for A (NEEDED).

Out of scope: Gemini's items 3, 4, 5; `ccx/policy.json`; any `agy` invocation.

Give the plan per HANDOFF.md, Planner instruction.
