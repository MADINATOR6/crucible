# UPGRADE-3: Gemini (Antigravity) gets Claude/Codex-level access in Crucible

User decision (2026-11-26, chat): "Make sure Gemini/Antigravity doesnt get blocked in crucible and can access it just like claude and codex", "So it can actually do real work alongside claude and codex", "make sure it has full access/bypass permissions "Turbo mode" just like claude and codex". This overrides the earlier master-prompt guardrails "never pass --dangerously-skip-permissions, keep agentShell: []" for agy runs.

Owner: Claude (Codex at its weekly limit until about 21:10; Codex verifies afterwards, UPGRADE-CODEX-VERIFY). Risk: high (security-sensitive launcher code): Gemini adversarial review now, Codex verify after the reset.

Probe evidence (scratchpad agy-probe, gemini-3.8-flash-low, agy 1.5.17): with `enableTerminalSandbox`, a relative deny path (`write_file(scripts/)`) makes every shell command fail ("sandbox configuration error: deny scripts/: non-absolute file path"); with absolute deny paths, commands run but the sandbox denies all writes (inside and outside the workspace) and network (DNS fails); `git status` works. So agy's sandbox = Codex's read-only sandbox.

## Write allowlist
`scripts/codex-dispatch.ps1`, `scripts/crucible.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/test-crucible.ps1`, `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`.

## Requirements
1. **Shell on (normal runs).** agy runs with a `-TaskId` get `command(*)` allowed inside agy's terminal sandbox (read-only, no network). The prompt tells Gemini to use the shell for git, search and reading, make edits with file tools, and report commands that need writes (tests, builds) as NOT RUN.
2. **Absolute deny paths.** Every agy `write_file(...)` deny is the absolute path under the run's checkout (directories end with a separator), so the sandbox accepts it.
3. **Owned-path parity.** A protected path the task owns (or a protected folder containing a path it owns) is not denied, for agy and for headless Claude (`--disallowedTools`); the after-run protected-hash check ignores the task's owned paths and still flags any other protected change (exit 9). Obsidian briefs still cannot own the launcher stack (`Test-Brief` unchanged).
4. **Turbo.** `-Sandbox danger-full-access` on an agy run passes `--dangerously-skip-permissions`, drops `--sandbox`, sets `enableTerminalSandbox` and `allowNonWorkspaceAccess` true/false accordingly, and tells Gemini it may run the task's tests and builds. It needs the same per-dispatch `codex-full-access` approval as Codex full access (existing gate). Protected-path denies for unowned paths and the hash check stay.
5. No change for Codex runs; `useG1Credits` stays false (no AI-credit purchases).

## Done When
- [Claude] `scripts/test-codex-dispatch.ps1` and `scripts/test-crucible.ps1` exit 0, with cases for: shell allowed + absolute denies (normal), turbo flags only under danger-full-access with approval, owned protected path not denied and not flagged, unowned protected change still exit 9.
- [Claude] one live agy run on a throwaway task shows shell works (git status) in a normal run.
- [Gemini] adversarial review; [Codex] verify after reset.
