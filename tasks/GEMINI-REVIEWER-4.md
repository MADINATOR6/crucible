# GEMINI-REVIEWER-4: complete the Gemini-protected list; -Reviewer never overrides a stop route

Owner: claude (implements). Source: automated security review of the GEMINI-REVIEWER push (2dbc37e), two medium findings. Approved under the user's chat instructions ("push what needs to be pushed and merge what needs to be merged", "follow the recommendations"). Gemini authored none of it and may not review it.

## Findings and decisions
- Protected list incomplete. Added the files that route, gate or launch Gemini or tell it how to work: `ccx/` (was `ccx/policy.json`), `scripts/ccx.ps1`, `scripts/ccx-ops.ps1`, `.gemini/`, `.agy/`, `.geminiignore`, `HANDOFF.md`. Not adopted: all of `policy.agentProtectedPaths` (it holds `scripts/`, which would bar Gemini from every test-script review); marked with a `ponytail:` comment.
- `-Reviewer gemini` overrode any route. It now keeps the refusal of a `surface` or `premium` route and stands in only for `worker`, `cheap`, `script` or `defer` (Codex out, its purpose).

## Write allowlist
`scripts/ccx-core.ps1`, `scripts/codex-dispatch.ps1`, `scripts/test-ccx.ps1`, `scripts/test-codex-dispatch.ps1`, `AGENTS.md`, `CLAUDE.md`, `tasks/GEMINI-REVIEWER-4.md`.

## Done When
- test-ccx GR-C3: each new protected path (case variants included) blocks Gemini; `scripts/test-ccx.ps1` stays eligible.
- test-codex-dispatch GR-D4: a research task whose owns overlap its lead session routes to `surface`, and `-Reviewer gemini` exits 8 with that route and never starts agy.
- `ccx verify -TaskId GEMINI-REVIEWER-4` passes; an independent verifier (Codex, or the ccx-reviewer agent while Codex is out) checks the diff.
