# Task

<!-- Task spec for Dispatch-mode work (Parallel tasks use their handoff note instead). May be overwritten per task after checking it holds no uncommitted manual edits. Reference paths; do not paste files. -->

## Mode and Owner
CCX-1 · complex · risk high · Dispatch. Codex (gpt-6-astra, high) implements. Claude reviews the diff and commits. A separate Codex verifier run (CCX-4) attacks the combined result later.

## Goal
Build the ccx core library and CLI for the Claude + Codex control plane, driven entirely by `ccx/policy.json`: a shared state store with locking, a task registry with ownership checks, the OMNIROUTE router, a permission gate with approvals, an event queue, redacted telemetry, and quick checks. Two later tasks build on your function names and state fields: CCX-2 adds `scripts/ccx-ops.ps1` (tick/runtime, verify pipeline, memory lint, worktrees, merge-check, health, status) and CCX-3 wires `scripts/codex-dispatch.ps1` to ccx. Keep those contracts exactly as written here.

## Relevant Files
- `ccx/policy.json`: the configuration contract. Read it, do not edit it. Code must take models, efforts, classes, budgets, levels, patterns and limits from it, never hard-code them.
- `scripts/codex-dispatch.ps1`: house style for git calls (`Clear-GitOverrides`), process handling and UTF-8.
- `scripts/test-codex-dispatch.ps1`: house style for tests (`Case`/`Assert`, scratch safety, child processes).

## Write Allowlist
- `scripts/ccx-core.ps1` (new): library, dot-sourced.
- `scripts/ccx.ps1` (new): CLI entry point.
- `scripts/test-ccx.ps1` (new): regression tests.
- Temporary files: only in `%TEMP%\ccx-t1-<random>` directories that the test run creates and removes.

## Constraints

### Platform and style
- Windows PowerShell 5.1 and .NET Framework only; git 2.55. No new modules, packages, downloads or network access.
- Write every file UTF-8 without BOM via `[IO.File]` and `New-Object Text.UTF8Encoding $false`.
- JSON: prefer `System.Web.Script.Serialization.JavaScriptSerializer` (`Add-Type -AssemblyName System.Web.Extensions`, `MaxJsonLength = [int]::MaxValue`), so state is plain dictionaries and arrays that are easy to mutate. If you use `ConvertFrom-Json`/`ConvertTo-Json` instead, handle the PS 5.1 pitfalls (depth, single-element arrays, `{value,Count}` wrapping).
- Git: clear the inherited `GIT_*` overrides exactly as `Clear-GitOverrides` in `scripts/codex-dispatch.ps1` does, and never use `2>&1` on native commands.
- Security: never store, print or log secrets. Every string written to state, history, telemetry, notifications, checkpoints or quotes goes through `Protect-CcxText`. Never read or scan `nursing-a2/`: it is unrelated private user data. Scan only paths from a task's owns or paths passed explicitly.

### Locations
- Repo root: `git rev-parse --show-toplevel` from the current directory (a worktree root when run in a worktree). Main root: the first `worktree` entry of `git worktree list --porcelain`.
- State dir: `$env:CCX_STATE_DIR` when set, else `<git rev-parse --path-format=absolute --git-common-dir>/ccx`, shared by all worktrees and never committed. Create it when missing.
- Policy: `$env:CCX_POLICY` when set, else `<repo root>/ccx/policy.json`. Validate on load: required sections present, every effort in `effortLadder`, every action level in `permissions.levels`, budgets numeric. Invalid policy: exit 1 with a clear message.
- Codex catalog: `<$env:CODEX_HOME, else %USERPROFILE%\.codex>\<models.codex.catalogFile>`, JSON with `models[].slug`.
- Files in the state dir:
  - `state.json`, plus `state.json.bak` (the previous version) and `state.lock`.
  - `history.jsonl`: audit lines and finished events. Rotates to `history.1.jsonl` at `state.historyMaxBytes`.
  - `telemetry.jsonl`: rotates to `telemetry.1.jsonl` at `telemetry.maxBytes`.

### State store
- Every mutation goes through `Invoke-CcxLocked { param($state) ... }`:
  1. Open `state.lock` with FileShare None, retrying every 50 ms for up to `state.lockTimeoutSeconds`. On timeout, exit 1 with `LOCK TIMEOUT`.
  2. Load `state.json`, or start a new empty state.
  3. Run the block.
  4. Write `state.json.tmp-<guid>` and replace `state.json` atomically, keeping `state.json.bak`.
  5. Release the lock.

  History and telemetry appends happen under the same lock.
- `Get-CcxState` reads `state.json` without the lock (the atomic replace makes that safe).
- Read-mostly commands such as `route` still print their result when the state dir is not writable (for example inside Codex's sandbox). They warn that the log was not written; they do not fail.
- The schema field names below are the contract. Times are UTC `yyyy-MM-ddTHH:mm:ssZ`. Lists are bounded by `state.*Max` and keep the newest entries.
  - State: `{ schema:1, updated, runtime:{enabled:true, lastTick:null}, agents:{codex:{unavailableUntil:null, reason:null}}, tasks:{}, approvals:{}, eventQueue:[], eventKeys:{}, notifications:[], routingLog:[], counters:{approval:0, notification:0} }`
  - Task: `{ id, title, type, class, risk, owner (claude|codex), parent, dependsOn[], owns[], taskFile, status (planned|active|verifying|blocked|done|abandoned), worktree, branch, baselineDirty[], created, updated, checkpoints[{at,note}], dispatches:0, modelEscalations:0, reviewCycles:0, tokens:{input:0,cached:0,output:0}, budget:{} (overrides), lastDispatch:null, verification:null, reviews[{at,by,kind,result,note}], merge:"none" }`
  - Verification (written by CCX-2): `{ status: PASS|FAIL, at, fingerprint, full: bool, stages:[{name,result}] }`
  - Approval: `{ id (A-0001), action, level, target, taskId, reason, status (pending|approved|denied|used|expired), requested, decided, by, provenance (interactive|chat), quote, expires }`
  - Event: `{ id (E-<8 hex>), at, type, key, taskId, data:{}, status (pending|processing|failed|dead), attempts:0, nextAt, leaseUntil }`
  - Notification: `{ id (N-0001), at, level (info|warn|action), text, taskId, key, ack:false }`. Deduplicate by key among unacknowledged notifications.

### Owned paths
- Owned paths are repo-relative with forward slashes. A trailing `/` marks a directory prefix. Reject absolute paths, drive letters, `..` segments and empty strings (exit 2).
- Two paths overlap (case-insensitive) when they are equal or one is a directory prefix of the other.
- `-Owns`, `-DependsOn`, `-Stage`, `-Path` and `-Add` accept comma-separated values, because `powershell -File` passes an array as one string.

### CLI: `scripts/ccx.ps1`
- Invocation: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 <command> [sub] [-Name value ...]`.
- Declare all of these parameters:
  - Positional: Command (position 0), Sub (position 1).
  - Strings and arrays: Id, TaskId, Title, Type, Class, Risk, Owner, Owns, Parent, DependsOn, TaskFile, Status, Note, Result, By, Kind, Action, Target, Reason, Quote, Key, Data, Max, Stage, Path, Agent, Base, Branch, Into, Attempt, AuthoredBy, Add, Worktree, Merge.
  - Switches: Chat, Quick, Baseline, Apply, Full, Json, Brief, Ambiguous, RequestMythos, All.
- Dispatch:
  - Dot-source `ccx-core.ps1`, and `ccx-ops.ps1` when it exists.
  - Command `a-b` calls function `Invoke-CcxCmdAB` (for example `merge-check` calls `Invoke-CcxCmdMergeCheck`). The function receives a hashtable of the bound parameters plus Sub and returns the exit code.
  - A missing function prints `Command not available: <command>` and exits 2. No command, or `help`, prints usage and exits 0.
- Exit codes:
  - 0 ok
  - 1 error
  - 2 usage
  - 7 ownership conflict
  - 8 budget, cap or route refusal
  - 10 approval required
  - 11 approval not found, not pending or denied
  - 12 interactive console required

  Functions signal a code by throwing an exception whose `Data['ccxExit']` holds it (`New-CcxError`). The CLI prints the message and exits with that code (default 1).
- Output: concise human-readable text by default. `-Json` prints exactly one JSON document instead.

### Commands in this task
CCX-2 will add tick, runtime, verify, memory, worktree, merge-check, health and status.

1. `task add -Id -Title -Type -Class -Risk -Owner claude|codex -Owns <paths> [-Parent] [-DependsOn] [-TaskFile]`
   - Creates the task with status planned.
   - The id must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$`.
   - Type, class and risk are validated against the policy. A duplicate id exits 2.
2. `task start -Id [-Worktree] [-Branch]`
   - Checks the task's owns for overlap with every other task whose status is active, verifying or blocked. On overlap, exit 7 naming the other task and the paths.
   - Records `baselineDirty`: the changed paths not under owns at that moment, in the task's worktree when it has one, else the repo root. Pre-existing unrelated changes are therefore never blamed on the task.
   - Sets status active.
3. `task update -Id [-Status] [-Note] [-Merge none|staged|merged] [-Worktree] [-Branch]`
   - `-Note` adds a checkpoint.
   - Status cannot be set to done here (use `task done`), and a done or abandoned task cannot change status.
4. `task review -Id -Result pass|changes -By claude|codex [-Kind review|verifier] [-Note]` (Kind defaults to review)
   - Kind review requires By to differ from the owner; otherwise exit 2 with "author cannot review own work".
   - A `changes` result increments reviewCycles.
   - When reviewCycles exceeds the budget's maxReviewCycles: record the review, print `REVIEW CAP REACHED: orchestrator decides on evidence or asks the user`, add an action notification and exit 8.
5. `task done -Id`. It requires all of the following, and exits 8 listing whatever is missing:
   - verification.status is PASS and verification.full is true.
   - verification.fingerprint equals the current `Get-CcxFingerprint` of the task.
   - Every item in the class verification list (plus the risk additions) is satisfied:
     - cross-model-review: a pass review of kind review by someone other than the owner.
     - independent-verifier: a pass review of kind verifier.
     - human-approval: an approval with action task-accept and target equal to the task id, in status approved or used.

   On success, set status done and write telemetry kind task-done with `accepted:true`, `firstTry: dispatches -le 1` and the last dispatch effort.
6. `task budget -Id -Add <field>=<n>[,...] -Reason <text>`
   - Adds to the task's budget overrides. Fields: maxDispatches, maxModelEscalations, maxReviewCycles, tokenTarget.
   - Records a checkpoint with the reason.
7. `task show -Id` shows one task. `task list [-All]` lists tasks that are not done, or every task with `-All`.
8. `route [-TaskId] [-Type] [-Class] [-Risk] [-Attempt] [-Ambiguous] [-AuthoredBy] [-RequestMythos]` returns a decision (algorithm below). With `-TaskId`, missing values come from the task, and attempt = dispatches + 1.
9. `gate -Action [-Target] [-TaskId] [-Reason]` (below).
10. `approve -Id A-n` (interactive), `approve -Id A-n -Chat -Quote <text>`, and `deny -Id A-n` (below).
11. `event add -Type [-Key] [-TaskId] [-Data <JSON object>]` prints the event id and whether it was a duplicate.
12. `ack -Id N-n|all` marks notifications read.
13. `stats` reports, per (type, agent, effort): dispatches, failures, done count, first-try rate, and mean effective tokens (input - cached + output).

### Router: `Invoke-CcxRoute`
Deterministic: no LLM, no network. It returns an ordered hashtable with these fields: route (tool|script|cheap|worker|premium|mythos|defer|surface), llmRequired, agent (none|claude|claude-subagent|codex|<mythos agent>), subagent, codexRole, model, effort, command, verifyStage, class, risk, attempt, verification[], budget{}, permissionLevel, escalation, fallbacks[], reasons[].

1. An unknown type exits 2, listing the known types.
2. Type route `tool`: set llmRequired false, agent none, and the command or verifyStage from the type. Add reason `deterministic tool: no LLM required`. Stop.
3. Class and risk:
   - Class is `-Class`, else the task's class, else normal. Risk is `-Risk`, else the task's risk, else low.
   - When risk is high and the class ranks below `risk.high.minClass`, raise the class to it (with a reason).
   - Verification is the class list, plus `risk.high.addVerification` when risk is high (deduplicated).
4. Agent comes from the type. `cross-model` means the other agent than `-AuthoredBy` (claude or codex); a missing `-AuthoredBy` exits 2. codexRole comes from the type.
5. Budget is the class budget with the task's overrides applied.
6. If attempt > budget.maxDispatches:
   - If the task's modelEscalations < budget.maxModelEscalations: route premium with agent claude, model `models.claude.lead` and effort = the class claude max. Reason: `retry cap reached: escalate to the lead model`.
   - Otherwise route surface. Reason: `retry and escalation caps reached: stop automated retries, collect evidence, decide or ask the user`.

   Stop in both cases.
7. If the agent is codex and `state.agents.codex.unavailableUntil` is in the future: route defer, with a reason naming the time. Stop.
8. `-RequestMythos`:
   - If the class is not in `mythos.allowedClasses`, add a reason and ignore the request.
   - Else if `mythos.available` and `mythos.model` are set: route mythos with agent `mythos.agent`, model `mythos.model`, permissionLevel `mythos.maxPermissionLevel` and verification `mythos.requiredVerification`. Stop.
   - Otherwise add reason `mythos-class not available: fallback`, continue with agent, model and effort from `mythos.fallback[0]`, and list the rest in fallbacks.
9. Model:
   - codex: `models.codex.default`. If the Codex catalog exists and lacks that model, use the first entry of `models.codex.fallbacks` that it has. If the catalog is missing or unreadable, keep the default and add a reason.
   - claude: `models.claude.lead`.
   - claude-subagent: `models.claude.cheap`, with subagent `models.claude.cheapSubagent` and effort `agent-defined`.
10. Effort for codex and claude:
    - base = the class effort for that agent.
    - steps = min(escalation.maxSteps, (attempt - 1) × stepsOnFailedAttempt + (stepsOnAmbiguity if `-Ambiguous`)).
    - effort = the ladder position base + steps, capped at the class max for that agent.
    - If that gives max while failed attempts (attempt - 1) < `maxEffortNeedsFailedAttempts`, cap at xhigh and add a reason.
    - Above base, set escalation `{from, to, reason}`.
11. Adaptive routing applies only when `adaptive.enabled` and nothing escalated in this decision. It uses telemetry records with the same type, agent and effort:
    - Done count >= minSamples and first-try rate >= downgradeFirstTryRate: one step down, not below the class `effort.min`.
    - Otherwise, dispatch count >= minSamples and failure rate >= upgradeFailureRate: one step up, not above the agent max. A failure is a nonzero exit or a status other than READY_FOR_CLAUDE_REVIEW.

    The reason states the numbers.
12. permissionLevel comes from the type. Append a summary to `state.routingLog` and write a telemetry record of kind route (best effort, see State store).

### Gate: `Invoke-CcxGate`
- Level = `permissions.actions[action]`. An unknown action gets `unknownActionLevel` (fail closed).
- L0-L2: allow, exit 0.
- L3: allow, write a history audit line, exit 0.
- L4 and L5:
  - If an approval with the same action and target (a null target matches null) is approved and unexpired: mark it used, write an audit line, exit 0 printing `APPROVED <id>`.
  - Otherwise reuse the pending approval for that action and target, or create `A-<4 digits>`. Add an action notification and an approval-requested event. Print `APPROVAL REQUIRED <id> <level> <action> <target>` and the exact approve command. Exit 10.
- `approve` (the approval must exist and be pending; otherwise exit 11):
  - Without `-Chat`: refuse with exit 12 unless the console is interactive (`[Environment]::UserInteractive` and not `[Console]::IsInputRedirected`). Prompt `Type <id> to approve`, require an exact match, and set provenance interactive.
  - With `-Chat`: `-Quote` is required and must be non-empty. Allowed only when the level's approvalProvenance includes chat (L4); otherwise exit 12 with `L5 needs interactive approval`. Set provenance chat and store the quote redacted, at most 300 characters.
  - On approval, set expires = now + approvalTtlMinutes.
- `deny` sets status denied. Mark expired approvals as expired when read.

### Events
`Add-CcxEvent`:
- With a key: if `eventKeys[key]` is within `runtime.dedupWindowMinutes`, the event is a duplicate. Return the original id and add nothing.
- Otherwise append to eventQueue (status pending, attempts 0, nextAt now) and set `eventKeys[key]`.
- Prune keys older than the window.

Processing (tick) is CCX-2's job.

### Shared helpers (CCX-2 and CCX-3 call these; keep the names)
- Locations and state: `Get-CcxRepoRoot`, `Get-CcxMainRoot`, `Get-CcxStateDir`, `Get-CcxPolicy`, `Get-CcxState`, `Invoke-CcxLocked`, `Get-CcxTask`.
- Redaction, logging, events and notifications: `Protect-CcxText`, `Find-CcxSecrets`, `Write-CcxTelemetry`, `Add-CcxHistory`, `Add-CcxEvent`, `Add-CcxNotification`, `New-CcxError`.
  - `Protect-CcxText` replaces every `redaction.patterns` match with `[REDACTED]` and truncates to `maxFieldChars`, marking the cut with `...`.
  - `Find-CcxSecrets -Text` returns `{patternIndex, line}` hits and never the matched text.
- `Get-CcxChangedPaths -Root`: uses `git status --porcelain=v1 -z --untracked-files=all` and returns repo-relative forward-slash paths. For a rename it returns both names.
- `Test-CcxPathOverlap` and `Test-CcxPathOwned`.
- `Get-CcxFingerprint -Task -Root`: SHA-256 over sorted `path:sha256(content)` lines for every file under the task's owns (tracked and untracked, not ignored), with `path:<missing>` for an owned file path that does not exist. It deliberately excludes HEAD, so committing the verified content does not change it.
- `Invoke-CcxRoute` and `Invoke-CcxGate`.
- Quick checks:
  - `Test-CcxScope -Task -Root`: the changed paths neither under owns nor in baselineDirty.
  - `Test-CcxSecretsInPaths -Root -Paths`: hits per file. Scans text files up to 1 MB and skips binary and missing files.
  - `Test-CcxPowerShellParse -Root -Paths`: `System.Management.Automation.Language.Parser::ParseFile` errors for .ps1 and .psm1 files.
  - `Test-CcxJsonFiles -Root -Paths`: invalid .json files.
  - `Invoke-CcxQuickChecks -Task -Root`: returns `{pass, stages:[{name, result PASS|FAIL|N/A, details[]}]}`. It runs parse, json and secrets over the task's changed owned paths, plus scope.

## Out of Scope
- `scripts/ccx-ops.ps1` and everything in it: tick and event processing, runtime on/off, verify pipeline, memory lint, worktrees, merge-check, health and status (CCX-2).
- Any change to `scripts/codex-dispatch.ps1`, its test, `scripts/sync-mirror.ps1`, `ccx/policy.json`, docs, AGENTS.md, HANDOFF.md, MEMORY.md or TASK.md. Propose changes in the report instead.
- Scheduling, services, hooks, network calls, and invoking Codex or Claude.
- `nursing-a2/`: do not read, scan or modify it.

## Done When
1. (Codex) `scripts\test-ccx.ps1` passes and covers at least the following:
   - State store:
     - Lock contention: 5 concurrent child processes each run `task update -Note`, and all 5 checkpoints land.
     - Atomic write keeps `state.json.bak`.
   - Tasks:
     - `task start` overlap refusal (exit 7) and non-overlap success.
     - baselineDirty excludes pre-existing changes.
     - The review author rule, and the review cap (exit 8).
     - `task done` refused with no verification, with a stale fingerprint and with a missing review; accepted when all items are satisfied. Tests may write verification records through `Invoke-CcxLocked`.
     - `task budget -Add`.
   - Router:
     - git-state routes to a tool with llmRequired false.
     - implement/normal gives codex gpt-6-astra at medium; complex gives high; complex at attempt 2 gives xhigh.
     - Routine with `-Ambiguous` stays at or below medium.
     - max needs two failed attempts.
     - The retry cap gives premium first, then surface.
     - Codex unavailable gives defer.
     - Mythos unavailable falls back to claude max. Mythos available (a test policy copy) routes mythos at L0.
     - A cross-model review requires AuthoredBy.
     - An unknown type exits 2.
     - Catalog fallback when the default model is missing.
     - Adaptive downgrade and upgrade from synthetic telemetry.
   - Gate:
     - L2 allowed and L3 logged.
     - L4 pending (exit 10), then chat approve, allowed once, and a second use is pending again.
     - L5 chat approve refused (exit 12).
     - Interactive approve through a child process with redirected stdin refused (exit 12).
     - deny.
     - An unknown action is treated as L4.
   - Events, redaction and telemetry:
     - Event dedup within the window.
     - Redaction of every pattern class, using secret-like strings built at runtime by concatenation, so the file contains no literal secret-like strings.
     - Telemetry rotation.
   - CLI:
     - Owned-path validation.
     - `-Json` output parses.
     - Comma-separated `-Owns`.
2. (Codex) The tests never touch the real state dir. They set `CCX_STATE_DIR` (and `CCX_POLICY` and `CODEX_HOME` where needed) to their own `%TEMP%\ccx-t1-*` directories and remove only directories they created.
3. (Codex) All three files parse with `Parser::ParseFile` and are UTF-8 without BOM. `ccx.ps1` and `ccx-core.ps1` hard-code no model names, efforts, classes or levels that the policy provides.
4. (Claude) Diff review and a secret scan of the diff. `scripts\test-codex-dispatch.ps1` and `scripts\test-sync-mirror.ps1` still pass.

## Verify
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx.ps1
$env:CCX_STATE_DIR = Join-Path $env:TEMP 'ccx-t1-verify'; powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 route -Type git-state -Json
$env:CCX_STATE_DIR = Join-Path $env:TEMP 'ccx-t1-verify'; powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 route -Type implement -Class complex -Attempt 2 -Json
```
Remove `%TEMP%\ccx-t1-verify` afterwards.

## Stop Conditions
- A Done When check still fails after one focused repair: stop and report.
- An ambiguity that would change a contract CCX-2 or CCX-3 depends on (function names, state fields, exit codes): do not choose silently. Report UNKNOWN / CHECKED / NEEDED with a proposal, and continue with independent parts.
- A step needs network access, a module install, or writes outside the allowlist or your temp directories: stop that step.
- Report by 120 minutes after start, even if items remain open.
