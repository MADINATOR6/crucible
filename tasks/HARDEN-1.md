# HARDEN-1: four small follow-ups from the GEMINI-REVIEWER-4 and CODEX-UPGRADE-1 reviews

Owner: claude (implements). Sources: the independent verifier on GEMINI-REVIEWER-4 (hardening 1-3) and Codex's CODEX-UPGRADE-1 review (hardening 1-2). The user approved in chat ("Yes, do them"). Reviewer: Codex. Gemini may not review it (it touches Gemini's routing).

## Changes
1. `scripts/ccx-core.ps1` protected list: add `.agent/`, `_agents/`, `_agent/` (agy's other customization-folder names) and `.antigravityignore`.
2. `scripts/ccx-core.ps1` router: a Codex-out `defer` is held as a flag and returned only after the session-overlap and lesson `surface` checks, so a stop always outranks a wait. While deferred, the Codex model and class-provider choice and the mythos route are skipped, as before.
3. `scripts/ccx-ops.ps1` health `codex-instructions`: match AGENTS.md's last non-blank line (its longest plain-text run, since the prompt is JSON), not its last heading.
4. `scripts/codex-dispatch.ps1`: a usage limit is judged by the error that ended the run plus the last stderr line, as transient failures already are. With no ending error at all, every stderr line still counts.

## Write allowlist
`scripts/ccx-core.ps1`, `scripts/codex-dispatch.ps1`, `scripts/ccx-ops.ps1`, `scripts/test-ccx.ps1`, `scripts/test-codex-dispatch.ps1`, `AGENTS.md`, `CLAUDE.md`, `tasks/HARDEN-1.md`.

## Done When
- test-ccx: GR-C3 blocks the four new paths; a delegated task overlapping its lead session routes to `surface` while Codex is out (not `defer`); the plain Codex-out route still defers.
- test-codex-dispatch: an earlier quota warning followed by an unrelated `turn.failed` exits 1, prints no `USAGE LIMIT:` and leaves Codex available; existing quota cases still exit 4.
- `ccx health` codex-instructions PASS on this machine; `ccx verify -TaskId HARDEN-1` passes; Codex reviews the diff.
