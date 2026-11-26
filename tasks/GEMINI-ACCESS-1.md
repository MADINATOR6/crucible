# GEMINI-ACCESS-1: three approved Gemini access fixes

Owner: claude (implements). Reviewer: Codex. Approved by the user in chat on 2026-11-27: "push main to github now, and do what needs to be done in give you permission", in reply to `handoffs/GEMINI-UPGRADE-approvals.md` (items #3, #8 and the plan-mode row; #4-#6 are asked separately). Gemini did not author or approve any of this (AGENTS.md, Gemini as primary worker).

## Changes
1. **Shell in Obsidian-launched runs (#3).** `crucible.ps1 launch` starts the background run as a triggerless per-user scheduled task (`\Crucible\Run <id>`, interactive logon, limited rights) instead of WMI `Win32_Process.Create`. Under WMI, agy's sandboxed shell fails with `Access is denied.`; under a scheduled task it works (Claude's probes, 2026-11-27). The run is still outside any caller's job, so closing Obsidian does not end it. The run writes its own pid and start ticks into its run record; until then the record counts as starting (existing 60 s rule).
2. **Plan mode in read-only agy runs.** agy ignores `--mode plan` when `--disable-slash-commands` is passed (it warns so). The launcher passes `--disable-slash-commands` only when the mode is not `plan`. Writes stayed denied either way (headless agy refuses `write_file` without an allow rule); this restores the missing layer.
3. **Gemini worktrees (#8).** `ccx/policy.json` `worktrees.branchPrefix` gains `"gemini": "gemini/"`, and `ccx worktree add` accepts the `gemini` agent (`scripts/ccx-ops.ps1:443`).

## Write allowlist
`scripts/crucible.ps1`, `scripts/codex-dispatch.ps1`, `scripts/ccx-ops.ps1`, `ccx/policy.json`, `scripts/test-crucible.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/test-ccx-ops.ps1`, `AGENTS.md`, `CLAUDE.md`, `FRICTION.md`, `handoffs/GEMINI-UPGRADE-approvals.md`.

## Done When
- A probe started the new way runs `git status --short` inside agy's sandbox (live, by Claude).
- Dispatch tests: an agy read-only run gets `--mode plan` without `--disable-slash-commands`; a writable run keeps `--disable-slash-commands`.
- ccx-ops test: `worktree add -Agent gemini` creates a `gemini/` branch.
- `ccx verify -TaskId GEMINI-ACCESS-1` passes; Codex reviews the diff.

## Stop conditions
- If the scheduled task cannot be registered without admin rights on this machine, stop and keep WMI.
