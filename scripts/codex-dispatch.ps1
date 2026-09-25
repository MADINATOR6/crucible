<#
Dispatch-mode launcher for Windows PowerShell 5.1.
Parameters: -Effort medium|high (medium), -Role implement|verify|research
(implement), -TaskFile <path> (TASK.md; required for research),
-CaptureDir <path> (%USERPROFILE%\codex-captures), -TimeoutMinutes <n> (60; fractions allowed),
-Sandbox read-only|workspace-write|danger-full-access (workspace-write for
implement, read-only otherwise). Relative paths use the caller's directory.
Exit codes: 0 success; Codex's own code otherwise; 3 missing/blank report;
4 usage limit; 5 timeout; 6 busy writer; 1 refusal or launcher failure.
The execution-policy bypass, if supplied by the caller, affects that process only.
#>
param(
  [ValidateSet('medium', 'high')] [string]$Effort = 'medium',
  [ValidateSet('implement', 'verify', 'research')] [string]$Role = 'implement',
  [string]$TaskFile = 'TASK.md',
  [string]$CaptureDir = (Join-Path $env:USERPROFILE 'codex-captures'),
  [ValidateRange(0.01, 10080)] [double]$TimeoutMinutes = 60,
  [ValidateSet('read-only', 'workspace-write', 'danger-full-access')] [string]$Sandbox = 'workspace-write'
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

function Invoke-Git([string]$Arguments) {
  $info = New-Object Diagnostics.ProcessStartInfo
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
  $killer.FileName = Join-Path $env:WINDIR 'System32\taskkill.exe'
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

try {
  [Console]::OutputEncoding = $utf8
  $OutputEncoding = $utf8
  # PS 5.1 can start in System32 when the process cwd contains brackets.
  if ($previousLocation.ProviderPath -eq (Join-Path $env:WINDIR 'System32') -and
      [Environment]::CurrentDirectory -ne $previousLocation.ProviderPath) {
    Set-Location -LiteralPath ([Environment]::CurrentDirectory)
  }
  if ($Role -eq 'research' -and -not $PSBoundParameters.ContainsKey('TaskFile')) {
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
  if (-not [IO.File]::Exists($taskPath)) { throw "Task file not found: $taskPath" }
  $body = [IO.File]::ReadAllText($taskPath, $utf8) -replace '(?s)<!--.*?-->', '' -replace '(?m)^\s*#{1,6}(?:\s.*)?\r?$', ''
  if ([string]::IsNullOrWhiteSpace($body)) { throw "Task file is empty or unfilled: $taskPath" }
  $codex = Get-Command codex.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $codex) { throw 'codex.cmd not found on PATH' }
  if ($codex.Source -match '[%"]') { throw 'codex.cmd path must not contain % or double quotes.' }
  $base = Join-Path $CaptureDir ('codex-' + [guid]::NewGuid().ToString('N'))
  if (($base.Length + 13) -ge 260) { throw "Capture path too long ($($base.Length + 13) chars). Pass a shorter -CaptureDir." }

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
  Write-Output "Dispatching Codex: HEAD=$head effort=$Effort sandbox=$Sandbox"
  $arguments = @($codex.Source, 'exec', '-s', $Sandbox, '-c', "model_reasoning_effort=$Effort", '--json', '--output-last-message', ($base + '.report.md'), $prompt)
  # Quote every cmd argument and disable delayed expansion; no shell redirection touches paths.
  $commandLine = ($arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $env:ComSpec
  $info.Arguments = '/d /v:off /s /c "' + $commandLine + '"'
  $info.WorkingDirectory = $root
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $info
  $eventsStream = [IO.File]::Create($base + '.events.jsonl')
  $stderrStream = [IO.File]::Create($base + '.stderr.log')
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
    if ($code -eq 0) { $code = 3 }
  } else {
    Write-Output '--- report ---'
    Write-Output $report
  }
  if ($limitMessages.Count -gt 0) { $code = 4 }
  if ($timedOut) { $code = 5 }
} catch {
  Write-Output $_.Exception.Message
  if ($timedOut) { $code = 5 } elseif ($code -ne 6) { $code = 1 }
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
