# Project

Not set. When this template is applied to a real repository, fill Project, Stack, Folder Map and Commands from verified inspection only.

# Stack

Not set.

# Folder Map

Not set. Workflow files: `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`, `TASK.md`, `FRICTION.md`, `MEMORY.md` (unattended sessions only), `handoffs/`, `scripts/codex-dispatch.ps1`, `.codex/`.

# Commands

Not set. Add a dev, test, lint, typecheck or build command only after it has run successfully in this repo. Never invent one.

# Windows

In PowerShell, always call `codex.cmd`, `npm.cmd` and `npx.cmd`, never plain `codex`, `npm` or `npx`. The execution policy and Codex's sandbox block the `.ps1` launchers that plain names resolve to. Keep sandbox protections intact.

Windows PowerShell 5.1 reads UTF-8 files without a BOM as ANSI and writes a BOM with `-Encoding utf8`, which corrupts characters like `→` and `–`. Edit text files with the agent's file-editing tools, not `Get-Content`/`Set-Content` round-trips.

# Mobile Sync

- Phone and iPad see a one-way, read-only copy of this repo in OneDrive: `%OneDrive%\AgentWorkspace\<repo folder name>`. It excludes `.git`, `node_modules`, `.env*`, `*.pem` and `*.key`.
- Edit files only in this repo, never in the OneDrive copy.
- After each commit to the base branch, Claude or the user refreshes the copy. Run it only from the base-branch checkout, never from a task worktree. Codex's sandbox may not be able to write to OneDrive. Exit codes 0–7 mean success:
  `$r = (git rev-parse --show-toplevel) -replace '/','\'; if ($env:OneDrive) { robocopy $r "$env:OneDrive\AgentWorkspace\$(Split-Path -Leaf $r)" /E /XD .git node_modules /XF .git .env* *.pem *.key /NFL /NDL /NJH /NJS /NP }`
- Never copy secrets or confidential data. If the working tree contains any, do not run the command.

# Roles

- **Claude Code:** planning, ambiguous or cross-cutting design, TASK.md, risky-diff review, final acceptance, commits to the base branch, push, mirror sync.
- **Codex:** implementation of well-specified tasks, independent verification and research (read-only roles in HANDOFF.md), running checks, reporting evidence.
- Either may do trivial tasks directly. Never have both solve the same problem.

# Modes

Pick one per task. Record the task once: in the task file (default TASK.md) for Dispatch, in the handoff note for Parallel (do not edit TASK.md on task branches). All commit and push steps anywhere in this file follow the selected mode's ownership.

- **Dispatch (default):** Claude writes the task file and launches Codex with the launcher in HANDOFF.md. Codex edits the working tree only: no staging, commits, branches or worktrees. Claude verifies and commits.
- **Parallel:** the user runs both tools at once on separate tasks. Each works in its own worktree on its own branch (`claude/<task>`, `codex/<task>`), commits only there, never to the base branch, and never edits files the other task owns. Hand off only committed work, with a note in `handoffs/` (see HANDOFF.md). Claude reviews and merges; the user may assign review the other way.

# Routing

- Trivial (typo, rename, formatting, tiny isolated change): one agent → change → targeted check → commit by the mode's commit owner. No plan.
- Normal and clear: short task spec (goal, write allowlist, Done When, stop conditions) → Codex implements → verify → commit.
- Complex or ambiguous: Claude plans → task spec → Codex implements → verify → commit.
- Risky (see Risky Changes): as complex, plus Claude reviews the task spec, the diff, changed files and relevant tests → fix → final verification → commit.

# Token Efficiency

- Read AGENTS.md, then only the files the task needs. Search before reading; read ranges, not whole large files.
- Reference paths; never paste files, full diffs or long logs into prompts, handoffs or reports. Trim logs to the relevant errors.
- Hand over only goal, paths, constraints, out-of-scope, acceptance criteria and verification. Never reasoning history.
- Do not plan obvious tasks, delegate trivial ones, or re-derive what TASK.md or a handoff already states.
- Targeted checks first, broad suites only when the change warrants it. Review diffs, not the whole repo.
- Stop when acceptance criteria are met. Reports: outcome, evidence, open items. No narration.

# Effort

- Claude: medium effort for routine work; high for architecture, ambiguous requirements, important planning, risky or security review, and cross-cutting debugging. Change effort mid-session rather than starting a new session.
- Codex: default coding model at medium reasoning. High when one reasonable attempt failed, debugging is hard, several systems interact, or being wrong is costly. Never above high by default. `.codex/config.toml` sets medium once the folder is trusted; otherwise pass `-c model_reasoning_effort=medium`.

# Scope

- Make the smallest correct change. No unrelated refactors, renames, reorganisation or cleanup.
- Do not modify files outside the task's write allowlist.
- Inspect files, config, scripts, tests and Git state before assuming. Never invent commands, paths, APIs, behaviour or business rules.
- Preserve existing architecture unless the task requires changing it.

# Tasks and Progress

- One task at a time; clear context between unrelated tasks unless working through an unattended queue.
- Track every acceptance criterion and tick it off as it is done. Before ending a turn, continue with open items or name what blocks them. A progress update is not completion.

# Git and Working Tree

- Run `git status` and read recent `git log` before significant work. Never assume existing changes belong to your task.
- Never overwrite, revert, discard or commit unrelated changes. Isolate your task's changes.
- Verify, then commit one coherent logical change.
- Never run `git reset --hard`, `git clean`, blanket `git checkout`/`restore`, or force-push over others' work.
- TASK.md may be overwritten per task after checking it holds no uncommitted manual edits. Commit it before dispatch or with the task it describes.
- Commit messages carry no trailers (no Co-Authored-By).

# Failure Handling

Verification fails → diagnose → one focused repair → verify again. Fails again → stop; undo only this task's own edits (edit them back; `git restore -- <path>` only for paths with no pre-existing edits; never reset or clean), or escalate to higher effort or planning. Undo the same way at once if the approach is wrong or regressions spread.

# Dependencies

- Use existing capabilities first. Add a dependency only when justified, compatible, maintained and established.
- No unrelated upgrades. Broad upgrades are their own task.

# Security

- Never expose, paste into prompts, or commit secrets, credentials, private keys, or confidential user data.
- Never weaken security or validation to make a check pass.
- Do not edit generated or vendored files unless the task requires it.

# Risky Changes

Authentication, authorisation, payments, sensitive or user data, database schema or migrations, destructive operations, security-sensitive code, important business logic, concurrency or state consistency, infrastructure or deployment, major dependencies, production-facing external API behaviour.

# Uncertainty

If something material is unverified, report UNKNOWN (what is uncertain), CHECKED (what was inspected) and NEEDED (what would resolve it). Do not guess.

# Friction

Log real friction in FRICTION.md: date, symptom, cost, fix proposal, count. Count 1: log only. Count 2: observe. Count 3+, or one costly failure (lost work, a blocked session): make the simplest justified fix. If FRICTION.md is outside your write allowlist or another task owns it, put the friction in your report or handoff note instead.

# Unattended Sessions

- MEMORY.md holds a long session's state: task queue, decisions, findings, failure modes, checkpoints. Claude reads it first and updates it at every task boundary. Its `Last task commit` is the newest commit that finished a task; plan and state commits may follow it.
- Chain queued tasks, one at a time. Launcher exit 4 (Codex usage limit): note the reset time if given, otherwise UNKNOWN, and do non-Codex work meanwhile.
- When stopping, Claude writes HANDOFF-REPORT.md: state, anything MEMORY.md lacks, exact next steps.

# Definition of Done

- Requested behaviour works and appropriate verification passes with evidence.
- No known regression; scope respected.
- Risky work received a Claude diff review.
- Handoff or report written if another agent or the user continues the work.
