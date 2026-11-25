# UPGRADE-0-AUDIT: Friction & Workflow Audit Report

Task: UPGRADE-0-AUDIT
Start HEAD: 25c8ba0 (initial git status: 13 entries confirmed by launcher)

This audit examines the current codebase against six known workflow problems identified in `tasks/UPGRADE-0-AUDIT.md`.

---

## 1. Baseline of unrelated dirty files

**Verdict:** `partly fixed`

### Evidence
- **Where `baselineDirty` is recorded:**
  - `scripts/ccx-core.ps1:1172-1175` inside `Start-CcxTaskInState`:
    ```powershell
    if (-not $Task.baselines.ContainsKey($key)) {
        $Task.baselines[$key] = @(Get-CcxChangedPaths -Root $root | Where-Object { -not (Test-CcxPathOwned -Path $_ -Owns $Task.owns) })
    }
    $Task.baselineDirty = @($Task.baselines[$key])
    ```
- **Recorded by `task add`, `task start`, or only dispatch?**
  - `task add` (`scripts/ccx-core.ps1:1248`) initializes `$task.baselineDirty = @()` and `$task.baselines = @{}`. It does **not** capture dirty paths.
  - `task start` invokes `Start-CcxTaskInState` (`scripts/ccx-core.ps1:1172-1175`), which captures and records the baseline in `$task.baselines[$key]` and sets `$task.baselineDirty`.
  - `scripts/codex-dispatch.ps1:337` starts planned tasks via `Start-CcxTaskInState -State $state -Task $task` when dispatched.
  - A task run manually or by Claude without invoking `task start` (or when updated directly via `task update -Status active`) has no baseline recorded (`baselines` dictionary lacks the worktree key).
- **Does `ccx verify`'s scope stage subtract it?**
  - In `scripts/ccx-core.ps1:441-446`:
    ```powershell
    function Test-CcxScope {
        param($Task, [string]$Root = (Get-CcxRepoRoot))
        foreach ($path in @(Get-CcxChangedPaths -Root $Root)) {
            if (-not (Test-CcxPathOwned -Path $path -Owns $Task.owns) -and $path -notin $Task.baselineDirty -and -not (Test-CcxBrief -Root $Root -Path $path)) { $path }
        }
    }
    ```
  - And in `scripts/ccx-ops.ps1:336-340`:
    ```powershell
    $baselineKey = [IO.Path]::GetFullPath($root).TrimEnd('\','/').ToLowerInvariant()
    if ($task.baselines -is [Collections.IDictionary] -and -not $task.baselines.ContainsKey($baselineKey)) {
        $hits = @("no baseline recorded for this checkout: run ccx task start -Id $($task.id) here, then verify again")
    } else { $hits = @(Test-CcxScope -Task $task -Root $root) }
    ```
  - `Test-CcxScope` does subtract `$Task.baselineDirty` (`-and $path -notin $Task.baselineDirty`). However, if `task start` was never run in that checkout, verification fails with a diagnostic demanding `ccx task start` because `task add` does not capture the baseline.

### What would close it
Record the checkout baseline automatically during `task add` (or require `task add` to initialize `$task.baselines` for the current root), eliminating false scope failures when tasks are worked directly without an explicit `task start`.

---

## 2. Transient provider failures counted as attempts

**Verdict:** `still open`

### Evidence
- **How usage limits (exit 4) are kept from counting toward `maxDispatches`:**
  - In `scripts/codex-dispatch.ps1:659-660`:
    ```powershell
    # A run cut off by the usage limit says nothing about the task: it does not use a retry.
    if ($Role -eq 'implement') { $task.dispatches = [Math]::Max(0, [int]$task.dispatches - 1) }
    ```
  - In `scripts/codex-dispatch.ps1:566-568`, the usage limit pattern only matches:
    ```powershell
    $limitPattern = 'hit your usage limit|Quota exceeded|usage not included|usage limit reached|hit your limit|RESOURCE_EXHAUSTED|quota (?:exceeded|exhausted)'
    $limitMessages = @($messages | Where-Object { $_ -match $limitPattern })
    $limitMessages += @([IO.File]::ReadLines($base + '.stderr.log', $utf8) | Where-Object { $_ -match $limitPattern })
    ```
- **Handling of capacity errors or provider 5xx:**
  - There is **no handling** for provider capacity errors ("at capacity", "overloaded") or HTTP 5xx errors (e.g., Higgsfield 500) in `scripts/codex-dispatch.ps1`.
  - When such an error occurs, `$limitMessages` is empty, `$code` remains `1`, `task.dispatches` is **not** decremented, and the transient failure counts as a failed attempt toward `maxDispatches`.

### What would close it
Add transient error patterns (e.g. `at capacity`, `overloaded`, `5\d{2}\b`, `Server Error`, `service unavailable`) to a transient/capacity detection block in `codex-dispatch.ps1` that decrements `$task.dispatches` (or sets a transient exit code) so attempts are not burned on remote infrastructure failures.

---

## 3. Gemini fallback

**Verdict:** `partly fixed`

### Evidence
- **Where is the health check and what does it test?**
  - In `scripts/ccx-ops.ps1:656-675`:
    ```powershell
    foreach ($name in @($policy.providers.Keys)) {
        $provider = $policy.providers[$name]
        ...
        elseif (-not (Get-CcxProviderKey $provider.envKey)) { $detail = "$($provider.envKey) not set; route skips it" }
        elseif ($provider.cli) {
            if (Get-Command $provider.command -CommandType Application -ErrorAction SilentlyContinue) { $result = 'PASS'; $detail = "$($provider.command) present; $($provider.envKey) set" }
            else { $detail = "$($provider.command) not installed; route skips it" }
        }
    ```
  - Notice `scripts/ccx-ops.ps1:667`: `elseif (-not (Get-CcxProviderKey $provider.envKey))` runs before checking whether `$provider.auth -eq 'account'`! Even though `ccx/policy.json:48` specifies `auth: account` for Gemini (`agy`), `ccx-ops.ps1` still tests `Get-CcxProviderKey $provider.envKey` (where `envKey` is unset/null), reporting `provider-gemini not set; route skips it` in health checks.
  - In contrast, `scripts/ccx-core.ps1:745-746` correctly handles `auth: account`:
    ```powershell
    # auth account: the CLI holds the user's own sign-in (agy); a cloud API provider needs its key set.
    if ($provider.kind -eq 'cloud' -and $provider.auth -ne 'account' -and -not (Get-CcxProviderKey $provider.envKey)) { return $provider.envKey + ' is not set' }
    ```
- **Does Codex-usage-limit fallback in `Invoke-CcxRoute` reach Gemini?**
  - In `scripts/ccx-core.ps1:829-838`:
    ```powershell
    if ($decision.agent -eq 'codex' -and $state.agents.codex.unavailableUntil -and [DateTime]::Parse($state.agents.codex.unavailableUntil).ToUniversalTime() -gt [DateTime]::UtcNow) {
        # Codex quota is out: a ready fallback provider takes the work, else wait.
        $altProvider = Get-CcxProvider $policy 'fallback' $state
        if (-not $altProvider) {
            $decision.route = 'defer'
            $decision.reasons += 'Codex unavailable until ' + $state.agents.codex.unavailableUntil
            return (Complete-CcxRoute $decision $Type $TaskId)
        }
        $decision.reasons += 'Codex unavailable until ' + $state.agents.codex.unavailableUntil + ': fallback provider ' + $altProvider.name
    }
    ```
  - `Get-CcxProvider` (`scripts/ccx-core.ps1:753-764`) scans `$Policy.providers` for `use` containing `'fallback'`. In `ccx/policy.json:48`, `gemini` has `"use": ["fallback"]`. `Get-CcxProviderBlocker` allows `gemini` because `auth -eq 'account'` skips the `envKey` check and checks `agy.exe` on PATH.
  - However, in `Invoke-CcxRoute` (`scripts/ccx-core.ps1:878-884`):
    ```powershell
    'codex' {
        ...
        if ($altProvider) { $decision.provider = $altProvider.name; $decision.model = $altProvider.model; break }
    ```
    And in `scripts/codex-dispatch.ps1:249-253`:
    ```powershell
    $runnable = ($decision.agent -eq 'codex' -and $decision.route -in @('worker','cheap','script')) -or
                ($decision.agent -in @('gemini','claude') -and $decision.route -eq 'worker' -and $Role -eq 'implement' -and $task.owner -eq $decision.agent)
    ```
    When Codex is at its limit and routes to fallback provider `gemini`, `$decision.agent` is still `'codex'` and `$decision.provider` is `'gemini'`. In `codex-dispatch.ps1:260-261`:
    ```powershell
    if ($decision.agent -eq 'gemini') { $providerName = 'gemini'; $providerPolicy = $policy.providers.gemini }
    ```
    Because `$decision.agent` is `'codex'`, `$isGemini` / `$isAgy` is determined by lines 268-270:
    ```powershell
    if ($decision.provider -and $decision.provider -ne 'openai' -and $policy.providers.ContainsKey($decision.provider)) {
        $providerName = $decision.provider
        $providerPolicy = $policy.providers[$providerName]
    ```
    This correctly sets `$providerPolicy` to the gemini provider, and lines 373-374 set `$isAgy = $providerPolicy -and $providerPolicy.cli -eq 'agy'`.
  - But `ccx-ops.ps1:667` still falsely reports `provider-gemini not set` in `ccx health` because it ignores `provider.auth == 'account'`.

### What would close it
Fix `Invoke-CcxHealth` in `scripts/ccx-ops.ps1:667` to mirror `scripts/ccx-core.ps1:745` by checking `if ($provider.auth -ne 'account' -and -not (Get-CcxProviderKey $provider.envKey))`, allowing `ccx health` to recognize account-authenticated CLIs (`agy`) without checking an environment key.

---

## 4. Sandbox cannot create TEMP scratch folders

**Verdict:** `partly fixed`

### Evidence
- **How scratch roots are created:**
  - `scripts/test-ccx.ps1:15`:
    ```powershell
    $scratch = Join-Path $env:TEMP ('ccx-t1-' + [guid]::NewGuid().ToString('N'))
    ```
  - `scripts/test-codex-dispatch.ps1:10`:
    ```powershell
    $scratch = Join-Path $env:TEMP $scratchName
    ```
  - `scripts/test-crucible.ps1:11`:
    ```powershell
    $scratch = Join-Path $env:TEMP ('crucible-t-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    ```
- **Is there any fallback when TEMP is denied?**
  - **None**. In all three test scripts, `$env:TEMP` is directly used with `Join-Path` and `[IO.Directory]::CreateDirectory` or `New-Item`. There is no `try/catch` fallback to a repository-local directory (e.g. `.scratch/` or worktree temp) if `$env:TEMP` returns Access Denied.
  - The workaround documented in FRICTION.md (2026-11-12) and HANDOFF.md is procedural: dispatching verifiers with `-Sandbox workspace-write` instead of `read-only`, because `workspace-write` grants access to `%TEMP%`. The test scripts themselves have no code fallback.

### What would close it
Implement a fallback in test scripts to probe `$env:TEMP` and, if write access is denied, fall back to a gitignored local directory (e.g. `.\.tmp` or a task-local folder).

---

## 5. AGENTS.md / CLAUDE.md symmetry

**Verdict:** `still open`

### Evidence
- **Check in `ccx/policy.json` (`verify.stages`):**
  - In `ccx/policy.json:231-246`, the verification stages are:
    `parse`, `json`, `secrets`, `scope`, `memory`, `format`, `lint`, `tests-ccx`, `tests-ccx-ops`, `tests-dispatch`, `tests-mirror`, `tests-higgsfield`, `tests-crucible`, and `tests-external-tools`.
  - There is **no stage** checking symmetry between `AGENTS.md` and `CLAUDE.md`.
- **Check in `scripts/ccx-ops.ps1`:**
  - `scripts/ccx-ops.ps1` implements `powershell-parse`, `json-valid`, `secret-scan`, `task-scope`, and `memory-lint`.
  - Neither `scripts/ccx-ops.ps1` nor `scripts/ccx-core.ps1` contains any check asserting that an edit to `AGENTS.md` is accompanied by an edit to `CLAUDE.md` (or vice versa).
  - The symmetry requirement is documented solely as human-level policy text at the top of `AGENTS.md` and `CLAUDE.md`.

### What would close it
Add a built-in verification stage (e.g. `doc-symmetry`) in `verify.stages` / `ccx-ops.ps1` that fails if `AGENTS.md` is in the modified file list without `CLAUDE.md`, or `CLAUDE.md` without `AGENTS.md`.

---

## 6. Retiring slug `gpt-oss-120b-medium`

**Verdict:** `already fixed`

### Evidence
- **List of every file and line naming `gpt-oss-120b-medium`:**
  - A comprehensive search across all files in the repository yields **0 occurrences** of `gpt-oss-120b-medium`.
  - The only historical mention of related OSS models is in `ccx/ARCHITECTURE.md:168`:
    ```markdown
    ... On the free plan, DeepSeek, GLM, Kimi and MiniMax cloud models return 402; gpt-oss:120b answered but printed its tool call as text.
    ```
- **Is any occurrence a route, fallback, or default?**
  - No. No active policy (`ccx/policy.json`), script, test, or documentation file contains or references `gpt-oss-120b-medium` as a route, fallback, or default.

### What would close it
Already closed and clean; no reference exists in code or policy.

---

## Status
READY_FOR_CLAUDE_REVIEW

## Summary Table

| Item | Problem | Verdict |
|:---|:---|:---|
| 1 | Baseline of unrelated dirty files | `partly fixed` |
| 2 | Transient provider failures counted as attempts | `still open` |
| 3 | Gemini fallback (`provider-gemini not set`) | `partly fixed` |
| 4 | Sandbox cannot create TEMP scratch folders | `partly fixed` |
| 5 | AGENTS.md / CLAUDE.md symmetry | `still open` |
| 6 | Retiring slug `gpt-oss-120b-medium` | `already fixed` |

## Untested
All shell-dependent execution checks (`ccx health`, test suites `test-ccx.ps1`, `test-codex-dispatch.ps1`, `test-crucible.ps1`, and live `git` commands) were NOT RUN per the headless environment constraints.

Next owner: claude - reads the verdicts before planning
