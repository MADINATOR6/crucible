# GEMINI-REVIEWER: Gemini as reviewer and verifier, never of its own routing (+ Higgsfield for Antigravity)

Owner: claude (implements). Plan: Codex (`handoffs/GEMINI-REVIEWER-plan.md`, gpt-6.2-astra, 2026-11-28). Reviewer: Codex. Approved by the user in chat on 2026-11-27 ("4. do this", "5. do this"). Gemini authored none of it.

## Plan critique (Claude, HANDOFF.md Plan critique)
- Accepted: explicit `-Reviewer gemini` for `-Role verify|research` with `-TaskId`; one eligibility function used at dispatch (intentional and quota fallback), at `task review` recording and at `task done`; a prohibited fallback defers instead of running; `codex.cmd` lookup moves after provider resolution; HANDOFF's `-By codex` example names the reviewing provider.
- Simplified: no committed-review-range tracking. ccx's scope stage already refuses changes outside a task's `owns`, so a task whose `owns` avoids the protected files cannot have changed them. Eligibility = owner is not gemini, no recorded gemini implementation dispatch, and `owns` does not overlap the protected list (whole files, case-insensitive, parents included via `Test-CcxPathOverlap`).
- Added: Higgsfield joins `.agents/plugins/crucible-tools/mcp_config.json` together with a launcher deny `mcp(crucible-tools_higgsfield/*)` in every agy settings file, turbo included (moved here from GEMINI-TOOLS).

## Protected subjects (Gemini may not review or verify)
`ccx/policy.json`, `scripts/codex-dispatch.ps1`, `scripts/crucible.ps1`, `scripts/ccx-core.ps1`, `GEMINI.md`, `.agents/`, `AGENTS.md`, `CLAUDE.md`.

## Write allowlist
`scripts/ccx-core.ps1`, `scripts/codex-dispatch.ps1`, `scripts/test-ccx.ps1`, `scripts/test-codex-dispatch.ps1`, `HANDOFF.md`, `AGENTS.md`, `CLAUDE.md`, `.agents/plugins/crucible-tools/mcp_config.json`, `EXTERNAL-TOOLS.md`, `tasks/GEMINI-REVIEWER.md`, `handoffs/GEMINI-REVIEWER-plan.md`.

## Done When
- test-ccx: GR-C1 (Gemini review and verifier rows satisfy their gates on safe Claude/Codex-owned tasks), GR-C2 (both kinds refused for Gemini-owned or Gemini-implemented subjects; a historical self-verifier row cannot satisfy `done`), GR-C3 (protected owns detected: each file, a parent folder, case variation; an unrelated path stays eligible).
- test-codex-dispatch: GR-D1 (explicit Gemini verify/research runs fake agy read-only in plan mode, provider recorded, no implementation attempt spent), GR-D2 (explicit and fallback runs on a protected subject refuse/defer before any child starts; invalid combinations fail), GR-D3 (no `codex.cmd` on PATH: a Gemini run succeeds, a Codex run reports the missing CLI), and the Higgsfield deny appears in both normal and turbo agy settings.
- `ccx verify -TaskId GEMINI-REVIEWER` passes; Codex reviews the diff.

## Stop conditions
Stop if GEMINI-ACCESS-1 has not closed (ownership overlap). Defer an individual Gemini run when its subject cannot be established.
