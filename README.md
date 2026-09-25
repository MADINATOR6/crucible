# claude-codex-collab

A lightweight workflow template for running Claude Code and Codex on the same repository: clear roles, no overlapping edits, token-efficient handoffs, and safe long unattended sessions.

| File | Purpose |
|---|---|
| `AGENTS.md` | Shared rules for both agents: roles, modes, routing, token efficiency, Git safety, unattended sessions. Codex reads it natively. |
| `CLAUDE.md` | Imports AGENTS.md and adds Claude's handoff duties. |
| `HANDOFF.md` | The handoff contract: Dispatch launcher and exit codes, Codex implementer, verifier and researcher instructions, report format, parallel-mode rules. |
| `TASK.md` | Per-task spec: mode, goal, write allowlist, Done When, verification, stop conditions. |
| `scripts/codex-dispatch.ps1` | One-command Dispatch launcher: roles, closed stdin, timeout, single-writer lock, usage-limit detection, token usage, report. |
| `handoffs/` | One note per parallel-mode handoff, from `TEMPLATE.md`. |
| `FRICTION.md` | Log of real workflow friction. |
| `.codex/config.toml` | Codex reasoning effort (medium). |
| `BOOTSTRAP.md` | Instructions for applying this template to a repo. Not copied. |
| `MEMORY.md` | This repo's own unattended-session state. Not copied. |
| `scripts/test-codex-dispatch.ps1` | Regression test for the launcher with a fake Codex. Not copied. |
| `prompts/` | Standalone prompts to paste into Claude Code. Not copied. |

## Two modes

- **Dispatch (default):** Claude plans in TASK.md, launches Codex from HANDOFF.md, verifies and commits. Codex never commits. The same launcher runs Codex as a read-only verifier or researcher (`-Role verify|research`).
- **Parallel:** both tools work at once on separate tasks in separate worktrees and branches (`claude/*`, `codex/*`), hand off committed work via `handoffs/`, and Claude merges.

## Use

Open the target repo in Claude Code and say: "Follow `<path to this repo>/BOOTSTRAP.md` for this repo." Then open it once in Codex and trust the folder.

## Test the template

From this repo's root (Windows PowerShell 5.1; never calls the real Codex):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-codex-dispatch.ps1
```
