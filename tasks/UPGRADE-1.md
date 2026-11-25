# UPGRADE-1: control-plane fixes (baseline, transient retry, Gemini fallback, symmetry)

Mode: Codex plans (report in `C:\Users\Madison\codex-captures`, plan dispatch 2026-11-26 on 73920a7), Claude implements. Tests first: UPGRADE-1T (Codex, test files) then UPGRADE-1 (Claude, source). Both verified, reviewed and closed together. Audit: `handoffs/UPGRADE-friction-audit.md`.

## Write allowlist
- UPGRADE-1T (Codex): `scripts/test-ccx.ps1`, `scripts/test-ccx-ops.ps1`, `scripts/test-codex-dispatch.ps1`.
- UPGRADE-1 (Claude): `scripts/ccx-core.ps1`, `scripts/ccx-ops.ps1`, `scripts/codex-dispatch.ps1`, `ccx/policy.json`.
- Later, UPGRADE-1M (Codex, after both close): TEMP fallback in `scripts/test-ccx.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/test-crucible.ps1`, `.gitignore`.
- Docs (Gemini draft, Claude applies in one commit): `AGENTS.md`, `CLAUDE.md`, including item 6.

## Requirements and decisions
1. **Baseline at `task add`.** Record unrelated dirty paths (not owned) for the current checkout key at `task add`; task stays `planned`. `task start`/dispatch in the same checkout keep that snapshot; first start in another worktree takes that worktree's own. Direct `ccx verify` on a never-started task uses it. Pre-add dirt passes scope; a file dirtied after add fails. Legacy tasks without a baselines map keep the old diagnostic.
2. **Transient provider failure → exit 4, no attempt used.** Terminal capacity errors ("at capacity", "overloaded") or a provider HTTP 5xx in Codex's own error events or the provider's stderr: exit 4, the implement attempt is refunded, outputs and captures kept. It does **not** set `agents.codex.unavailableUntil` or `providerLimits` (no fake quota reset). A recovered 5xx followed by a completed turn, or an ordinary failure, still counts. Decision: board/event wording for exit 4 stays as is (out of scope; `scripts/crucible.ps1` not in allowlist).
3. **Codex-out fallback uses the class-tier Gemini model.** When the route falls back to the `gemini` provider, model = `classes.<class>.geminiModel` (same selection as Gemini-owned work), not `providers.gemini.model`. Owner unchanged. Gemini blocked → next eligible fallback or `defer`; no loop. Health: an `auth: account` provider skips the env-key branch; when its command exists, report PASS with `<command> --version` output and `sign-in unknown` (agy has no non-interactive status command; never `-p`, never a permission-bypass flag). `agentShell` stays `[]`.
4. (UPGRADE-1M) see allowlist.
5. **Symmetry verify stage.** A built-in stage fails when the checkout's uncommitted changes (staged or not, vs HEAD) touch exactly one of `AGENTS.md`, `CLAUDE.md`; passes when both or neither change. Decision (Size check): no commit-range or staged-only analysis; verify runs before the commit.
6. Already clean in code; doc note only.

## Done When
- [Codex] UPGRADE-1T: failing tests for 1, 2, 3a, 3b, 5 as named in the plan, each red at the intended assertion on the pre-fix source.
- [Claude] Tests reviewed against this file once; then frozen.
- [Claude] UPGRADE-1: the four suites exit 0: `scripts\test-ccx.ps1`, `scripts\test-ccx-ops.ps1`, `scripts\test-codex-dispatch.ps1`, `scripts\test-crucible.ps1` (policy `verify.stages`). Cap: 2 implement cycles.
- [Codex] `-Role verify -Sandbox workspace-write` tries to break the diff: wrong baseline, real failure misread as transient, provider fallback loop.
- [Claude] `ccx verify`, `task review -By codex`, `task done` for both tasks.

## Stop conditions
A test that contradicts this file goes back to Codex with output and spec line. Two failed implement cycles: stop and ask the user. Codex exit 4: Gemini takes Codex's step (log the switch in MEMORY.md).
