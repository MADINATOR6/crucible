# GEMINI-REVIEWER: plan brief for Codex (Planner instruction, HANDOFF.md)

The user approved on 2026-11-27 ("4. do this") proposal #4 of `handoffs/GEMINI-SELF-UPGRADE-report.md` (also `handoffs/GEMINI-UPGRADE-approvals.md`): let Gemini act as a reviewer and verifier of Claude's and Codex's work, especially while Codex is at its limit, while it can never review or verify anything that touches Gemini's own routing or access. Claude implements your plan; Codex reviews the diff; Gemini authors none of it (AGENTS.md, Gemini as primary worker).

Plan only; edit nothing. Read AGENTS.md (Roles, Gemini as primary worker, Control Plane), HANDOFF.md (Planner instruction, Verifier instruction), `ccx/policy.json` (`taskTypes`, `classes[*].verification`, `providers`, `agentProtectedPaths`), `scripts/ccx-core.ps1` (`Get-CcxVerification`, task review and task done), and `scripts/codex-dispatch.ps1` (role/route handling for agy, the fallback that let Gemini review UPGRADE-3R, FRICTION.md 2026-11-26).

Questions the plan must answer:
1. How a reviewer is chosen today, and the smallest change that lets `codex-dispatch.ps1 -Role verify` (and `-Role research`) run on Gemini on purpose (e.g. `-Reviewer gemini` or a route), not only as a silent fallback.
2. Whether `ccx task review -By gemini` already counts as the cross-model review / independent verifier for a Claude- or Codex-owned task, and what must change so it does, and never for a Gemini-owned task.
3. The guard: Gemini must never verify, review or research a task whose owned paths (or diff) touch Gemini's routing or access: Gemini's entries in `ccx/policy.json`, the agy branch of `scripts/codex-dispatch.ps1`, `scripts/crucible.ps1` launch/run, `GEMINI.md`, `.agents/`, AGENTS.md's "Gemini as primary worker" section. Where is the cheapest place to enforce it so the fallback path and the intentional path both hit it? Should the fallback for verify on such a task defer instead?
4. Whether the launcher still needs `codex.cmd` on PATH for a Gemini-only run, and whether to fix that here or leave it.

Return the plan per HANDOFF.md Planner instruction: requirements, approach, exact write allowlist, Done When with test cases (ids in `scripts/test-ccx.ps1` / `scripts/test-codex-dispatch.ps1`), Verify commands from AGENTS.md Commands or `verify.stages`, stop conditions, and the `Untested:` line.
