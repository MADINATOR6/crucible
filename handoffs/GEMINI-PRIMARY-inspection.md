# GEMINI-PRIMARY inspection (Gemini, read-only, advisory; agy plan mode with all writes denied, 2026-11-26)

### 1. `providers.gemini.use` and all code reading a provider's `"use"` list

- **Current value** ([policy.json:48](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L48)):
  ```json
  "gemini": { "kind": "cloud", "enabled": true, "cli": "agy", "auth": "account", "note": "...", "command": "agy.exe", "codexFlags": [], "model": "gemini-4-neon-medium", "use": ["fallback"] }
  ```
  `providers.gemini.use` is `["fallback"]`.

- **Every place in the code that reads a provider's `"use"` list** — there is **only one** ([ccx-core.ps1:759-770](file:///C:/Users/Madison/code/claude-codex-collab/scripts/ccx-core.ps1#L759-L770)):
  ```powershell
  function Get-CcxProvider {
      # First enabled provider (policy order) serving this purpose whose prerequisite exists:
      # a local CLI on PATH, or a cloud API key in the environment (setting the key is the opt-in).
      param($Policy, [string]$Purpose, $State)
      if (-not $Policy.ContainsKey('providers')) { return $null }
      foreach ($name in @($Policy.providers.Keys)) {
          $provider = $Policy.providers[$name]
          if (-not $provider.enabled -or $Purpose -notin @($provider.use)) { continue }
          if ($null -eq (Get-CcxProviderBlocker $Policy $name $State)) { return @{ name = $name; model = $provider.model; kind = $provider.kind } }
      }
      return $null
  }
  ```

- **Purposes the code recognizes** (all callers of `Get-CcxProvider`, both inside `Invoke-CcxRoute` and only when `$decision.agent -eq 'codex'`):
  1. **`'fallback'`** ([ccx-core.ps1:835-837](file:///C:/Users/Madison/code/claude-codex-collab/scripts/ccx-core.ps1#L835-L837)), when OpenAI Codex is recorded unavailable (usage limit):
     ```powershell
     if ($decision.agent -eq 'codex' -and $state.agents.codex.unavailableUntil -and [DateTime]::Parse($state.agents.codex.unavailableUntil).ToUniversalTime() -gt [DateTime]::UtcNow) {
         # Codex quota is out: a ready fallback provider takes the work, else wait.
         $altProvider = Get-CcxProvider $policy 'fallback' $state
     ```
  2. **`$Class`** (`routine`, `normal`, `complex`, `critical`, `exceptional`) ([ccx-core.ps1:886-888](file:///C:/Users/Madison/code/claude-codex-collab/scripts/ccx-core.ps1#L886-L888)), on attempt 1 of a Codex-routed task (intended for local providers such as `ollama`/`lmstudio`, which have `"use": ["routine"]` in [policy.json:45-46](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L45-L46)):
     ```powershell
     if (-not $altProvider -and $Attempt -eq 1) {
         $altProvider = Get-CcxProvider $policy $Class $state
         if ($altProvider) { $decision.reasons += 'local provider ' + $altProvider.name + ' for ' + $Class + ' work' }
     }
     ```
  - The `'gemini'` agent branch ([ccx-core.ps1:926-937](file:///C:/Users/Madison/code/claude-codex-collab/scripts/ccx-core.ps1#L926-L937)) **does not call `Get-CcxProvider` and never reads `providers.gemini.use`**; it calls `Get-CcxProviderBlocker $policy 'gemini' $state` directly. No code anywhere recognizes `"primary"`.

---

### 2. Full task-type routing block (verbatim)

Key name: **`"taskTypes"`** ([policy.json:110-135](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L110-L135)):

```json
  "taskTypes": {
    "git-state": { "route": "tool", "level": "L0", "command": "git status --short --branch" },
    "list-files": { "route": "tool", "level": "L0", "command": "git ls-files" },
    "search": { "route": "tool", "level": "L0", "command": "git grep -n -I -e <pattern> (or the agent's own Grep tool)" },
    "format": { "route": "tool", "level": "L1", "verifyStage": "format" },
    "lint": { "route": "tool", "level": "L2", "verifyStage": "parse" },
    "test": { "route": "tool", "level": "L2", "command": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\ccx.ps1 verify" },
    "health": { "route": "tool", "level": "L2", "command": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\ccx.ps1 health" },
    "mechanical-migration": { "route": "script", "agent": "codex", "level": "L1", "note": "The agent writes or reuses a deterministic script; the script makes the edits." },
    "extract": { "route": "cheap", "agent": "claude-subagent", "level": "L0" },
    "research": { "route": "cheap", "agent": "codex", "codexRole": "research", "level": "L0" },
    "docs": { "route": "worker", "agent": "claude", "level": "L1" },
    "implement": { "route": "worker", "agent": "codex", "codexRole": "implement", "level": "L1" },
    "media-generate": { "route": "worker", "agent": "codex", "codexRole": "implement", "level": "L4", "gates": ["paid-action"], "ledger": "media-out/higgsfield/", "note": "Spends Higgsfield credits: task add needs -CreditCap and one owned media-out/higgsfield/<project>/ folder; the launcher consumes a paid-action approval; task done checks it and the ledger." },
    "media-edit": { "route": "worker", "agent": "codex", "codexRole": "implement", "level": "L2", "note": "Local ffmpeg edits of existing media only; no Higgsfield calls." },
    "refactor": { "route": "worker", "agent": "codex", "codexRole": "implement", "level": "L1" },
    "test-write": { "route": "worker", "agent": "codex", "codexRole": "implement", "level": "L1" },
    "debug": { "route": "worker", "agent": "codex", "codexRole": "implement", "level": "L2" },
    "verify": { "route": "worker", "agent": "codex", "codexRole": "verify", "level": "L0", "verification": ["deterministic", "cross-model-review"] },
    "review": { "route": "worker", "agent": "cross-model", "level": "L0" },
    "architecture": { "route": "premium", "agent": "claude", "level": "L0" },
    "plan": { "route": "premium", "agent": "claude", "level": "L0" },
    "source-research": { "route": "worker", "agent": "gemini", "level": "L1", "note": "Research or source synthesis that ends in a deliverable file; quotes source passages (check: sources)." },
    "creative": { "route": "worker", "agent": "gemini", "level": "L1", "note": "Creative development, scripts and storyboards that end in a deliverable file." },
    "ux-review": { "route": "worker", "agent": "gemini", "level": "L1", "note": "Visual, video or user-experience review of shareable material; findings carry frames or timestamps." }
  },
```

---

### 3. Tiered model config for Gemini and how retries step up the tier

- **Provider default** ([policy.json:48](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L48)):
  `"model": "gemini-4-neon-medium"`
- **Per-class `geminiModel`** ([policy.json:55-86](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L55-L86)):
  - `classes.routine.geminiModel` (`policy.json:57`): `"gemini-3.8-flash-low"`
  - `classes.normal.geminiModel` (`policy.json:64`): `"gemini-4-neon-medium"`
  - `classes.complex.geminiModel` (`policy.json:70`): `"gemini-4-neon-high"`
  - `classes.critical.geminiModel` (`policy.json:76`): `"gemini-4-neon-xhigh"`
  - `classes.exceptional.geminiModel` (`policy.json:82`): `"gemini-4-neon-xhigh"`
- **Initial model selection**:
  - Direct Gemini (`ccx-core.ps1:934-936`):
    ```powershell
    $decision.provider = 'gemini'
    $preferred = @(@($policy.classes[$Class].geminiModel, $policy.providers.gemini.model) | Where-Object { $_ })
    $decision.model = $preferred[0]
    ```
  - Gemini as Codex fallback (`ccx-core.ps1:891-893`):
    ```powershell
    $decision.provider = $altProvider.name; $decision.model = $altProvider.model
    # Gemini as fallback takes the same class-tier model as Gemini-owned work.
    if ($altProvider.name -eq 'gemini' -and $policy.classes[$Class].geminiModel) { $decision.model = $policy.classes[$Class].geminiModel }
    ```
- **Retry / ambiguity tier step-up** ([ccx-core.ps1:958-988](file:///C:/Users/Madison/code/claude-codex-collab/scripts/ccx-core.ps1#L958-L988)):
  - Because `classes.<class>.effort` has only `codex` and `claude` entries, Gemini uses `effort.codex` (`ccx-core.ps1:960`):
    ```powershell
    $efforts = if ($policy.classes[$Class].effort.ContainsKey($decision.agent)) { $policy.classes[$Class].effort[$decision.agent] } else { $policy.classes[$Class].effort.codex }
    ```
  - Each retry adds `escalation.stepsOnFailedAttempt` (1) to effort on `effortLadder` (`["low","medium","high","xhigh","max"]`), plus `stepsOnAmbiguity` (1) if `-Ambiguous`, capped by `escalation.maxSteps` (2), `effort.codex.max`, and `maxEffortNeedsFailedAttempts` (2) for `max` (`policy.json:52,94-99`; `ccx-core.ps1:961-977`).
  - When `$index -gt $baseIndex`, `Invoke-CcxRoute` rewrites **only the suffix** of the current model family (`ccx-core.ps1:978-988`):
    ```powershell
    if ($index -gt $baseIndex) {
        $decision.escalation = @{ from=$efforts.base; to=$decision.effort; reason='failed attempts or ambiguity' }
        if (($decision.agent -eq 'gemini' -or $decision.provider -eq 'gemini') -and $decision.model) {
            $tier = if ($decision.effort -eq 'max') { 'xhigh' } else { $decision.effort }
            if ($decision.model -match '^(gemini-3\.8-flash)-(low|medium|high)$' -and $tier -in @('low','medium','high')) {
                $decision.model = $Matches[1] + '-' + $tier
            } elseif ($decision.model -match '^(gemini-4-neon|gemini-4-hydrogen)-(low|medium|high|xhigh)$' -and $tier -in @('low','medium','high','xhigh')) {
                $decision.model = $Matches[1] + '-' + $tier
            }
        }
    }
    ```
  - Effective retry transitions (with `maxDispatches: 2` across all classes, so attempt 2 is the retry before escalation/surface):
    - `routine` (`codex` effort `low -> medium`): `gemini-3.8-flash-low` → `gemini-3.8-flash-medium` (stays on `3.8-flash`, never jumps to `4-neon`).
    - `normal` (`medium -> high`): `gemini-4-neon-medium` → `gemini-4-neon-high`.
    - `complex` (`high -> xhigh`): `gemini-4-neon-high` → `gemini-4-neon-xhigh`.
    - `critical` (`xhigh -> xhigh`) and `exceptional` (`xhigh -> max`, where `'max'` maps to `'xhigh'`): stays `gemini-4-neon-xhigh`.
  - In the launcher, `--effort` is omitted whenever the model slug already ends in `-(low|medium|high|xhigh|max)$` ([codex-dispatch.ps1:463-464](file:///C:/Users/Madison/code/claude-codex-collab/scripts/codex-dispatch.ps1#L463-L464)).

---

### 4. Owner vs. type default in `Invoke-CcxRoute`, and launcher requirements to run Gemini

- **Owner interaction in `Invoke-CcxRoute`** ([ccx-core.ps1:808-819](file:///C:/Users/Madison/code/claude-codex-collab/scripts/ccx-core.ps1#L808-L819)):
  ```powershell
  $decision.agent = $typePolicy.agent
  if ($decision.agent -eq 'cross-model') {
      if ($AuthoredBy -notin $script:CcxOwners) { throw (New-CcxError 'Cross-model review requires AuthoredBy claude, codex or gemini.' 2) }
      $decision.agent = if ($AuthoredBy -eq 'claude') { 'codex' } else { 'claude' }
  }
  # The task's owner does its own type of work (an escalation changes the owner).
  $ownTaskWork = $task -and $Type -eq $task.type
  if ($ownTaskWork -and $typePolicy.agent -ne 'cross-model' -and $decision.agent -in $script:CcxOwners -and $task.owner -in $script:CcxOwners -and $task.owner -ne $decision.agent) {
      $decision.reasons += 'task owner ' + $task.owner + ' replaces the type default ' + $decision.agent
      $decision.agent = $task.owner
      if ($decision.agent -ne 'codex') { $decision.codexRole = $null }
  }
  ```
  - When `-TaskId` is given and `$Type -eq $task.type` (`$ownTaskWork`), `$task.owner` replaces `$typePolicy.agent` for any owner-eligible type (i.e., `$typePolicy.agent` is in `@('claude','codex','gemini')`, excluding `'cross-model'` and `'claude-subagent'`).
  - When `-TaskId` is omitted, or when `$Type -ne $task.type` (for example, `codex-dispatch.ps1:241` sets `$routeArgs.Type = $Role` for `-Role verify` or `-Role research`), `$ownTaskWork` is false and `$typePolicy.agent` stays in effect.

- **What `scripts/codex-dispatch.ps1` requires before it will actually run Gemini**:
  - **General prerequisites**: `-TaskId` must be passed (without `-TaskId`, `ccx-core.ps1`/`policy.json` are not loaded and only `codex.cmd` runs), `codex.cmd` must still exist on PATH (`codex-dispatch.ps1:182-183`), `agy.exe` must exist on PATH (`codex-dispatch.ps1:434-435`), and token budget/ownership/approvals (`codex-full-access` for `-Sandbox danger-full-access`, `paid-action` for gated types) must pass (`codex-dispatch.ps1:199-293`).
  - **The `$runnable` check and provider selection** ([codex-dispatch.ps1:248-273](file:///C:/Users/Madison/code/claude-codex-collab/scripts/codex-dispatch.ps1#L248-L273)):
    ```powershell
    # Codex takes its routes; Gemini and headless Claude take only work their task owns (never an automatic escalation).
    $runnable = ($decision.agent -eq 'codex' -and $decision.route -in @('worker','cheap','script')) -or
                ($decision.agent -in @('gemini','claude') -and $decision.route -eq 'worker' -and $Role -eq 'implement' -and $task.owner -eq $decision.agent)
    if (-not $runnable) {
      throw (New-CcxError ("Route: $($decision.route) $($decision.agent) - " + ($decision.reasons -join '; ')) 8)
    }
    ...
    if ($decision.agent -eq 'gemini') { $providerName = 'gemini'; $providerPolicy = $policy.providers.gemini }
    if (-not $explicit) {
      ...
      if ($decision.provider -and $decision.provider -ne 'openai' -and $policy.providers.ContainsKey($decision.provider)) {
        $providerName = $decision.provider
        $providerPolicy = $policy.providers[$providerName]
    ```
  - Thus there are **two ways** the launcher runs Gemini (`$isAgy = $providerPolicy -and $providerPolicy.cli -eq 'agy'`, `codex-dispatch.ps1:374`):
    1. **Direct Gemini-owned run (`$decision.agent -eq 'gemini'`)**: requires **all four** of:
       - `route`: `'worker'` (cannot be `cheap`, `script`, `premium`, `defer`, `surface`, or `tool`),
       - `Role`: `'implement'` (cannot be `verify` or `research`),
       - `owner`: `$task.owner -eq 'gemini'`,
       - `Get-CcxProviderBlocker $policy 'gemini' $state` is `$null` (enabled, not in `providerLimits`, `agy.exe` on PATH).
       (Obsidian briefs enforce the same `route -eq 'worker'` rule in [crucible.ps1:80-81](file:///C:/Users/Madison/code/claude-codex-collab/scripts/crucible.ps1#L80-L81).)
    2. **Fallback while Codex is at its usage limit (`$decision.agent -eq 'codex'` and `$decision.provider -eq 'gemini'`)**: requires `$codexOut` true, `-not $explicit` (no `-Model`/`-Effort` override, `codex-dispatch.ps1:244,261`), and `$decision.route -in @('worker','cheap','script')`. In this path `$Role` can be `implement`, `verify`, or `research`, and `$task.owner` does **not** need to be `gemini`.

---

### 5. What gives Claude its implementer role, and where `implement`, `docs`, `refactor` route today

- **What gives Claude its implementer role**: a **documentation / workflow rule**, NOT a policy key.
  - [AGENTS.md:121-122](file:///C:/Users/Madison/code/claude-codex-collab/AGENTS.md#L121-L122): *"Role swap (user decision 2026-11-01): Codex plans, Claude implements, for code tasks. ccx code is unchanged: register tasks with `-Owner claude` (owner overrides the type's default agent)..."* (also [HANDOFF.md:5-14](file:///C:/Users/Madison/code/claude-codex-collab/HANDOFF.md#L5-L14), [CLAUDE.md:9](file:///C:/Users/Madison/code/claude-codex-collab/CLAUDE.md#L9)).
  - In `ccx/policy.json`, no code-implementation type has `"agent": "claude"`.
- **Where each type routes today in `ccx/policy.json`** (`ccx route -Type <t>` without a `-TaskId` owner override):
  - `implement` ([policy.json:122](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L122)): `route: "worker"`, **`agent: "codex"`** (`codexRole: "implement"`).
  - `docs` ([policy.json:121](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L121)): `route: "worker"`, **`agent: "claude"`**.
  - `refactor` ([policy.json:125](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L125)): `route: "worker"`, **`agent: "codex"`** (`codexRole: "implement"`).
  - With `-TaskId`, if the task was registered with `-Owner claude` per the doc rule, `Invoke-CcxRoute` (`ccx-core.ps1:814-819`) overrides `implement` and `refactor` from `codex` to `claude`.

---

### 6. Planner and reviewer today (`plan`, `architecture`, `review`, `verify`, `cross-model-review`) and Codex dependency

| Item | Policy / Code | Current Workflow Docs (`AGENTS.md` / `HANDOFF.md`) | Depends on Codex? |
|---|---|---|---|
| `plan` | `route: "premium"`, **`agent: "claude"`** (`policy.json:131`) | Under 2026-11-01 role swap, **Codex** plans complex/ambiguous/risky code tasks read-only via `-Role research` (`research` → `codex`, `policy.json:120`; `AGENTS.md:120,122,142`; `HANDOFF.md:5-14`). `ccx/ARCHITECTURE.md:92,178` still reflects pre-swap Claude planning. | Policy `plan`: **No**. Doc workflow (`-Role research`): **Yes by default**, with explicit doc fallback to Claude if Codex is deferred or sandbox-broken (`AGENTS.md:122`, `HANDOFF.md:11`) and runtime fallback to `gemini`/`ollama-cloud` when Codex is at usage limit (`ccx-core.ps1:835-844`). |
| `architecture` | `route: "premium"`, **`agent: "claude"`** (`policy.json:130`) | **Claude** (`AGENTS.md:178`, `ccx/ARCHITECTURE.md:92`). | **No.** |
| `verify` | `route: "worker"`, **`agent: "codex"`**, `codexRole: "verify"`, `verification: ["deterministic", "cross-model-review"]` (`policy.json:128`) | **Codex** verifies Claude's code (`HANDOFF.md:14`, `AGENTS.md:120,122,143`). | **Yes by default** (unless Codex is at usage limit, triggering `gemini`/`ollama-cloud` fallback, or overridden by `task.owner` on a `verify`-type task). |
| `review` | `route: "worker"`, **`agent: "cross-model"`** (`policy.json:129`). Resolved in `ccx-core.ps1:809-812`: `if ($AuthoredBy -eq 'claude') { 'codex' } else { 'claude' }`. | **Codex** reviews Claude's code (`AGENTS.md:122,141-143`, `HANDOFF.md:14`); **Claude** reviews Codex's work (`HANDOFF.md:117,315`). | **Yes for Claude-authored work** (`ccx-core.ps1:811` hard-codes `'codex'`, with fallback provider only when Codex is at usage limit); **No** for Codex- or Gemini-authored work (resolves to `'claude'`). Never resolves directly to `'gemini'`. |
| `cross-model-review` enforcement (`task review` / `task done`) | Required for `normal`+ classes (`policy.json:66,72,78,84`) and `verify` (`policy.json:128`). `task review` (`ccx-core.ps1:1313-1314`) accepts any `-By` in `@('claude','codex','gemini')` with `$_.by -ne $task.owner`. `task done` (`ccx-core.ps1:1359-1363`) accepts any passing `kind='review'` with `$_.by -ne $task.owner` **or** a human `task-accept` approval. | `ccx/ARCHITECTURE.md:475` states older prose: *"If Codex is unavailable, Claude-authored complex work waits for Codex or goes to the user."* (`ccx-reviewer` only covers `independent-verifier`, `ccx-core.ps1:1364-1366`.) | **No strict Codex dependency in code:** for a Claude-owned task, `-By codex`, `-By gemini`, or a human `task-accept` approval satisfies `cross-model-review` in `ccx task done`. |

---

### 7. Headless Gemini shell access and running test suites today

- **Can headless Gemini (`agy`) run shell commands today?** **Yes.**
  In `scripts/codex-dispatch.ps1:441-467` (the `$isAgy` branch for `providers.gemini.cli == "agy"`):
  ```powershell
  # Turbo (UPGRADE-3): -Sandbox danger-full-access, behind the same codex-full-access approval as Codex.
  $turbo = $Sandbox -eq 'danger-full-access'
  ...
  # Turbo drops only the terminal sandbox (tests must write); file tools stay inside the workspace either way.
  $settings = @{ useG1Credits = $false; enableTerminalSandbox = -not $turbo; toolPermission = 'request-review'; allowNonWorkspaceAccess = $false
    permissions = @{ allow = @('command(*)'); deny = $deny } }
  ...
  $sandboxFlag = if ($turbo) { '--dangerously-skip-permissions' } else { '--sandbox' }
  $arguments = @($agy.Source, '-p', $prompt, '--output-format', 'json', '--mode', $mode, $sandboxFlag, '--disable-slash-commands',
    '--settings', ($base + '.settings.json'), '--print-timeout', ([string][Math]::Ceiling($TimeoutMinutes) + 'm')) + $agyModel + $agyEffort
  ```
  - `permissions.allow` explicitly includes `'command(*)'` (verified by [test-codex-dispatch.ps1:862,911](file:///C:/Users/Madison/code/claude-codex-collab/scripts/test-codex-dispatch.ps1#L862)).
  - **Default mode** (`workspace-write` or `read-only`): runs with `--sandbox` and `enableTerminalSandbox: true`. On Windows, Antigravity's terminal sandbox is **read-only and offline** (`AGENTS.md:126`, `HANDOFF.md:182`, `codex-dispatch.ps1:446-448`), so read-only shell commands (Git status/diff/log, search, file reads) work, while commands that write fail.
  - **Turbo mode** (`-Sandbox danger-full-access`, requiring a per-dispatch `codex-full-access` L4 approval, `codex-dispatch.ps1:278`): runs with `--dangerously-skip-permissions` and `enableTerminalSandbox: false`, granting full unsandboxed shell access.

- **Can headless Gemini run the test suites today?**
  - **Default sandboxed mode (`--sandbox`)**: **No for suites that write** — `AGENTS.md:126`, `HANDOFF.md:182`, and `codex-dispatch.ps1:448` explicitly state that tests/builds requiring writes fail inside the read-only terminal sandbox (e.g., PowerShell suites create scratch dirs under `%TEMP%`, Playwright launches Chromium) and must be reported as `NOT RUN`. (In addition, for Obsidian briefs, `crucible.ps1:312-321` only auto-runs non-`agentSafe` checks like `lt-unit`/`lt-browser` when the task owns plain docs **and** `$task.lastDispatch.provider -eq 'openai'`, so Crucible will not auto-run them after Gemini either.)
  - **Turbo mode (`-Sandbox danger-full-access` + `codex-full-access` approval)**: **Yes** — explicitly enabled so headless Gemini can run tests and builds (`AGENTS.md:126`, `HANDOFF.md:89,182`, `CLAUDE.md:13`, `codex-dispatch.ps1:443-444`).

- **Internal repo drift**: Three older descriptions still claim Antigravity has no shell access / denies `command(*)`: [policy.json:48](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L48) (`providers.gemini.note`), [policy.json:141](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L141) (`checks.about`), and [ccx/ARCHITECTURE.md:165](file:///C:/Users/Madison/code/claude-codex-collab/ccx/ARCHITECTURE.md#L165). The live launcher code (`codex-dispatch.ps1:441-467`), tests (`test-codex-dispatch.ps1:862,909-911`), `AGENTS.md:126`, `CLAUDE.md:13`, and `HANDOFF.md:89,182` supersede them (UPGRADE-3, 2026-11-26).

---

### 8. Audit of assumptions (a)–(g)

- **(a) "the routing block is named `types`"** — **Wrong.** The key is `"taskTypes"` (`ccx/policy.json:110`; validated and read as `$policy.taskTypes` in `scripts/ccx-core.ps1:81,127,785,788`).
- **(b) "`gemini.use` is `["fallback"]`"** — **Correct.** `ccx/policy.json:48` sets `"use": ["fallback"]`.
- **(c) "adding `'primary'` to `gemini.use` makes Gemini a primary worker"** — **Wrong.** No code checks for `"primary"`. `Get-CcxProvider` (`scripts/ccx-core.ps1:766`) is the sole reader of `$provider.use` and is only called with `'fallback'` (`ccx-core.ps1:837`) or `$Class` (`ccx-core.ps1:887`) inside the `'codex'` agent path. Adding `"primary"` to `providers.gemini.use` does nothing. Direct Gemini routing (`ccx-core.ps1:926-937`) ignores `use` and is triggered by `taskTypes.<type>.agent = "gemini"` or `task.owner = "gemini"`.
- **(d) "setting a type's `agent` to `gemini` makes `ccx route` resolve Gemini for it"** — **Only partially true; wrong for tasks owned by another agent and insufficient for launching.**
  - It resolves to `gemini` for bare `ccx route -Type <t>` (no `-TaskId`), or when `-TaskId` has `owner: gemini`, provided Gemini has no blocker (else `defer`, `ccx-core.ps1:928-933`) and retries are within `maxDispatches` (else `premium`/`claude` or `surface`, `ccx-core.ps1:820-833`).
  - For any registered task with `-Owner claude` or `-Owner codex` where `$Type -eq $task.type`, `Invoke-CcxRoute` (`ccx-core.ps1:814-819`) **overrides** the type default with `$task.owner`, so `ccx route -TaskId <id>` does **not** resolve to Gemini.
  - Even when `ccx route` resolves `agent: gemini`, `codex-dispatch.ps1:249-250` refuses (exit 8) unless `route -eq 'worker'`, `$Role -eq 'implement'`, and `$task.owner -eq 'gemini'`.
- **(e) "tiers are `flash-low -> neon-medium -> neon-high`"** — **Wrong / incomplete.**
  - Policy defines **four** full slugs across five classes (`ccx/policy.json:57,64,70,76,82`): `gemini-3.8-flash-low` (`routine`), `gemini-4-neon-medium` (`normal`), `gemini-4-neon-high` (`complex`), and **`gemini-4-neon-xhigh`** (`critical` and `exceptional`).
  - On retries (`ccx-core.ps1:980-987`), escalation **never** steps across families from `flash` to `neon`; it only swaps the suffix inside the starting model family (`gemini-3.8-flash-low` → `gemini-3.8-flash-medium`; `gemini-4-neon-medium` → `gemini-4-neon-high`; `gemini-4-neon-high` → `gemini-4-neon-xhigh`).
- **(f) "Claude is the default implementer in policy"** — **Wrong.** In `ccx/policy.json:118,122-127`, **`codex`** is the default agent for `implement`, `refactor`, `test-write`, `debug`, `mechanical-migration`, `media-generate`, and `media-edit`. Claude is the default code implementer only by workflow doc rule (`AGENTS.md:121-122`, `HANDOFF.md:5-14`), achieved by passing `-Owner claude` at `ccx task add`.
- **(g) "Gemini runs without shell access in headless mode"** — **Wrong in the live launcher (though stale docs still say this).** `scripts/codex-dispatch.ps1:458-467` allows `command(*)` inside Antigravity's read-only/offline `--sandbox` by default, and allows unsandboxed shell commands (for tests/builds) in turbo mode (`-Sandbox danger-full-access` with `codex-full-access` approval, `--dangerously-skip-permissions`, `enableTerminalSandbox: false`). The "no shell access" / "deny `command(*)`" wording remaining in `ccx/policy.json:48,141` and `ccx/ARCHITECTURE.md:165` is stale.

---

### Citations

- [ccx/policy.json:45-49](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L45-L49) — `providers` (`ollama`, `lmstudio`, `deepseek`, `gemini`, `ollama-cloud`; `providers.gemini.model`, `providers.gemini.use`, stale note)
- [ccx/policy.json:52](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L52) — `effortLadder`
- [ccx/policy.json:54-87](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L54-L87) — `classes` (`geminiModel` at lines 57, 64, 70, 76, 82; `effort`; `verification`; `budget`)
- [ccx/policy.json:94-99](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L94-L99) — `escalation`
- [ccx/policy.json:110-135](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L110-L135) — `taskTypes`
- [ccx/policy.json:140-146](file:///C:/Users/Madison/code/claude-codex-collab/ccx/policy.json#L140-L146) — `checks` (including stale `about` at line 141)
- [scripts/ccx-core.ps1:12](file:///C:/Users/Madison/code/claude-codex-collab/scripts/ccx-core.ps1#L12) — `$script:CcxOwners`
- [scripts/ccx-core.ps1:81,100,114,127](file:///C:/Users/Madison/code/claude-codex-collab/scripts/ccx-core.ps1#L81-L127) — `Get-CcxPolicy` schema validation (`taskTypes`, `geminiModel`, `cli`)
- [scripts/ccx-core.ps1:741-758](file:///C:/Users/Madison/code/claude-codex-collab/scripts/ccx-core.ps1#L741-L758) — `Get-CcxProviderBlocker`
- [scripts/ccx-core.ps1:759-770](file:///C:/Users/Madison/code/claude-codex-collab/scripts/ccx-core.ps1#L759-L770) — `Get-CcxProvider` (sole reader of `$provider.use` at line 766)
- [scripts/ccx-core.ps1:771-1013](file:///C:/Users/Madison/code/claude-codex-collab/scripts/ccx-core.ps1#L771-L1013) — `Invoke-CcxRoute` (`cross-model` 809–812, owner override 814–819, retry cap 820–833, `'fallback'` 835–844, `$Class` 886–895, `'gemini'` branch 926–937, effort & Gemini tier suffix step-up 958–988)
- [scripts/ccx-core.ps1:1311-1322](file:///C:/Users/Madison/code/claude-codex-collab/scripts/ccx-core.ps1#L1311-L1322) — `task review` author check
- [scripts/ccx-core.ps1:1351-1373](file:///C:/Users/Madison/code/claude-codex-collab/scripts/ccx-core.ps1#L1351-L1373) — `task done` (`cross-model-review` and `independent-verifier` enforcement)
- [scripts/codex-dispatch.ps1:182-183](file:///C:/Users/Madison/code/claude-codex-collab/scripts/codex-dispatch.ps1#L182-L183) — unconditional `codex.cmd` PATH check
- [scripts/codex-dispatch.ps1:202-205](file:///C:/Users/Madison/code/claude-codex-collab/scripts/codex-dispatch.ps1#L202-L205) — `implement` role owner check
- [scripts/codex-dispatch.ps1:237-279](file:///C:/Users/Madison/code/claude-codex-collab/scripts/codex-dispatch.ps1#L237-L279) — routing, `$codexOut`, `$runnable` (249–253), provider selection (260, 267–273), approval checks (277–279)
- [scripts/codex-dispatch.ps1:373-375](file:///C:/Users/Madison/code/claude-codex-collab/scripts/codex-dispatch.ps1#L373-L375) — `$isGemini`, `$isAgy`, `$isClaude`
- [scripts/codex-dispatch.ps1:433-467](file:///C:/Users/Madison/code/claude-codex-collab/scripts/codex-dispatch.ps1#L433-L467) — `$isAgy` launch flags, sandbox/turbo settings (`command(*)`, `enableTerminalSandbox`, `--sandbox` vs `--dangerously-skip-permissions`, `--effort` suppression)
- [scripts/crucible.ps1:70-81](file:///C:/Users/Madison/code/claude-codex-collab/scripts/crucible.ps1#L70-L81) — brief type/owner `worker` check
- [scripts/crucible.ps1:312-321](file:///C:/Users/Madison/code/claude-codex-collab/scripts/crucible.ps1#L312-L321) — post-run follow-up checks (`agentSafe` / `openai` doc-only gate)
- [scripts/test-codex-dispatch.ps1:862,909,911,918](file:///C:/Users/Madison/code/claude-codex-collab/scripts/test-codex-dispatch.ps1#L862-L918) — tests asserting `command(*)`, `enableTerminalSandbox`, `--dangerously-skip-permissions`, `geminiModel`
- [AGENTS.md:120-127](file:///C:/Users/Madison/code/claude-codex-collab/AGENTS.md#L120-L127) — `# Roles` (2026-11-01 role swap, Gemini UPGRADE-3 sandbox & turbo, Owner wins)
- [AGENTS.md:135,141-143,182](file:///C:/Users/Madison/code/claude-codex-collab/AGENTS.md#L135-L182) — Dispatch mode, Routing, Codex fallback chain
- [CLAUDE.md:9,11,13](file:///C:/Users/Madison/code/claude-codex-collab/CLAUDE.md#L9-L13) — role swap, Obsidian/Gemini, UPGRADE-3 headless Antigravity
- [HANDOFF.md:5-14,88-89,115-118,178-186](file:///C:/Users/Madison/code/claude-codex-collab/HANDOFF.md#L5-L186) — Codex plans / Claude implements, launcher options (turbo on agy), Obsidian briefs & headless Gemini shell rules
- [ccx/ARCHITECTURE.md:91-92,144,164-165,178,192,475](file:///C:/Users/Madison/code/claude-codex-collab/ccx/ARCHITECTURE.md#L91-L475) — OMNIROUTE rungs, owner override, fallback chain, stale agy `deny command(*)` note, pre-swap roles, `cross-model-review` note
- [BOOTSTRAP.md:1-24](file:///C:/Users/Madison/code/claude-codex-collab/BOOTSTRAP.md#L1-L24) — template bootstrap checklist (Claude Code + Codex only; no Gemini routing rules)
