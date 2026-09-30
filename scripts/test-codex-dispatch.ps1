<#
Regression tests for codex-dispatch.ps1. All Codex calls use a fake codex.cmd.
Run from the repository root with Windows PowerShell 5.1.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $PSScriptRoot 'codex-dispatch.ps1'
$scratch = Join-Path $env:TEMP 'ccx-t2'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$powershell = Join-Path $PSHOME 'powershell.exe'
$git = (Get-Command git.exe -ErrorAction Stop).Source
$node = (Get-Command node.exe -ErrorAction Stop).Source
$passed = 0
$total = 0
$failures = New-Object 'System.Collections.Generic.List[string]'
$clock = [Diagnostics.Stopwatch]::StartNew()

function Write-Utf8File([string]$path, [string]$value) {
  [System.IO.File]::WriteAllText($path, $value, $utf8)
}
function Quote-Ps([string]$value) {
  return "'" + $value.Replace("'", "''") + "'"
}
function Assert([bool]$condition, [string]$reason) {
  if (-not $condition) { throw $reason }
}
function Run-Git([string[]]$gitArgs) {
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo.FileName = $git
  $p.StartInfo.Arguments = ($gitArgs | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
  $p.StartInfo.UseShellExecute = $false
  $p.StartInfo.RedirectStandardOutput = $true
  $p.StartInfo.RedirectStandardError = $true
  [void]$p.Start()
  $null = $p.StandardOutput.ReadToEnd()
  $errorText = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) { throw "git failed: $errorText" }
}
function Run-Launcher {
  param([string]$cwd, [string[]]$arguments = @(), [string]$mode = 'success',
        [string]$pathMode = 'fake', [bool]$keepStdin = $false,
        [int]$limitSeconds = 25, [string]$fakeLog = '')
  Assert (($arguments.Count % 2) -eq 0) 'test harness arguments must be name/value pairs'
  $parts = New-Object 'System.Collections.Generic.List[string]'
  for ($i = 0; $i -lt $arguments.Count; $i += 2) {
    Assert ($arguments[$i] -in @('-CaptureDir', '-TimeoutMinutes', '-Sandbox', '-Role', '-TaskFile', '-Effort', '-Model')) 'unexpected test harness parameter'
    $parts.Add($arguments[$i])
    $parts.Add((Quote-Ps $arguments[$i + 1]))
  }
  $argText = $parts -join ' '
  $guard = if ($pathMode -eq 'fake') {
    "if ((Get-Command codex.cmd -CommandType Application -ErrorAction SilentlyContinue).Source -cne $(Quote-Ps $fakeCmd)) { throw 'SAFETY: fake codex.cmd is not first on PATH' };"
  } else {
    "if (Get-Command codex.cmd -CommandType Application -ErrorAction SilentlyContinue) { throw 'SAFETY: real codex.cmd resolved in missing case' };"
  }
  $command = "Set-Location -LiteralPath $(Quote-Ps $cwd); $guard & $(Quote-Ps $launcher) $argText; exit `$LASTEXITCODE"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $powershell
  $info.Arguments = '-NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + $encoded
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.WorkingDirectory = $cwd
  $systemPath = (Join-Path $env:SystemRoot 'System32') + ';' + $env:SystemRoot + ';' + (Split-Path $git -Parent)
  if ($pathMode -eq 'fake') { $systemPath = (Join-Path $scratch 'fakebin') + ';' + $systemPath }
  $info.EnvironmentVariables['PATH'] = $systemPath
  $info.EnvironmentVariables['FAKE_MODE'] = $mode
  $info.EnvironmentVariables['FAKE_LOG'] = $fakeLog
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $info
  $started = $false
  $failed = $true
  try {
    [void]$process.Start()
    $started = $true
    if (-not $keepStdin) { $process.StandardInput.Close() }
    $out = New-Object System.IO.MemoryStream
    $err = New-Object System.IO.MemoryStream
    $outTask = $process.StandardOutput.BaseStream.CopyToAsync($out)
    $errTask = $process.StandardError.BaseStream.CopyToAsync($err)
    if (-not $process.WaitForExit($limitSeconds * 1000)) { throw "launcher child exceeded ${limitSeconds}s" }
    if (-not $outTask.Wait(5000) -or -not $errTask.Wait(5000)) {
      throw 'launcher exited but a fake descendant kept a capture pipe open'
    }
    [void]$outTask.GetAwaiter().GetResult()
    [void]$errTask.GetAwaiter().GetResult()
    $result = [pscustomobject]@{
      Code = $process.ExitCode
      Stdout = $utf8.GetString($out.ToArray())
      Stderr = $utf8.GetString($err.ToArray())
      Bytes = $out.ToArray()
    }
    Assert ($result.Stderr -notmatch 'SAFETY:') $result.Stderr
    $failed = $false
    return $result
  } finally {
    if ($started -and -not $process.HasExited) {
      try { & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /T /F /PID $process.Id *> $null } catch { }
      if (-not $process.WaitForExit(2000)) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        [void]$process.WaitForExit(2000)
      }
    }
    if ($failed -and $fakeLog -and (Test-Path -LiteralPath $fakeLog)) {
      try {
        $fakePid = (Get-Content -LiteralPath $fakeLog -Raw | ConvertFrom-Json).pid
        $fakeProcess = Get-Process -Id $fakePid -ErrorAction SilentlyContinue
        if ($fakeProcess -and $fakeProcess.ProcessName -eq 'node') {
          Stop-Process -Id $fakePid -Force -ErrorAction SilentlyContinue
        }
      } catch { }
    }
    $process.Dispose()
  }
}
function Remove-Scratch {
  $actual = [IO.Path]::GetFullPath($scratch).TrimEnd('\')
  $expected = [IO.Path]::GetFullPath((Join-Path $env:TEMP 'ccx-t2')).TrimEnd('\')
  Assert ($actual -ieq $expected) 'scratch path escaped approved temp directory'
  if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force }
}
function Case([string]$name, [scriptblock]$body) {
  $script:total++
  try {
    & $body
    $script:passed++
    Write-Output "PASS $name"
  } catch {
    $message = ($_.Exception.Message -replace '\s+', ' ').Trim()
    $script:failures.Add("FAIL ${name}: $message")
    Write-Output "FAIL ${name}: $message"
  }
}
function New-Task([string]$path, [string]$text = "# Task`nDo this task.`n") {
  Write-Utf8File $path $text
}
function Check-Code($result, [int]$expected) {
  Assert ($result.Code -eq $expected) "exit $($result.Code), expected $expected; stdout=$($result.Stdout); stderr=$($result.Stderr)"
}

if (Test-Path -LiteralPath $scratch) {
  # Never delete a folder this run did not create (another run may be using it).
  Write-Output "FAIL setup: $scratch already exists; inspect and remove it before retrying."
  exit 1
}
try {
  [void](New-Item -ItemType Directory -Path $scratch)
  $fakeDir = Join-Path $scratch 'fakebin'
  [void](New-Item -ItemType Directory -Path $fakeDir)
  $fakeJs = Join-Path $fakeDir 'fake.js'
  $fakeCmd = Join-Path $fakeDir 'codex.cmd'
  $nodeQuoted = '"' + $node + '"'
  Write-Utf8File $fakeCmd ("@echo off`r`n$nodeQuoted `"%~dp0fake.js`" %*`r`n")
  Write-Utf8File $fakeJs @'
const fs = require('fs');
const args = process.argv.slice(2);
const mode = process.env.FAKE_MODE;
const log = process.env.FAKE_LOG;
if (log) fs.writeFileSync(log, JSON.stringify({pid: process.pid, args, cwd: process.cwd()}));
const index = args.indexOf('--output-last-message');
const report = index < 0 ? null : args[index + 1];
const event = value => process.stdout.write(JSON.stringify(value) + '\n');
const write = value => { if (report) fs.writeFileSync(report, value, 'utf8'); };
const usage = "You've hit your usage limit; try again at 5:33 PM.";
if (mode === 'sleep') { setInterval(() => {}, 1000); }
else if (mode === 'stdin') {
  process.stdin.resume();
  process.stdin.on('end', () => { write('stdin done'); process.exit(0); });
}
else if (mode === 'nonzero') { process.exit(7); }
else if (mode === 'noreport') { process.exit(0); }
else if (mode === 'blank') { write(' \t\r\n'); }
else if (mode === 'usage') {
  event({type:'error', message:usage});
  event({type:'turn.failed', error:{message:usage}});
  process.stderr.write(usage + '\n');
  process.exit(1);
}
else if (mode === 'error') {
  event({type:'error', message:'first error'});
  event({type:'turn.failed', error:{message:'first error'}});
  event({type:'turn.failed', error:{message:'second error'}});
  write('done');
}
else {
  process.stdout.write('not JSON\n');
  event({type:'turn.completed', usage:{input_tokens:100,cached_input_tokens:10,output_tokens:5}});
  event({type:'turn.completed', usage:{input_tokens:200,cached_input_tokens:20,output_tokens:7}});
  write('Done ' + String.fromCharCode(0x2192) + ' ok ' + String.fromCharCode(0x2013) + ' fine');
}
'@
  $repo = Join-Path $scratch "repo & (test) [1]'s"
  [void](New-Item -ItemType Directory -Path $repo)
  Run-Git @('init', $repo)
  Run-Git @('-C', $repo, 'config', 'user.email', 'fake@example.test')
  Run-Git @('-C', $repo, 'config', 'user.name', 'Fake')
  New-Task (Join-Path $repo 'TASK.md')
  Write-Utf8File (Join-Path $repo 'HANDOFF.md') '# Handoff'
  Run-Git @('-C', $repo, 'add', 'TASK.md', 'HANDOFF.md')
  Run-Git @('-C', $repo, 'commit', '-m', 'fixture')
  $captures = Join-Path $scratch 'captures'
  $common = @('-CaptureDir', $captures)

  Case 'success report and summed tokens' {
    $r = Run-Launcher $repo $common
    Check-Code $r 0
    Assert ($r.Stdout -match 'input=300 \(cached=30\) output=12') 'token sum missing'
    Assert ($r.Stdout -match '--- report ---') 'report marker missing'
    Assert ($r.Stdout -match 'Codex exit=0; capture=') 'exit/capture line missing'
    Assert ($r.Stdout -notmatch 'VoidTaskResult') 'task result leaked into output'
  }
  Case 'nonzero without report' {
    $r = Run-Launcher $repo $common 'nonzero'; Check-Code $r 7
    Assert ($r.Stdout -match 'NO REPORT') 'NO REPORT missing'
  }
  Case 'zero without report' {
    $r = Run-Launcher $repo $common 'noreport'; Check-Code $r 3
    Assert ($r.Stdout -match 'NO REPORT') 'NO REPORT missing'
  }
  Case 'whitespace report' {
    $r = Run-Launcher $repo $common 'blank'; Check-Code $r 3
    Assert ($r.Stdout -match 'NO REPORT') 'NO REPORT missing'
  }
  Case 'usage limit and reset' {
    $r = Run-Launcher $repo $common 'usage'; Check-Code $r 4
    Assert ($r.Stdout -match 'USAGE LIMIT:') 'usage line missing'
    Assert ($r.Stdout -match 'RESETS: 5:33 PM\r?\n') 'reset line missing or has trailing text'
  }
  Case 'distinct errors' {
    $r = Run-Launcher $repo $common 'error'; Check-Code $r 0
    Assert (([regex]::Matches($r.Stdout, 'Codex error: first error')).Count -eq 1) 'first error repeated or absent'
    Assert ($r.Stdout -match 'Codex error: second error') 'second error absent'
  }
  Case 'timeout removes fake process' {
    $log = Join-Path $scratch 'timeout.json'
    $r = Run-Launcher $repo ($common + @('-TimeoutMinutes', '0.05')) 'sleep' 'fake' $false 30 $log
    Check-Code $r 5
    Assert ($r.Stdout -match 'TIMEOUT after 0\.05 min') 'timeout message missing'
    Assert (Test-Path -LiteralPath $log) 'fake never started'
    $fakePid = (Get-Content -LiteralPath $log -Raw | ConvertFrom-Json).pid
    Start-Sleep -Milliseconds 500
    Assert (-not (Get-Process -Id $fakePid -ErrorAction SilentlyContinue)) "fake pid $fakePid still alive"
  }
  Case 'open caller stdin' {
    $r = Run-Launcher $repo $common 'stdin' 'fake' $true
    Check-Code $r 0
    Assert ($r.Stdout -match 'stdin done') 'fake did not get stdin EOF'
  }
  $gitDir = Join-Path $repo '.git'
  $lock = Join-Path $gitDir 'codex-dispatch.lock'
  Case 'live writer lock' {
    # Hold the lock the way a running launcher does: open for write, shared for read only.
    $held = [IO.File]::Open($lock, 'OpenOrCreate', 'ReadWrite', ([IO.FileShare]::Read -bor [IO.FileShare]::Delete))
    try {
      $pidBytes = $utf8.GetBytes([string]$PID)
      $held.Write($pidBytes, 0, $pidBytes.Length); $held.Flush()
      $r = Run-Launcher $repo $common; Check-Code $r 6
      Assert ($r.Stdout -match 'BUSY: another write dispatch is running') 'BUSY missing'
    } finally { $held.Dispose(); Remove-Item -LiteralPath $lock -ErrorAction SilentlyContinue }
  }
  Case 'stale writer lock' {
    Write-Utf8File $lock '2147483647'
    $r = Run-Launcher $repo $common; Check-Code $r 0
    Assert (-not (Test-Path -LiteralPath $lock)) 'lock remains after run'
  }
  Case 'stale lock naming a live pid is reclaimed' {
    Write-Utf8File $lock ([string]$PID)
    $r = Run-Launcher $repo $common; Check-Code $r 0
    Assert (-not (Test-Path -LiteralPath $lock)) 'lock remains after run'
  }
  Case 'read-only ignores writer lock' {
    Write-Utf8File $lock ([string]$PID)
    try {
      $r = Run-Launcher $repo ($common + @('-Sandbox', 'read-only')); Check-Code $r 0
    } finally { Remove-Item -LiteralPath $lock -ErrorAction SilentlyContinue }
  }
  Case 'verify role and sandbox' {
    $log = Join-Path $scratch 'verify.json'
    $r = Run-Launcher $repo ($common + @('-Role', 'verify')) 'success' 'fake' $false 25 $log
    Check-Code $r 0
    $args = (Get-Content -LiteralPath $log -Raw | ConvertFrom-Json).args
    Assert (($args -join '|') -match '\|-s\|read-only\|') 'read-only sandbox absent'
    $wanted = 'Read HANDOFF.md and follow its Verifier instruction for ' + (Join-Path $repo 'TASK.md') + '.'
    Assert ($args[-1] -ceq $wanted) 'Verifier prompt differs'
  }
  Case 'model and xhigh effort passed' {
    $log = Join-Path $scratch 'model.json'
    $r = Run-Launcher $repo ($common + @('-Model', 'gpt-6-astra', '-Effort', 'xhigh')) 'success' 'fake' $false 25 $log
    Check-Code $r 0
    $joined = ((Get-Content -LiteralPath $log -Raw | ConvertFrom-Json).args) -join '|'
    Assert ($joined -match '\|-m\|gpt-6-astra\|') 'model flag absent'
    Assert ($joined -match '\|model_reasoning_effort=xhigh\|') 'xhigh effort absent'
    Assert ($r.Stdout -match 'model=gpt-6-astra effort=xhigh') 'dispatch line lacks model or effort'
  }
  Case 'default model omits flag' {
    $log = Join-Path $scratch 'nomodel.json'
    $r = Run-Launcher $repo $common 'success' 'fake' $false 25 $log
    Check-Code $r 0
    $args = (Get-Content -LiteralPath $log -Raw | ConvertFrom-Json).args
    Assert (-not ($args -contains '-m')) 'model flag passed without -Model'
  }
  Case 'unsafe model refused' {
    # Under -File a binding failure exits 1; this harness calls the script with &, so check the refusal itself.
    $log = Join-Path $scratch 'badmodel.json'
    $r = Run-Launcher $repo ($common + @('-Model', 'gpt 6 & x')) 'success' 'fake' $false 25 $log
    Assert ($r.Stderr -match "Cannot validate argument on parameter 'Model'") 'model validation message absent'
    Assert (-not (Test-Path -LiteralPath $log)) 'fake codex ran with an unsafe model'
  }
  Case 'research requires task file' {
    $r = Run-Launcher $repo ($common + @('-Role', 'research')); Check-Code $r 1
  }
  Case 'relative paths from subdirectory' {
    $sub = Join-Path $repo 'sub'
    [void](New-Item -ItemType Directory -Path $sub -Force)
    New-Task (Join-Path $sub 'other.md')
    $log = Join-Path $scratch 'relative.json'
    $r = Run-Launcher $sub @('-TaskFile', 'other.md', '-CaptureDir', 'capture here') 'success' 'fake' $false 25 $log
    Check-Code $r 0
    $args = (Get-Content -LiteralPath $log -Raw | ConvertFrom-Json).args
    Assert ($args[-1] -ceq ('Read HANDOFF.md and follow its Implementer instruction for ' + (Join-Path $sub 'other.md') + '.')) 'relative task path incorrect'
    Assert (Test-Path -LiteralPath (Join-Path $sub 'capture here')) 'relative capture path incorrect'
  }
  Case 'empty task refused' {
    $task = Join-Path $scratch 'empty.md'
    New-Task $task "# Heading`n<!-- placeholder -->`n"
    $r = Run-Launcher $repo ($common + @('-TaskFile', $task)); Check-Code $r 1
  }
  Case 'missing handoff refused' {
    $other = Join-Path $scratch 'nohandoff'
    [void](New-Item -ItemType Directory -Path $other)
    Run-Git @('init', $other)
    New-Task (Join-Path $other 'TASK.md')
    $r = Run-Launcher $other $common; Check-Code $r 1
  }
  Case 'outside repository' {
    $outside = Join-Path $scratch 'outside'
    [void](New-Item -ItemType Directory -Path $outside)
    $r = Run-Launcher $outside $common; Check-Code $r 1
    Assert ($r.Stdout -match 'Not inside a Git repository\.') 'friendly git message missing'
    Assert ($r.Stderr -notmatch 'NativeCommandError') 'NativeCommandError leaked'
  }
  Case 'codex.cmd missing' {
    $before = @(Get-ChildItem -LiteralPath $captures -ErrorAction SilentlyContinue).Count
    $r = Run-Launcher $repo $common 'success' 'missing'; Check-Code $r 1
    Assert ($r.Stdout -match 'codex.cmd not found on PATH') 'missing executable message absent'
    $after = @(Get-ChildItem -LiteralPath $captures -ErrorAction SilentlyContinue).Count
    Assert ($before -eq $after) 'capture created before executable check'
  }
  Case 'UTF-8 report bytes' {
    $r = Run-Launcher $repo $common; Check-Code $r 0
    $expected = [byte[]]@(0xE2, 0x86, 0x92)
    $hex = [BitConverter]::ToString($r.Bytes)
    Assert ($hex.Contains('E2-86-92') -and $hex.Contains('E2-80-93')) 'UTF-8 arrow or dash bytes missing'
  }
  Case 'special repository path' {
    $log = Join-Path $scratch 'special.json'
    $r = Run-Launcher $repo $common 'success' 'fake' $false 25 $log
    Check-Code $r 0
    Assert ((Get-Content -LiteralPath $log -Raw | ConvertFrom-Json).cwd -ceq $repo) 'fake cwd did not preserve special path'
  }
  Case 'unsafe percent task path refused' {
    $task = Join-Path $repo 'bad%task.md'
    New-Task $task
    $r = Run-Launcher $repo ($common + @('-TaskFile', $task)); Check-Code $r 1
  }
  Case 'unsafe percent capture path refused' {
    $r = Run-Launcher $repo @('-CaptureDir', (Join-Path $scratch 'bad%capture')); Check-Code $r 1
  }
} finally {
  $timeoutLog = Join-Path $scratch 'timeout.json'
  if (Test-Path -LiteralPath $timeoutLog) {
    try {
      $ownedPid = (Get-Content -LiteralPath $timeoutLog -Raw | ConvertFrom-Json).pid
      $ownedProcess = Get-Process -Id $ownedPid -ErrorAction SilentlyContinue
      if ($ownedProcess -and $ownedProcess.ProcessName -eq 'node') {
        Stop-Process -Id $ownedPid -Force -ErrorAction SilentlyContinue
      }
    } catch { }
  }
  Remove-Scratch
}
$clock.Stop()
Write-Output "$passed/$total passed in $([math]::Round($clock.Elapsed.TotalSeconds))s"
if ($passed -ne $total) { exit 1 }
