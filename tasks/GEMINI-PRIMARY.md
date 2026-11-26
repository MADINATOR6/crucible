# GEMINI-PRIMARY: Gemini becomes a primary worker beside Claude and Codex

User request (2026-11-26, chat): promote Gemini from fallback-only to a first-class primary worker, keep every verification and isolation guarantee, Codex unavailable (usage limit), Gemini read-only advisory, Claude sole implementer, human reviews. User decisions on the inspection's discrepancies: the verifier rule is enforced in the kernel as a union ("Kernel union"), and `providers.gemini.use` stays `["fallback"]` because no code reads a "primary" value ("Skip it").

Inspection: Gemini (agy plan mode, writes denied) in `handoffs/GEMINI-PRIMARY-inspection.md`; Claude re-checked every load-bearing claim and found one more: a type's `verification` list replaces its class list (`scripts/ccx-core.ps1` `Get-CcxVerification`).

## Write allowlist
`ccx/policy.json`, `scripts/ccx-core.ps1`, `scripts/test-ccx.ps1`, `AGENTS.md`, `CLAUDE.md` (the repo's symmetry rule requires it with AGENTS.md), `BOOTSTRAP.md`. Not `Status/`.

## Changes
1. `ccx/policy.json` `taskTypes`: `implement`, `refactor`, `docs` default to `agent: "gemini"`; each gets `addVerification: ["cross-model-review"]`. `codexRole` stays on implement/refactor so Codex-owned tasks keep their role. `source-research`, `creative`, `ux-review` unchanged. Tiers unchanged. Fix the stale `providers.gemini.note` wording (shell denied) to match UPGRADE-3.
2. `scripts/ccx-core.ps1` `Get-CcxVerification`: a type's `addVerification` is added to its class list (the existing `verification` key keeps its replace meaning, which `verify` relies on). So every Gemini-led task, routine included, needs `task review` by someone other than its owner before `task done`; complex and critical keep independent-verifier and human-approval.
3. `AGENTS.md` "Gemini as primary worker" section; matching line in `CLAUDE.md`; `BOOTSTRAP.md` default for new repos.

## Done When
- [Claude] `ccx route -Type implement|refactor|docs` resolves gemini with class-tier models; `source-research|creative|ux-review` unchanged; an owner of claude or codex still wins.
- [Claude] scratch task `-Owner gemini` routes to gemini; `ccx verify` deterministic result shown; `task done` refused without a non-owner review.
- [Claude] `scripts/test-ccx.ps1`, `scripts/test-ccx-ops.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/test-crucible.ps1` exit 0.
- [Human] reviews the diff and approves; Claude does not self-approve, Gemini does not review.

## Known gaps (Codex at its limit)
`review` of Claude-authored work resolves to Codex (`ccx-core.ps1` cross-model branch); `verify` and `research` (Codex's planner route) default to Codex; the launcher needs `codex.cmd` on PATH even for Gemini runs. Left in place, documented.
