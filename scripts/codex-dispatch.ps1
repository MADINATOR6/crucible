<#
Dispatch-mode launcher for Windows PowerShell 5.1.
Parameters: -Effort low|medium|high|xhigh|max (medium), -Model <slug> (Codex's
configured default when omitted), -Role implement|verify|research
(implement), -TaskFile <path> (TASK.md; required for research),
-TaskId <id> (optional ccx task integration),
  which can launch Codex, Gemini via its CLI, or Claude via headless claude -p,
-CaptureDir <path> (%USERPROFILE%\codex-captures), -TimeoutMinutes <n> (60; fractions allowed),
-Sandbox read-only|workspace-write|danger-full-access (workspace-write for
implement, read-only otherwise). Relative paths use the caller's directory.
Exit codes: 0 success; Codex's own code otherwise; 3 missing/blank report;
4 usage limit; 5 timeout; 6 busy writer; 1 refusal or launcher failure.
With -TaskId: 7 ownership/worktree, including when the owner is not codex,
gemini or claude for -Role implement; 8 budget/route; 9 post-checks; 10 approval.
The execution-policy bypass, if supplied by the caller, affects that process only.
#>
param(
  [ValidateSet('low', 'medium', 'high', 'xhigh', 'max')] [string]$Effort = 'medium',
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$')] [string]$Model,
  [ValidateSet('implement', 'verify', 'research')] [string]$Role = 'implement',
  [string]$TaskFile = 'TASK.md',
  [string]$CaptureDir = (Join-Path $env:USERPROFILE 'codex-captures'),
  [ValidateRange(0.01, 10080)] [double]$TimeoutMinutes = 60,
  [ValidateSet('read-only', 'workspace-write', 'danger-full-access')] [string]$Sandbox = 'workspace-write',
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$')] [string]$TaskId
)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
$previousEncoding = [Console]::OutputEncoding
$previousOutputEncoding = $OutputEncoding
$previousLocation = Get-Location
$lockStream = $null
$ownsLock = $false
$process = $null
$processStarted = $false
$timedOut = $false
$eventsStream = $null
$stderrStream = $null
$code = 1
$protectedBefore = $null

function Read-LockPid([string]$Path) {
  $stream = $null
  $reader = $null
  try {
    $stream = [IO.File]::Open($Path, 'Open', 'Read', ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    $reader = New-Object IO.StreamReader($stream)
    $recorded = 0
    if ([int]::TryParse($reader.ReadToEnd().Trim(), [ref]$recorded)) { return $recorded }
  } catch [IO.IOException] {
    return 0
  } finally {
    if ($reader) { $reader.Dispose() } elseif ($stream) { $stream.Dispose() }
  }
  return 0
}

function Clear-GitOverrides([Diagnostics.ProcessStartInfo]$Info) {
  # Inherited overrides (for example from a Git hook) must not choose another repository.
  foreach ($name in @('GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE')) {
    [void]$Info.EnvironmentVariables.Remove($name)
  }
}

function Invoke-Git([string]$Arguments) {
  $info = New-Object Diagnostics.ProcessStartInfo
  Clear-GitOverrides $info
  $info.FileName = 'git.exe'
  $info.Arguments = $Arguments
  $info.WorkingDirectory = (Get-Location).ProviderPath
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.StandardOutputEncoding = $utf8
  $gitProcess = New-Object Diagnostics.Process
  $gitProcess.StartInfo = $info
  try {
    [void]$gitProcess.Start()
    $stdout = $gitProcess.StandardOutput.ReadToEndAsync()
    $stderr = $gitProcess.StandardError.ReadToEndAsync()
    $gitProcess.WaitForExit()
    if ($gitProcess.ExitCode -eq 0) { return $stdout.Result.Trim() }
    return $null
  } finally { $gitProcess.Dispose() }
}

function Stop-CodexTree([Diagnostics.Process]$Child) {
  $killer = New-Object Diagnostics.ProcessStartInfo
  # System paths come from the OS, not environment variables a caller could redirect.
  $killer.FileName = Join-Path ([Environment]::SystemDirectory) 'taskkill.exe'
  $killer.Arguments = "/T /F /PID $($Child.Id)"
  $killer.UseShellExecute = $false
  $killer.CreateNoWindow = $true
  $killer.RedirectStandardOutput = $true
  $killer.RedirectStandardError = $true
  $killProcess = [Diagnostics.Process]::Start($killer)
  try {
    $killOut = $killProcess.StandardOutput.ReadToEndAsync()
    $killErr = $killProcess.StandardError.ReadToEndAsync()
    $killProcess.WaitForExit()
    if ($killProcess.ExitCode -ne 0 -or -not $Child.WaitForExit(10000)) {
      throw "taskkill $($killer.Arguments) failed: $($killErr.Result) $($killOut.Result)"
    }
  } finally { $killProcess.Dispose() }
}

function Get-RepoSnapshot {
  # HEAD plus every changed or untracked path with its content hash, from the current directory.
  # Enough to tell whether a run that must not edit files edited any: a new file, a deleted one, or
  # new content in a file that was already modified all change the result. Ignored paths stay out.
  $head = Invoke-Git 'rev-parse HEAD'
  # -z: NUL-separated and never quoted (the line form quotes paths with spaces). A rename or copy
  # entry is followed by one extra entry holding the old path.
  $status = Invoke-Git 'status --porcelain=v1 -z --untracked-files=all'
  if ($null -eq $head -or $null -eq $status) { return $null }
  $lines = New-Object 'System.Collections.Generic.List[string]'
  $lines.Add("HEAD $head")
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $entries = $status.Split([char]0)
    for ($i = 0; $i -lt $entries.Count; $i++) {
      $entry = $entries[$i]
      if (-not $entry) { continue }
      # Invoke-Git trims the output, which can eat the first entry's leading space.
      if ($entry -notmatch '^([ A-Za-z?!]{1,2}) (.+)$') { $lines.Add($entry); continue }
      $kind = $Matches[1].Trim(); $path = $Matches[2]
      if ($kind -match '[RC]') { $i++; $lines.Add("old $($entries[$i])") }
      $full = Join-Path (Get-Location).ProviderPath $path
      $hash = '<missing>'
      if ([IO.File]::Exists($full)) {
        $stream = [IO.File]::OpenRead($full)
        try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') } finally { $stream.Dispose() }
      }
      $lines.Add("$kind $path|$hash")
    }
  } finally { $sha.Dispose() }
  return ,@($lines)
}

function Get-DispatchReset([string]$Text, $Policy) {
  $now = [DateTime]::Now
  $parsed = [DateTime]::MinValue
  $culture = [Globalization.CultureInfo]::InvariantCulture
  $style = [Globalization.DateTimeStyles]::None
  $Text = $Text -replace '(?<=\d)(st|nd|rd|th)\b', ''
  if ([DateTime]::TryParseExact($Text, 'h:mm tt', $culture, $style, [ref]$parsed)) {
    $parsed = $now.Date.Add($parsed.TimeOfDay)
    if ($parsed -le $now) { $parsed = $parsed.AddDays(1) }
  } elseif (-not [DateTime]::TryParseExact($Text, 'MMM d, yyyy h:mm tt', $culture, $style, [ref]$parsed)) {
    $parsed = $now.AddMinutes([double]$Policy.models.codex.unavailableBackoffMinutes)
  }
  $parsed.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
}

try {
  [Console]::OutputEncoding = $utf8
  $OutputEncoding = $utf8
  # PS 5.1 can start in System32 when the process cwd contains brackets.
  if ($previousLocation.ProviderPath -eq (Join-Path $env:WINDIR 'System32') -and
      [Environment]::CurrentDirectory -ne $previousLocation.ProviderPath) {
    Set-Location -LiteralPath ([Environment]::CurrentDirectory)
  }
  if ($Role -eq 'research' -and -not $TaskId -and -not $PSBoundParameters.ContainsKey('TaskFile')) {
    throw 'Role research requires an explicit -TaskFile.'
  }
  if (-not $PSBoundParameters.ContainsKey('Sandbox') -and $Role -ne 'implement') { $Sandbox = 'read-only' }
  $taskPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($TaskFile)
  $CaptureDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($CaptureDir)
  if ($taskPath -match '[%"]' -or $CaptureDir -match '[%"]') {
    throw 'Task-file and capture paths must not contain % or double quotes.'
  }
  $root = Invoke-Git 'rev-parse --show-toplevel'
  if (-not $root) { throw 'Not inside a Git repository.' }
  Set-Location -LiteralPath $root
  if (-not [IO.File]::Exists((Join-Path $root 'HANDOFF.md'))) { throw 'HANDOFF.md not found at the repo root.' }
  if (-not $TaskId) {
    if (-not [IO.File]::Exists($taskPath)) { throw "Task file not found: $taskPath" }
    $body = [IO.File]::ReadAllText($taskPath, $utf8) -replace '(?s)<!--.*?-->', '' -replace '(?m)^\s*#{1,6}(?:\s.*)?\r?$', ''
    if ([string]::IsNullOrWhiteSpace($body)) { throw "Task file is empty or unfilled: $taskPath" }
  }
  $codex = Get-Command codex.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $codex) { throw 'codex.cmd not found on PATH' }
  if ($codex.Source -match '[%"]') { throw 'codex.cmd path must not contain % or double quotes.' }
  $base = Join-Path $CaptureDir ('codex-' + [guid]::NewGuid().ToString('N'))
  if (($base.Length + 13) -ge 260) { throw "Capture path too long ($($base.Length + 13) chars). Pass a shorter -CaptureDir." }

  $providerArguments = @(); $codexEffort = $null; $providerName = $null; $providerPolicy = $null
  if ($TaskId) {
    $corePath = Join-Path $PSScriptRoot 'ccx-core.ps1'
    if (-not [IO.File]::Exists($corePath)) { throw 'ccx-core.ps1 not found: -TaskId needs the ccx scripts' }
    . $corePath
    $policy = Get-CcxPolicy
    $task = Invoke-CcxLocked {
      param($state)
      if (-not $state.tasks.ContainsKey($TaskId)) { throw (New-CcxError 'unknown task') }
      $task = Get-CcxTask -State $state -Id $TaskId
      if ($task.status -in @('done','abandoned')) { throw (New-CcxError 'Task is done or abandoned.') }
      if ($task.worktree -and [IO.Path]::GetFullPath($task.worktree).TrimEnd('\','/') -ine [IO.Path]::GetFullPath($root).TrimEnd('\','/')) {
        throw (New-CcxError "run from the task's worktree: $($task.worktree)" 7)
      }
      if ($Role -eq 'implement') {
        # Gemini runs through its CLI provider; Claude runs headless (claude -p), e.g. a brief launched from Obsidian.
        if ($task.owner -notin @('codex','gemini','claude')) { throw (New-CcxError 'Role implement requires task.owner codex, gemini or claude.' 7) }
      }
      # A planned task is started only after the writer lock (below), whatever the role: any role can
      # be given a writable sandbox, and a BUSY refusal must leave status, baseline and attempts
      # untouched. Ownership is still checked here, so a conflict keeps its early exit 7.
      if ($Role -eq 'implement' -or $task.status -eq 'planned') { Assert-CcxTaskOwnership -State $state -Task $task }
      $task
    }
    if (-not $PSBoundParameters.ContainsKey('TaskFile') -and $task.taskFile) {
      $taskPath = if ([IO.Path]::IsPathRooted($task.taskFile)) { $task.taskFile } else { Join-Path $root $task.taskFile }
      $taskPath = [IO.Path]::GetFullPath($taskPath)
    }
    if ($taskPath -match '[%"]') { throw 'Task-file and capture paths must not contain % or double quotes.' }
    foreach ($excluded in $policy.privacy.excludePaths) {
      $privatePath = [IO.Path]::GetFullPath((Join-Path $root $excluded)).TrimEnd('\','/')
      if ($taskPath -ieq $privatePath -or $taskPath.StartsWith($privatePath + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Task file is excluded by privacy.excludePaths.'
      }
    }
    if ($Role -eq 'research' -and -not $PSBoundParameters.ContainsKey('TaskFile') -and -not $task.taskFile) { throw 'Role research requires an explicit -TaskFile.' }
    if (-not [IO.File]::Exists($taskPath)) { throw "Task file not found: $taskPath" }
    $body = [IO.File]::ReadAllText($taskPath, $utf8) -replace '(?s)<!--.*?-->', '' -replace '(?m)^\s*#{1,6}(?:\s.*)?\r?$', ''
    if ([string]::IsNullOrWhiteSpace($body)) { throw "Task file is empty or unfilled: $taskPath" }
    # The input version this run answers: a result is stale once the brief's bytes change.
    $shaInput = [Security.Cryptography.SHA256]::Create()
    try { $inputSha = [BitConverter]::ToString($shaInput.ComputeHash([IO.File]::ReadAllBytes($taskPath))).Replace('-', '').Substring(0, 12).ToLowerInvariant() } finally { $shaInput.Dispose() }
    $class = Get-CcxClass -Policy $policy -Class $task.class -Risk $task.risk
    $budget = Get-CcxBudget -Policy $policy -Class $class -Task $task
    $used = [long]$task.tokens.input - [long]$task.tokens.cached + [long]$task.tokens.output
    if ($used -ge $budget.tokenTarget) {
      throw (New-CcxError "BUDGET: token target reached ($used/$($budget.tokenTarget)); raise it with ccx task budget" 8)
    }
    $state = Get-CcxState
    $codexOut = $state.agents.codex.unavailableUntil -and [DateTime]::Parse($state.agents.codex.unavailableUntil).ToUniversalTime() -gt [DateTime]::UtcNow
    # Always route: retry caps, deferral and ownership refusals apply even with explicit -Effort/-Model.
    $explicit = $PSBoundParameters.ContainsKey('Effort') -or $PSBoundParameters.ContainsKey('Model')
    $routeArgs = @{ TaskId = $TaskId; Type = $task.type; IgnoreSessionPreference = $explicit }
    if ($Role -ne 'implement') { $routeArgs.Type = $Role; $routeArgs.Attempt = 1 }
    $decision = Invoke-CcxRoute @routeArgs
    # A cloud fallback provider may run while OpenAI Codex is at its usage limit; nothing else may.
    if ($codexOut -and $decision.agent -eq 'codex' -and ($explicit -or -not $decision.provider -or $decision.provider -eq 'openai')) {
      $resume = [DateTime]::Parse($state.agents.codex.unavailableUntil).ToLocalTime()
      throw (New-CcxError "USAGE LIMIT (recorded): Codex resumes at $resume" 4)
    }
    # Codex takes its routes; Gemini and headless Claude take only work their task owns (never an automatic escalation).
    $runnable = ($decision.agent -eq 'codex' -and $decision.route -in @('worker','cheap','script')) -or
                ($decision.agent -in @('gemini','claude') -and $decision.route -eq 'worker' -and $Role -eq 'implement' -and $task.owner -eq $decision.agent)
    if (-not $runnable) {
      throw (New-CcxError ("Route: $($decision.route) $($decision.agent) - " + ($decision.reasons -join '; ')) 8)
    }
    if ($decision.agent -eq 'claude') {
      $providerName = 'claude'
      if (-not $policy.models.claude.headless -or [string]$policy.models.claude.headless.command -notmatch '^[A-Za-z0-9._-]{1,64}$') { throw 'Policy models.claude.headless.command is missing or invalid.' }
      # Before the lock and the attempt count: a missing CLI must not leave a run that never started.
      if (-not (Get-Command $policy.models.claude.headless.command -CommandType Application -ErrorAction SilentlyContinue)) { throw (New-CcxError "$($policy.models.claude.headless.command) not found on PATH" 8) }
    }
    if ($decision.agent -eq 'gemini') { $providerName = 'gemini'; $providerPolicy = $policy.providers.gemini }
    if (-not $explicit) {
      $Model = $decision.model; $Effort = $decision.effort
      if ($Model -notmatch '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' -or $Effort -notin @('low','medium','high','xhigh','max')) {
        throw 'Route returned an invalid model or effort.'
      }
      # A routed non-OpenAI provider (local Ollama/LM Studio, or a cloud fallback) adds its Codex flags.
      if ($decision.provider -and $decision.provider -ne 'openai' -and $policy.providers.ContainsKey($decision.provider)) {
        $providerName = $decision.provider
        $providerPolicy = $policy.providers[$providerName]
        $providerArguments = @($providerPolicy.codexFlags)
        # Small local models reject Codex's thinking request; the provider sets the effort Codex sends.
        if ($providerPolicy.reasoningEffort) { $codexEffort = $providerPolicy.reasoningEffort }
      }
      Write-Output "Route: $($decision.route) $(if ($providerName) { $providerName + '/' })$Model $Effort"
    } else { Write-Output 'Route: explicit' }
    foreach ($reason in $decision.reasons) { Write-Output ('Route reason: ' + (Protect-CcxText $reason)) }
    $requiredApprovals = @()
    if ($Sandbox -eq 'danger-full-access') { $requiredApprovals += 'codex-full-access' }
    if ($Role -eq 'implement' -and @($policy.taskTypes[$task.type].gates) -contains 'paid-action') { $requiredApprovals += 'paid-action' }
    if ($requiredApprovals.Count) {
      $approvals = (Get-CcxState).approvals.Values
      $missing = @($requiredApprovals | Where-Object {
        $action = $_
        -not @($approvals | Where-Object { $_.action -ceq $action -and [object]::Equals($_.target, $TaskId) -and $_.status -eq 'approved' }).Count
      })
      if ($missing.Count) {
        $requests = @($missing | ForEach-Object {
          $gate = Invoke-CcxGate -Action $_ -Target $TaskId -TaskId $TaskId
          $gate.message + [Environment]::NewLine + $gate.command
        })
        throw (New-CcxError ($requests -join [Environment]::NewLine) 10)
      }
    }
  }

  # The writer lock comes before anything a refused dispatch must not spend: approvals, the
  # attempt count and the task start. A BUSY exit (6) leaves the task and its approvals as they were.
  if ($Sandbox -ne 'read-only') {
    $gitDir = Invoke-Git 'rev-parse --absolute-git-dir'
    if (-not $gitDir) { throw 'Cannot resolve the Git directory.' }
    $lockPath = Join-Path $gitDir 'codex-dispatch.lock'
    # Opening for write atomically excludes competing writers, including during PID publication.
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      try {
        $lockStream = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', ([IO.FileShare]::Read -bor [IO.FileShare]::Delete))
        break
      } catch [IO.IOException] {
        $otherPid = Read-LockPid $lockPath
        if ($otherPid -gt 0 -and (Get-Process -Id $otherPid -ErrorAction SilentlyContinue)) {
          $code = 6
          throw "BUSY: another write dispatch is running (pid $otherPid)"
        }
        Start-Sleep -Milliseconds 50
      }
    }
    if (-not $lockStream) { throw 'Cannot acquire the dispatch lock.' }
    # A live writer holds the file open for its whole run, so a lock we could open is stale,
    # whatever PID it records (Windows reuses PIDs).
    $ownsLock = $true
    $lockStream.SetLength(0)
    $pidBytes = $utf8.GetBytes([string]$PID)
    $lockStream.Write($pidBytes, 0, $pidBytes.Length)
    $lockStream.Flush()
  }

  if ($TaskId) {
    # Past every refusal that needs no lock, and holding the writer lock when one is needed:
    # consume the approvals and record the attempt. A throw here still releases the lock (finally).
    foreach ($action in $requiredApprovals) {
      $gate = Invoke-CcxGate -Action $action -Target $TaskId -TaskId $TaskId
      if ($gate.code -ne 0) { throw (New-CcxError ($gate.message + [Environment]::NewLine + $gate.command) 10) }
      Write-Output $gate.message
    }
    $dispatch = Invoke-CcxLocked {
      param($state)
      $task = Get-CcxTask -State $state -Id $TaskId
      if ($task.status -eq 'planned') { Start-CcxTaskInState -State $state -Task $task }
      elseif ($Role -eq 'implement') { Assert-CcxTaskOwnership -State $state -Task $task }
      if ($Role -eq 'implement') { $task.dispatches++ }
      $now = Get-CcxNow
      $ladder = @($policy.effortLadder)
      $task.status = 'active'; $task.updated = $now
      $task.checkpoints = @($task.checkpoints) + @(@{at=$now; note="dispatch $($task.dispatches) start $Role $Model $Effort"})
      $task.lastDispatch = @{
        n=$task.dispatches; role=$Role; provider=$(if ($providerName) { $providerName } else { 'openai' }); model=$Model; effort=$Effort; sandbox=$Sandbox; startedAt=$now
        escalated=([array]::IndexOf($ladder,$Effort) -gt [array]::IndexOf($ladder,$policy.classes[$class].effort.codex.base))
      }
      if ($decision.strategy) {
        $task.lastDispatch.sessionId = $decision.strategy.sessionId
        $task.lastDispatch.routingLessons = @($decision.learning | ForEach-Object { $_.id })
      }
      $task.lastDispatch.Clone()
    }
    $dispatchClock = [Diagnostics.Stopwatch]::StartNew()
  }

  [void][IO.Directory]::CreateDirectory($CaptureDir)
  # A verify or research run is read-only by rule. A writable sandbox exists so the verifier can
  # create the scratch folders the PowerShell suites need under TEMP, not so it can edit the repo:
  # snapshot the tree now and fail the run if it changed.
  $guardNoEdit = $Role -ne 'implement' -and $Sandbox -ne 'read-only'
  $snapshotBefore = $null
  if ($guardNoEdit) {
    $snapshotBefore = Get-RepoSnapshot
    if ($null -eq $snapshotBefore) { throw "Cannot snapshot the repository to guard a $Role run with sandbox $Sandbox." }
  }
  $instruction = @{ implement = 'Implementer'; verify = 'Verifier'; research = 'Researcher' }[$Role]
  $prompt = "Read HANDOFF.md and follow its $instruction instruction for $taskPath."
  $head = Invoke-Git 'rev-parse --short HEAD'
  $modelName = if ($Model) { $Model } else { 'default' }
  Write-Output "Dispatching $(if ($providerName) { $providerName } else { 'Codex' }): HEAD=$head model=$modelName effort=$Effort sandbox=$Sandbox"
  $modelArguments = if ($Model) { @('-m', $Model) } else { @() }
  $isGemini = $providerPolicy -and $providerPolicy.cli -eq 'gemini'
  $isAgy = $providerPolicy -and $providerPolicy.cli -eq 'agy'
  $isClaude = $providerName -eq 'claude'
  # Permitted checks (policy.checks): the only shell commands Gemini or headless Claude may run unasked.
  # Neither has a sandbox here, so only agentSafe checks (they execute no repository code), and none when
  # the task owns anything under a protected path such as scripts/ (the checker itself).
  $checkPrefixes = @(); $protectedPaths = @($policy.agentProtectedPaths | Where-Object { $_ })
  $ownsProtected = $TaskId -and @($task.owns | Where-Object { $o = $_; @($protectedPaths | Where-Object { Test-CcxPathOverlap $o $_ }).Count }).Count
  # Owned-path parity with Codex (UPGRADE-3): a protected path the task owns, or a protected folder holding
  # one, is writable; the after-run hash check still flags every other protected change.
  $taskOwns = if ($TaskId) { @($task.owns) } else { @() }
  $deniedPaths = @($protectedPaths | Where-Object { $p = $_; -not @($taskOwns | Where-Object { Test-CcxPathOverlap $_ $p }).Count })
  if ($TaskId -and $Sandbox -ne 'read-only' -and $policy.ContainsKey('checks') -and -not $ownsProtected) {
    foreach ($entry in @($policy.checks.Values | Where-Object { $_ -is [Collections.IDictionary] -and $_.run -and $_.agentSafe -eq $true })) {
      if ([string]$entry.run -notmatch '^[A-Za-z0-9 ._/:=-]{1,120}$') { throw 'Policy checks.<name>.run must be a plain command prefix.' }
      $checkPrefixes += [string]$entry.run
    }
  }
  $agentShell = @($checkPrefixes) + @($(if ($Sandbox -ne 'read-only' -and $TaskId) { @($policy.agentShell | Where-Object { $_ -match '^[A-Za-z0-9 ._/:=-]{1,120}$' }) }))
  if (($isGemini -or $isAgy -or $isClaude) -and $TaskId) {
    if (-not $isAgy) {
      $prompt += " Your shell is limited to commands starting with: $(if ($agentShell.Count) { $agentShell -join '; ' } else { 'none' }). Any other command is refused and ends your run, so do not try one; say in the report what you could not run."
    }
    # Unsandboxed or account-run agents: the launcher stack is hashed before and after, whatever their deny rules miss.
    $protectedBefore = Get-CcxProtectedHashes -Root $root -Policy $policy
  }
  if ($isGemini) {
    $gemini = Get-Command $providerPolicy.command -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $gemini) { throw "$($providerPolicy.command) not found on PATH" }
    if ($gemini.Source -match '[%"]') { throw 'Gemini CLI path must not contain % or double quotes.' }
    # No sandbox on Windows: never yolo. Implement may edit files and run only the permitted checks; other roles are read-only.
    $approval = if ($Sandbox -eq 'read-only') { 'plan' } else { 'auto_edit' }
    $geminiModel = if ($Model -and $Model -ne 'auto') { @('-m', $Model) } else { @() }
    $policyArguments = @()
    if ($Sandbox -ne 'read-only') {
      $rules = @($checkPrefixes | ForEach-Object { "[[rule]]`ntoolName = `"run_shell_command`"`ncommandPrefix = `"$_`"`ndecision = `"allow`"`npriority = 100`n" })
      # Never let the unsandboxed agent rewrite the launcher stack that later runs on this machine.
      foreach ($path in $deniedPaths) {
        # Windows paths ignore case and Gemini's policy engine uses JavaScript regex (no inline (?i)): [sS][cC]...
        $caseless = -join @($path.TrimEnd('/').ToCharArray() | ForEach-Object {
          if ([char]::IsLetter($_)) { '[' + [char]::ToLowerInvariant($_) + [char]::ToUpperInvariant($_) + ']' } else { [regex]::Escape([string]$_) } })
        $pattern = '"file_path"\s*:\s*"(?:[^"]*[\\/])?' + $caseless + '(?:[\\/"])'
        $rules += "[[rule]]`ntoolName = [`"write_file`", `"replace`"]`nargsPattern = '$pattern'`ndecision = `"deny`"`npriority = 200`n"
      }
      [IO.File]::WriteAllText($base + '.policy.toml', ($rules -join "`n"), $utf8)
      $policyArguments = @('--policy', ($base + '.policy.toml'))
    }
    $arguments = @($gemini.Source, '--skip-trust', '--approval-mode', $approval, '-o', 'json') + $policyArguments + $geminiModel + @('-p', $prompt)
  } elseif ($isAgy) {
    $agy = Get-Command $providerPolicy.command -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $agy) { throw "$($providerPolicy.command) not found on PATH" }
    if ($agy.Source -match '[%"]') { throw 'Antigravity CLI path must not contain % or double quotes.' }
    $status = Invoke-Git 'status --short'
    if (-not $head -or $null -eq $status) { throw 'Cannot capture the starting Git state for Antigravity.' }
    # Keep unrelated filenames out of the cloud prompt and cmd.exe arguments.
    $startingChanges = @($status -split '\r?\n' | Where-Object { $_ }).Count
    # Turbo (UPGRADE-3): -Sandbox danger-full-access, behind the same codex-full-access approval as Codex.
    $turbo = $Sandbox -eq 'danger-full-access'
    $shellNote = if ($turbo) {
      'You have full access (no sandbox): you may run the task''s tests and builds with the shell. Never commit, push, install software or change settings.'
    } elseif ($Sandbox -eq 'read-only') {
      'This run is read-only: do not edit files. Your shell runs in Antigravity''s sandbox (read-only, offline): use it for Git, search and reading, and report commands that must write as NOT RUN.'
    } else {
      'Your shell runs in Antigravity''s sandbox: read-only and offline. Use it for Git, search and reading; make edits with file tools. Commands that must write (tests, builds) fail there: report them as NOT RUN.'
    }
    $prompt = "$shellNote The launcher confirmed the repo root, start HEAD $head and initial git status ($startingChanges entries). Inspect existing owned outputs before editing. Leave final Git status to the launcher operator. $prompt"
    # write_file is the permission action for workspace edits, including replacements. The terminal sandbox
    # rejects relative paths ("non-absolute file path"), so every deny is absolute under this checkout.
    $deny = @(foreach ($path in $deniedPaths) {
      $full = [IO.Path]::GetFullPath((Join-Path $root $path.TrimEnd('/')))
      "write_file($full$(if ($path.EndsWith('/')) { [IO.Path]::DirectorySeparatorChar }))"
    })
    # Turbo drops only the terminal sandbox (tests must write); file tools stay inside the workspace either way.
    $settings = @{ useG1Credits = $false; enableTerminalSandbox = -not $turbo; toolPermission = 'request-review'; allowNonWorkspaceAccess = $false
      permissions = @{ allow = @('command(*)'); deny = $deny } }
    [IO.File]::WriteAllText($base + '.settings.json', (ConvertTo-Json $settings -Depth 5), $utf8)
    $mode = if ($Sandbox -eq 'read-only') { 'plan' } else { 'accept-edits' }
    $agyModel = if ($Model -and $Model -ne 'auto') { @('--model', $Model) } else { @() }
    # agy rejects --effort when the model slug already carries a tier suffix (e.g. gemini-4-neon-medium).
    $agyEffort = if ($Effort -in @('low','medium','high','xhigh','max') -and (-not $Model -or $Model -eq 'auto' -or $Model -notmatch '-(low|medium|high|xhigh|max)$')) { @('--effort', $Effort) } else { @() }
    $sandboxFlag = if ($turbo) { '--dangerously-skip-permissions' } else { '--sandbox' }
    $arguments = @($agy.Source, '-p', $prompt, '--output-format', 'json', '--mode', $mode, $sandboxFlag, '--disable-slash-commands',
      '--settings', ($base + '.settings.json'), '--print-timeout', ([string][Math]::Ceiling($TimeoutMinutes) + 'm')) + $agyModel + $agyEffort
  } elseif ($isClaude) {
    $claude = Get-Command $policy.models.claude.headless.command -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $claude) { throw "$($policy.models.claude.headless.command) not found on PATH" }
    if ($claude.Source -match '[%"]') { throw 'Claude CLI path must not contain % or double quotes.' }
    $mode = if ($Sandbox -eq 'read-only') { 'plan' } else { 'acceptEdits' }
    $allowed = @($agentShell | ForEach-Object { '--allowedTools'; "Bash($_`:*)" })
    foreach ($path in $deniedPaths) { $allowed += @('--disallowedTools', "Edit($(if ($path.EndsWith('/')) { $path + '**' } else { $path }))") }
    $arguments = @($claude.Source, '-p', $prompt, '--output-format', 'json', '--permission-mode', $mode) + $(if ($Model) { @('--model', $Model) } else { @() }) + $allowed
  } else {
    $arguments = @($codex.Source, 'exec', '-s', $Sandbox, '-c', "model_reasoning_effort=$(if ($codexEffort) { $codexEffort } else { $Effort })") + $modelArguments + @($providerArguments) + @('--json', '--output-last-message', ($base + '.report.md'), $prompt)
  }
  # Quote every cmd argument and disable delayed expansion; no shell redirection touches paths.
  $commandLine = ($arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = Join-Path ([Environment]::SystemDirectory) 'cmd.exe'
  $info.Arguments = '/d /v:off /s /c "' + $commandLine + '"'
  $info.WorkingDirectory = $root
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  Clear-GitOverrides $info
  # A nested Claude Code session refuses to start, and Obsidian has none of these anyway.
  if ($isClaude) { foreach ($name in @('CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT')) { [void]$info.EnvironmentVariables.Remove($name) } }
  if ($providerPolicy -and $providerPolicy.envKey -and -not $info.EnvironmentVariables[$providerPolicy.envKey]) {
    # A key saved for the Windows user after this shell started; passed to the child only, never logged.
    $info.EnvironmentVariables[$providerPolicy.envKey] = Get-CcxProviderKey $providerPolicy.envKey
  }
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $info
  $eventsStream = [IO.File]::Open($base + '.events.jsonl', 'Create', 'Write', 'Read')
  $stderrStream = [IO.File]::Open($base + '.stderr.log', 'Create', 'Write', 'Read')
  # Briefs are user inputs exempt from scope; snapshot them so a brief changed during this run is reported.
  $briefHashes = @{}
  foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $root 'tasks') -Recurse -Filter *.md -File -ErrorAction SilentlyContinue)) { $briefHashes['tasks/' + $file.FullName.Substring((Join-Path $root 'tasks').Length + 1).Replace('\', '/')] = (Get-FileHash -LiteralPath $file.FullName).Hash }
  [void]$process.Start()
  $processStarted = $true
  $process.StandardInput.Close()
  $eventsCopy = $process.StandardOutput.BaseStream.CopyToAsync($eventsStream)
  $stderrCopy = $process.StandardError.BaseStream.CopyToAsync($stderrStream)
  $deadline = [DateTime]::UtcNow.AddMinutes($TimeoutMinutes)
  while (-not $process.WaitForExit(200)) {
    if ([DateTime]::UtcNow -ge $deadline) {
      $timedOut = $true
      Write-Output "TIMEOUT after $TimeoutMinutes min"
      Stop-CodexTree $process
      break
    }
  }
  $code = $process.ExitCode
  # PS 5.1 would print the VoidTaskResult these return.
  [void]$eventsCopy.GetAwaiter().GetResult()
  [void]$stderrCopy.GetAwaiter().GetResult()
  $eventsStream.Dispose(); $eventsStream = $null
  $stderrStream.Dispose(); $stderrStream = $null
  [IO.File]::WriteAllText($base + '.exit.txt', [string]$code, $utf8)

  $messages = New-Object 'System.Collections.Generic.List[string]'
  [long]$inputTokens = 0; [long]$cachedTokens = 0; [long]$outputTokens = 0
  $hasUsage = $false
  $lastMessage = $null
  if ($isGemini) {
    # Gemini CLI -o json prints one object: response, stats.models.<name>.tokens, optional error.
    try {
      $result = [IO.File]::ReadAllText($base + '.events.jsonl', $utf8) | ConvertFrom-Json -ErrorAction Stop
      if ($result.response) { [IO.File]::WriteAllText($base + '.report.md', [string]$result.response, $utf8) }
      if ($result.error -and $result.error.message) { $messages.Add([string]$result.error.message) }
      foreach ($entry in @($result.stats.models.PSObject.Properties)) {
        $hasUsage = $true
        $inputTokens += [long]$entry.Value.tokens.prompt
        $cachedTokens += [long]$entry.Value.tokens.cached
        $outputTokens += [long]$entry.Value.tokens.candidates + [long]$entry.Value.tokens.thoughts
      }
    } catch { }
  }
  if ($isAgy) {
    # agy -p --output-format json prints one object: status (SUCCESS), response, usage, and an error when it fails.
    try {
      $result = [IO.File]::ReadAllText($base + '.events.jsonl', $utf8) | ConvertFrom-Json -ErrorAction Stop
      if ($result.status -eq 'SUCCESS' -and $result.response) { [IO.File]::WriteAllText($base + '.report.md', [string]$result.response, $utf8) }
      elseif ($result.status -ne 'SUCCESS') { $messages.Add([string]$(if ($result.error.message) { $result.error.message } elseif ($result.error) { $result.error } else { "agy status $($result.status)" })) }
      if ($result.usage) {
        $hasUsage = $true
        $inputTokens += [long]$result.usage.input_tokens; $cachedTokens += [long]$result.usage.cache_read_tokens
        $outputTokens += [long]$result.usage.output_tokens + [long]$result.usage.thinking_tokens
      }
    } catch { }
  }
  if ($isClaude) {
    # claude -p --output-format json prints one result object: result, is_error, usage.
    try {
      $result = [IO.File]::ReadAllText($base + '.events.jsonl', $utf8) | ConvertFrom-Json -ErrorAction Stop
      if ($result.is_error) { $messages.Add([string]$result.result) }
      elseif ($result.result) { [IO.File]::WriteAllText($base + '.report.md', [string]$result.result, $utf8) }
      if ($result.usage) {
        $hasUsage = $true
        $cachedTokens += [long]$result.usage.cache_read_input_tokens
        $inputTokens += [long]$result.usage.input_tokens + [long]$result.usage.cache_read_input_tokens + [long]$result.usage.cache_creation_input_tokens
        $outputTokens += [long]$result.usage.output_tokens
      }
    } catch { }
  }
  foreach ($line in $(if ($isGemini -or $isAgy -or $isClaude) { @() } else { [IO.File]::ReadLines($base + '.events.jsonl', $utf8) })) {
    try { $event = $line | ConvertFrom-Json -ErrorAction Stop } catch { continue }
    if ($event.type -eq 'turn.completed' -and $event.usage) {
      $hasUsage = $true
      $inputTokens += $event.usage.input_tokens
      $cachedTokens += $event.usage.cached_input_tokens
      $outputTokens += $event.usage.output_tokens
    }
    $message = $null
    if ($event.type -eq 'error') { $message = $event.message }
    if ($event.type -eq 'turn.failed') { $message = $event.error.message }
    if ($message -and -not $messages.Contains($message)) { $messages.Add($message) }
    if ($event.type -eq 'item.completed' -and $event.item -and $event.item.type -eq 'agent_message' -and $event.item.text) { $lastMessage = [string]$event.item.text }
  }
  $briefsChanged = @(foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $root 'tasks') -Recurse -Filter *.md -File -ErrorAction SilentlyContinue)) {
    $key = 'tasks/' + $file.FullName.Substring((Join-Path $root 'tasks').Length + 1).Replace('\', '/')
    if (-not $briefHashes.ContainsKey($key) -or $briefHashes[$key] -ne (Get-FileHash -LiteralPath $file.FullName).Hash) { $key }
  }) + @($briefHashes.Keys | Where-Object { -not [IO.File]::Exists((Join-Path $root $_)) })
  foreach ($path in $briefsChanged) { Write-Output "BRIEF CHANGED DURING RUN: $path (by you or the agent; check it)" }
  $protectedChanged = @()
  if ($protectedBefore) {
    # Owned protected paths are the task's own work (UPGRADE-3); every other protected change is tampering.
    $protectedChanged = @(Compare-CcxProtectedHashes $protectedBefore (Get-CcxProtectedHashes -Root $root -Policy $policy) |
      Where-Object { -not (Test-CcxPathOwned -Path $_ -Owns $taskOwns) })
    foreach ($path in $protectedChanged) { Write-Output "PROTECTED FILE CHANGED DURING RUN: $path (review and undo before running anything)" }
  }
  if ($hasUsage) { Write-Output "Codex tokens: input=$inputTokens (cached=$cachedTokens) output=$outputTokens" }
  else { Write-Output 'Codex tokens: unknown (no turn.completed event)' }
  $limitPattern = 'hit your usage limit|Quota exceeded|usage not included|usage limit reached|hit your limit|RESOURCE_EXHAUSTED|quota (?:exceeded|exhausted)'
  $limitMessages = @($messages | Where-Object { $_ -match $limitPattern })
  $limitMessages += @([IO.File]::ReadLines($base + '.stderr.log', $utf8) | Where-Object { $_ -match $limitPattern })
  foreach ($message in ($limitMessages | Select-Object -Unique)) {
    Write-Output "USAGE LIMIT: $message"
    if ($message -match '(?i)try again at\s+([^\r\n]+)') { Write-Output "RESETS: $($Matches[1].Trim().TrimEnd('.'))" }
  }
  # A provider capacity error or 5xx that ended the turn (no completed turn, nonzero exit) is transient: like a
  # usage limit it says nothing about the task, but it records no quota reset. A recovered 5xx is not one.
  $transientPattern = '(?i)\bat capacity\b|\boverloaded\b|\bservice unavailable\b|\b(?:HTTP|status)[ /:]*5\d\d\b|\b5\d\d (?:Internal Server Error|Bad Gateway|Gateway Timeout)\b'
  # Only the failure that ended the run counts: the last error message, or the last stderr line. A timeout or a
  # protected-file change keeps its own verdict and spends the attempt.
  # ponytail: "last line" heuristic; a provider that logs a 5xx last and then dies of something else still reads
  # as transient. Parse the terminal turn.failed reason per provider if that shows up in FRICTION.md.
  $transientMessages = @()
  if ($limitMessages.Count -eq 0 -and $code -ne 0 -and -not $hasUsage -and -not $timedOut -and -not $protectedChanged.Count) {
    $lastStderr = @([IO.File]::ReadLines($base + '.stderr.log', $utf8) | Where-Object { $_.Trim() }) | Select-Object -Last 1
    $transientMessages = @(@(@($messages) | Select-Object -Last 1) + @($lastStderr) | Where-Object { $_ -and $_ -match $transientPattern })
  }
  foreach ($message in ($transientMessages | Select-Object -Unique)) { Write-Output "TRANSIENT PROVIDER FAILURE: $message (no attempt used)" }
  if ($limitMessages.Count -eq 0) {
    foreach ($message in $messages) { Write-Output "Codex error: $message" }
  }
  Write-Output "Codex exit=$code; capture=$base"
  $report = ''
  if ([IO.File]::Exists($base + '.report.md')) { $report = [IO.File]::ReadAllText($base + '.report.md', $utf8) }
  if ([string]::IsNullOrWhiteSpace($report)) {
    Write-Output 'NO REPORT: inspect the .events.jsonl and .stderr.log captures and the working-tree diff.'
    # A usage-limit cutoff loses the report; Codex's last progress message is the best summary left.
    if ($lastMessage) { Write-Output ('LAST MESSAGE: ' + $lastMessage.Substring(0, [Math]::Min(2000, $lastMessage.Length))) }
    if ($code -eq 0) { $code = 3 }
  } else {
    Write-Output '--- report ---'
    Write-Output $report
  }
  if ($limitMessages.Count -gt 0 -or $transientMessages.Count -gt 0) { $code = 4 }
  if ($timedOut) { $code = 5 }
  # A protected-file change outranks a timeout: it must never be masked as exit 5 (UPGRADE-3 review 2b).
  if ($protectedChanged.Count) { $code = 9 }
  if ($guardNoEdit) {
    $snapshotAfter = Get-RepoSnapshot
    $changed = if ($null -eq $snapshotAfter) { @('<snapshot failed>') } else {
      @(Compare-Object -ReferenceObject $snapshotBefore -DifferenceObject $snapshotAfter | ForEach-Object { $_.InputObject } | Select-Object -Unique)
    }
    if ($changed.Count) {
      Write-Output "NO-EDIT VIOLATION: the $Role run changed the working tree (sandbox $Sandbox). Review and undo before anything else:"
      foreach ($entry in ($changed | Select-Object -First 20)) { Write-Output "  $entry" }
      # Only the launcher's own verdict replaces a clean exit; a usage limit or timeout keeps its code.
      if ($code -eq 0 -or $code -eq 3) { $code = 9 }
    }
  }
  if ($TaskId) {
    $codexCode = $code
    try {
      $status = 'NONE'
      # Tolerate Markdown emphasis (Status: **X**, **Status:** **X**, **Status**: X); the colon is required.
      $statusMatch = [regex]::Match($report, '(?m)^[ \t*]*Status[ \t*]*:[ \t*]*(READY_FOR_CLAUDE_REVIEW|PARTIAL|BLOCKED)\b')
      if ($statusMatch.Success) { $status = $statusMatch.Groups[1].Value }
      $postChecks = $null; $scopeViolations = @()
      if ($Role -eq 'implement') {
        $task = Get-CcxTask -Id $TaskId
        $postChecks = Invoke-CcxQuickChecks -Task $task -Root $root
        foreach ($stage in $postChecks.stages) {
          $details = ConvertTo-Json -InputObject $stage.details -Compress -Depth 10
          Write-Output (Protect-CcxText "POST-CHECK $($stage.result) $($stage.name) $details")
          if ($stage.name -eq 'scope') { $scopeViolations = @($stage.details) }
        }
        foreach ($path in $scopeViolations) { Write-Output (Protect-CcxText "SCOPE VIOLATION: $path") }
        if ($code -eq 0 -and -not $postChecks.pass) { $code = 9; Write-Output 'completed; post-checks failed' }
      }
      $tokens = if ($hasUsage) { @{input=$inputTokens; cached=$cachedTokens; output=$outputTokens} } else { $null }
      $duration = [math]::Round($dispatchClock.Elapsed.TotalSeconds, 3)
      Invoke-CcxLocked {
        param($state)
        $task = Get-CcxTask -State $state -Id $TaskId
        if ($hasUsage) {
          $task.tokens.input += $inputTokens; $task.tokens.cached += $cachedTokens; $task.tokens.output += $outputTokens
        }
        $now = Get-CcxNow
        $dispatch.exit = $code; $dispatch.status = $status; $dispatch.endedAt = $now
        $dispatch.durationSec = $duration; $dispatch.tokens = $tokens; $dispatch.postChecks = $postChecks
        $dispatch.capture = $base; $dispatch.input = $inputSha; $dispatch.briefsChanged = @($briefsChanged)
        $task.lastDispatch = $dispatch; $task.updated = $now
        # Every run's input version, output and verdict, so a cross-agent task keeps its whole trail.
        $task.runs = @(@($task.runs | Where-Object { $_ }) + @($dispatch.Clone()) | Select-Object -Last 20)
        if ($limitMessages.Count -gt 0) {
          $resetText = ''
          foreach ($message in $limitMessages) {
            if ($message -match '(?i)try again at\s+([^\r\n]+)') { $resetText = $Matches[1].Trim().TrimEnd('.'); break }
          }
          # Gemini says "Please retry in 15h22m7.08s": turn it into a time the reset parser accepts.
          if (-not $resetText) {
            foreach ($message in $limitMessages) {
              if ($message -match '(?i)retry in (?:(\d+)h)?(?:(\d+)m)?' -and ($Matches[1] -or $Matches[2])) {
                $resetText = [DateTime]::Now.AddHours([int]$Matches[1]).AddMinutes([int]$Matches[2] + 1).ToString('MMM d, yyyy h:mm tt', [Globalization.CultureInfo]::InvariantCulture); break
              }
            }
          }
          # Another provider's limit says nothing about OpenAI Codex quota.
          if ($providerName) {
            # The provider's own limit: the router skips it until then and tries the next fallback.
            if (-not $state.ContainsKey('providerLimits') -or $state.providerLimits -isnot [Collections.IDictionary]) { $state.providerLimits = @{} }
            $state.providerLimits[$providerName] = Get-DispatchReset -Text $resetText -Policy $policy
          } else {
            $state.agents.codex.unavailableUntil = Get-DispatchReset -Text $resetText -Policy $policy
            $state.agents.codex.reason = Protect-CcxText ($limitMessages -join '; ')
          }
          # A run cut off by the usage limit says nothing about the task: it does not use a retry.
          if ($Role -eq 'implement') { $task.dispatches = [Math]::Max(0, [int]$task.dispatches - 1) }
        } elseif ($transientMessages.Count -gt 0 -and $code -eq 4 -and $Role -eq 'implement') {
          # Transient provider failure: refund the attempt, record no reset; outputs and captures stay for review.
          $task.dispatches = [Math]::Max(0, [int]$task.dispatches - 1)
        }
        $task.checkpoints = @($task.checkpoints) + @(@{at=$now; note="dispatch $($dispatch.n) end exit $code status $status"})
        Write-CcxTelemetry -Record @{
          at=$now; kind='dispatch'; taskId=$TaskId; type=$task.type; class=$task.class; risk=$task.risk
          role=$Role; agent=$(if ($isClaude) { 'claude' } elseif ($isGemini -or $isAgy) { 'gemini' } else { 'codex' }); provider=$(if ($providerName) { $providerName } else { 'openai' }); model=$Model; effort=$Effort; attempt=$dispatch.n
          exit=$code; status=$status; tokens=$tokens; durationSec=$duration
          scopeViolations=$scopeViolations.Count; postChecksPass=$(if ($postChecks) { $postChecks.pass } else { $null })
        }
        $eventKey = "dispatch:${TaskId}:$($dispatch.n)"
        $startedStamp = [DateTime]::Parse($dispatch.startedAt).ToUniversalTime().ToString('yyyyMMddHHmmss')
        if ($Role -ne 'implement') { $eventKey = "dispatch:${TaskId}:${Role}:$startedStamp" }
        elseif ($limitMessages.Count -gt 0 -or $transientMessages.Count -gt 0) { $eventKey += ":limit:$startedStamp" }
        $null = Add-CcxEvent -State $state -Type dispatch-finished -TaskId $TaskId -Key $eventKey -Data @{exit=$code; status=$status; dispatch=$dispatch.n; role=$Role}
      }
    } catch {
      Write-Output ('ccx bookkeeping failed: ' + (Protect-CcxText $_.Exception.Message))
      $code = if ($codexCode -eq 0) { 1 } else { $codexCode }
    }
  }
} catch {
  Write-Output $_.Exception.Message
  if ($timedOut) { $code = 5 }
  elseif ($TaskId -and $_.Exception.Data.Contains('ccxExit')) { $code = [int]$_.Exception.Data['ccxExit'] }
  elseif ($code -ne 6) { $code = 1 }
} finally {
  if ($processStarted -and -not $process.HasExited) {
    try { Stop-CodexTree $process } catch { Write-Output $_.Exception.Message; $code = 1 }
  }
  if ($eventsStream) { $eventsStream.Dispose() }
  if ($stderrStream) { $stderrStream.Dispose() }
  if ($process) { $process.Dispose() }
  if ($ownsLock) {
    # Delete while holding the handle, so another writer cannot acquire it between close and delete.
    try { [IO.File]::Delete($lockPath) } catch { Write-Output "Cannot remove dispatch lock: $($_.Exception.Message)" }
  }
  if ($lockStream) { $lockStream.Dispose() }
  Set-Location -LiteralPath $previousLocation.ProviderPath
  $OutputEncoding = $previousOutputEncoding
  [Console]::OutputEncoding = $previousEncoding
}
exit $code
