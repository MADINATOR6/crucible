# CCX-3 · Launcher integration with ccx

## Mode and Owner
CCX-3 · complex · risk high · Dispatch in worktree `.ccx-worktrees/codex-CCX-3` on branch `codex/ccx-3`, running in parallel with CCX-2 in its own worktree. Codex (gpt-6-astra, high) implements. Claude reviews, commits and merges. CCX-4 (a Codex verifier) attacks the combined result later.

## Goal
Give `scripts/codex-dispatch.ps1` an optional `-TaskId` that ties a dispatch to the ccx control plane:
- ownership and worktree checks;
- budgets and caps;
- recorded Codex availability;
- OMNIROUTE model and effort;
- the permission gate for full access;
- after the run: bookkeeping, post-checks and telemetry.

Without `-TaskId`, the launcher must behave exactly as it does now.

## Relevant Files
- `scripts/codex-dispatch.ps1` and `scripts/test-codex-dispatch.ps1`: yours to change.
- `scripts/ccx-core.ps1` and `scripts/ccx.ps1`: CCX-1. Read them, never edit them. The helpers you need are `Get-CcxPolicy`, `Get-CcxState`, `Get-CcxTask`, `Invoke-CcxLocked`, `Invoke-CcxRoute`, `Invoke-CcxGate`, `Test-CcxPathOverlap`, `Invoke-CcxQuickChecks`, `Write-CcxTelemetry`, `Add-CcxEvent`, `Protect-CcxText`, `New-CcxError`, `Start-CcxTask` / `Start-CcxTaskInState` (the task-start logic: ownership check, baselineDirty, status active) and `Assert-CcxTaskOwnership`. Read `tasks/CCX-1.md` for the contracts. Claude's review changed CCX-1 afterwards, and the code is authoritative on these points:
  - `defaults` and `privacy.excludePaths` policy sections;
  - `task escalate`, which changes the owner and sets `attemptBase`;
  - the owner decides the agent for the task's own type;
  - caching of the policy, repo root and state dir.
- `ccx/policy.json`: read-only.
- HANDOFF.md: the launcher contract and exit codes. Propose doc text in your report; do not edit it.

## Write Allowlist
- `scripts/codex-dispatch.ps1`.
- `scripts/test-codex-dispatch.ps1`.
- Temporary files: the existing `%TEMP%\ccx-t2` scratch that the test already manages.

## Constraints
- Keep every existing behaviour, message and exit code for runs without `-TaskId`. All 26 existing test cases stay unchanged and passing.
- Keep the house rules: the one-line prompt, closed stdin, the held-handle writer lock, `Clear-GitOverrides`, the cmd quoting rules, UTF-8 without BOM, and `taskkill` resolved from the OS.
- The same privacy and redaction rules as CCX-1. Never read or scan `nursing-a2/`.
- Parameter validation: `-TaskId` must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$`.

## Behaviour with -TaskId

### Before launching, in this order, after the existing validation and before the writer lock
1. Dot-source `$PSScriptRoot\ccx-core.ps1`. If it is missing, exit 1 with `ccx-core.ps1 not found: -TaskId needs the ccx scripts`.
2. The task must exist; otherwise exit 1 with `unknown task`. A done or abandoned task exits 1. A planned, active or blocked task may continue; blocked means a retry after a failed verification.
3. If the task has a worktree and the resolved repo root is a different path (full-path, case-insensitive), exit 7 with `run from the task's worktree: <path>`.
4. Role implement requires `task.owner = codex`; otherwise exit 7. Roles verify and research accept any owner.
5. Ownership, implement role only:
   - A planned task gets the task-start logic: the overlap check (exit 7), baselineDirty, and status active.
   - An active or blocked task has its overlap re-checked against the other active, verifying and blocked tasks (exit 7).
6. If `-TaskFile` is not bound and `task.taskFile` is set, use `task.taskFile`, resolved from the repo root.
7. Budget: when effective tokens (input - cached + output) >= the budget's tokenTarget, exit 8 with `BUDGET: token target reached (<used>/<target>); raise it with ccx task budget`. The budget is the class budget plus the task's overrides.
8. If `state.agents.codex.unavailableUntil` is in the future, exit 4 without launching Codex. Print `USAGE LIMIT (recorded): Codex resumes at <local time>`.
9. Route, when neither `-Effort` nor `-Model` is bound (use `$PSBoundParameters`):
   - Call `Invoke-CcxRoute -TaskId`. For role implement, leave `-Attempt` out so the router derives it: dispatches - attemptBase + 1, which restarts after an escalation. For verify and research, pass `-Attempt 1`, because those runs do not count toward the implementation retry cap. Pass a type matching the role:
     - implement: the task's type;
     - verify: `verify`;
     - research: `research`.
   - The decision must have agent codex and route worker, cheap or script. Otherwise exit 8, printing the route and its reasons (for example defer, surface or premium). This enforces the retry cap.
   - Use the decision's model and effort, and print `Route: <route> <model> <effort> - <first reason>`.
   - When either parameter is bound, print `Route: explicit` and use the given values. An unbound model then stays the Codex default, as today.
10. If `-Sandbox` is danger-full-access, call `Invoke-CcxGate -Action codex-full-access -Target <taskId>`. If it is not allowed, exit 10 and print its approval instructions.
11. Record the dispatch start under the lock:
    - dispatches++, for role implement only; verify and research runs are recorded in lastDispatch and telemetry but never counted;
    - status active;
    - a checkpoint, `dispatch <n> start <role> <model> <effort>`;
    - `lastDispatch = {n, role, model, effort, sandbox, startedAt, escalated}`, where escalated is true when the routed effort is above the class base for codex.

### After Codex returns, when the report has been printed
12. Report status: the first line matching `^\s*Status:\s*(READY_FOR_CLAUDE_REVIEW|PARTIAL|BLOCKED)\b`, else `NONE`.
13. Role implement only: run `Invoke-CcxQuickChecks -Task -Root`.
    - Print `POST-CHECK <PASS|FAIL|N/A> <stage> <details>`.
    - Print `SCOPE VIOLATION: <path>` for each path outside owns and baselineDirty.
14. Update the task under the lock:
    - Add the token counts, when known.
    - Complete `lastDispatch` with `{exit (the final code), status, endedAt, durationSec, tokens, postChecks}`.
    - On a usage limit, set `state.agents.codex.unavailableUntil` from the RESETS text and a reason:
      - `h:mm tt` means today, or tomorrow if that time has passed.
      - `MMM d, yyyy h:mm tt` has its ordinal suffix removed first.
      - Anything unparseable gives now + `models.codex.unavailableBackoffMinutes`.
    - Add a checkpoint, `dispatch <n> end exit <x> status <s>`.
15. Telemetry kind dispatch:
    - task: taskId, type, class, risk;
    - run: role, agent codex, model, effort, attempt n;
    - outcome: exit, status, tokens, durationSec, the scopeViolations count, postChecksPass.
16. `Add-CcxEvent -Type dispatch-finished` with data `{exit, status, dispatch:n, role}`. The key is `dispatch:<taskId>:<n>` for implement runs. For verify and research runs it is `dispatch:<taskId>:<role>:<startedAt as yyyyMMddHHmmss>`, so a repeated run is never dropped as a duplicate.
17. Exit code:
    - Existing codes keep their meaning and precedence.
    - A result that would be 0 becomes 9 when post-checks failed (`completed; post-checks failed`).
    - A failure in steps 12-16 (for example a lock timeout) must never hide Codex's result. Print `ccx bookkeeping failed: <message>`, keep Codex's code, and turn 0 into 1.

### Observability (all runs, with or without -TaskId)
18. Open the `.events.jsonl` and `.stderr.log` capture streams with `FileShare.Read`, so progress can be read while Codex runs. Today `[IO.File]::Create` locks them exclusively. Nothing else about the captures changes.

## Tests (extend scripts/test-codex-dispatch.ps1)
- **Harness:**
  - Accept `-TaskId`.
  - Each ccx case gets its own `CCX_STATE_DIR` under the scratch dir, and a `CODEX_HOME` holding a fake catalog that lists gpt-6-astra.
  - Copy the repo's `ccx/policy.json` into the fixture repo at `ccx/policy.json`.
  - Add fake-codex modes:
    - `ready`: writes the report `Status: READY_FOR_CLAUDE_REVIEW` and creates or updates an owned file.
    - `stray`: the same report, but it writes a file outside owns.
  - Set up tasks through `scripts\ccx.ps1` child processes with the same environment.
- **Cases:**
  - Pre-launch refusals:
    - an unknown task exits 1;
    - an ownership conflict with another active task exits 7, and the fake never runs;
    - a worktree mismatch exits 7;
    - a claude-owned task with role implement exits 7;
    - the dispatch cap is reached through the route and exits 8;
    - the token target exits 8;
    - a recorded usage limit exits 4 without launching.
  - Routing:
    - a routed dispatch passes `-m gpt-6-astra` and `model_reasoning_effort=medium` for a normal task, and high for attempt 2;
    - explicit `-Effort` wins.
  - The usage-limit fake (`5:33 PM`) records `unavailableUntil`.
  - danger-full-access without an approval exits 10 and leaves a pending approval. With a chat-approved approval, created through `ccx.ps1 approve -Chat -Quote`, it proceeds.
  - The ready mode:
    - records dispatches 1, `lastDispatch.status READY_FOR_CLAUDE_REVIEW` and the summed tokens;
    - writes a telemetry line;
    - queues a dispatch-finished event.
  - The stray mode gives exit 9 and a `SCOPE VIOLATION` line.
- While the fake is sleeping, the capture files can be opened for reading (the `sleep` mode with a short timeout).
  - The existing cases run without `-TaskId`, unchanged.

## Out of Scope
- `scripts/ccx-core.ps1`, `scripts/ccx.ps1`, `scripts/ccx-ops.ps1` (CCX-2 is writing it in parallel), `scripts/sync-mirror.ps1` and its test, `ccx/policy.json`, docs, AGENTS.md, HANDOFF.md, MEMORY.md, TASK.md and `tasks/`.
- Calling tick or verify from the launcher.
- `nursing-a2/`.

## Done When
1. (Codex) `scripts\test-codex-dispatch.ps1` passes: all 26 existing cases plus the new ones.
2. (Codex) `scripts\test-ccx.ps1` still passes.
3. (Codex) The file parses and is UTF-8 without BOM. A run without `-TaskId` produces the same Codex arguments as before, as a test proves.
4. (Claude) Diff review, merge with CCX-2, HANDOFF.md exit codes and options, and a real dispatch through `-TaskId` in CCX-5.

## Verify
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-codex-dispatch.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx.ps1
```

## Stop Conditions
- A Done When check still fails after one focused repair: stop and report.
- A core defect or missing helper blocks you: do not edit core. Report file:line and a proposed fix, and continue with independent parts.
- Keeping existing behaviour conflicts with the spec: existing behaviour wins. Report it.
- Report by 120 minutes after start.
