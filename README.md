# claude-codex-collab

A lightweight workflow template for running Claude Code and Codex on the same repository: clear roles, no overlapping edits, token-efficient handoffs.

| File | Purpose |
|---|---|
| `AGENTS.md` | Shared rules for both agents: roles, modes, routing, token efficiency, Git safety. Codex reads it natively. |
| `CLAUDE.md` | Imports AGENTS.md and adds Claude's handoff duties. |
| `HANDOFF.md` | Dispatch launcher, Codex implementer instruction, report format, parallel-mode rules. |
| `TASK.md` | Per-task spec: mode, goal, write allowlist, Done When, verification. |
| `handoffs/` | One note per parallel-mode handoff, from `TEMPLATE.md`. |
| `FRICTION.md` | Log of real workflow friction. |
| `.codex/config.toml` | Codex reasoning effort (medium). |
| `BOOTSTRAP.md` | Instructions for applying this template to a repo. Not copied. |

## Two modes

- **Dispatch (default):** Claude plans in TASK.md, launches Codex from HANDOFF.md, verifies and commits. Codex never commits.
- **Parallel:** both tools work at once on separate tasks in separate worktrees and branches (`claude/*`, `codex/*`), hand off committed work via `handoffs/`, and Claude merges.

## Use

Open the target repo in Claude Code and say: "Follow `<path to this repo>/BOOTSTRAP.md` for this repo." Then open it once in Codex and trust the folder.
