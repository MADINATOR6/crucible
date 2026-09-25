# MEMORY.md

Operating state for autonomous sessions on this repo. Read first every session. Cap 400 lines; archive old entries to MEMORY-ARCHIVE.md.

## Current state
- Project: claude-codex-collab (Claude Code + Codex workflow template)
- Last task commit: 3bfe4f5 (session start, fast-forwarded from origin)
- Task: T0 bootstrap operating state
- Status: in-progress

## Task queue
Derived 2026-09-25 from the repo's open items and the gaps between this template and the user's autonomous operating prompt. There was no queue before.
- [ ] T0 [normal] Create MEMORY.md with this queue.
- [ ] T1 [complex] Audit the template: launcher bugs, rule contradictions, rules that would cause real failures. Adversarially verify every finding; confirmed ones become fix tasks.
- [ ] T2 [complex] Fix confirmed launcher defects (scripts/codex-dispatch.ps1) through Codex Dispatch, then a read-only Codex verifier pass.
- [ ] T3 [frontier] Make the workflow docs support long unattended sessions (state file, stop report, verifier/researcher dispatch, usage-limit pivot) without raising per-session token cost. Design panel first.
- [ ] T4 [normal] Pilot the updated template end to end in a throwaway repo; record tokens and friction.
- [ ] T5 [normal] Docs consistency pass (README, BOOTSTRAP file lists).
- [ ] T6 Stop: HANDOFF-REPORT.md, final checkpoint, self-critique.

## Decisions log
- 2026-09-25 | HANDOFF.md is this repo's handoff contract; no separate HANDOFF-CONTRACT.md | HANDOFF.md already holds the launcher, implementer instruction, report format and sandbox limits; a second file would duplicate it | -
- 2026-09-25 | No OneDrive mirror sync for this repo | `%OneDrive%\AgentWorkspace` has only claude-codex-template; creating a new mirror is outside the task | -
- 2026-09-25 | Commits carry no trailer | User's operating prompt: no trailer, no Co-Authored-By | -
- 2026-09-25 | Codex may edit scripts/ under a TASK.md allowlist; Claude edits workflow docs | HANDOFF.md forbids Codex from editing AGENTS.md, CLAUDE.md, HANDOFF.md, .codex/ | -

## Open questions
- Delete merged remote branch `origin/claude/laptop-efficiency-tasks-6598uz`? | User decision (remote deletion) | no
- Should `prompts/laptop-efficiency.md` live in this template repo? | User decision | no

## Research findings
- codex-cli 0.156.1 installed at `%LOCALAPPDATA%\Programs\nodejs\codex.cmd` | `codex.cmd --version` | 2026-09-25
- Last dispatch stderr showed `Reading additional input from stdin...`: codex exec reads stdin when it is not a TTY | `%USERPROFILE%\codex-captures\codex-c92f...stderr.log` | 2026-09-25
- The local folder `claude-codex-template` is the powerlifting-tracker repo, not this template | `git remote -v` | 2026-09-25

## Known failure modes
- Codex usage limit mid-task: edits land, no report | Rate limit | Review the diff and run checks yourself; pivot to non-Codex work until reset (powerlifting HANDOFF-REPORT.md, 2026-09-24)
- Built-in browser pane cannot register service workers | Environment | Use headless Chrome for SW checks

## Checkpoint (auto-updated)
- 2026-09-25 13:12 +10:00: session start; HEAD 3bfe4f5; T0 in progress. Session stop deadline 17:10 (240 min).
