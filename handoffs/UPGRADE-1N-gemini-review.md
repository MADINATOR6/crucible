# Independent Adversarial Review: UPGRADE-1N

Verdict: VERIFIED WITH CAVEATS

Status: READY_FOR_CLAUDE_REVIEW
Task / start HEAD: UPGRADE-1N-REVIEW / 55b0c07 (launcher confirmed repo root and initial git status: 9 entries)
Changes:
- `handoffs/UPGRADE-1N-gemini-review.md:1` - wrote independent adversarial review of `handoffs/UPGRADE-1N.diff` against `tasks/UPGRADE-1N.md` and `handoffs/UPGRADE-1M-gemini-review.md` (sole owned output; no source or test files modified).
Decisions/deviations:
- Read-only review using built-in file tools only (no shell invocation); test suites and git checks are reported as `NOT RUN` per launcher and task instructions.
- Static verification performed against `handoffs/UPGRADE-1N.diff`, `tasks/UPGRADE-1N.md`, `handoffs/UPGRADE-1M-gemini-review.md`, `scripts/test-crucible.ps1`, `scripts/test-codex-dispatch.ps1`, and `scripts/codex-dispatch.ps1`.
Intent / Twins: none

## Claims

| Claim | Observed | Status |
| --- | --- | --- |
| Diff stays within `tasks/UPGRADE-1N.md` write allowlist (`scripts/test-codex-dispatch.ps1`, `scripts/test-crucible.ps1`) | `handoffs/UPGRADE-1N.diff` touches only those 2 files, matching working tree | PASS |
| Crucible cleanup guard deletes only its own scratch folder under the chosen parent, never outside | Verified in `scripts/test-crucible.ps1:436-442` against parent resolution in `scripts/test-crucible.ps1:12-15` | PASS |
| Crucible cleanup guard does not skip deleting its own folder | Verified path normalization and regex matching against `crucible-t-[0-9a-f]{8}` in `scripts/test-crucible.ps1:15,438-440` | PASS |
| Timeout test case fails on code that refunds a timed-out run | Verified against `sleep503` mock and dispatch refund condition in `scripts/codex-dispatch.ps1:581,601-603,674-677` | PASS |
| No existing assertions weakened | Inspected all hunks in `handoffs/UPGRADE-1N.diff`; existing tests are unchanged; only additive test and cleanup hardening | PASS |
| Claude's reported test runs: `test-codex-dispatch` 72/72, `test-crucible` 23/23 | Cannot execute shell suites in this run (built-in file tools only) | CAVEAT (UNVERIFIABLE) |

## Checks

- **Attack 1 — Can the new crucible cleanup guard ever delete outside its scratch folder, or skip deleting its own?:** `PASS`
  - *Outside deletion check:* In `scripts/test-crucible.ps1:438-441`, `$actual` is computed as `[IO.Path]::GetFullPath($scratch).TrimEnd('\')`. Before running `Remove-Item -LiteralPath $actual -Recurse -Force -ErrorAction SilentlyContinue`, it verifies two conditions:
    1. `(Split-Path $actual -Parent) -ieq [IO.Path]::GetFullPath($scratchParent).TrimEnd('\')`
    2. `(Split-Path $actual -Leaf) -cmatch '^crucible-t-[0-9a-f]{8}$'`
    Because both `$actual` and `$scratchParent` are normalized with `GetFullPath().TrimEnd('\')`, case-insensitively checked for exact parent equality, and the leaf is strictly matched with case-sensitive regex `^crucible-t-[0-9a-f]{8}$` matching the exact prefix and 8-hex lowercase GUID format generated at `scripts/test-crucible.ps1:15`, it is impossible to target an arbitrary directory, root directory, or parent directory. If the check fails, it writes `"NOT REMOVED: scratch path $actual is outside $scratchParent"` and avoids deletion.
  - *Skip check:* In `scripts/test-crucible.ps1:15`, `$scratch = Join-Path $scratchParent ('crucible-t-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))`. `[Guid]::ToString('N')` generates lowercase hex (`[0-9a-f]`). The leaf of `$actual` will strictly match `^crucible-t-[0-9a-f]{8}$`, and the parent of `$actual` matches `[IO.Path]::GetFullPath($scratchParent).TrimEnd('\')`. It will not skip deleting its own folder during normal execution.
- **Attack 2 — Does the new timeout case fail on code that refunds a timed-out run?:** `PASS`
  - In `scripts/test-codex-dispatch.ps1:831-838`:
    - The mock `sleep503` (`scripts/test-codex-dispatch.ps1:9`) writes `HTTP 503 Service Unavailable\n` to stderr and sleeps indefinitely (`setInterval(() => {}, 1000)`).
    - The test sets `-TimeoutMinutes 0.05` (3 seconds). Codex times out, setting `$timedOut = $true` and returning exit `5`.
    - `Assert ($r.Stdout -notmatch 'TRANSIENT PROVIDER FAILURE')` and `Assert ((Read-CcxState).tasks.T1.dispatches -eq 1)` verify that despite 503 occurring on stderr, the timeout is not classified as transient and the task dispatch attempt is counted (not refunded).
    - *Testing against defect / hypothetical refunding code:* In `scripts/codex-dispatch.ps1:581`, the transient condition requires `-not $timedOut`. If code erroneously treated the run as transient or refunded on timeout (e.g., if `-not $timedOut` were omitted from line 581 or if line 674 did not require `$code -eq 4`), `$transientMessages` would match the 503, print `TRANSIENT PROVIDER FAILURE: ... (no attempt used)`, set `$code = 4`, and refund `$task.dispatches` to `0`. Both `Check-Code $r 5`, `Assert ($r.Stdout -notmatch 'TRANSIENT PROVIDER FAILURE')`, and `Assert ((Read-CcxState).tasks.T1.dispatches -eq 1)` would fail. Thus, the test genuinely catches and fails on code that refunds a timed-out run.
- **Attack 3 — Weakened assertions or scope leak:** `PASS`
  - `handoffs/UPGRADE-1N.diff` contains only:
    1. Addition of mode `sleep503` in `scripts/test-codex-dispatch.ps1:9`.
    2. Addition of regression case `'A 503 before a timeout keeps exit 5 and spends the attempt (Gemini UPGRADE-1M note)'` in `scripts/test-codex-dispatch.ps1:831-838`.
    3. Replacement of unconditional `Remove-Item` with guarded removal in `scripts/test-crucible.ps1:436-442`.
  - Zero pre-existing assertions modified or weakened.
- **Attack 4 — Shell execution:** `NOT RUN` (file tools only per instruction).

## Findings

No defects found (`0` high, `0` medium, `0` low). The changes precisely address findings 1 and 3 from `handoffs/UPGRADE-1M-gemini-review.md`.

## Acceptance

- Review `handoffs/UPGRADE-1N.diff` against `tasks/UPGRADE-1N.md` and `handoffs/UPGRADE-1M-gemini-review.md` — DONE (`VERIFIED WITH CAVEATS`) — claude
- Write `handoffs/UPGRADE-1N-gemini-review.md` — DONE — claude

## Untested

- Runtime execution of `scripts\test-codex-dispatch.ps1` (case `sleep503`) and `scripts\test-crucible.ps1` (scratch guard cleanup) — claude
- `ccx verify` and final `git status --short` check — claude

## UNKNOWN / CHECKED / NEEDED

- CHECKED: `HANDOFF.md`, `tasks/UPGRADE-1N-REVIEW.md`, `tasks/UPGRADE-1N.md`, `handoffs/UPGRADE-1M-gemini-review.md`, `handoffs/UPGRADE-1N.diff`, `scripts/test-crucible.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/codex-dispatch.ps1`.
- NEEDED: Claude to confirm test suite executions, verify ccx status, and proceed with task completion.

Out-of-scope findings: none

Final git status --short: NOT RUN (no shell; left to launcher operator; only `handoffs/UPGRADE-1N-gemini-review.md` was created).

Next owner: claude - confirm suite run outputs, run ccx verify/review/done, and commit UPGRADE-1N.
