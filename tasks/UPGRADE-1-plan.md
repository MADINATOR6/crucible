Follow HANDOFF.md, Planner instruction (it replaces the Researcher instruction for this task).

# UPGRADE-1 plan brief: six control-plane fixes

Codex's weekly limit is nearly spent: keep reading to what the plan needs. Start from `handoffs/UPGRADE-friction-audit.md` (Gemini's code audit of these items, with path:line evidence) and confirm its claims rather than re-deriving them. Skip any item it shows already fixed, after checking the cited lines.

Claude's check of that audit (2026-11-26): items 1-5 match the code at the cited lines. Two corrections:
- Item 3 also needs the fallback model: `Invoke-CcxRoute`'s codex branch sets `$decision.model = $altProvider.model` (flat `providers.gemini.model`, gemini-4-neon-medium), not `classes.<class>.geminiModel`. And `ccx-ops.ps1` health tests `envKey` before honouring `auth: account`.
- Item 6: no policy or script names the slug (route already clean), but AGENTS.md and CLAUDE.md Roles mention `gpt-oss-120b-medium` as selectable via `-Model`. Only a doc note remains; no code task for item 6 unless you find a route.

## Goal
Fix the items below in the ccx control plane with the smallest change each, with a failing test written first for items 1, 2, 3 and 5.

## Requirements (from the user)
1. **Baseline for every task.** `ccx verify`'s scope stage must not fail on files that were already dirty when the task began, for tasks that are never dispatched as well as dispatched ones. Record the dirty baseline at `task add` or `task start`, not only in the dispatch launcher. FRICTION.md rows 2026-11-06, 2026-11-10, 2026-11-14.
2. **Transient provider failures are retryable.** A model "at capacity" error or a provider 5xx counts like a usage limit (exit 4): it does not count toward `maxDispatches`, and files already made stay for review. A real failure must still count. FRICTION.md rows 2026-11-05.
3. **Gemini fallback wired to agy.** When Codex is at its usage limit, the route falls back to the `gemini` provider (`cli: agy`) with the class-tier model (`classes.<class>.geminiModel`). `ccx health` reports the agy version and whether it is signed in instead of `provider-gemini not set`. No `agy -p` call from health (a version/status command only, and no `--dangerously-skip-permissions`); keep `agentShell: []`. The fallback must not loop between providers.
4. **TEMP fallback for test suites.** When `%TEMP%` cannot be written (Codex sandbox), `scripts/test-ccx.ps1`, `scripts/test-codex-dispatch.ps1` and `scripts/test-crucible.ps1` use a gitignored repo-local scratch folder. FRICTION.md row 2026-11-12 (note its finding that read-only writes nowhere; this is for `workspace-write`).
5. **Symmetry check.** A verify stage fails when a change touches AGENTS.md without CLAUDE.md, or the reverse (CLAUDE.md symmetry rule, line 1 of both files).
6. **Retiring slug.** `gpt-oss-120b-medium` (retires 2026-11-30) is not the target of any route, fallback or default.

## Ownership (for the allowlist)
- Claude implements items 1, 2, 3, 5 in `scripts/ccx-core.ps1`, `scripts/ccx-ops.ps1`, `scripts/codex-dispatch.ps1`, `ccx/policy.json` (whichever the plan needs).
- Codex writes the failing tests for 1, 2, 3, 5 first (tests-first task, test files only), then implements 4 and 6 in its own follow-up task. Name one owner per file; a file two tasks need is a sequencing decision, say which task goes first.
- Docs (AGENTS.md + CLAUDE.md, same commit) are drafted separately; list what wording changes, not the text.

## Known constraints
- Suites: `scripts/test-ccx.ps1`, `scripts/test-ccx-ops.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/test-crucible.ps1` (each slow: ~4 s per child PowerShell, FRICTION.md 2026-09-30). Verify stages in `ccx/policy.json` `verify.stages`.
- Base checkout holds unrelated untracked work (`agency/`, `tasks/AGENCY-*`, `Reference/Obsidian ribbon smoke.md`, `tasks/OBSIDIAN-RIBBON-SMOKE.md`); do not plan edits there.
- PowerShell 5.1; no new dependencies.

Give the plan per HANDOFF.md, Planner instruction, with tests named per item (case name, file, what it asserts, and why it fails at HEAD).
