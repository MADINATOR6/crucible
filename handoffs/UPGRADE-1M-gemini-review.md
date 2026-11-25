# Independent Adversarial Review: UPGRADE-1M

Verdict: VERIFIED WITH CAVEATS

Status: READY_FOR_CLAUDE_REVIEW
Task / start HEAD: UPGRADE-1M-REVIEW / d58ef93 (launcher confirmed repo root and initial git status: 10 entries)
Changes:
- `handoffs/UPGRADE-1M-gemini-review.md:1` - wrote independent review of `handoffs/UPGRADE-1M.diff` against `tasks/UPGRADE-1M.md` (sole owned output; no source or test files edited).
Decisions/deviations:
- Read-only review using built-in file tools only (no shell); shell test suites and Git commands are reported as `NOT RUN` per launcher and task instructions.
- Every static check below was verified directly against `handoffs/UPGRADE-1M.diff`, `tasks/UPGRADE-1M.md`, `handoffs/UPGRADE-1-fix.diff`, `.gitignore`, `scripts/test-ccx.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/test-crucible.ps1`, `scripts/ccx-core.ps1`, and `scripts/codex-dispatch.ps1`.
Intent / Twins: none

## Claims

| Claim | Observed | Status |
| --- | --- | --- |
| Diff stays within `tasks/UPGRADE-1M.md` write allowlist (`scripts/test-ccx.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/test-crucible.ps1`, `.gitignore`) | `handoffs/UPGRADE-1M.diff` touches only those 4 files, and every hunk matches the current files on disk | PASS |
| Cleanup guards check the chosen parent and cannot delete outside the scratch folder | Verified in `scripts/test-ccx.ps1:15-19,170-182`, `scripts/test-codex-dispatch.ps1:9-14,151-156,249-255`, and `scripts/test-crucible.ps1:11-15,436-438`; `.gitignore:39` ignores `.test-scratch/` | PASS |
| New `SKIP` in `outside repository` is unreachable in a normal run (`TEMP` writable) | Verified in `scripts/test-codex-dispatch.ps1:11-14,165,520-528,1185`: `$scratchParent` stays `$env:TEMP` whenever the probe succeeds, so `$scratchParent -ne $env:TEMP` is `$false` | PASS |
| Both new regression cases fail on pre-fix code (`handoffs/UPGRADE-1-fix.diff`) and pass on post-fix code | Traced against pre-fix and post-fix `scripts/ccx-core.ps1:441-452` and `scripts/codex-dispatch.ps1:573-584,601,674-677`; both fail on pre-fix code and pass on post-fix code | PASS |
| No existing assertion was weakened | Inspected every hunk in `handoffs/UPGRADE-1M.diff`; no existing assertion was loosened, deleted, or mocked | PASS |
| Claude's claimed runs: normal `test-ccx` 39/39, `test-codex-dispatch` 71/71, `test-crucible` 23/23; TEMP-denied `test-ccx` 39/39, `test-crucible` 23/23; fallback-forced `test-codex-dispatch` 70/71 + 1 SKIP (`outside repository`), leaving no `.test-scratch/<run>` behind | Cannot execute shell suites in this run (built-in file tools only) | CAVEAT (UNVERIFIABLE) |

## Checks

- **Attack 1 — Cleanup guards and deletion scope when parent is not `TEMP`:** `PASS`
  - `scripts/test-ccx.ps1:16-19,170-182`: `$scratchParent` is either writable `$env:TEMP` or `<repo>\.test-scratch` (derived from `Split-Path $PSScriptRoot -Parent`). `$scratch` is `$scratchParent\ccx-t1-<32hex>`, asserted absent before creation (`line 180`), and `$createdScratch` is set only after `CreateDirectory($scratch)` (`line 182`). `Remove-Scratch` (`lines 170-177`) checks `$createdScratch`, `(Split-Path $actual -Parent) -ieq $parent`, and leaf regex `^ccx-t1-[0-9a-f]{32}$`, and deletes only `$actual` (leaving `.test-scratch/` itself, which `.gitignore:39` ignores).
  - `scripts/test-codex-dispatch.ps1:9-14,151-156,249-255`: `$scratchParent` is writable `$env:TEMP` or `<root>\.test-scratch`; `$scratchName` is `ccx-t2-<8hex>`, verified absent before creation (`line 249`). `Remove-Scratch` (`lines 151-156`) asserts `$actual -ieq $expected` (`Join-Path $scratchParent $scratchName`) before removing `$scratch`.
  - `scripts/test-crucible.ps1:11-15,436-438`: `$scratch` is `<TEMP or root\.test-scratch>\crucible-t-<8hex>`, never reassigned, and removed in `finally` (`line 437`). (Pre-existing note: `test-crucible.ps1` has no `Remove-Scratch` guard function; not introduced by this diff.)
- **Attack 2 — Reachability of `SKIP` in `outside repository` when `TEMP` is writable:** `PASS`
  - `scripts/test-codex-dispatch.ps1:11-14,520-528`: `$scratchParent` starts as `$env:TEMP` and is only switched to `<root>\.test-scratch` if creating or deleting the empty probe directory in `$env:TEMP` throws. Nothing mutates `$scratchParent` or `$env:TEMP` before `line 522`, so `$scratchParent -ne $env:TEMP` is `$false` in a normal writable-`TEMP` run. When the fallback is active, `throw 'SKIP: ...'` is counted as `$script:skipped` (`line 165`), not `$script:passed`, and printed explicitly (`line 1185`).
- **Attack 3 — Do the two new regression cases fail on pre-fix code (`handoffs/UPGRADE-1-fix.diff`)?:** `PASS`
  - **1.1 (`scripts/test-ccx.ps1:741-752`):** Sets `$state.tasks.T1.baselines = @{ $here = @(); 'c:\elsewhere\other-checkout' = @('leak.txt') }` and `$state.tasks.T1.baselineDirty = @('leak.txt')`, writes `leak.txt` in `$repo`, and asserts `@(Test-CcxScope -Task (Get-TestTask) -Root $repo) -contains 'leak.txt'`. On pre-fix `Test-CcxScope` (`handoffs/UPGRADE-1-fix.diff:15-18`), `$path -notin $Task.baselineDirty` evaluates `$false` for `leak.txt`, returning `@()` and failing the assertion. On post-fix `scripts/ccx-core.ps1:441-452`, `$baseline` is looked up via `$Task.baselines[$key]` (`@()`), so `leak.txt` is returned and the test passes.
  - **1.2 (`scripts/test-codex-dispatch.ps1:288-293,824-829`):** `early503` emits `{type:'error', message:'Reconnecting... HTTP 503 Service Unavailable'}`, then `{type:'turn.failed', error:{message:'invalid_request_error'}}`, and exits `1` without `turn.completed`. On pre-fix `codex-dispatch.ps1` (`handoffs/UPGRADE-1-fix.diff:34-36`), `$messages | Where-Object { $_ -match $transientPattern }` matches the earlier 503, forcing exit `4` (`codex-dispatch.ps1:601`) and refunding `$task.dispatches` to `0` (`handoffs/UPGRADE-1-fix.diff:47-50`), failing both `Check-Code $r 1` and `dispatches -eq 1`. On post-fix `scripts/codex-dispatch.ps1:581-584,674-677`, only the last message (`invalid_request_error`) and last non-empty stderr line (none) are checked, so `$transientMessages` is empty, exit stays `1`, and `dispatches` stays `1`.
- **Attack 4 — Weakened assertions:** `PASS`
  - Every hunk in `handoffs/UPGRADE-1M.diff` was inspected; no pre-existing assertion was loosened, removed, or mocked. Only the cleanup-guard parent variable (`test-ccx.ps1:173-174`, `test-codex-dispatch.ps1:153`) and the fallback-only `SKIP` (`test-codex-dispatch.ps1:521-522`) were adjusted, both directly required by `tasks/UPGRADE-1M.md:7`.
- **Shell suite execution (`scripts\test-ccx.ps1`, `scripts\test-codex-dispatch.ps1`, `scripts\test-crucible.ps1`, normal and TEMP-denied):** `NOT RUN` — built-in file tools only (no shell in this run).

## Findings

No blocking defects found (`0` high/medium). Minor non-blocking observations:
- `scripts/test-crucible.ps1:436-438` | low | Unlike `test-ccx.ps1` and `test-codex-dispatch.ps1`, `test-crucible.ps1` deletes `$scratch` directly in `finally` without a `Remove-Scratch` path/leaf guard or pre-existence check (pre-existing, not introduced by this diff).
- `scripts/test-ccx.ps1:173` and `scripts/test-codex-dispatch.ps1:153` | low | `Remove-Scratch` compares `$scratch` against `$scratchParent` rather than re-validating that `$scratchParent` equals either `$env:TEMP` or `<repo>\.test-scratch` (safe today because nothing mutates `$scratchParent`).
- `scripts/test-codex-dispatch.ps1:824-829` | low | Covers `UPGRADE-1-fix.diff`'s early-503 + ordinary-error guard (`1.2B`, matching `tasks/UPGRADE-1M.md:10`), but does not add a test for the timeout (`exit 5`) or protected-file (`exit 9`) refund guards (`scripts/codex-dispatch.ps1:581,674`, finding `1.2A`).

## Acceptance

- Review `handoffs/UPGRADE-1M.diff` against `tasks/UPGRADE-1M.md` across all 4 attack questions — DONE (`VERIFIED WITH CAVEATS`) — claude
- Write `handoffs/UPGRADE-1M-gemini-review.md` — DONE — claude

## Untested

- Runtime execution of `scripts\test-ccx.ps1`, `scripts\test-codex-dispatch.ps1`, and `scripts\test-crucible.ps1` (both normal writable `TEMP` and denied/fallback `TEMP`, plus confirming no `.test-scratch/<run>` remains) — claude
- `ccx verify -TaskId UPGRADE-1M` and final `git status --short` / working-tree check — claude

## UNKNOWN / CHECKED / NEEDED

- CHECKED: `HANDOFF.md`, `tasks/UPGRADE-1M-REVIEW.md`, `tasks/UPGRADE-1M.md`, `handoffs/UPGRADE-1M.diff`, `handoffs/UPGRADE-1-fix.diff`, `handoffs/UPGRADE-gemini-review.md`, `.gitignore`, `scripts/test-ccx.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/test-crucible.ps1`, `scripts/ccx-core.ps1`, `scripts/codex-dispatch.ps1`.
- NEEDED: Claude to confirm the recorded suite runs / run `ccx verify`, record review, and decide whether to optionally add a `Remove-Scratch` guard to `scripts/test-crucible.ps1` or a timeout-after-503 test in a follow-up.

Out-of-scope findings: none

Final git status --short: NOT RUN (no shell; left to launcher operator; only `handoffs/UPGRADE-1M-gemini-review.md` was created).

Next owner: claude - verify test runs, run ccx verify/review/done, and commit UPGRADE-1M.
