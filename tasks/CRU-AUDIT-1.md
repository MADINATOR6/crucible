# Task CRU-AUDIT-1: adversarial audit of the control plane

Mode: Dispatch, role-swap. Owner: claude. Worktree `.ccx-worktrees/claude-CRU-AUDIT-1`, branch `claude/cru-audit-1`. Start HEAD: d6a93f7 (CRU-UP-2 fix `eecf02b` included).
Scope read: `scripts/codex-dispatch.ps1`, `scripts/ccx-core.ps1`, `scripts/ccx-ops.ps1` (lines 1-684; the health tail 685-806 was not read), `scripts/test-codex-dispatch.ps1` helpers. Hunted for: state changed before a refusal or failure; approvals, attempts or budget spent without the work; counts or status wrong after a failure path; checks bypassable by ordering or a second call; `task done` accepting unverified or refusing verified work.

Method for reproductions: a throwaway copy of the `test-codex-dispatch.ps1` harness (fake `codex.cmd`, temp git repo, isolated `CCX_STATE_DIR`) pointed at the unmodified scripts at d6a93f7, with two extra fake modes (`badname`, `capacity`). Every `OBS` value below was printed by that run on 2026-11-12. The harness is not committed; the fix tasks write the permanent cases.

Severity: HIGH = work, an approval or a session is lost; MEDIUM = a gate can be bypassed or a state is wrong; LOW = untidy.

## Confirmed findings (reproduced)

### F1 HIGH: approval, attempt and task start are spent before the launcher can fail
- Where: `scripts/codex-dispatch.ps1:279-283` consume approvals; `:284-299` count `dispatches++`, set status `active`, write `lastDispatch`; only afterwards `:303` `CreateDirectory($CaptureDir)`, `:340-341` open capture streams, `:342` `Process.Start`. Any throw there (unusable `-CaptureDir`, drive missing, path under a file, stream open failure, `Process.Start` failure, missing provider key) reaches the outer catch (`:487`) and exit 1. The bookkeeping transaction (`:442`) never runs.
- State before: planned task T1 (owner codex), `codex-full-access` approved for T1.
- Command: `codex-dispatch.ps1 -TaskId T1 -Sandbox danger-full-access -CaptureDir <path under a regular file>`.
- Expected: exit 1, nothing spent (same as BUSY after CRU-UP-2): `dispatches` 0, approval `approved`, task `planned`.
- Observed (R1): exit 1; `dispatches` 1; status `active`; approval `used`; `lastDispatch.exit` and `endedAt` empty; no telemetry, no event. A one-shot full-access approval is gone and one of `maxDispatches` is burned though no provider ran.
- Same class as CRU-UP-2 (it fixed lock ordering; the lock is now first, but the capture setup is still after the spend). `tasks/CRU-UP-2.md` line 19 covers lock release for this case only.
- Deterministic test: yes. The existing case `lock is released on every failure path` already makes this failure (blocker file); the new case asserts the spend.
- Fix scope: move capture directory creation, provider command resolution, capture-stream opening and process object setup before the approval consumption and attempt count. Codex's correction: `Process.Start` launches `cmd.exe`, so a vanished `codex.cmd` is a child failure, not a start exception; no refund path is added. What can still throw after the spend is only `Process.Start` of `cmd.exe` and `StandardInput.Close`, logged as residue.

### F2 HIGH: a throwing post-check aborts the whole bookkeeping transaction
- Where: `scripts/codex-dispatch.ps1:431` `Invoke-CcxQuickChecks` is inside the `try` that also holds the token and `lastDispatch` update (`:442-481`). `Test-CcxPowerShellParse`, `Test-CcxJsonFiles` and `Test-CcxSecretsInPaths` call `Get-CcxSafeFile` (`ccx-core.ps1:374-388`) for every changed owned path; `ConvertTo-CcxOwnedPath` (`:343-358`) throws for a path that matches a redaction pattern, has an invalid Windows segment, or is a reparse point.
- State before: task T1 owns `out/`; Codex writes `a file under `out/` whose name looks like a credential assignment (key word, equals sign, eight or more characters)` and finishes normally (tokens reported, `Status: READY_FOR_CLAUDE_REVIEW`).
- Expected: post-check stage FAIL, tokens recorded, `lastDispatch` closed, dispatch telemetry and event written, exit 9.
- Observed (R2): stdout `ccx bookkeeping failed: Path exceeds the safe field limit or contains sensitive data.`; exit 1; `tokens.input` 0 (the run printed `input=100`); `lastDispatch.exit` empty; 0 telemetry rows. The task keeps `dispatches` 1 and `active` with an open `lastDispatch`; the token budget gate (`:192-195`) never sees the spend, so a repeating pattern bypasses `tokenTarget`.
- Deterministic test: yes (new fake mode writing the file).
- Fix scope: catch the post-check exception inside the `implement` block and record it as a FAIL `post-checks` stage so bookkeeping still runs and the exit becomes 9. No exit code changes.

### F3 MEDIUM: verify on a task with no baseline lists every unrelated dirty file instead of saying what is missing
- Where: `scripts/ccx-core.ps1:1012-1016` `task update -Status active` sets the status without taking a baseline; `:914-940` `Start-CcxTaskInState` is the only place a baseline is recorded (called by `task start`, `worktree add` and the launcher); `ccx-ops.ps1:330-333` scope stage compares changed paths to `baselineDirty`.
- State before: base checkout with other tasks' uncommitted files (the normal state here); task T1 registered and set active via `task update`, or never touched (planned).
- Command: `ccx verify -TaskId T1`.
- Expected: a clear message ("no baseline for this checkout: run ccx task start").
- Observed (R4): exit 1, `FAIL scope unrelated-dirty.txt` for both the `update`-activated task (`baselineDirty` empty) and a planned one. Matches FRICTION 2026-11-06 (SNAP-7) and 2026-11-10 (LT-CALORIE-2).
- Correction after Codex's review: my first draft said no ccx command repairs this. It does: `task start` on an already-active task with an empty `baselines` map takes the first baseline (`ccx-core.ps1:934-937`; the CCX-4c guard at `:920-926` applies only to legacy non-dictionary tasks). The defect is that nothing tells the user, so the sessions above were stuck. Severity lowered from HIGH.
- Deterministic test: yes (`test-ccx.ps1`): the message, and that `task start` then makes scope pass.
- Fix scope (revised): `Invoke-CcxVerify` with `-TaskId`, when the task's baselines map is a dictionary lacking the key for the verified root, stops with one clear line naming `ccx task start -Id <id>`. Verify's exit stays 1. `task update` is not changed (Codex: it sets `-Worktree` after the status handling, so starting inside it could baseline the wrong root). No gate loosened; baselines are never recaptured.

### F4 MEDIUM: `task done` accepts a review recorded before the last edit
- Where: `scripts/ccx-core.ps1:1070-1072` bind verification to the owned-files fingerprint; `:1075-1082` accept any `review`/`verifier` pass without any link to a fingerprint (the review record, `:1031`, stores none).
- State before: T1 owned `owned.txt` = v1; full verify PASS; `task review -By claude -Result pass`; then `owned.txt` rewritten to v2 and full verify PASS again.
- Expected: `task done` refuses ("review is for older content"), because v2 was never reviewed.
- Observed (R5): `task done` exit 0.
- Deterministic test: yes. Not fixed here: binding reviews to a fingerprint is a stricter gate that changes the workflow (a review recorded before a documentation touch-up would be refused), so it is a design decision. See Decisions.

### F5 MEDIUM: a provider capacity error counts as a failed attempt
- Where: `scripts/codex-dispatch.ps1:398-419` only usage-limit text is excluded from the retry count (`:467`); `ccx-core.ps1:543-547` telemetry stats count any other nonzero exit as a model failure.
- Observed (R3): fake run emits tokens, then `error: Selected model is at capacity`, exit 1: `dispatches` 1. FRICTION 2026-11-05 (SNAP-1) records the cost. Codex: the SNAP-3 HTTP 500 was a Higgsfield error inside a tool call, not necessarily a failed model-provider dispatch, so the 5xx half of that row is UNCLEAR and is dropped from this finding.
- Deterministic test: yes.
- Not fixed: which provider messages are transient is a policy decision (a wrongly broad pattern refunds a real failure; each refund also weakens the `maxDispatches` cap). See Decisions.

## Read but not reproduced (UNKNOWN / CHECKED / NEEDED)

- **Usage-limit run spends a one-shot approval.** CHECKED `codex-dispatch.ps1:279-283` and `:467`: a usage-limit cutoff refunds the attempt but not the `codex-full-access` or `paid-action` approval consumed for it. UNKNOWN whether this is wanted. NEEDED: a gate API that can restore an approval (`ccx/ARCHITECTURE.md`, gate section; CRU-UP-2 rejected this as out of scope). LOW, not fixed.
- **Stderr text can fake a usage limit.** CHECKED `codex-dispatch.ps1:399`: any stderr line containing `Quota exceeded` or `usage not included` forces exit 4 and records `codex.unavailableUntil` even when the run succeeded and wrote a report. UNKNOWN whether real Codex stderr ever carries such text on a good run. NEEDED: a captured good-run stderr, or a Codex answer.
- **`task review` cap answers exit 8 on a later `pass`.** CHECKED `ccx-core.ps1:1033`: once `reviewCycles` exceeds the cap every review call, including a pass, returns 8 with the cap message, though the review is recorded. Callers may read it as failure. LOW, FRICTION.
- **Timeout whose kill fails skips bookkeeping.** CHECKED `codex-dispatch.ps1:352` and the outer catch at `:487`: `Stop-CodexTree` throwing leaves tokens and `lastDispatch` unrecorded. UNKNOWN whether `taskkill` fails for the Codex tree in practice. LOW.
- **`paid-action` is gated for the `implement` role only** (`codex-dispatch.ps1:229`). A `-Role research` or `verify` run with `danger-full-access` on a `media-generate` task needs only `codex-full-access`. CHECKED by reading; the role split looks deliberate (read-only roles). NEEDED: a decision whether a full-access non-implement run on a paid task should also need `paid-action`. Not fixed.
- **Blank ledger line makes `task done` refuse.** CHECKED `ccx-core.ps1:1098-1100`: an empty line in `log.jsonl` makes `DeserializeObject('')` throw, so `done` reports `readable ledger`. UNKNOWN whether `scripts/higgsfield.ps1 log` can write blank lines. LOW.
- **F6 (Codex): approvals are consumed in separate transactions before the final ownership check.** CHECKED `codex-dispatch.ps1:279-288` and `ccx-core.ps1:778-788`: with two required approvals (media task, full access), if the second expires or another task takes overlapping ownership between the preflight check and the recording transaction, the first approval is already `used`. UNKNOWN: needs a time- or concurrency-dependent reproduction. NEEDED: a hook or a short-TTL approval to reproduce; the structural remedy is one outer `Invoke-CcxLocked` around consume-and-record (the gate nests re-entrantly and a throw discards the whole write). Not changed here.
- **Route is logged on a refused dispatch.** Already known (CRU-UP-2 line 21). Not repeated.
- **`ccx-ops.ps1` lines 685-806** (rest of health and the command dispatch) not read.

## Decisions for the user (not fixable without one)

1. F4: bind each review and verifier pass to the owned-files fingerprint (stricter `task done`)? Cost: a review recorded before a last edit must be repeated.
2. F5: which provider messages are transient (not counted as an attempt)? Proposed: "at capacity" and "overloaded" in the model's own error events only, never HTTP 5xx from tool output.
3. Restoring a used approval after a run that never started or hit a usage limit (needs a new gate operation).
4. Should a non-implement full-access run on a paid task also need `paid-action`?

## Plan for the fixes

Order: F1, F2 (both in `codex-dispatch.ps1`, so one after the other), F3 (`ccx-core.ps1`/`ccx-ops.ps1`). Each is its own ccx task (class complex, risk high, owner claude), a failing test first in `test-codex-dispatch.ps1` or `test-ccx.ps1`, the smallest fix, a Codex `-Role verify` run that tries to break it, `ccx verify`, review, `task done`, commit, local merge. F4 and F5 are logged in FRICTION.md, not fixed.

## Codex review of this list

Request to the verifier (read-only, static; do not edit any file): for each finding F1-F5, open the cited `path:line` in this worktree and decide CONFIRMED, REFUTED or UNCLEAR with the line evidence. Try to refute: look for a guard, an earlier check or a rollback I missed (for F1 especially: is anything between `codex-dispatch.ps1:279` and `:342` able to throw, and does any later code undo the attempt or approval?). Also check my proposed fix scopes for ways they could break an existing exit code or weaken a gate, and list any further spend-before-work defect you find in the three scripts. Report `Status:` and a `Untested:` line. Runtime suites cannot run in your sandbox; the reproductions are mine (OBS values above).

Codex (`-Role verify`, capture `codex-4a15919f72ff4d44898aa93f3d8278b1`, gpt-6-astra, static): F1, F2, F4 CONFIRMED; F3 REFUTED as unrecoverable (corrected above); F5 CONFIRMED for the capacity error only; one additional UNKNOWN (F6 above). Its F2 notes were adopted: keep exit precedence (9 only when the run otherwise succeeded) and redact the exception text. Nothing was dropped as unreproducible.
