<#
Regression tests for codex-dispatch.ps1. All Codex calls use a fake codex.cmd.
Run from the repository root with Windows PowerShell 5.1.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $PSScriptRoot 'codex-dispatch.ps1'
$ccx = Join-Path $PSScriptRoot 'ccx.ps1'
$scratchName = 'ccx-t2-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$scratch = Join-Path $env:TEMP $scratchName
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
        [int]$limitSeconds = 25, [string]$fakeLog = '', [bool]$probeCapture = $false)
  Assert (($arguments.Count % 2) -eq 0) 'test harness arguments must be name/value pairs'
  $parts = New-Object 'System.Collections.Generic.List[string]'
  for ($i = 0; $i -lt $arguments.Count; $i += 2) {
    Assert ($arguments[$i] -in @('-CaptureDir', '-TimeoutMinutes', '-Sandbox', '-Role', '-TaskFile', '-Effort', '-Model', '-TaskId')) 'unexpected test harness parameter'
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
    $readable = $false
    if ($probeCapture) {
      # PowerShell alone can take ~5 s to start on slow hosts; the loop also ends when the launcher exits.
      $deadline = [DateTime]::UtcNow.AddSeconds(30)
      while ([DateTime]::UtcNow -lt $deadline -and -not $readable -and -not $process.HasExited) {
        $files = @(Get-ChildItem -LiteralPath ($arguments[[array]::IndexOf($arguments, '-CaptureDir') + 1]) -File -ErrorAction SilentlyContinue)
        $events = @($files | Where-Object { $_.Name -like '*.events.jsonl' }) | Select-Object -Last 1
        $stderrFile = @($files | Where-Object { $_.Name -like '*.stderr.log' }) | Select-Object -Last 1
        if ($fakeLog -and (Test-Path -LiteralPath $fakeLog) -and $events -and $stderrFile) {
          try {
            $a = [IO.File]::Open($events.FullName, 'Open', 'Read', 'ReadWrite')
            $b = [IO.File]::Open($stderrFile.FullName, 'Open', 'Read', 'ReadWrite')
            $readable = $true
          } catch [IO.IOException] { } finally {
            if ($a) { $a.Dispose(); $a = $null }
            if ($b) { $b.Dispose(); $b = $null }
          }
        }
        if (-not $readable) { Start-Sleep -Milliseconds 50 }
      }
    }
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
      ProbeRead = $readable
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
  $expected = [IO.Path]::GetFullPath((Join-Path $env:TEMP $scratchName)).TrimEnd('\')
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
function Read-CcxState {
  return (([IO.File]::ReadAllText((Join-Path $env:CCX_STATE_DIR 'state.json'), $utf8)) | ConvertFrom-Json)
}
function Write-CcxState($state) {
  Write-Utf8File (Join-Path $env:CCX_STATE_DIR 'state.json') ($state | ConvertTo-Json -Depth 30 -Compress)
}
function Run-Ccx([string[]]$arguments) {
  $parts = @($arguments | ForEach-Object { if ($_ -cmatch '^-[A-Za-z]+$') { $_ } else { Quote-Ps $_ } }) -join ' '
  $command = "Set-Location -LiteralPath $(Quote-Ps $repo); & $(Quote-Ps $ccx) $parts; exit `$LASTEXITCODE"
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $powershell
  $info.Arguments = '-NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
  $info.WorkingDirectory = $repo
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $p = New-Object Diagnostics.Process
  $p.StartInfo = $info
  try {
    [void]$p.Start()
    $p.StandardInput.Close()
    $out = $p.StandardOutput.ReadToEndAsync()
    $err = $p.StandardError.ReadToEndAsync()
    Assert ($p.WaitForExit(30000)) 'ccx child timed out'
    Assert ($out.Wait(5000) -and $err.Wait(5000)) 'ccx capture pipe stayed open'
    return [pscustomobject]@{ Code=$p.ExitCode; Stdout=$out.Result; Stderr=$err.Result }
  } finally {
    if (-not $p.HasExited) { $p.Kill() }
    $p.Dispose()
  }
}
function Ccx-Case([string]$name, [scriptblock]$ccxBody) {
  # Not $body: Case's own $body would shadow it and the wrapper would call itself.
  Case $name {
    $previous = @{}
    foreach ($key in @('CCX_STATE_DIR','CCX_POLICY','CODEX_HOME')) { $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
    $fixture = Join-Path $scratch ('ccx-' + $script:total)
    $env:CCX_STATE_DIR = Join-Path $fixture 'state'
    $env:CCX_POLICY = Join-Path $fixture 'policy.json'
    $env:CODEX_HOME = Join-Path $fixture 'catalog'
    [void][IO.Directory]::CreateDirectory($fixture)
    [IO.File]::Copy((Join-Path $root 'ccx/policy.json'), $env:CCX_POLICY)
    [void][IO.Directory]::CreateDirectory($env:CODEX_HOME)
    Write-Utf8File (Join-Path $env:CODEX_HOME 'models_cache.json') '{"models":[{"slug":"gpt-6-astra"}]}'
    try { & $ccxBody } finally {
      foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
    }
  }
}
function Add-CcxTask([string]$id = 'T1', [string]$owns = 'owned.txt', [string]$owner = 'codex', [string]$type = 'implement', [string]$taskFile = 'TASK.md') {
  Check-Code (Run-Ccx @('task','add','-Id',$id,'-Title','Synthetic task','-Type',$type,'-Class','normal','-Risk','low','-Owner',$owner,'-Owns',$owns,'-TaskFile',$taskFile)) 0
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
  event({type:'item.completed', item:{type:'agent_message', text:'progress note before the limit'}});
  event({type:'error', message:usage});
  event({type:'turn.failed', error:{message:usage}});
  process.stderr.write(usage + '\n');
  process.exit(1);
}
else if (mode === 'ready' || mode === 'stray') {
  fs.writeFileSync(mode === 'stray' ? 'stray.txt' : 'owned.txt', 'synthetic change');
  event({type:'turn.completed', usage:{input_tokens:100,cached_input_tokens:10,output_tokens:5}});
  event({type:'turn.completed', usage:{input_tokens:200,cached_input_tokens:20,output_tokens:7}});
  write('Status: READY_FOR_CLAUDE_REVIEW\n');
}
else if (mode === 'bold' || mode === 'bold2' || mode === 'concat') {
  event({type:'turn.completed', usage:{input_tokens:100,cached_input_tokens:10,output_tokens:5}});
  write({bold:'**Status:** **READY_FOR_CLAUDE_REVIEW**\n', bold2:'**Status**: **READY_FOR_CLAUDE_REVIEW**\n', concat:'StatusREADY_FOR_CLAUDE_REVIEW\n'}[mode]);
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
  [void](New-Item -ItemType Directory -Path (Join-Path $repo 'ccx'))
  [IO.File]::Copy((Join-Path $root 'ccx/policy.json'), (Join-Path $repo 'ccx/policy.json'))
  Run-Git @('-C', $repo, 'add', 'TASK.md', 'HANDOFF.md', 'ccx/policy.json')
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
    Assert ($r.Stdout -match 'LAST MESSAGE: progress note before the limit') 'last progress message not surfaced'
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
    # Hosts wrap long error lines; compare with whitespace collapsed.
    Assert (($r.Stderr -replace '\s+', '') -match "Cannotvalidateargumentonparameter'Model'") 'model validation message absent'
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
  Ccx-Case 'unknown task refused before fake runs' {
    $log = Join-Path $scratch 'unknown.json'
    $r = Run-Launcher $repo ($common + @('-TaskId','UNKNOWN')) 'success' 'fake' $false 25 $log
    Check-Code $r 1
    Assert ($r.Stdout -match 'unknown task') 'unknown task message absent'
    Assert (-not (Test-Path -LiteralPath $log)) 'fake ran for unknown task'
  }
  Ccx-Case 'ownership conflict refused' {
    Add-CcxTask 'T1' 'owned.txt'
    Add-CcxTask 'T2' 'owned.txt'
    Check-Code (Run-Ccx @('task','start','-Id','T1')) 0
    $log = Join-Path $scratch 'overlap.json'
    $r = Run-Launcher $repo ($common + @('-TaskId','T2')) 'ready' 'fake' $false 25 $log
    Check-Code $r 7
    Assert ($r.Stdout -match 'Ownership conflict') 'overlap reason absent'
    Assert (-not (Test-Path -LiteralPath $log)) 'fake ran after ownership conflict'
  }
  Ccx-Case 'worktree mismatch refused' {
    Add-CcxTask
    Check-Code (Run-Ccx @('task','update','-Id','T1','-Worktree',(Join-Path $scratch 'other-worktree'))) 0
    $r = Run-Launcher $repo ($common + @('-TaskId','T1'))
    Check-Code $r 7
    Assert ($r.Stdout -match "run from the task's worktree") 'worktree message absent'
  }
  Ccx-Case 'claude owner implement refused' {
    Add-CcxTask 'T1' 'owned.txt' 'claude'
    $r = Run-Launcher $repo ($common + @('-TaskId','T1'))
    Check-Code $r 7
  }
  Ccx-Case 'dispatch cap refused by route' {
    Add-CcxTask
    $state = Read-CcxState
    $state.tasks.T1.dispatches = 3
    Write-CcxState $state
    $log = Join-Path $scratch 'cap.json'
    $r = Run-Launcher $repo ($common + @('-TaskId','T1')) 'ready' 'fake' $false 25 $log
    Check-Code $r 8
    Assert ($r.Stdout -match 'Route: (premium|surface)') 'route refusal absent'
    Assert (-not (Test-Path -LiteralPath $log)) 'fake ran beyond dispatch cap'
    # CCX-4 F5: an explicit effort must not bypass the cap.
    $r = Run-Launcher $repo ($common + @('-TaskId','T1','-Effort','medium')) 'ready' 'fake' $false 25 $log
    Check-Code $r 8
    Assert (-not (Test-Path -LiteralPath $log)) 'explicit effort bypassed the dispatch cap'
  }
  Ccx-Case 'token target refused' {
    Add-CcxTask
    $state = Read-CcxState
    $state.tasks.T1.tokens.input = 400000
    Write-CcxState $state
    $r = Run-Launcher $repo ($common + @('-TaskId','T1'))
    Check-Code $r 8
    Assert ($r.Stdout -match 'BUDGET: token target reached') 'budget message absent'
  }
  Ccx-Case 'recorded usage limit refused' {
    Add-CcxTask
    $state = Read-CcxState
    $state.agents.codex.unavailableUntil = [DateTime]::UtcNow.AddHours(1).ToString('yyyy-MM-ddTHH:mm:ssZ')
    Write-CcxState $state
    $log = Join-Path $scratch 'recorded-limit.json'
    $r = Run-Launcher $repo ($common + @('-TaskId','T1')) 'ready' 'fake' $false 25 $log
    Check-Code $r 4
    Assert ($r.Stdout -match 'USAGE LIMIT \(recorded\)') 'recorded limit message absent'
    Assert (-not (Test-Path -LiteralPath $log)) 'fake ran during recorded limit'
  }
  Ccx-Case 'routed normal effort and task file' {
    New-Task (Join-Path $repo 'ccx-task.md')
    Add-CcxTask 'T1' 'owned.txt,ccx-task.md' 'codex' 'implement' 'ccx-task.md'
    $log = Join-Path $scratch 'routed.json'
    $r = Run-Launcher $repo ($common + @('-TaskId','T1')) 'ready' 'fake' $false 25 $log
    Check-Code $r 0
    Assert ($r.Stdout -match 'Route: worker gpt-6-astra medium') 'normal route absent'
    $args = (Get-Content -LiteralPath $log -Raw | ConvertFrom-Json).args
    Assert (($args -join '|') -match '\|-m\|gpt-6-astra\|') 'routed model absent'
    Assert ($args -contains 'model_reasoning_effort=medium') 'routed medium effort absent'
    Assert ($args[-1] -match 'ccx-task.md\.$') 'task file not selected'
  }
  Ccx-Case 'second implementation attempt routes high' {
    Add-CcxTask
    $state = Read-CcxState
    $state.tasks.T1.dispatches = 1
    Write-CcxState $state
    $log = Join-Path $scratch 'attempt-two.json'
    $r = Run-Launcher $repo ($common + @('-TaskId','T1')) 'ready' 'fake' $false 25 $log
    Check-Code $r 0
    $args = (Get-Content -LiteralPath $log -Raw | ConvertFrom-Json).args
    Assert ($args -contains 'model_reasoning_effort=high') 'second attempt did not route high'
  }
  Ccx-Case 'explicit effort keeps default model' {
    Add-CcxTask
    $log = Join-Path $scratch 'explicit.json'
    $r = Run-Launcher $repo ($common + @('-TaskId','T1','-Effort','low')) 'ready' 'fake' $false 25 $log
    Check-Code $r 0
    Assert ($r.Stdout -match 'Route: explicit') 'explicit route message absent'
    $args = (Get-Content -LiteralPath $log -Raw | ConvertFrom-Json).args
    Assert ($args -contains 'model_reasoning_effort=low') 'explicit effort lost'
    Assert (-not ($args -contains '-m')) 'unbound model was passed'
  }
  Ccx-Case 'usage reset recorded' {
    Add-CcxTask
    $r = Run-Launcher $repo ($common + @('-TaskId','T1')) 'usage'
    Check-Code $r 4
    $until = [DateTime]::Parse((Read-CcxState).agents.codex.unavailableUntil).ToLocalTime()
    Assert ($until -gt [DateTime]::Now) 'recorded reset is not future'
    Assert ($until.Hour -eq 17 -and $until.Minute -eq 33) 'recorded reset time incorrect'
    Assert ((Read-CcxState).tasks.T1.dispatches -eq 0) 'usage-limit run used a retry'
  }
  Ccx-Case 'full access requires and consumes chat approval' {
    Add-CcxTask
    $args = $common + @('-TaskId','T1','-Sandbox','danger-full-access')
    $log = Join-Path $scratch 'approved.json'
    $r = Run-Launcher $repo $args 'ready' 'fake' $false 25 $log
    Check-Code $r 10
    Assert (-not (Test-Path -LiteralPath $log)) 'fake ran without approval'
    $state = Read-CcxState
    $pending = @($state.approvals.PSObject.Properties.Value | Where-Object { $_.action -eq 'codex-full-access' -and $_.status -eq 'pending' })
    Assert ($pending.Count -eq 1) 'pending approval absent'
    Check-Code (Run-Ccx @('approve','-Id',$pending[0].id,'-Chat','-Quote','Approved synthetic fixture dispatch')) 0
    $r = Run-Launcher $repo $args 'ready' 'fake' $false 25 $log
    Check-Code $r 0
    Assert (Test-Path -LiteralPath $log) 'fake did not run after approval'
    Assert ((Read-CcxState).approvals.($pending[0].id).status -eq 'used') 'approval was not consumed'
  }
  Ccx-Case 'ready dispatch records state telemetry and event' {
    Add-CcxTask
    $r = Run-Launcher $repo ($common + @('-TaskId','T1')) 'ready'
    Check-Code $r 0
    $state = Read-CcxState
    $task = $state.tasks.T1
    Assert ($task.dispatches -eq 1 -and $task.lastDispatch.status -eq 'READY_FOR_CLAUDE_REVIEW') 'dispatch state missing'
    Assert ($task.tokens.input -eq 300 -and $task.tokens.cached -eq 30 -and $task.tokens.output -eq 12) 'summed tokens absent'
    Assert (@($state.eventQueue | Where-Object { $_.type -eq 'dispatch-finished' -and $_.key -eq 'dispatch:T1:1' }).Count -eq 1) 'dispatch event missing'
    $records = @([IO.File]::ReadAllLines((Join-Path $env:CCX_STATE_DIR 'telemetry.jsonl')) | ForEach-Object { $_ | ConvertFrom-Json })
    Assert (@($records | Where-Object { $_.kind -eq 'dispatch' -and $_.taskId -eq 'T1' -and $_.exit -eq 0 }).Count -eq 1) 'dispatch telemetry absent'
  }
  Ccx-Case 'stray write gives post-check exit nine' {
    Add-CcxTask
    $r = Run-Launcher $repo ($common + @('-TaskId','T1')) 'stray'
    Check-Code $r 9
    Assert ($r.Stdout -match 'SCOPE VIOLATION: stray.txt') 'scope violation not printed'
    Assert ((Read-CcxState).tasks.T1.lastDispatch.exit -eq 9) 'final post-check code not recorded'
  }
  Ccx-Case 'markdown-emphasised report status is parsed' {
    Add-CcxTask
    $r = Run-Launcher $repo ($common + @('-TaskId','T1')) 'bold'
    Check-Code $r 0
    Assert ((Read-CcxState).tasks.T1.lastDispatch.status -eq 'READY_FOR_CLAUDE_REVIEW') 'bold status not parsed'
    # CCX-4c inputs: colon outside the bold label must parse; a missing colon must not.
    Check-Code (Run-Launcher $repo ($common + @('-TaskId','T1')) 'bold2') 0
    Assert ((Read-CcxState).tasks.T1.lastDispatch.status -eq 'READY_FOR_CLAUDE_REVIEW') 'bold label with outside colon not parsed'
    Check-Code (Run-Launcher $repo ($common + @('-TaskId','T1')) 'concat') 0
    Assert ((Read-CcxState).tasks.T1.lastDispatch.status -eq 'NONE') 'malformed status accepted'
  }
  Ccx-Case 'baseline dirty permits pre-existing path' {
    Add-CcxTask
    Write-Utf8File (Join-Path $repo 'stray.txt') 'existing synthetic edit'
    $r = Run-Launcher $repo ($common + @('-TaskId','T1')) 'stray'
    Check-Code $r 0
    Assert ((Read-CcxState).tasks.T1.baselineDirty -contains 'stray.txt') 'baselineDirty was not captured'
  }
  Ccx-Case 'verify run does not consume implementation cap' {
    Add-CcxTask 'T1' 'owned.txt' 'claude'
    $r = Run-Launcher $repo ($common + @('-TaskId','T1','-Role','verify')) 'success'
    Check-Code $r 0
    Assert ((Read-CcxState).tasks.T1.dispatches -eq 0) 'verify consumed implementation dispatch'
  }
  Ccx-Case 'research run does not consume implementation cap' {
    Add-CcxTask 'T1' 'owned.txt' 'claude'
    $r = Run-Launcher $repo ($common + @('-TaskId','T1','-Role','research')) 'success'
    Check-Code $r 0
    Assert ((Read-CcxState).tasks.T1.dispatches -eq 0) 'research consumed implementation dispatch'
  }
  Case 'legacy dispatch argv unchanged' {
    $log = Join-Path $scratch 'legacy-argv.json'
    $r = Run-Launcher $repo $common 'success' 'fake' $false 25 $log
    Check-Code $r 0
    $args = (Get-Content -LiteralPath $log -Raw | ConvertFrom-Json).args
    Assert ($args.Count -eq 9) 'legacy argument count changed'
    Assert ((($args[0..6]) -join '|') -ceq 'exec|-s|workspace-write|-c|model_reasoning_effort=medium|--json|--output-last-message') 'legacy flags changed'
    Assert ($args[7] -match '\.report\.md$') 'legacy report argument changed'
    Assert ($args[8] -ceq ('Read HANDOFF.md and follow its Implementer instruction for ' + (Join-Path $repo 'TASK.md') + '.')) 'legacy prompt changed'
  }
  Case 'capture streams readable during run' {
    $liveCaptures = Join-Path $scratch 'live-captures'
    $log = Join-Path $scratch 'live.json'
    $r = Run-Launcher $repo @('-CaptureDir',$liveCaptures,'-TimeoutMinutes','0.05') 'sleep' 'fake' $false 25 $log $true
    Check-Code $r 5
    Assert ($r.ProbeRead) 'capture streams could not be opened while fake Codex ran'
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
