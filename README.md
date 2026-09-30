# claude-codex-collab

A lightweight workflow template for running Claude Code and Codex on the same repository: clear roles, no overlapping edits, token-efficient handoffs, and safe long unattended sessions.

| File | Purpose |
|---|---|
| `AGENTS.md` | Shared rules for both agents: roles, modes, routing, token efficiency, Git safety, unattended sessions. Codex reads it natively. |
| `CLAUDE.md` | Imports AGENTS.md and adds Claude's handoff duties. |
| `HANDOFF.md` | The handoff contract: Dispatch launcher and exit codes, Codex implementer, verifier and researcher instructions, report format, parallel-mode rules. |
| `TASK.md` | Per-task spec: mode, goal, write allowlist, Done When, verification, stop conditions. |
| `scripts/codex-dispatch.ps1` | One-command Dispatch launcher: roles, closed stdin, timeout, single-writer lock, usage-limit detection, token usage, report. |
| `scripts/sync-mirror.ps1` | Refreshes the read-only OneDrive copy from committed files only. |
| `ccx/policy.json` | OMNIROUTE policy: models, effort ladder, task classes and budgets, routing, permission levels, runtime, redaction, verify stages, MCP scopes. |
| `ccx/ARCHITECTURE.md` | How the control plane works: routing, approvals, verification, runtime, memory, worktrees, recovery, rollback. |
| `scripts/ccx.ps1`, `scripts/ccx-core.ps1`, `scripts/ccx-ops.ps1` | The ccx control plane CLI: tasks and ownership, route, gate and approvals, events and tick, verify, worktrees, health, status. |
| `.claude/agents/ccx-*.md` | Scoped Claude subagents: a cheap read-only scout and an independent reviewer, neither with MCP tools. |
| `tasks/` | One spec per task when several Dispatch tasks run at once. |
| `handoffs/` | One note per parallel-mode handoff, from `TEMPLATE.md`. |
| `FRICTION.md` | Log of real workflow friction. |
| `.codex/config.toml` | Codex reasoning effort (medium). |
| `BOOTSTRAP.md` | Instructions for applying this template to a repo. Not copied. |
| `MEMORY.md`, `HANDOFF-REPORT.md` | This repo's own unattended-session state and last stop report. Not copied. |
| `scripts/test-*.ps1` | Regression tests for the two scripts (fake Codex, fake OneDrive). Not copied. |
| `prompts/` | Standalone prompts to paste into Claude Code. Not copied. |

## Two modes

- **Dispatch (default):** Claude plans in TASK.md, launches Codex from HANDOFF.md, verifies and commits. Codex never commits. The same launcher runs Codex as a read-only verifier or researcher (`-Role verify|research`).
- **Parallel:** both tools work at once on separate tasks in separate worktrees and branches (`claude/*`, `codex/*`), hand off committed work via `handoffs/`, and Claude merges.

## Control plane (optional)

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 status` shows the Master Computer view. `... ccx.ps1 health` checks the stack. `ccx/ARCHITECTURE.md` explains the rest.

What ccx does:
- **Routing:** picks the model and effort for each task (OMNIROUTE); deterministic work never goes to a model.
- **Ownership:** keeps tasks from editing the same files.
- **Limits:** enforces budgets and retry caps.
- **Completion:** refuses to mark work done without verification and a review by the other model.
- **Approvals:** holds pushes and other consequential actions for your approval.

## Use

Open the target repo in Claude Code and say: "Follow `<path to this repo>/BOOTSTRAP.md` for this repo." Then open it once in Codex and trust the folder.

## Test the template

From this repo's root (Windows PowerShell 5.1; never calls the real Codex or touches the real OneDrive):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-codex-dispatch.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-sync-mirror.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx-ops.ps1
```

The ccx suites use a private temp state, never the real one.

The mirror test skips its junction case on hosts that forbid creating junctions.
