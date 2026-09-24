# Handoff

How work passes between Claude Code and Codex. AGENTS.md is authoritative for workflow; TASK.md defines the current task's scope. Neither agent shares conversation history with the other: everything needed to continue lives in the repo.

## Dispatch mode (Claude launches Codex)

### Claude checklist
1. [ ] `git status` clean or pre-existing paths recorded; TASK.md filled and committed-or-saved; note HEAD.
2. [ ] TASK.md has a write allowlist, out-of-scope list, resolved business rules, and each Done When item assigned to Codex or Claude.
3. [ ] Say whether temporary scripts or fixtures are allowed, and where. Synthetic data only unless the user authorised real data.
4. [ ] Set `$handoffCaptureDir` to an existing absolute directory outside the repo and OneDrive, with a short path such as `C:\Users\<you>\codex-captures`. Capture file names add about 50 characters; if long paths are disabled, paths over 260 characters make the launcher silently capture nothing.

### Launcher (PowerShell, repo root)

```powershell
if (-not $handoffCaptureDir -or -not (Test-Path -LiteralPath $handoffCaptureDir -PathType Container)) { throw 'Set handoffCaptureDir to an existing absolute directory.' }; $b = Join-Path $handoffCaptureDir ('codex-' + [guid]::NewGuid().ToString('N')); codex.cmd exec -s workspace-write -c model_reasoning_effort=medium --json --output-last-message ($b + '.report.md') 'Read HANDOFF.md and follow its Implementer instruction for TASK.md.' 1> ($b + '.events.jsonl') 2> ($b + '.stderr.log'); $x = $LASTEXITCODE; Set-Content -LiteralPath ($b + '.exit.txt') -Value $x -Encoding ascii; "Codex exit=$x; capture=$b"
```

Keep the prompt on one line: `codex.cmd` splits a multi-line prompt into separate arguments and exits with `unexpected argument`. Put longer instructions in a file and pass `'Read <path> and follow it.'` Use `model_reasoning_effort=high` only when AGENTS.md's escalation rules apply. Re-check flags with `codex.cmd exec --help` after a Codex upgrade.

A stderr line `Reading additional input from stdin...` wrapped as a PowerShell NativeCommandError is harmless. Exit 0 is not acceptance: confirm the `.report.md` file exists. On a nonzero exit, missing report, PARTIAL or BLOCKED: inspect the events, the actual diff and remaining items before resuming. If Codex stops with items open and no blocker named, re-run naming only the open items; stop after two nudges and review instead.

### After return (Claude)
Match the report's task and baseline to this run → inspect the diff for correctness and scope → resolve every non-PASS item → run Claude-owned checks → deeper review if risky → commit only task-owned changes → mirror sync if used.

### Implementer instruction (Codex)

```text
Implement TASK.md. Claude owns planning, final review, commits, push and mirror sync.
1. Confirm repo root. Read AGENTS.md and TASK.md, then only the source the task needs. Record HEAD and initial git status. Stop before editing if TASK.md is empty, has no write allowlist, or overlaps pre-existing work you cannot separate.
2. Make the smallest correct change inside the write allowlist. Do not create tests, fixtures or scratch files unless TASK.md authorises their paths.
3. Do not stage, commit, change branches, create worktrees, push, deploy, sync OneDrive, or edit workflow files (AGENTS.md, CLAUDE.md, HANDOFF.md, .codex/). Propose workflow changes in the report instead.
4. Respect the sandbox. Never broaden permissions or install tools to get around a restriction; report it.
5. Ambiguous data rules, destructive behaviour, conflicting requirements or needed scope growth: stop that part, report UNKNOWN / CHECKED / NEEDED with a proposed resolution, and continue only independent work.
6. Run Codex-owned checks from Done When. A check is PASS only with evidence from this run; static reading cannot prove runtime behaviour.
7. Follow AGENTS.md Failure Handling; report failed checks, repair attempts and remaining blockers. Never blanket-revert pre-existing work.
8. Reply with the Report format below. No file dumps, secrets or private data.
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
