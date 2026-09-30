# CCX-2 · ccx ops: runtime, verify pipeline, memory lint, worktrees, merge-check, health, status

## Mode and Owner
CCX-2 · complex · risk high · Dispatch in worktree `.ccx-worktrees/codex-CCX-2` on branch `codex/ccx-2`, running in parallel with CCX-3 in its own worktree. Codex (gpt-6-astra, high) implements. Claude reviews, commits and merges. CCX-4 (a Codex verifier) attacks the combined result later.

## Goal
Add `scripts/ccx-ops.ps1`, which completes the ccx CLI, and its tests. It builds only on the helpers, state fields and exit codes in `scripts/ccx-core.ps1` (CCX-1, committed; read it first, and read `tasks/CCX-1.md` for the contracts). `scripts/ccx.ps1` already dot-sources `ccx-ops.ps1` when present and calls `Invoke-CcxCmd<Verb>([hashtable]$P)`, which returns the exit code. `$P` holds the bound CLI parameters plus `Sub`.

Claude's review changed CCX-1 after its spec was written; the code is authoritative:
- **Policy sections:** `defaults` (class, risk) and `privacy.excludePaths`. `Get-CcxChangedPaths` and owned-path validation already honour the exclusions.
- **`task escalate`:** it bumps `modelEscalations`, sets `attemptBase` and changes the owner. Attempts restart after an escalation.
- **Owner routing:** the task owner decides the agent for the task's own type.
- **Caching:** the policy, repo root and state dir are cached per process.
- **Starting a task:** use `Start-CcxTask` / `Start-CcxTaskInState` for the task-start logic (`worktree add` needs it). Do not re-implement it.

## Relevant Files
- `scripts/ccx-core.ps1`, `scripts/ccx.ps1`, `scripts/test-ccx.ps1`: CCX-1. Read them, never edit them. If a core defect blocks you, report it with file:line and a proposed fix.
- `ccx/policy.json`: the configuration contract (read-only). Relevant sections: `runtime`, `verify`, `memory`, `worktrees`, `mcp`, `models`, `state`.
- `scripts/codex-dispatch.ps1`: house style for child processes, timeouts and `taskkill /T /F`.

## Write Allowlist
- `scripts/ccx-ops.ps1` (new).
- `scripts/test-ccx-ops.ps1` (new).
- Temporary files: only in `%TEMP%\ccx-t2o-<random>` directories that the tests create and remove.

## Constraints
- The same platform, JSON, git, UTF-8, redaction and privacy rules as CCX-1. Never read or scan `nursing-a2/`. Output that may echo file content passes through `Protect-CcxText`.
- Reuse the core helpers rather than re-implementing them: `Invoke-CcxLocked`, `Get-CcxChangedPaths`, `Test-CcxPathOwned`, `Get-CcxFingerprint`, `Test-CcxScope`, `Test-CcxSecretsInPaths`, `Test-CcxPowerShellParse`, `Test-CcxJsonFiles`, `Invoke-CcxRoute`, `Invoke-CcxGate`, `Add-CcxEvent`, `Add-CcxNotification`, `Add-CcxHistory`, `Write-CcxTelemetry`.
- Automatic work (tick handlers, status) never goes above `runtime.maxAutonomousLevel` (L2). It never launches Codex or Claude, never pushes, and never deletes anything except the temp fixtures described below.

## Commands

### 1. `tick [-Max n]` → `Invoke-CcxCmdTick`
- If `state.runtime.enabled` is false: print `runtime disabled`, exit 0, and leave events queued.
- **Claim** (locked). Select, oldest first, up to Max (default `runtime.maxEventsPerTick`), the events that are:
  - pending with nextAt <= now;
  - processing with an expired leaseUntil (crash recovery);
  - failed with nextAt <= now.

  Set each to processing with `leaseUntil = now + leaseSeconds`, and increment attempts.
- **Handle** (unlocked). Run the handler named by `runtime.handlers[type]`, else `runtime.defaultHandler`.
- **Complete** (locked).
  - On success: remove the event from the queue and append `{kind:"event", ...event, result, finished}` to history.
  - On failure: if attempts >= maxAttempts, set status dead and add a warn notification. Otherwise set status failed with `nextAt = now + min(backoffMaxSeconds, backoffBaseSeconds × 2^(attempts-1))`.
- **Stale scan** (inline, cheap, idempotent through notification keys):
  - Active or verifying tasks whose `updated` is older than `staleTaskHours` get a warn notification with key `stale:<taskId>`.
  - Approved or pending approvals past `expires` become expired.
  - Tasks whose recorded worktree path no longer exists get a warn notification.
- Set `runtime.lastTick`. Print the counts (processed, failed, dead, not due, notifications added), or JSON with `-Json`. Exit 0; a handler failure is recorded, not fatal. Exit 1 only for lock or state errors.
- **Handlers.** Each must be idempotent: running one twice adds no duplicate notifications (use keys).
  - `notify-dispatch`, with data `{exit, status, dispatch, role}` and key `dispatch:<taskId>:<n>`:
    - exit 0 with status READY_FOR_CLAUDE_REVIEW: info notification, "<task> ready for Claude review".
    - exit 4: warn notification with the recorded `agents.codex.unavailableUntil`.
    - Otherwise: action notification, "<task> dispatch <n> ended exit <code> status <s>; suggested route: <route> <agent> <model> <effort>", using `Invoke-CcxRoute` for that task. It never dispatches: `runtime.autoDispatch` is false.
  - `block-task`: set the task to blocked (unless it is done) and add an action notification.
  - `notify`: info notification with the type and a redacted data summary.
  - `run-health`: run the quick health checks. Any FAIL gives an action notification.
  - `stale-scan`: run the stale scan.
  - An unknown handler name behaves like `notify` and adds a warn.

### 2. `runtime on|off|show` → `Invoke-CcxCmdRuntime`
- `on` and `off` set `state.runtime.enabled` and write an audit line.
- `show` prints enabled, lastTick, queue counts by status and the dedup key count.

### 3. `verify [-TaskId] [-Stage a,b] [-Quick] [-Baseline] [-Path p,q]` → `Invoke-CcxCmdVerify` (also export `Invoke-CcxVerify`)
- **Root**: the task's worktree when set (it must exist; otherwise exit 1), else the repo root.
- **Changed set**:
  - With TaskId: changed paths under the task's owns.
  - Without: `git diff --name-only HEAD` plus the files given with `-Path`. Untracked files are included only through owns or `-Path`.
- **Stages**: `verify.stages`, in order.
  - `-Stage` limits the run to the named stages; an unknown name exits 2.
  - `-Quick` limits it to stages with `quick:true`.
- **Applicability**: `when` globs (PowerShell `-like`, case-insensitive, forward slashes) are matched against the changed set. With TaskId and an empty changed set, match against the task's owns entries instead, so re-verifying committed work still runs its tests. A stage without `when` always applies. A stage that does not apply is N/A.
- **Builtins**:
  - `powershell-parse`: changed .ps1 and .psm1 files; N/A when there are none.
  - `json-valid`: changed .json files, plus policy validation through `Get-CcxPolicy`.
  - `secret-scan`: the changed set. Report the file, pattern index and line only.
  - `task-scope`: `Test-CcxScope`; N/A without a task.
  - `memory-lint`: `Invoke-CcxMemoryLint`.
- **Command stages**:
  - A null command gives SKIP with the stage note.
  - Otherwise run `cmd.exe /d /s /c "<command>"`, resolved from `[Environment]::SystemDirectory`, with cwd = root and inherited `GIT_*` overrides cleared. The timeout is `timeoutMinutes`; on expiry, kill the process tree with `taskkill /T /F` and report FAIL (timeout).
  - Write the output to `<stateDir>/logs/verify-<taskId|none>-<stage>-<yyyyMMddHHmmss>.log` and keep the newest `verify.logsMax` logs.
  - Exit code 0 is PASS; anything else is FAIL. On FAIL, print the last 15 lines through `Protect-CcxText`.
- **Result**:
  - The run passes when no stage FAILs; SKIP and N/A do not fail. Print one line per stage: `<PASS|FAIL|SKIP|N/A> <name> <detail>`.
  - With TaskId, set `task.verification = {status, at, fingerprint (Get-CcxFingerprint), full (true only without -Quick and without -Stage), stages}`. Write telemetry kind verify `{taskId, type, class, pass, fail, skip}`. On FAIL, queue a `verification-failed` event with key `verify:<taskId>:<fingerprint>`.
  - `-Baseline` stores `{at, head, taskId, stages}` in `state.baselines` (keep the last 10) and never counts toward `task done`.
- Exit 0 on PASS, 1 on FAIL.

### 4. `memory lint [-Path p]` → `Invoke-CcxCmdMemory` (also export `Invoke-CcxMemoryLint`)
- **Files**: `-Path`, or the existing `memory.files`, relative to the repo root.
- **Checks per file**:
  - Secret hits: FAIL, printing the pattern index and line number only.
  - Line count above `memory.maxLines[file]`: FAIL.
  - Duplicate non-empty lines (trimmed, ignoring headings, table separators and lines under 20 characters): WARN.
  - In MEMORY.md, more than `memory.maxCheckpoints` entries under `## Checkpoint`: WARN, "archive older checkpoints to MEMORY-ARCHIVE.md".
- Exit 0 when nothing FAILs, else 1.

### 5. `worktree add|list|prune` → `Invoke-CcxCmdWorktree`
- **`add -TaskId [-Agent claude|codex] [-Base ref]`**
  - The task must exist and not be done or abandoned. Agent defaults to the task owner.
  - Gate: `create-worktree` (L3, logged).
  - Path: `<main root>/<worktrees.root>/<agent>-<taskId>`. Branch: `<worktrees.branchPrefix[agent]><taskId lowercased>`. If the path or branch exists, exit 2.
  - Run the `task start` ownership check first (exit 7 on conflict), then `git worktree add -b <branch> <path> <base, default HEAD>`.
  - Record `task.worktree` (absolute path), `task.branch` and `task.worktreeCreatedBy = "ccx"`, and set the task active with baselineDirty computed in the new worktree. Print the path and branch.
- **`list`**
  - Source: `git worktree list --porcelain`.
  - For each worktree show: path, branch, HEAD, the ccx task and its status, and dirty (`git -C <path> status --porcelain` non-empty).
  - Also show merged: `git merge-base --is-ancestor <branch> <main root's current branch>`.
  - Also show stale: ccx-created, task not active or verifying, and last commit older than `worktrees.staleDays`.
- **`prune [-Apply]`**
  - Candidates are worktrees that meet all of: ccx-created, task done or abandoned, clean (no changes and no untracked files), and branch merged into the main root's current branch.
  - Without `-Apply`: list the candidates and why each other worktree is kept.
  - With `-Apply`:
    1. Gate `remove-worktree` (L3, logged).
    2. `git worktree remove <path>`, never with `--force`.
    3. `git branch -d <branch>`, never `-D`.
    4. Clear `task.worktree` and add a checkpoint.
  - Never touch a worktree that ccx did not create.

### 6. `merge-check -Branch <b> [-Into <ref>]` → `Invoke-CcxCmdMergeCheck`
- Into defaults to the main root's current branch. Never modify refs, the index or worktrees.
- Run `git merge-tree --write-tree --name-only --no-messages <into> <branch>`. Exit status 1 means conflicts: print `CONFLICT <file>` lines and exit 1.
- Changed files come from `git diff --name-only <into>...<branch>`. When a task has this branch, print `SCOPE <file>` for each file it does not own and exit 1.
- Print `WARN overlap <task> <file>` for files owned by other active tasks.
- Clean: print `MERGE CLEAN` and exit 0.

### 7. `health [-Full] [-Json]` → `Invoke-CcxCmdHealth` (also export `Invoke-CcxHealth -Quick`)
One line per check, each PASS, WARN, FAIL or SKIP. `-Json` prints an array.

- **Environment:** PowerShell 5.1 or later; git present; repo root resolves; policy loads and validates.
- **State dir:** write, read and delete a probe under the lock.
- **Self-tests:** run in an isolated temporary state dir. Set `CCX_STATE_DIR` for their duration only, then restore it and delete the temp dir. They cover:
  - router: git-state routes to a tool with no LLM; implement complex at attempt 2 escalates; a mythos request while unavailable falls back;
  - gate: L4 creates a pending approval; L2 is allowed;
  - budget: an attempt over maxDispatches routes premium or surface;
  - events: dedup;
  - tick: processes one event exactly once.
- **Memory:** `memory lint` over `memory.files`.
- **Codex:**
  - `codex.cmd` on PATH (missing: FAIL).
  - `codex.cmd --version`.
  - `cmd /c "codex.cmd login status < NUL"`: exit 0 is PASS, printed only as "logged in" or "not logged in", never with account details.
  - `models.codex.default` in the catalog: PASS; otherwise WARN naming the first fallback the catalog has.
- **Codex availability:** `state.agents.codex.unavailableUntil` in the future is a WARN.
- **Claude:** `claude.exe` or `claude` on PATH and `--version`: PASS; otherwise WARN (informational; Claude usually runs as the desktop app).
- **Mythos:**
  - available false: PASS, "not configured; escalation falls back to <fallbacks>".
  - available true without a model: FAIL.
- **Agents:** for `models.claude.cheapSubagent` and `models.claude.reviewSubagent`:
  - `.claude/agents/<name>.md` must exist, with frontmatter keys name, description and tools. Missing: FAIL.
  - Its tools may include `mcp__` entries only where `mcp.subagents[name]` lists them; otherwise FAIL.
- **MCP:**
  - Read only the `[mcp_servers.<name>]` headers from `<CODEX_HOME or ~/.codex>/config.toml`, never values. They must be a subset of `mcp.codexAllowedServers`; otherwise WARN listing the extra names.
  - Project `.mcp.json` servers must be a subset of `mcp.projectAllowedServers`. An absent `.mcp.json` is a PASS.
- **Worktree:** `git worktree add --detach "%TEMP%\ccx-hc-<random>" HEAD`, check its HEAD, then `git worktree remove` and `git worktree prune`. PASS or FAIL. Nothing may be left behind.
- **Verify runner:** the parse stage over the tracked `scripts/*.ps1`.
- **Runtime:** enabled, pending and dead counts, and expired leases (WARN).
- **`-Full`:** additionally run every verify command stage regardless of `when`.
- Exit 0 when nothing FAILs, 1 otherwise.

### 8. `status [-Json] [-Brief]` → `Invoke-CcxCmdStatus`
- **Tick first:** when the runtime is enabled, run one bounded tick. A tick error becomes a warn line; continue.
- **Then print:**
  - repo, branch and HEAD;
  - runtime: enabled, last tick and queue counts;
  - agents: Codex default model and availability, Claude lead, whether mythos is available;
  - non-done tasks: id, status, owner, last dispatch model and effort, dispatches against maxDispatches, effective tokens against tokenTarget, verification status, reviews;
  - worktree counts (ccx-created, stale);
  - pending approvals: id, level, action, target, task;
  - the newest 10 unread notifications;
  - the last 5 routing decisions.
- `-Brief` prints at most 5 lines: counts, pending approvals and action notifications.
- Exit 0.

## Out of Scope
- Editing `scripts/ccx-core.ps1`, `scripts/ccx.ps1`, `scripts/test-ccx.ps1`, `scripts/codex-dispatch.ps1` (CCX-3 is changing it in parallel), `scripts/sync-mirror.ps1`, the tests of those scripts, `ccx/policy.json`, docs, AGENTS.md, HANDOFF.md, MEMORY.md, TASK.md or anything under `tasks/`.
- Scheduling (Task Scheduler), services, git hooks, Claude Code hooks, network calls, and invoking the real Codex or Claude beyond `codex.cmd --version` and `login status` in health.
- `nursing-a2/`.

## Done When
1. (Codex) `scripts\test-ccx-ops.ps1` passes. Its fixtures:
   - Git repos under `%TEMP%\ccx-t2o-*`.
   - `CCX_STATE_DIR` set to a temp dir.
   - `CCX_POLICY` pointing at a test copy of the policy whose verify stages use fixture commands (`cmd /c exit 0`, `cmd /c exit 1`, and a sleep with timeoutMinutes 0.02).
   - `CODEX_HOME` set to a temp dir holding a fake catalog and a `config.toml` with an extra MCP server name.
   - A fake `codex.cmd` first on PATH for health.

   It covers at least:
   - Tick:
     - disabled runtime;
     - one event processed once;
     - handler failure followed by backoff;
     - dead after maxAttempts;
     - crash recovery of an expired lease;
     - the three notify-dispatch outcomes, with no dispatch;
     - block-task;
     - no duplicate notifications on re-run.
   - Runtime on, off and show.
   - Verify:
     - PASS records full verification with its fingerprint; `-Quick` records full false;
     - a failing stage fails the run, queues the event and keeps `task done` refused;
     - SKIP and N/A;
     - scope violation;
     - a secret found without being printed (the secret is built at runtime by concatenation);
     - parse error;
     - invalid JSON;
     - a timeout kills the child;
     - baseline;
     - an end-to-end CLI flow: task add, task start, edit an owned file, verify, review, done.
   - Memory lint: a secret (FAIL, no secret text in the output), too many lines, duplicates, too many checkpoints.
   - Worktrees:
     - add: ownership conflict exits 7, success, recorded;
     - list: dirty and merged flags;
     - prune: a dry run; `-Apply` removes only clean, merged, ccx-created worktrees of done tasks, keeps a dirty one, and never touches a worktree ccx did not create.
   - Merge-check: clean, conflict, scope.
   - Health:
     - the fixture passes, with WARNs allowed;
     - `-Json` parses;
     - misconfigured mythos is a FAIL;
     - a missing agent definition is a FAIL;
     - an extra Codex MCP server is a WARN;
     - no temporary worktree remains.
   - Status: sections present, `-Brief` at most 5 lines, `-Json` parses.
2. (Codex) `scripts\test-ccx.ps1` still passes, unchanged.
3. (Codex) The new files parse and are UTF-8 without BOM. They hard-code no values that the policy provides.
4. (Claude) Diff review; merge with CCX-3; full `ccx verify`; real `ccx health`.

## Verify
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx-ops.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx.ps1
```

## Stop Conditions
- A Done When check still fails after one focused repair: stop and report.
- A core (CCX-1) defect or missing helper blocks you: do not edit core. Work around it only if the workaround stays inside your files and is marked in the report. Otherwise report file:line and a proposed fix.
- Anything needs network access, installs, or writes outside the allowlist and your temp directories: stop that step.
- Report by 120 minutes after start.
