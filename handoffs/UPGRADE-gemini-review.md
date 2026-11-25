# Independent Adversarial Review: UPGRADE-1 and UPGRADE-2A

Status: READY_FOR_CLAUDE_REVIEW
Task / start HEAD: UPGRADE-REVIEW / 8fcae31 (launcher confirmed repo root and initial git status: 6 entries)
Changes:
- `handoffs/UPGRADE-gemini-review.md:1` - wrote independent adversarial review report for UPGRADE-1 and UPGRADE-2A (sole owned output; no source or test files edited).
Decisions/deviations:
- Read-only review with built-in file tools only (no shell); shell test suites and Git commands are reported as `NOT RUN` per launcher and task instructions.
- Every finding below is grounded in static reading of the review packs, specs, diffs, and full current source files in `.ccx-worktrees/codex-UPGRADE-1T/` (UPGRADE-1) and the repo root (UPGRADE-2A).
Intent / Twins: none

## Checks

### UPGRADE-1 (Control Plane)

- **Attack 1.1 — Wrong baseline (laundering, restart, worktree move, legacy task, checkout leakage):** `FAIL` (High)
  - **Path:** `.ccx-worktrees/codex-UPGRADE-1T/scripts/ccx-core.ps1:441-446` (`Test-CcxScope`), called from `.ccx-worktrees/codex-UPGRADE-1T/scripts/ccx-ops.ps1:336-341` (`Invoke-CcxVerify`) and `.ccx-worktrees/codex-UPGRADE-1T/scripts/ccx-core.ps1:514` (`Invoke-CcxQuickChecks`).
  - **What holds:** Same-checkout restarts and resets to `planned` do NOT launder dirt (`Start-CcxTaskInState` at `ccx-core.ps1:1177` only captures when `-not $Task.baselines.ContainsKey($key)`). Legacy tasks without a `baselines` map still get the missing-baseline diagnostic when `planned` (`ccx-ops.ps1:338`) and preserve `baselineDirty` when non-pristine (`ccx-core.ps1:1163-1170`).
  - **Concrete failure A (laundering post-add dirt in checkout A via checkout B):**
    - *Input:* (1) In clean checkout A, run `ccx task add -Id T1 -Owns owned.txt ...` (`worktree=$null`, `baselines[A]=@()`, `baselineDirty=@()`). (2) In worktree B (where unowned `leak.txt` is dirty), run `ccx task start -Id T1` (`worktree=$null`, `baselines[B]=@('leak.txt')`, `baselineDirty=@('leak.txt')`). (3) Back in checkout A, dirty unowned `leak.txt` (after `task add`) and run `ccx verify -TaskId T1 -Stage scope`. (Same defect occurs if `T1` moves from worktree B back to checkout A via `ccx task update -Id T1 -Worktree <A>` without re-running `task start`.)
    - *Expected:* `FAIL scope` naming `leak.txt` (because `baselines[A]` is `@()`).
    - *Observed by reading:* `ccx-ops.ps1:338` sees `$task.baselines.ContainsKey(key(A))` is `$true` (`$missing = $false`) and calls `Test-CcxScope -Task $task -Root A`. `Test-CcxScope` (`ccx-core.ps1:444`) checks `$path -notin $Task.baselineDirty` instead of `$Task.baselines[$key]`. Because `$Task.baselineDirty` still holds checkout B's `@('leak.txt')`, `leak.txt` is **exempt (laundered)** and `scope` reports `PASS`—while any pre-add dirty file in `baselines[A]` would falsely fail `scope`.
  - **Concrete failure B (`task add` baseline in checkout A leaking into checkout B during dispatch quick-checks):**
    - *Input:* (1) In checkout A (where `leak.txt` is dirty), run `ccx task add -Id T1 -Owns owned.txt ...` (`baselineDirty=@('leak.txt')`, `worktree=$null`), then `ccx task update -Id T1 -Status active`. (2) In clean worktree B, run `codex-dispatch.ps1 -TaskId T1`; the agent edits unowned `leak.txt`.
    - *Expected:* `POST-CHECK FAIL scope ["leak.txt"]` (exit 9).
    - *Observed by reading:* `codex-dispatch.ps1:199,337` skips `Start-CcxTaskInState` (`worktree` is `$null`, `status` is already `active`); `codex-dispatch.ps1:622` calls `Invoke-CcxQuickChecks` -> `Test-CcxScope -Task $task -Root B` (`ccx-core.ps1:514,444`), which reads checkout A's `baselineDirty` and exempts `leak.txt` in checkout B.

- **Attack 1.2 — Real failure misread as transient:** `FAIL` (Medium)
  - **Path:** `.ccx-worktrees/codex-UPGRADE-1T/scripts/codex-dispatch.ps1:549-551, 575-581, 597-599, 670-673, 684`.
  - **What holds:** Ordinary failures without transient patterns spend 1 attempt and exit 1 (`codex-dispatch.ps1:575-580`). Tool/test output printing `"503"` or `"overloaded"` stays inside `item.completed` (not `$messages`, not `.stderr.log`), `.report.md` is never scanned by `$transientMessages`, and a completed turn sets `$hasUsage = $true` (`codex-dispatch.ps1:542-552, 577`).
  - **Concrete failure A (timeout or protected-file violation refunds implementation attempt):**
    - *Input:* A Codex `implement` run logs an early transient retry warning (`HTTP 503 Service Unavailable`) to stderr or as an `error` event, recovers and keeps working without emitting `turn.completed` (`$hasUsage = $false`), and is killed at `-TimeoutMinutes` (`$timedOut = $true`, `$process.ExitCode = 1`) — or an account-run provider edits a protected file (`$protectedChanged.Count -gt 0`) and exits nonzero with `"overloaded"` on stderr and no usage object.
    - *Expected:* Exit 5 (timeout) or exit 9 (protected file changed), NO `TRANSIENT PROVIDER FAILURE ... (no attempt used)` message, and `$task.dispatches` is NOT refunded.
    - *Observed by reading:* `codex-dispatch.ps1:577` checks only `$limitMessages.Count -eq 0 -and $code -ne 0 -and -not $hasUsage` (omitting `-not $timedOut -and -not $protectedChanged.Count`), populating `$transientMessages` and printing `TRANSIENT PROVIDER FAILURE ... (no attempt used)`. Lines 598-599 then overwrite `$code` to `9` or `5`, but lines 670-673 still check `$transientMessages.Count -gt 0 -and $Role -eq 'implement'` (ignoring `$code -ne 4`) and decrement `$task.dispatches` (and line 684 appends `:limit:` to the event key).
  - **Concrete failure B (recovered 5xx followed by an ordinary non-transient `turn.failed`):**
    - *Input:* Codex emits `{type:'error', message:'Reconnecting... HTTP 503 Service Unavailable'}` (or writes it to stderr), recovers, and later terminates with `{type:'turn.failed', error:{message:'invalid_request_error'}}`, exit 1, no `turn.completed` (`$hasUsage = $false`).
    - *Expected:* Ordinary terminal failure (`exit 1`), attempt spent.
    - *Observed by reading:* `codex-dispatch.ps1:549-551` appends every `error` event to `$messages` and line 579 scans all lines of `.stderr.log`; the earlier recovered 503 matches `$transientPattern`, turning the non-transient `turn.failed` into exit 4 (`line 597`) and refunding the attempt (`line 672`).

- **Attack 1.3 — Fallback loop, blocked Gemini deferral, Gemini-owned routing:** `PASS`
  - **Evidence:** `Get-CcxProvider` (`ccx-core.ps1:753-764`) iterates `$Policy.providers.Keys` once in policy order; `Get-CcxPolicy` (`ccx-core.ps1:110`) forbids `'openai'` as a provider name, preventing any cycle back to Codex. When Codex is unavailable (`ccx-core.ps1:829-838, 884-889, 974-981`), `gemini` fallback selects `$policy.classes[$Class].geminiModel` (and escalates tier on retry/ambiguity) while leaving `$decision.agent = 'codex'` and `$task.owner` unchanged. When `gemini` is blocked in `state.providerLimits` (`ccx-core.ps1:742-743`), `Get-CcxProvider` skips it and tries the next eligible fallback or returns `$null` -> `route = 'defer'` (`ccx-core.ps1:832-835`) -> `codex-dispatch.ps1:244-246` exits 4 without running `agy`. Gemini-owned tasks (`ccx-core.ps1:920-931`) still check `Get-CcxProviderBlocker` for `gemini`, defer without falling back if blocked, and select `classes.<class>.geminiModel`. `ccx/policy.json:137` keeps `"agentShell": []`.

- **Attack 1.4 — Health `agy` invocation:** `PASS`
  - **Evidence:** `Invoke-CcxHealth` (`ccx-ops.ps1:677-685`) handles `$provider.auth -eq 'account' -and $provider.command` before the `Get-CcxProviderKey` branch (`line 686`), resolves the binary with `Get-Command -CommandType Application`, and executes only `& $cli.Source --version 2>&1 | Select-Object -First 1` (`line 683`)—never `-p`, never a permission-bypass flag, never any other argument. `Invoke-CcxHealthSelfTests` (`ccx-ops.ps1:549-594`) never invokes `agy`. (Low-severity note: line 683 runs even under `-Quick` without a timeout wrapper, and a nonzero exit from `--version` still reports `PASS` with `version unknown; sign-in unknown`.)

- **Attack 1.5 — Symmetry stage (renames, case, subfolder `AGENTS.md`):** `PASS`
  - **Evidence:** Registered once in `ccx/policy.json:237` (`{ "name": "symmetry", "builtin": "instruction-symmetry", "quick": true }`) and implemented in `ccx-ops.ps1:344-351` using `Get-CcxChangedPaths` (`ccx-core.ps1:393-411`, `git status --porcelain=v1 -z --untracked-files=all`). Subfolder paths (`docs/AGENTS.md`) do not match `'AGENTS.md' -in $changed` (no false fail). Staged renames/copies include both old and new paths (`ccx-core.ps1:408`); unstaged renames emit ` D <old>` + `?? <new>` (both caught). PowerShell `-in` is case-insensitive, matching Windows NTFS so case-variants cannot bypass symmetry. (Design note consistent with `tasks/UPGRADE-1.md:16`: symmetry checks the entire checkout's uncommitted changes, so pre-existing single-sided `AGENTS.md` dirt in a shared checkout will fail `ccx verify` on unrelated tasks even when baselined in `scope`.)

- **Attack 1.6 — Test diff checked for weakened pre-existing assertions:** `PASS`
  - **Evidence:** Inspected all hunks in `handoffs/UPGRADE-1.diff:148-414`. All three fixture adjustments to pre-existing tests (`scripts/test-ccx-ops.ps1:350`, `scripts/test-ccx.ps1:718-721`, `scripts/test-codex-dispatch.ps1:952-953, 959-960`) trace directly to `tasks/UPGRADE-1.md` Requirement 1 (baseline captured at `task add` instead of first `task start`). No assertions were loosened, deleted, skipped, or replaced with mocks.

- **Shell test suites (`scripts\test-ccx.ps1`, `scripts\test-ccx-ops.ps1`, `scripts\test-codex-dispatch.ps1`, `scripts\test-crucible.ps1`):** `NOT RUN` — built-in file tools only (no shell in this run).

---

### UPGRADE-2A (Obsidian New Brief Modal)

- **Attack 2A.1 — Can the modal create an unlaunchable or unsafe brief?:** `FAIL` (High)
  - **Path:** `scripts/crucible.ps1:74-77, 129-136, 565-569`; `.obsidian/plugins/crucible/main.js:18-28, 38-41, 89-93`; `scripts/codex-dispatch.ps1:249-253`; `scripts/ccx-core.ps1:803-806`.
  - **Concrete failure A (Modal Work type dropdown offers 4 unconditionally unlaunchable types + 2 owner-unlaunchable types):**
    - *Input:* User opens `NewBriefModal`, sets Title `Design auth`, Owner `auto` (or any owner), Work type `plan` (or `architecture`, `extract`, `review`), Output file `Reference/design.md`, and clicks Create. (Or Work type `research` / `mechanical-migration` with Owner `claude` or `gemini`.)
    - *Expected:* `crucible.ps1 types` exposes only types that can actually be launched as Obsidian briefs, and `crucible.ps1 new` refuses unlaunchable combinations before creating a file.
    - *Observed by reading:* `scripts/crucible.ps1:568` (and `Test-Brief` at `scripts/crucible.ps1:74-77`) filters only `route -ne 'tool'` and no `gates`. From `ccx/policy.json:110-135`, that emits `architecture` (`route: premium`), `plan` (`route: premium`), `extract` (`route: cheap`, `agent: claude-subagent`), and `review` (`agent: cross-model`). `crucible.ps1 new` creates the brief, and launching it **always fails**:
      - `architecture` / `plan`: `codex-dispatch.ps1:249-252` rejects `route = 'premium'` with exit 8.
      - `extract`: `codex-dispatch.ps1:249-252` rejects `agent = 'claude-subagent'` with exit 8.
      - `review`: `ccx-core.ps1:804` throws exit 2 (`Cross-model review requires AuthoredBy claude, codex or gemini.`) because launch/dispatch never supplies `-AuthoredBy`.
      - `research` (`route: cheap`) and `mechanical-migration` (`route: script`): `codex-dispatch.ps1:250` only allows `claude`/`gemini` on `route -eq 'worker'`, so both fail with exit 8 when Owner is `claude` or `gemini`.
  - **Concrete failure B (`-Type` unvalidated when `-Owns` is omitted, Medium severity):**
    - *Input:* `crucible.ps1 new -Title "X" -Type media-generate` (or `-Type "docs`nchecks: [lt-unit]"`) without `-Owns`.
    - *Expected:* Gated, invalid, or multiline `-Type` is rejected with no note created.
    - *Observed by reading:* `scripts/crucible.ps1:129-136, 143` runs `Test-Brief` only inside `if ($Owns)`, so any `-Type` value is interpolated directly into frontmatter when `-Owns` is omitted (CLI-reachable; modal constrains `-Type` to `crucible.ps1 types`).

- **Attack 2A.2 — Can `-Owns` input inject YAML or frontmatter lines (`newline`, `#`, `]`, `'`, `[`, `{`)?:** `FAIL` (High)
  - **Path:** `scripts/crucible.ps1:54, 59, 61, 83-90, 131-136, 146`; `scripts/ccx-core.ps1:347-370`.
  - **What holds:** Standard newlines (`\r`, `\n`) in `-Owns` are blocked—leading/trailing whitespace is stripped by `.Trim()` (`scripts/crucible.ps1:134-135`) and interior `\x00-\x1f` (including `\r`, `\n`), `:`, `"`, `*`, `?`, `<`, `>`, `|` are rejected by `ConvertTo-CcxOwnedPath` (`ccx-core.ps1:350`), while `,` is rejected at `scripts/crucible.ps1:133` and `%^&!()<>|\`` at `scripts/crucible.ps1:86`.
  - **Concrete failure A (`#` comment stripping corrupts `owns` and bypasses `new`-time protected-path check):**
    - *Input 1:* `-Owns "Reference/a #b.md"`
    - *Expected:* Refused before creating a file (cannot round-trip unquoted inside inline YAML `owns: [...]` with comment stripping).
    - *Observed by reading:* Passes `ConvertTo-CcxOwnedPath` and `Test-Brief`; `scripts/crucible.ps1:135,146` writes `owns: [Reference/a #b.md]            # ...`. In Obsidian's YAML parser, ` #b.md]` is parsed as a comment, leaving an unclosed `[` (**Invalid YAML**). In `Read-Brief` (`scripts/crucible.ps1:54,61`), `$line -replace '\s+#.*$'` strips ` #b.md]...`, corrupting `$fm.owns` to the string `'[Reference/a'`.
    - *Input 2:* `-Owns "AGENTS.md] #x"`
    - *Expected:* Refused with no file created (`AGENTS.md` is in `agentProtectedPaths`).
    - *Observed by reading:* `Test-CcxPathOverlap 'AGENTS.md] #x' 'AGENTS.md'` (`ccx-core.ps1:364-370`) is `$false`, so `Invoke-New` writes `owns: [AGENTS.md] #x]            # ...`. `Read-Brief` (`scripts/crucible.ps1:54,59`) then strips ` #x]...` and parses `$fm.owns = @('AGENTS.md')`—bypassing `new`-time validation to create an unlaunchable protected-path brief (and for non-protected paths like `"Reference/other.md] #x"`, silently changing the owned path to `Reference/other.md`).
  - **Concrete failure B (`]`, `[`, `{`, `}` break YAML flow syntax):**
    - *Input:* `-Owns "Reference/doc[1].md"`, `-Owns "Reference/a]b.md"`, or `-Owns "Reference/{a}.md"`.
    - *Expected:* Refused before creating a file.
    - *Observed by reading:* Passes `Invoke-New` and writes `owns: [Reference/doc[1].md]` / `owns: [Reference/a]b.md]` / `owns: [Reference/{a}.md]`. Unquoted YAML flow indicators inside `[...]` produce **Invalid YAML** in Obsidian's Properties UI.
  - **Concrete failure C (Single quote `'` bypasses `new`-time protected-path check and breaks YAML when unmatched):**
    - *Input:* `-Owns "'AGENTS.md'"` (or `-Owns "'Reference/a.md"`).
    - *Expected:* Refused with no file created.
    - *Observed by reading:* `Test-CcxPathOverlap "'AGENTS.md'" "AGENTS.md"` is `$false`, so `Invoke-New` writes `owns: ['AGENTS.md']`. Both `Read-Brief` (`scripts/crucible.ps1:59`, `Trim('"', "'")`) and Obsidian's YAML parser decode that as `AGENTS.md` (bypassing `new`-time validation and creating an unlaunchable brief). An unmatched leading `'` (`'Reference/a.md`) produces invalid YAML in Obsidian. (Leading `@` is also a reserved YAML indicator; Unicode line breaks `\u2028`/`\u2029`/`\u0085` are outside `[\x00-\x1f]`.)

- **UPGRADE-2A test diff checked for weakened assertions:** `PASS`
  - **Evidence:** `handoffs/UPGRADE-2A.diff:109-133` only adds one new case (`new validates a launch-ready brief`) in `scripts/test-crucible.ps1:131-144` without weakening any pre-existing test. (Gap: it checks generated frontmatter with raw regex rather than round-tripping through `Read-Brief`/`Test-Brief` or launching.)

- **Shell test suite (`scripts\test-crucible.ps1`):** `NOT RUN` — built-in file tools only (no shell in this run).

---

## Verdicts

### UPGRADE-1 — Verdict: REFUTED

Claims:
| Claim | Observed | Status |
| --- | --- | --- |
| Baseline at `task add` isolates pre-add dirt and prevents laundering across checkouts | `task add` records `baselines[$addKey]` and `Start-CcxTaskInState` never recaptures an existing checkout key, **but** `Test-CcxScope` (`ccx-core.ps1:444`) checks `$Task.baselineDirty` instead of `$Task.baselines[$key]`, allowing cross-checkout laundering and leakage | REFUTED |
| Transient capacity/5xx failures exit 4 and refund attempt without misreading real failures | Ordinary failures, test stdout, and report text are safe, **but** `codex-dispatch.ps1:577,670-673` refunds attempts on timeout (exit 5) / protected-file tamper (exit 9) if earlier stderr/events had a 5xx, and misreads a recovered 5xx followed by an ordinary `turn.failed` | REFUTED |
| Codex-limit fallback uses `classes.<class>.geminiModel`, defers when Gemini blocked, no loop, Gemini-owned routing intact | Verified in `ccx-core.ps1:742-764,829-838,884-889,920-931,974-981` and `codex-dispatch.ps1:244-275`; `agentShell` stays `[]` | PASS |
| Account-auth `agy` health skips env-key and runs only `--version` | Verified in `ccx-ops.ps1:677-685` | PASS |
| Symmetry verify stage catches single-sided `AGENTS.md`/`CLAUDE.md` changes without false pass/fail | Verified in `ccx/policy.json:237`, `ccx-ops.ps1:344-351`, `ccx-core.ps1:393-411` | PASS |
| Test diff does not weaken pre-existing assertions | Verified in `handoffs/UPGRADE-1.diff:148-414`; all 3 fixture edits trace to Requirement 1 | PASS |
| Four suites exit 0 (`test-ccx`, `test-ccx-ops`, `test-codex-dispatch`, `test-crucible`) | Cannot execute shell commands in this run | CAVEAT |
| Diff vs allowlist | `handoffs/UPGRADE-1.diff` touches only the 7 allowlisted files (UPGRADE-1 + UPGRADE-1T), but `handoffs/UPGRADE-1-review.md` lists 19 changed paths over `c754f7a..3609762` (12 outside allowlist; commit history not inspectable without shell) | CAVEAT |

Findings:
- `.ccx-worktrees/codex-UPGRADE-1T/scripts/ccx-core.ps1:441-446` | high | `Test-CcxScope` checks `$path -notin $Task.baselineDirty` instead of looking up `$Task.baselines[$key]` for `$Root`, letting checkout B's `baselineDirty` launder post-add dirt in checkout A during `ccx verify` and letting checkout A's `task add` baseline leak into `Invoke-CcxQuickChecks` in checkout B. | Smallest fix: resolve `$key = [IO.Path]::GetFullPath($Root).TrimEnd('\','/').ToLowerInvariant()` inside `Test-CcxScope` and compare against `@($Task.baselines[$key])` when `$Task.baselines` is a dictionary (falling back to `@()` if `$key` is absent, and to `@($Task.baselineDirty)` only for legacy tasks without `baselines`).
- `.ccx-worktrees/codex-UPGRADE-1T/scripts/codex-dispatch.ps1:577-581, 670-673, 684` | medium | `$transientMessages` detection and attempt refund do not exclude `$timedOut` (exit 5) or `$protectedChanged` (exit 9), and scan all historical `$messages`/`.stderr.log` lines rather than checking whether the terminal failure itself was transient, so an early recovered 5xx + later timeout/tamper/ordinary `turn.failed` refunds the attempt (or exits 4). | Smallest fix: add `-and -not $timedOut -and -not $protectedChanged.Count` at line 577, require `$code -eq 4` at lines 670 and 684, and when a `turn.failed` event exists match `$transientPattern` only against the terminal `turn.failed` error message.

Caveats / Unverified:
- Execution of `scripts\test-ccx.ps1`, `scripts\test-ccx-ops.ps1`, `scripts\test-codex-dispatch.ps1`, `scripts\test-crucible.ps1` and `ccx verify` — Next owner: claude
- Confirming why `handoffs/UPGRADE-1-review.md` lists 12 non-allowlisted paths in `c754f7a..3609762` (`git log` / `ccx merge-check` against `main`) — Next owner: claude

---

### UPGRADE-2A — Verdict: REFUTED

Claims:
| Claim | Observed | Status |
| --- | --- | --- |
| `crucible.ps1 new -Owns` validates with the same `Test-Brief` rules as launch before writing any file | `scripts/crucible.ps1:131-136,146` does not reject `#`, `]`, `[`, `{`, `}`, `'`, `@`; inputs such as `Reference/a #b.md`, `AGENTS.md] #x`, `Reference/doc[1].md`, and `'AGENTS.md'` produce broken YAML, corrupt `owns`, or bypass `new`-time protected-path validation | REFUTED |
| `crucible.ps1 types` offers only valid brief-eligible choices so the modal creates launchable briefs | `scripts/crucible.ps1:565-569` exposes `architecture`, `plan`, `extract`, `review` (all fail on launch) and `research`/`mechanical-migration` (fail for `claude`/`gemini` owners) | REFUTED |
| Diff stays within UPGRADE-2A allowlist and weakens no existing tests | `handoffs/UPGRADE-2A-review.md` and `handoffs/UPGRADE-2A.diff` touch only `.obsidian/plugins/crucible/main.js`, `scripts/crucible.ps1`, `scripts/test-crucible.ps1`; no existing assertions weakened | PASS |
| `scripts/test-crucible.ps1` passes | Cannot execute shell commands in this run | CAVEAT |
| Manual Obsidian plugin reload + modal brief creation | Cannot drive Obsidian (marked NEEDED in `tasks/UPGRADE-2A.md:13`) | CAVEAT |

Findings:
- `scripts/crucible.ps1:131-136, 146` | high | `-Owns` is written unquoted into `owns: [$($Owns.Trim())]` while rejecting only `,` (plus `ConvertTo-CcxOwnedPath`/`Test-Brief` characters); `#`, `]`, `[`, `{`, `}`, `'`, and leading `@` pass `Invoke-New`, producing invalid Obsidian YAML (`Reference/a #b.md`, `Reference/doc[1].md`, `'Reference/a.md`) or bypassing `new`-time protected-path validation (`AGENTS.md] #x`, `'AGENTS.md'`) so `Read-Brief` decodes `AGENTS.md` on launch. | Smallest fix: reject `[,#\[\]{}'\x85\u2028\u2029]` and leading `@` in `Test-Brief` (and therefore `Invoke-New`), and in `test-crucible.ps1` round-trip the written brief through `Read-Brief` + `Test-Brief` with negative tests for `#`, `]`, `[`, `'`.
- `scripts/crucible.ps1:74-77, 565-569` | high | `crucible.ps1 types` (and `Test-Brief`) lists `architecture`, `plan`, `extract`, and `review` in the modal dropdown even though `codex-dispatch.ps1:249-253` and `ccx-core.ps1:804` unconditionally refuse them on launch (exit 8 / exit 2), and lists `research` / `mechanical-migration` which fail with exit 8 when Owner is `claude` or `gemini`. | Smallest fix: exclude `route -in @('tool','premium')` and `agent -in @('claude-subagent','cross-model')` from `crucible.ps1 types` and `Test-Brief`, and either exclude `cheap`/`script` types from briefs or reject them when `owner` is `claude`/`gemini`.
- `scripts/crucible.ps1:129-136` | medium | When `-Owns` is omitted, `Invoke-New` skips `Test-Brief` entirely, so `crucible.ps1 new -Title X -Type <bad>` writes gated, unknown, or multiline `-Type` values unvalidated into frontmatter. | Smallest fix: validate `$briefType` against the eligible brief-type rule whenever `-Type` is provided, regardless of whether `-Owns` is set.

Caveats / Unverified:
- Execution of `scripts\test-crucible.ps1` — Next owner: claude
- Manual Obsidian plugin reload and creating a brief through `NewBriefModal` — Next owner: user

---

Acceptance:
- UPGRADE-1 adversarial review complete (all 6 attacks checked in code, diff, spec, pack) — DONE (2 FAILs found; Verdict: REFUTED) — claude
- UPGRADE-2A adversarial review complete (launchability and `-Owns` YAML/frontmatter injection checked in code, diff, spec, pack) — DONE (3 FAILs found; Verdict: REFUTED) — claude
- Written to `handoffs/UPGRADE-gemini-review.md` — DONE — claude

Untested:
- Shell execution of `scripts\test-ccx.ps1`, `scripts\test-ccx-ops.ps1`, `scripts\test-codex-dispatch.ps1`, `scripts\test-crucible.ps1`, and `ccx verify` (no shell access in this run) — claude
- Git commit-graph check for the 12 extra changed paths listed in `handoffs/UPGRADE-1-review.md` (`c754f7a..3609762`) — claude
- Manual Obsidian plugin reload and modal creation check (`tasks/UPGRADE-2A.md:13`) — user

UNKNOWN / CHECKED / NEEDED:
- CHECKED: `HANDOFF.md`, `tasks/UPGRADE-REVIEW.md`, `handoffs/UPGRADE-1-review.md`, `tasks/UPGRADE-1.md`, `handoffs/UPGRADE-1.diff`, `.ccx-worktrees/codex-UPGRADE-1T/ccx/policy.json`, `.ccx-worktrees/codex-UPGRADE-1T/scripts/{ccx.ps1,ccx-core.ps1,ccx-ops.ps1,codex-dispatch.ps1,test-ccx.ps1,test-ccx-ops.ps1,test-codex-dispatch.ps1}`, `handoffs/UPGRADE-2A-review.md`, `tasks/UPGRADE-2A.md`, `handoffs/UPGRADE-2A.diff`, `scripts/crucible.ps1`, `scripts/test-crucible.ps1`, `.obsidian/plugins/crucible/main.js`, `handoffs/UPGRADE-ux-review.md`.
- NEEDED: Claude to fix the 2 FAILs in UPGRADE-1 and 3 FAILs in UPGRADE-2A, add regression tests covering cross-checkout baseline isolation, timeout/recovered-5xx transient guards, launchable brief types, and `-Owns` YAML/comment/quote injection, and re-run all four PowerShell suites.

Out-of-scope findings:
- `handoffs/UPGRADE-1-review.md:7-28` lists 19 changed paths across `c754f7a..3609762` (12 outside the UPGRADE-1 + UPGRADE-1T allowlists), whereas `handoffs/UPGRADE-1.diff` contains only the 7 allowlisted files; likely caused by `-Base` predating sibling commits on the branch—verify with `ccx merge-check` before merging.
- `.obsidian/plugins/crucible/main.js:26` closes `NewBriefModal` before `create()` runs `crucible.ps1 new`, so a validation refusal discards the user's typed title/output path (UX friction, not a safety defect).

Final git status --short: NOT RUN (no shell; left to launcher operator; only `handoffs/UPGRADE-gemini-review.md` was created).

Next owner: claude - fixes FAILs
