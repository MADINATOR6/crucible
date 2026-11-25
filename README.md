# Crucible

A lightweight workflow template for running coding agents on the same repository (Claude Code and Codex today, other models and external tools as they are adopted): clear roles, no overlapping edits, token-efficient handoffs, and safe long unattended sessions.

| File | Purpose |
|---|---|
| [AGENTS.md](AGENTS.md) | Shared rules for both agents: roles, modes, routing, Git safety and unattended sessions. Codex reads it natively. |
| [CLAUDE.md](CLAUDE.md) | Imports AGENTS.md and adds Claude's handoff duties. |
| [HANDOFF.md](HANDOFF.md) | Handoff contract: planning, dispatch, verification, report format and parallel-mode rules. |
| [TASK.md](TASK.md) | Fallback task spec when the launcher has neither an explicit `-TaskFile` nor a registered task file. |
| `scripts/codex-dispatch.ps1` | One-command Dispatch launcher: roles, closed stdin, timeout, single-writer lock, usage-limit detection, token usage, report. |
| `scripts/sync-mirror.ps1` | Refreshes the read-only OneDrive copy from committed files only. |
| `ccx/policy.json` | OMNIROUTE policy: models, effort ladder, task classes and budgets, routing, permission levels, runtime, redaction, verify stages, MCP scopes. |
| [ccx/ARCHITECTURE.md](ccx/ARCHITECTURE.md) | Control plane command examples, routing, approvals, verification, worktrees and recovery. |
| `scripts/ccx.ps1`, `scripts/ccx-core.ps1`, `scripts/ccx-ops.ps1` | The ccx control plane CLI: tasks and ownership, route, gate and approvals, events and tick, verify, worktrees, health, status. |
| `.claude/agents/ccx-*.md` | Scoped Claude subagents: a cheap read-only scout and an independent reviewer, neither with MCP tools. |
| [tasks/](tasks/) | Named task specs with write allowlists, acceptance criteria and verification commands. |
| [handoffs/](handoffs/) | Parallel handoff notes and the [handoff template](handoffs/TEMPLATE.md). |
| [Crucible monitor](tools/crucible-monitor/README.md), [Crucible cockpit](tools/crucible-cockpit/README.md) | Local dashboards for monitoring work and handing it off. |
| `FRICTION.md` | Log of real workflow friction. |
| `.codex/config.toml` | Codex reasoning effort (medium). |
| [BOOTSTRAP.md](BOOTSTRAP.md) | Set up the workflow in another repository. |
| [EXTERNAL-TOOLS.md](EXTERNAL-TOOLS.md) | Optional integrations, prerequisites and checks. |
| [MEMORY.md](MEMORY.md), [HANDOFF-REPORT.md](HANDOFF-REPORT.md) | Unattended-session checkpoints and stop reports. |
| `scripts/test-*.ps1` | Regression suites for dispatch, mirror sync, ccx and optional integrations. |
| `prompts/` | Standalone prompts to paste into Claude Code. Not copied. |

## Two modes

- **Dispatch (default):** Claude writes the spec, implements, verifies and commits. For complex, ambiguous or risky code tasks, Codex plans first and Claude critiques the plan before writing the spec. Codex reviews through the launcher. See [the Dispatch sequence](HANDOFF.md#codex-plans-claude-implements-default-for-code-tasks-since-2026-11-01).
- **Parallel:** both tools work at once on separate tasks in separate worktrees and branches (`claude/*`, `codex/*`), hand off committed work via `handoffs/`, and Claude merges.

## Control plane (optional)

From the repo root, `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 help` lists commands. Use `status` for the task and worktree overview or `health` for stack diagnostics. When the runtime is enabled, `status` can process queued events. See [the everyday ccx flow](ccx/ARCHITECTURE.md#3-everyday-flow).

What ccx does:
- **Routing:** picks the model and effort for each task (OMNIROUTE); deterministic work never goes to a model.
- **Ownership:** keeps tasks from editing the same files.
- **Limits:** enforces budgets and retry caps.
- **Completion:** refuses to mark work done without verification and a review by the other model.
- **Approvals:** holds pushes and other consequential actions for your approval.

## Use

Open the target repo in Claude Code and say: "Follow `<path to this repo>/BOOTSTRAP.md` for this repo." Then open it once in Codex and trust the folder.

## Obsidian and Gemini

Open the repository folder as an Obsidian vault and start from [Start Here](<Start Here.md>). On Windows, check the Antigravity CLI with `& "$env:USERPROFILE\.local\agy\bin\agy.exe" --version`. Gemini-owned briefs use your Google AI Pro sign-in and Antigravity's file tools. Crucible runs the permitted follow-up checks and records the results in Obsidian.

## Test the template

From this repo's root (Windows PowerShell 5.1; never calls the real Codex or touches the real OneDrive):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-codex-dispatch.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-sync-mirror.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx-ops.ps1
```

The ccx suites use a private temp state, never the real one.

If sandboxed worktree cases in `test-ccx-ops.ps1` report `Worktree exceeds the safe field limit`, rerun with a shorter writable `TEMP` path for that PowerShell process. The timeout case needs a session that can terminate its test process tree.

The mirror test skips its junction case on hosts that forbid creating junctions.
