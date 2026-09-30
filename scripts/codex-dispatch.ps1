<#
Dispatch-mode launcher for Windows PowerShell 5.1.
Parameters: -Effort low|medium|high|xhigh|max (medium), -Model <slug> (Codex's
configured default when omitted), -Role implement|verify|research
(implement), -TaskFile <path> (TASK.md; required for research),
-TaskId <id> (optional ccx task integration),
-CaptureDir <path> (%USERPROFILE%\codex-captures), -TimeoutMinutes <n> (60; fractions allowed),
-Sandbox read-only|workspace-write|danger-full-access (workspace-write for
implement, read-only otherwise). Relative paths use the caller's directory.
Exit codes: 0 success; Codex's own code otherwise; 3 missing/blank report;
4 usage limit; 5 timeout; 6 busy writer; 1 refusal or launcher failure.
With -TaskId: 7 ownership/worktree; 8 budget/route; 9 post-checks; 10 approval.
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
        if ($task.owner -ne 'codex') { throw (New-CcxError 'Role implement requires task.owner = codex.' 7) }
        if ($task.status -eq 'planned') { Start-CcxTaskInState -State $state -Task $task }
        else { Assert-CcxTaskOwnership -State $state -Task $task }
      }
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
    $class = Get-CcxClass -Policy $policy -Class $task.class -Risk $task.risk
    $budget = Get-CcxBudget -Policy $policy -Class $class -Task $task
    $used = [long]$task.tokens.input - [long]$task.tokens.cached + [long]$task.tokens.output
    if ($used -ge $budget.tokenTarget) {
      throw (New-CcxError "BUDGET: token target reached ($used/$($budget.tokenTarget)); raise it with ccx task budget" 8)
    }
    $state = Get-CcxState
    if ($state.agents.codex.unavailableUntil -and [DateTime]::Parse($state.agents.codex.unavailableUntil).ToUniversalTime() -gt [DateTime]::UtcNow) {
      $resume = [DateTime]::Parse($state.agents.codex.unavailableUntil).ToLocalTime()
      throw (New-CcxError "USAGE LIMIT (recorded): Codex resumes at $resume" 4)
    }
    # Always route: retry caps, deferral and ownership refusals apply even with explicit -Effort/-Model.
    $routeArgs = @{ TaskId = $TaskId; Type = $task.type }
    if ($Role -ne 'implement') { $routeArgs.Type = $Role; $routeArgs.Attempt = 1 }
    $decision = Invoke-CcxRoute @routeArgs
    if ($decision.agent -ne 'codex' -or $decision.route -notin @('worker','cheap','script')) {
      throw (New-CcxError ("Route: $($decision.route) - " + ($decision.reasons -join '; ')) 8)
    }
    if (-not $PSBoundParameters.ContainsKey('Effort') -and -not $PSBoundParameters.ContainsKey('Model')) {
      $Model = $decision.model; $Effort = $decision.effort
      if ($Model -notmatch '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' -or $Effort -notin @('low','medium','high','xhigh','max')) {
        throw 'Route returned an invalid model or effort.'
      }
      $firstReason = @($decision.reasons | Select-Object -First 1)
      Write-Output ("Route: $($decision.route) $Model $Effort" + $(if ($firstReason.Count) { ' - ' + $firstReason[0] } else { '' }))
    } else { Write-Output 'Route: explicit' }
    if ($Sandbox -eq 'danger-full-access') {
      $gate = Invoke-CcxGate -Action codex-full-access -Target $TaskId -TaskId $TaskId
      if ($gate.code -ne 0) { throw (New-CcxError ($gate.message + [Environment]::NewLine + $gate.command) 10) }
      Write-Output $gate.message
    }
    $dispatch = Invoke-CcxLocked {
      param($state)
      $task = Get-CcxTask -State $state -Id $TaskId
      if ($Role -eq 'implement') {
        Assert-CcxTaskOwnership -State $state -Task $task
        $task.dispatches++
      }
      $now = Get-CcxNow
      $ladder = @($policy.effortLadder)
      $task.status = 'active'; $task.updated = $now
      $task.checkpoints = @($task.checkpoints) + @(@{at=$now; note="dispatch $($task.dispatches) start $Role $Model $Effort"})
      $task.lastDispatch = @{
        n=$task.dispatches; role=$Role; model=$Model; effort=$Effort; sandbox=$Sandbox; startedAt=$now
        escalated=([array]::IndexOf($ladder,$Effort) -gt [array]::IndexOf($ladder,$policy.classes[$class].effort.codex.base))
      }
      $task.lastDispatch.Clone()
    }
    $dispatchClock = [Diagnostics.Stopwatch]::StartNew()
  }

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

  [void][IO.Directory]::CreateDirectory($CaptureDir)
  $instruction = @{ implement = 'Implementer'; verify = 'Verifier'; research = 'Researcher' }[$Role]
  $prompt = "Read HANDOFF.md and follow its $instruction instruction for $taskPath."
  $head = Invoke-Git 'rev-parse --short HEAD'
  $modelName = if ($Model) { $Model } else { 'default' }
  Write-Output "Dispatching Codex: HEAD=$head model=$modelName effort=$Effort sandbox=$Sandbox"
  $modelArguments = if ($Model) { @('-m', $Model) } else { @() }
  $arguments = @($codex.Source, 'exec', '-s', $Sandbox, '-c', "model_reasoning_effort=$Effort") + $modelArguments + @('--json', '--output-last-message', ($base + '.report.md'), $prompt)
  # Quote every cmd argument and disable delayed expansion; no shell redirection touches paths.
  $commandLine = ($arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = Join-Path ([Environment]::SystemDirectory) 'cmd.exe'
  $info.Arguments = '/d /v:off /s /c "' + $commandLine + '"'
  $info.WorkingDirectory = $root
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  Clear-GitOverrides $info
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $info
  $eventsStream = [IO.File]::Open($base + '.events.jsonl', 'Create', 'Write', 'Read')
  $stderrStream = [IO.File]::Open($base + '.stderr.log', 'Create', 'Write', 'Read')
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
  foreach ($line in [IO.File]::ReadLines($base + '.events.jsonl', $utf8)) {
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
  if ($hasUsage) { Write-Output "Codex tokens: input=$inputTokens (cached=$cachedTokens) output=$outputTokens" }
  else { Write-Output 'Codex tokens: unknown (no turn.completed event)' }
  $limitMessages = @($messages | Where-Object { $_ -match 'hit your usage limit|Quota exceeded|usage not included' })
  $limitMessages += @([IO.File]::ReadLines($base + '.stderr.log', $utf8) | Where-Object { $_ -match 'hit your usage limit|Quota exceeded|usage not included' })
  foreach ($message in ($limitMessages | Select-Object -Unique)) {
    Write-Output "USAGE LIMIT: $message"
    if ($message -match '(?i)try again at\s+([^\r\n]+)') { Write-Output "RESETS: $($Matches[1].Trim().TrimEnd('.'))" }
  }
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
  if ($limitMessages.Count -gt 0) { $code = 4 }
  if ($timedOut) { $code = 5 }
  if ($TaskId) {
    $codexCode = $code
    try {
      $status = 'NONE'
      # Tolerate Markdown emphasis: Codex sometimes writes Status: **READY_FOR_CLAUDE_REVIEW**.
      $statusMatch = [regex]::Match($report, '(?m)^\s*\**Status:?\**\s*\**\s*(READY_FOR_CLAUDE_REVIEW|PARTIAL|BLOCKED)\b')
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
        $task.lastDispatch = $dispatch; $task.updated = $now
        if ($limitMessages.Count -gt 0) {
          $resetText = ''
          foreach ($message in $limitMessages) {
            if ($message -match '(?i)try again at\s+([^\r\n]+)') { $resetText = $Matches[1].Trim().TrimEnd('.'); break }
          }
          $state.agents.codex.unavailableUntil = Get-DispatchReset -Text $resetText -Policy $policy
          $state.agents.codex.reason = Protect-CcxText ($limitMessages -join '; ')
          # A run cut off by the usage limit says nothing about the task: it does not use a retry.
          if ($Role -eq 'implement') { $task.dispatches = [Math]::Max(0, [int]$task.dispatches - 1) }
        }
        $task.checkpoints = @($task.checkpoints) + @(@{at=$now; note="dispatch $($dispatch.n) end exit $code status $status"})
        Write-CcxTelemetry -Record @{
          at=$now; kind='dispatch'; taskId=$TaskId; type=$task.type; class=$task.class; risk=$task.risk
          role=$Role; agent='codex'; model=$Model; effort=$Effort; attempt=$dispatch.n
          exit=$code; status=$status; tokens=$tokens; durationSec=$duration
          scopeViolations=$scopeViolations.Count; postChecksPass=$(if ($postChecks) { $postChecks.pass } else { $null })
        }
        $eventKey = "dispatch:${TaskId}:$($dispatch.n)"
        $startedStamp = [DateTime]::Parse($dispatch.startedAt).ToUniversalTime().ToString('yyyyMMddHHmmss')
        if ($Role -ne 'implement') { $eventKey = "dispatch:${TaskId}:${Role}:$startedStamp" }
        elseif ($limitMessages.Count -gt 0) { $eventKey += ":limit:$startedStamp" }
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
