# Handoff

How work passes between Claude Code and Codex. This is the handoff contract (some prompts call it HANDOFF-CONTRACT.md). AGENTS.md is authoritative for workflow; the task file (TASK.md unless the launcher names another) defines the current task's scope. Neither agent shares conversation history with the other: everything needed to continue lives in the repo.

## Dispatch mode (Claude launches Codex)

### Claude checklist
1. [ ] `git status` clean or pre-existing paths recorded; task file filled and committed-or-saved; note HEAD.
2. [ ] The task file has a task ID, write allowlist, out-of-scope list, resolved business rules, exact Verify commands, stop conditions, and each Done When item assigned to Codex or Claude.
3. [ ] Say whether temporary scripts or fixtures are allowed, and where. Synthetic data only unless the user authorised real data.

### Launcher (repo root)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\codex-dispatch.ps1
```

Options: `-Role verify` or `-Role research` (read-only sandbox unless `-Sandbox` is given; research needs `-TaskFile`); `-TaskFile <path>` for a brief other than TASK.md; `-Effort high` only when AGENTS.md's escalation rules apply; `-TimeoutMinutes <n>` (default 60); `-CaptureDir` (default `%USERPROFILE%\codex-captures`, outside the repo and OneDrive). The script passes Codex a one-line prompt naming the role's instruction below and the task file (`codex.cmd` breaks on multi-line prompts), gives it a closed stdin, prints its token usage and report, and holds a lock so only one write dispatch runs per checkout. Claude Code: run it in the background; a dispatch can outlast the shell tool's timeout. Re-check flags with `codex.cmd exec --help` after a Codex upgrade.

Exit codes: Codex's own (0 = turn completed, never acceptance); 1 refused or launcher failure (the message says why; if Codex ran, inspect the captures and the diff); 3 no report; 4 Codex usage limit (do non-Codex work; `RESETS:` gives the time when Codex states one); 5 timeout (Codex's process tree was killed); 6 another write dispatch is running.

On a nonzero exit, missing report, PARTIAL or BLOCKED: inspect the captured events, the actual diff and remaining items before resuming. If Codex stops with items open and no blocker named, re-run once with a `-TaskFile` naming only the open items; if items remain, review instead.

### After return (Claude)
Match the report's task and baseline to this run → inspect the diff for correctness and scope → resolve every non-PASS item → re-run the checks Codex marked PASS, then Claude-owned checks → deeper review if risky → commit only task-owned changes → mirror sync if used.

### Implementer instruction (Codex)

```text
Implement the task file named in the prompt. Claude owns planning, final review, commits, push and mirror sync.
1. Confirm repo root. Read AGENTS.md and the task file, then only the source the task needs. Record HEAD and initial git status. Stop before editing if the task file is empty, has no write allowlist, or overlaps pre-existing work you cannot separate.
2. Make the smallest correct change inside the write allowlist. Before writing new code, use the first of these that fully meets the task, then finish the task: no new code, code already in the codebase, the standard library, a native platform feature, an existing project dependency, or one clear line. Never trim validation, error handling or security to save code. Do not create tests, fixtures or scratch files unless the task file authorises their paths.
3. Do not stage, commit, change branches, create worktrees, push, deploy or sync OneDrive. Edit workflow files (AGENTS.md, CLAUDE.md, HANDOFF.md, MEMORY.md, FRICTION.md, .codex/, scripts/) only when the write allowlist names them; otherwise propose changes in the report.
4. Respect the sandbox. Never broaden permissions or install tools to get around a restriction; report it.
5. Ambiguous data rules, destructive behaviour, conflicting requirements or needed scope growth: stop that part, report UNKNOWN / CHECKED / NEEDED with a proposed resolution, and continue only independent work.
6. Run Codex-owned checks from Done When. A check is PASS only with evidence from this run; static reading cannot prove runtime behaviour.
7. Follow AGENTS.md Failure Handling and the task file's stop conditions; report failed checks, repair attempts and remaining blockers. Never blanket-revert pre-existing work.
8. Reply with the Report format below. No file dumps, secrets or private data.
```

### Verifier instruction (Codex)

```text
Independently try to break the work described in the task file. Claude owns fixes, commits and push.
1. Never edit, create or delete repository files. Temporary files only where the task file allows. Read AGENTS.md, the task file and the change under test (working-tree diff, or git diff from the base the task file names).
2. Run the task file's Verify commands yourself, then attack: edge cases, invalid input, failure paths, Done When items that look untested, and claims only running can prove.
3. For each problem give a reproduction (command or input, expected, observed), file:line and severity. Do not fix anything. If the sandbox blocks a check, name the exact denied command.
4. Reply with the Report format: Changes none; one Checks line per attack (FAIL = problem found); Status READY_FOR_CLAUDE_REVIEW once checking is finished, whatever you found.
```

### Researcher instruction (Codex)

```text
Answer the questions in the task file. Never edit, create or delete repository files.
1. Use installed tools, local docs, package sources and small read-only experiments; use the web only if the sandbox allows it.
2. Give every answer a source (path:line, URL, or command and observed output) and mark it VERIFIED (evidence from this run) or UNVERIFIED.
3. Reply: Status (READY_FOR_CLAUDE_REVIEW | PARTIAL | BLOCKED), one answer per question with its source, then UNKNOWN / CHECKED / NEEDED. No file dumps.
```

### Report format

```text
Status: READY_FOR_CLAUDE_REVIEW | PARTIAL | BLOCKED
Task / start HEAD: <task> / <sha>
Changes: <path:line - what and why, one line each>
Decisions/deviations: <none or requirement -> decision>
Checks: <command or procedure - PASS|FAIL|NOT RUN|BLOCKED|UNKNOWN - evidence>
Acceptance: <Done When item - status - next owner>
UNKNOWN / CHECKED / NEEDED: <or none>
Out-of-scope findings: <or none>
Final git status --short: <output>
```

READY_FOR_CLAUDE_REVIEW means implementation and Codex-owned checks are done; it never means approved to commit.

## Parallel mode (both tools running)

1. The user assigns each tool a distinct task and file set. Record them in the handoff note, not TASK.md, so branches do not conflict on merge.
2. Preflight: confirm you can create a worktree, commit, and push. If any step is blocked, do not weaken the sandbox: keep your edits in place and name the exact blocked Git command for Claude or the user to run. Codex's `workspace-write` sandbox protects `.git`, so it cannot create branches, worktrees or commits: Parallel mode needs Codex in full-access mode, or Claude runs every Git step for Codex. Claude may pre-create the Codex worktree and branch and name it in the assignment.
3. Each tool: own worktree, own branch (`claude/<task>` or `codex/<task>`), commits only there. Worktrees cannot see each other's uncommitted files.
4. Handoff order: write a new note `handoffs/YYYY-MM-DD-<agent>-<task>.md` from `handoffs/TEMPLATE.md` (never edit another agent's note) → commit → push → verify the remote tip with `git ls-remote origin <branch>` → tell the user.
5. The receiver reads AGENTS.md, the handoff note, and `git log`/`git diff <base>...<branch>` before continuing.
6. Claude reviews and merges into the base branch unless the user assigns another owner, then runs the relevant checks on the merged result before pushing the base branch or syncing its mirror.
