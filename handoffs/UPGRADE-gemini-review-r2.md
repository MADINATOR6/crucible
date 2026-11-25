# Second-Round Verification Review: UPGRADE-1 and UPGRADE-2A Fixes

Status: READY_FOR_CLAUDE_REVIEW
Task / start HEAD: UPGRADE-REVIEW-R2 / 5959208 (launcher confirmed repo root and initial git status: 6 entries)
Changes:
- `handoffs/UPGRADE-gemini-review-r2.md:1` - wrote second-round verification review for UPGRADE-1 and UPGRADE-2A fixes (sole owned output; no source or test files edited).
Decisions/deviations:
- Read-only review using built-in file tools only (no shell); shell test suites and Git commands are reported as `NOT RUN` per launcher and brief instructions.
- Last review cycle (cap of two): evaluated only whether the fixes close Round 1 findings (`handoffs/UPGRADE-gemini-review.md`) or introduce new defects, plus the `Invoke-Run` PATH-order change.
Intent / Twins: none

## Checks

### UPGRADE-1 Fixes (`handoffs/UPGRADE-1-fix.diff`)

- **1.1 A/B — Per-checkout baseline lookup in `Test-CcxScope`:** `PASS`
  - **Path:** `.ccx-worktrees/codex-UPGRADE-1T/scripts/ccx-core.ps1:441-452`
  - **Evidence:** `Test-CcxScope` now checks `$Task.baselines -is [Collections.IDictionary]`, computes `$key = [IO.Path]::GetFullPath($Root).TrimEnd('\','/').ToLowerInvariant()` (matching `ccx-ops.ps1:336`), and filters `@($Task.baselines[$key] | Where-Object { $_ })` instead of reading `$Task.baselineDirty`.
  - **1.1 A (laundering checkout A via checkout B):** Checkout A's post-add dirt is checked against `baselines[A]` (`@()`), never checkout B's `baselineDirty`, so `leak.txt` fails `scope`.
  - **1.1 B (checkout A's `task add` baseline leaking into checkout B during dispatch quick-checks):** When `key(B)` is absent from `$Task.baselines`, PowerShell's dictionary indexer returns `$null` and `$baseline` evaluates to `@()`, so checkout A's baseline cannot exempt edits in checkout B. Legacy tasks without `baselines` still fall back to `@($Task.baselineDirty)`.

- **1.2 A/B — Transient failure detection and attempt refund in `codex-dispatch.ps1`:** `PASS` (with documented `ponytail:` limit)
  - **Path:** `.ccx-worktrees/codex-UPGRADE-1T/scripts/codex-dispatch.ps1:575-585, 601-603, 674-677, 688`
  - **1.2 A (timeout / protected-file tamper refunding an attempt):** Line 581 adds `-and -not $timedOut -and -not $protectedChanged.Count`, and line 674 adds `-and $code -eq 4`. Timeouts (exit 5) and protected-file changes (exit 9) can no longer populate `$transientMessages`, print `TRANSIENT PROVIDER FAILURE`, refund `$task.dispatches`, or append `:limit:` to `$eventKey`.
  - **1.2 B (recovered 5xx followed by non-transient `turn.failed`):** Line 583 checks only the last entry of `$messages` plus the last non-blank line of `.stderr.log`.
    - *Closed case:* An earlier `{type:'error', message:'...HTTP 503...'}` followed by `{type:'turn.failed', error:{message:'invalid_request_error'}}` in `.events.jsonl` (with empty/non-5xx stderr) now leaves `'invalid_request_error'` as the last `$messages` item and exits 1 with the attempt spent.
    - *Documented limit (`ponytail:` at lines 578-579):* Because line 583 unions `@($messages | Select-Object -Last 1)` with `$lastStderr`, a split-stream run where `.stderr.log`'s last non-blank line is a recovered 5xx and `.events.jsonl` later ends with a non-transient `turn.failed` still reads as transient (exit 4, refunded). Also, because line 551 deduplicates `$messages`, an exact-duplicate terminal message that appeared earlier than a 5xx would not move to the end (negligible in practice). This matches the deliberate, documented `ponytail:` heuristic and does not require another review cycle.

- **Shell test suites (`test-ccx`, `test-ccx-ops`, `test-codex-dispatch`):** `NOT RUN` — built-in file tools only (no shell). Note from brief: Claude ran `test-ccx` 38/38 and `test-ccx-ops` 20/20 after the fixes, while `test-codex-dispatch` 70/70 predated the fix commit and has not yet been re-run.

---

### UPGRADE-2A Fixes (`handoffs/UPGRADE-2A-fix.diff`)

- **2A.1 A — Brief-eligible types and owner/route compatibility:** `PASS`
  - **Path:** `scripts/crucible.ps1:68-82, 90, 582-586`; checked against `ccx/policy.json:110-135` and `scripts/codex-dispatch.ps1:249-253`.
  - **Evidence:** `Test-BriefType` restricts briefs to `route -in @('worker','cheap','script')`, `agent -notin @('claude-subagent','cross-model')`, and no `gates`. That removes `architecture`, `plan`, `extract`, `review`, `media-generate`, and all `tool` types from both `crucible.ps1 types` and `Test-Brief`. `Assert-BriefType` additionally rejects `owner -in @('gemini','claude')` when `route -ne 'worker'` (`research`, `mechanical-migration`), matching `codex-dispatch.ps1:249-250`.

- **2A.1 B — `-Type` validation when `-Owns` is omitted:** `PASS`
  - **Path:** `scripts/crucible.ps1:144-146`
  - **Evidence:** `if ($Type -or $Owner -ne 'auto') { Assert-BriefType (Get-CcxPolicy) $briefType $Owner }` runs unconditionally before the `if ($Owns)` block, rejecting gated (`media-generate`), unlaunchable (`plan`), unknown, multiline, or owner-mismatched `-Type` values even without `-Owns`.

- **2A.2 A/B/C — `-Owns` YAML flow, comment, quote, and control-character injection:** `PASS`
  - **Path:** `scripts/crucible.ps1:96-105, 147-152`
  - **Evidence:** Line 101 rejects `[#\[\]{}'"`\u0085\u2028\u2029]` anywhere in the path and leading `^[@&*!|>?:-]` (in addition to `,` at line 149, `[\x00-\x1f]:"*?<>|` in `ConvertTo-CcxOwnedPath`, and `[%^&!()<>|`]` at line 99). All Round 1 payloads (`Reference/a #b.md`, `AGENTS.md] #x`, `Reference/doc[1].md`, `Reference/a]b.md`, `Reference/{a}.md`, `'AGENTS.md'`, `'Reference/a.md`) are refused before any file is written.
  - *Low-severity maintainability note:* `scripts/crucible.ps1:101` embeds literal Unicode U+2028 and U+2029 characters inside the double-quoted regex string rather than `\u2028\u2029` escapes; Windows PowerShell 5.1 parses them safely, so this is non-blocking.

- **New check — `Invoke-Run` PATH-order change (`scripts/crucible.ps1:278-281`):** `PASS` (low-severity behavioral note)
  - **Path:** `scripts/crucible.ps1:274-281`
  - **Can a WMI-started run (Obsidian) lose `agy`?** **No.** WMI's inherited `$env:Path` is followed by Machine and User registry `Path` entries, and every entry is expanded with `[Environment]::ExpandEnvironmentVariables($_)` (with `LOCALAPPDATA`/`APPDATA` populated on lines 276-277). A post-logon `agy` install in the User or Machine registry `Path` is still appended and found by `Get-Command agy.exe`.
  - **Can a WMI-started run pick a different CLI than before?** **Yes, in one narrow stale-logon edge case (Low):**
    - *Input:* A CLI (`codex.cmd`, `claude.exe`, `node.exe`, or `agy.exe`) exists in directory `D_old` (present on the logon `Path` inherited by `WmiPrvSE.exe`), and the user later installs a newer copy in `D_new` and prepends `D_new` to User/Machine registry `Path` (or removes `D_old` from registry `Path` while leaving the binary on disk) without logging out.
    - *Before:* Registry `Path` (`Machine`, `User`) preceded inherited `$env:Path`, so `D_new` won immediately.
    - *After:* Inherited `$env:Path` precedes registry `Path`, so `D_old` wins until the next logon/reboot. (Normal single-location installs and post-logon `agy` installs are unaffected, and keeping `$env:Path` first fixes `test-crucible.ps1`'s fake-CLI shadowing.)

- **`scripts/test-crucible.ps1` diff check:** `PASS`
  - **Path:** `scripts/test-crucible.ps1:139-147, 236-237`
  - **Evidence:** No pre-existing assertions weakened; adds negative assertions for `plan`/`architecture`/`extract`/`review`, unvalidated `-Type` without `-Owns`, owner/route mismatch, `#`/`]`/`[`/`{`/`'` injection, and verifies the fake Codex CLI actually answered in the handoff test.

- **Shell test suite (`scripts\test-crucible.ps1`):** `NOT RUN` — built-in file tools only (no shell; Claude reported 23/23).

---

## Verdicts

### UPGRADE-1 — Verdict: VERIFIED WITH CAVEATS

Claims:
| Claim | Observed | Status |
| --- | --- | --- |
| `Test-CcxScope` uses only the checked checkout's baseline (closes 1.1 A/B) | Verified in `.ccx-worktrees/codex-UPGRADE-1T/scripts/ccx-core.ps1:441-452` | PASS |
| Transient detection excludes timeout/tamper and checks only last error/stderr line (closes 1.2 A/B within documented `ponytail:` limit) | Verified in `.ccx-worktrees/codex-UPGRADE-1T/scripts/codex-dispatch.ps1:575-585, 674-677, 688` | PASS |
| `test-codex-dispatch` passes on the post-fix code | Not re-run after the fix commit (brief notes 70/70 was before the fix commit); no shell in this review | CAVEAT |
| `test-ccx` (38/38) and `test-ccx-ops` (20/20) pass | Cannot execute shell commands in this run | CAVEAT |

Open findings: none (Round 1 findings 1.1 A/B and 1.2 A/B are closed; no new defects introduced).

Caveats / Unverified:
- Re-run `scripts\test-codex-dispatch.ps1` in `.ccx-worktrees/codex-UPGRADE-1T` against the post-fix code (and re-run `scripts\test-ccx.ps1`, `scripts\test-ccx-ops.ps1`, `ccx verify`) — Next owner: claude
- Note: `UPGRADE-1-fix.diff` adds no new automated regression tests for cross-checkout baseline isolation (1.1 A/B) or timeout/tamper/recovered-5xx transient guards (1.2 A/B) — Next owner: claude (optional before commit)

---

### UPGRADE-2A — Verdict: VERIFIED WITH CAVEATS

Claims:
| Claim | Observed | Status |
| --- | --- | --- |
| `types` and `Test-Brief`/`Assert-BriefType` expose only launchable types and enforce owner/route rules (closes 2A.1 A) | Verified in `scripts/crucible.ps1:68-82, 90, 582-586` against `ccx/policy.json:110-135` and `scripts/codex-dispatch.ps1:249-253` | PASS |
| `Invoke-New` validates `-Type` even without `-Owns` (closes 2A.1 B) | Verified in `scripts/crucible.ps1:144-146` | PASS |
| `Test-Brief` rejects `#`, `[`, `]`, `{`, `}`, quotes, Unicode line breaks, and leading YAML indicators in `-Owns` (closes 2A.2 A/B/C) | Verified in `scripts/crucible.ps1:96-105, 147-152` | PASS |
| `Invoke-Run` PATH-order change preserves `agy` on WMI runs | Verified in `scripts/crucible.ps1:274-281`; cannot lose `agy` (low-severity stale-logon duplicate-binary note only) | PASS |
| `scripts/test-crucible.ps1` adds regression coverage without weakening existing tests | Verified in `scripts/test-crucible.ps1:139-147, 236-237` | PASS |
| `scripts/test-crucible.ps1` passes (23/23) | Cannot execute shell commands in this run | CAVEAT |
| Manual Obsidian plugin reload + modal creation | Cannot drive Obsidian | CAVEAT |

Open findings: none (Round 1 findings 2A.1 A/B and 2A.2 A/B/C are closed; no blocking defects introduced).

Caveats / Unverified:
- Shell execution of `scripts\test-crucible.ps1` — Next owner: claude
- Manual Obsidian plugin reload and creating a brief through `NewBriefModal` — Next owner: user

---

Acceptance:
- UPGRADE-1 fix verification complete (1.1 A/B, 1.2 A/B closed) — DONE (Verdict: VERIFIED WITH CAVEATS) — claude
- UPGRADE-2A fix verification complete (2A.1 A/B, 2A.2 A/B/C closed; `Invoke-Run` PATH order checked) — DONE (Verdict: VERIFIED WITH CAVEATS) — claude
- Written to `handoffs/UPGRADE-gemini-review-r2.md` — DONE — claude

Untested:
- `scripts\test-codex-dispatch.ps1` on the post-fix UPGRADE-1 worktree (brief notes 70/70 ran before the fix commit) — claude
- Shell execution of `scripts\test-ccx.ps1`, `scripts\test-ccx-ops.ps1`, `scripts\test-crucible.ps1`, and `ccx verify` (no shell in this run) — claude
- Manual Obsidian plugin reload and `NewBriefModal` creation check — user

UNKNOWN / CHECKED / NEEDED:
- CHECKED: `HANDOFF.md`, `tasks/UPGRADE-REVIEW-R2.md`, `handoffs/UPGRADE-gemini-review.md`, `handoffs/UPGRADE-1-fix.diff`, `handoffs/UPGRADE-2A-fix.diff`, `.ccx-worktrees/codex-UPGRADE-1T/scripts/ccx-core.ps1`, `.ccx-worktrees/codex-UPGRADE-1T/scripts/ccx-ops.ps1`, `.ccx-worktrees/codex-UPGRADE-1T/scripts/codex-dispatch.ps1`, `scripts/crucible.ps1`, `scripts/test-crucible.ps1`, `scripts/codex-dispatch.ps1`, `ccx/policy.json`.
- NEEDED: Claude to re-run `scripts\test-codex-dispatch.ps1` (and `ccx verify`) in `.ccx-worktrees/codex-UPGRADE-1T` on the post-fix code before accepting/merging UPGRADE-1; user to do the manual Obsidian modal check for UPGRADE-2A.

Out-of-scope findings:
- `scripts/crucible.ps1:101` uses literal U+2028/U+2029 characters inside a double-quoted regex string; replacing them with `\u2028\u2029` escapes is optional hygiene.
- If WMI runs ever need registry `Path` to outrank a stale logon `Path` for relocated CLIs while keeping fake CLIs first in tests, gating the prepend order on `$env:CRUCIBLE_INLINE -eq '1'` is a one-line follow-up.

Final git status --short: NOT RUN (no shell; left to launcher operator; only `handoffs/UPGRADE-gemini-review-r2.md` was created).

Next owner: claude - re-run test-codex-dispatch on the UPGRADE-1 fix commit, run ccx verify/review/done, and commit
