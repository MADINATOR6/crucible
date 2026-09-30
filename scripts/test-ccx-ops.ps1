<# CCX-2 synthetic operations regression suite. Windows PowerShell 5.1. #>
$ErrorActionPreference = 'Stop'
$cli = Join-Path $PSScriptRoot 'ccx.ps1'
$core = Join-Path $PSScriptRoot 'ccx-core.ps1'
$ops = Join-Path $PSScriptRoot 'ccx-ops.ps1'
$sourcePolicy = Join-Path (Split-Path $PSScriptRoot -Parent) 'ccx/policy.json'
$utf8 = New-Object Text.UTF8Encoding $false
Add-Type -AssemblyName System.Web.Extensions
$json = New-Object Web.Script.Serialization.JavaScriptSerializer
$json.MaxJsonLength = [int]::MaxValue
$powershell = Join-Path $PSHOME 'powershell.exe'
$scratch = Join-Path $env:TEMP ('ccx-t2o-' + [guid]::NewGuid().ToString('N'))
$originalLocation = (Get-Location).ProviderPath
$oldEnv = @{}
foreach ($name in @('CCX_STATE_DIR','CCX_POLICY','CODEX_HOME','PATH')) { $oldEnv[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
$children = New-Object 'Collections.Generic.List[object]'
$failures = New-Object 'Collections.Generic.List[string]'
$total = 0; $passed = 0; $created = $false

function Assert([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Write-Text([string]$Path, [string]$Text) { [IO.File]::WriteAllText($Path,$Text,$utf8) }
function Write-Json([string]$Path, $Value) { Write-Text $Path ($json.Serialize($Value)) }
function Read-Json([string]$Path) { $json.DeserializeObject([IO.File]::ReadAllText($Path,$utf8)) }
function Quote-Ps([string]$Value) { "'" + $Value.Replace("'","''") + "'" }
function Run-Process([string]$File, [string]$Arguments, [string]$Directory = $script:repo) {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $File; $info.Arguments = $Arguments; $info.WorkingDirectory = $Directory
  $info.UseShellExecute = $false; $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true; $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
  foreach ($name in @('GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES','GIT_NAMESPACE')) { [void]$info.EnvironmentVariables.Remove($name) }
  $p = New-Object Diagnostics.Process; $p.StartInfo = $info
  [void]$p.Start(); $p.StandardInput.Close()
  $out = $p.StandardOutput.ReadToEndAsync(); $err = $p.StandardError.ReadToEndAsync()
  $children.Add($p)
  Assert ($p.WaitForExit(90000)) "child timeout: $File"
  Assert ($out.Wait(5000) -and $err.Wait(5000)) 'child output timeout'
  return @{ Code=$p.ExitCode; Out=$out.Result; Err=$err.Result }
}
function Run-Git([string[]]$Arguments, [string]$Directory = $script:repo) {
  $argsText = (@($Arguments) | ForEach-Object { ConvertTo-CcxArgument $_ }) -join ' '
  $r = Run-Process 'git.exe' $argsText $Directory
  Assert ($r.Code -eq 0) "git failed: $($r.Err)"
  return $r.Out
}
function Run-Cli([string[]]$Arguments) {
  $parts = foreach ($arg in $Arguments) { if ($arg -cmatch '^-[A-Za-z]+$') { $arg } else { Quote-Ps $arg } }
  $script = "Set-Location -LiteralPath $(Quote-Ps $script:repo); & $(Quote-Ps $cli) " + ($parts -join ' ') + '; exit $LASTEXITCODE'
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
  Run-Process $powershell ('-NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + $encoded)
}
function Check-Code($Result, [int]$Expected) {
  Assert ($Result.Code -eq $Expected) "exit $($Result.Code), expected $Expected; output=$($Result.Out) $($Result.Err)"
}
function Cli-Json([string[]]$Arguments) {
  $r = Run-Cli ($Arguments + @('-Json')); Check-Code $r 0
  try { return $json.DeserializeObject($r.Out) } catch { throw "invalid CLI JSON: $($r.Out)" }
}
function Save-Policy { Write-Json $env:CCX_POLICY $script:policy }
function Add-Task([string]$Id = 'T1', [string]$Owns = 'src/one.txt', [string]$Class = 'normal') {
  Check-Code (Run-Cli @('task','add','-Id',$Id,'-Title','Fixture','-Type','implement','-Class',$Class,'-Risk','low','-Owner','codex','-Owns',$Owns)) 0
}
function Task([string]$Id = 'T1') { (Get-CcxState).tasks[$Id] }
function State-Edit([scriptblock]$Action) { Invoke-CcxLocked $Action | Out-Null }
function Fixture {
  $caseRoot = Join-Path $scratch ('case-' + $script:total)
  $script:repo = Join-Path $caseRoot 'repo'
  [void][IO.Directory]::CreateDirectory($script:repo)
  $env:CCX_STATE_DIR = Join-Path $caseRoot 'state'
  $env:CCX_POLICY = Join-Path $caseRoot 'policy.json'
  $env:CODEX_HOME = Join-Path $caseRoot 'codex'
  [void][IO.Directory]::CreateDirectory($env:CODEX_HOME)
  $script:policy = Read-Json $sourcePolicy
  $script:policy.verify.stages = @(
    @{name='parse';builtin='powershell-parse';quick=$true},
    @{name='json';builtin='json-valid';quick=$true},
    @{name='secrets';builtin='secret-scan';quick=$true},
    @{name='scope';builtin='task-scope';quick=$true},
    @{name='memory';builtin='memory-lint';quick=$true},
    @{name='skipped';command=$null;note='fixture skip'},
    @{name='pass-command';command='cmd /c exit 0';when=@('src/*');timeoutMinutes=1},
    @{name='not-applicable';command='cmd /c exit 1';when=@('docs/*');timeoutMinutes=1}
  )
  Save-Policy
  Write-Json (Join-Path $env:CODEX_HOME $policy.models.codex.catalogFile) @{models=@(@{slug=$policy.models.codex.default})}
  Write-Text (Join-Path $env:CODEX_HOME 'config.toml') "[mcp_servers.extra_fixture]`ncommand = 'unused'`n"
  $bin = Join-Path $caseRoot 'bin'; [void][IO.Directory]::CreateDirectory($bin)
  Write-Text (Join-Path $bin 'codex.cmd') @'
@echo off
echo %*>>"%~dp0calls.log"
if "%1"=="--version" (
  echo codex-fixture 1.0
  exit /b 0
)
if "%1"=="login" if "%2"=="status" exit /b 0
exit /b 1
'@
  $env:PATH = $bin + [IO.Path]::PathSeparator + $oldEnv.PATH
  Set-Location -LiteralPath $script:repo
  $null = Run-Git @('init','-q')
  $null = Run-Git @('config','user.name','CCX fixture')
  $null = Run-Git @('config','user.email','fixture@example.test')
  [void][IO.Directory]::CreateDirectory((Join-Path $repo 'src'))
  Write-Text (Join-Path $repo 'src/one.txt') 'initial'
  $null = Run-Git @('add','src/one.txt')
  $null = Run-Git @('-c','core.hooksPath=NUL','commit','-qm','fixture')
}
function Case([string]$Name, [scriptblock]$Body) {
  $script:total++
  try { Fixture; & $Body; $script:passed++; Write-Output "PASS $Name" }
  catch { $message = ($_.Exception.Message -replace '\s+',' ').Trim(); $script:failures.Add("${Name}: $message"); Write-Output "FAIL ${Name}: $message" }
}
function Queue([string]$Type, [string]$Key, [string]$TaskId = '', $Data = @{}) { Add-CcxEvent -Type $Type -Key $Key -TaskId $TaskId -Data $Data | Out-Null }

try {
  Assert (-not (Test-Path -LiteralPath $scratch)) 'random fixture directory exists'
  [void][IO.Directory]::CreateDirectory($scratch); $created = $true
  $env:CCX_STATE_DIR = Join-Path $scratch 'bootstrap-state'
  $env:CCX_POLICY = Join-Path $scratch 'bootstrap-policy.json'
  $env:CODEX_HOME = Join-Path $scratch 'bootstrap-codex'
  Write-Text $env:CCX_POLICY ([IO.File]::ReadAllText($sourcePolicy,$utf8))
  . $core
  Assert ([IO.File]::Exists($ops)) 'ccx-ops.ps1 is missing'
  . $ops

  Case 'runtime on, off, show and disabled tick leaves queue' {
    Queue 'user' 'disabled'
    Check-Code (Run-Cli @('runtime','off')) 0
    $r = Run-Cli @('tick'); Check-Code $r 0
    Assert ($r.Out -match 'runtime disabled') 'disabled tick message absent'
    Assert (@((Get-CcxState).eventQueue).Count -eq 1) 'disabled tick consumed event'
    $show = Run-Cli @('runtime','show'); Check-Code $show 0
    Assert ($show.Out -match 'disabled|False') 'runtime show omitted disabled state'
    Check-Code (Run-Cli @('runtime','on')) 0
    Assert ((Get-CcxState).runtime.enabled) 'runtime did not enable'
  }
  Case 'tick processes once, recovers lease, retries with backoff and dies' {
    $policy.runtime.maxAttempts = 2; $policy.runtime.backoffBaseSeconds = 60; Save-Policy
    Queue 'user' 'once'
    Check-Code (Run-Cli @('tick','-Max','1')) 0
    Assert (@((Get-CcxState).eventQueue).Count -eq 0) 'successful event retained'
    $count = @((Get-CcxState).notifications).Count
    Check-Code (Run-Cli @('tick','-Max','1')) 0
    Assert (@((Get-CcxState).notifications).Count -eq $count) 'second tick duplicated notification'
    Queue 'user' 'lease'
    State-Edit { param($s) $s.eventQueue[0].status='processing'; $s.eventQueue[0].leaseUntil=[DateTime]::UtcNow.AddSeconds(-2).ToString('o') }
    Check-Code (Run-Cli @('tick','-Max','1')) 0
    Assert (@((Get-CcxState).eventQueue).Count -eq 0) 'expired lease not recovered'
    Add-Task
    $policy.runtime.handlers['verification-failed'] = 'run-health'
    $policy.runtime.maxAutonomousLevel = 'L0'; Save-Policy
    Queue 'verification-failed' 'retry' 'T1'
    # The handler cannot run above the test policy's autonomous ceiling.
    Check-Code (Run-Cli @('tick','-Max','1')) 0
    $event = @((Get-CcxState).eventQueue | Where-Object { $_.key -eq 'retry' })[0]
    Assert ($event.status -eq 'failed' -and $event.attempts -eq 1) 'handler failure did not back off'
    Assert ([DateTime]$event.nextAt -gt [DateTime]::UtcNow) 'backoff not scheduled'
    State-Edit { param($s) foreach ($e in $s.eventQueue) { if ($e.key -eq 'retry') { $e.nextAt=[DateTime]::UtcNow.AddSeconds(-2).ToString('o') } } }
    Check-Code (Run-Cli @('tick','-Max','1')) 0
    $event = @((Get-CcxState).eventQueue | Where-Object { $_.key -eq 'retry' })[0]
    Assert ($event.status -eq 'dead' -and $event.attempts -eq 2) 'max attempts did not dead-letter event'
  }
  Case 'notify dispatch outcomes, block task and keyed dedup' {
    Add-Task; Check-Code (Run-Cli @('task','start','-Id','T1')) 0
    Queue 'dispatch-finished' 'dispatch:T1:1' 'T1' @{exit=0;status='READY_FOR_CLAUDE_REVIEW';dispatch=1;role='implement'}
    Queue 'dispatch-finished' 'dispatch:T1:2' 'T1' @{exit=4;status='BLOCKED';dispatch=2;role='implement'}
    Queue 'dispatch-finished' 'dispatch:T1:3' 'T1' @{exit=1;status='PARTIAL';dispatch=3;role='implement'}
    Check-Code (Run-Cli @('tick')) 0
    $notes = @((Get-CcxState).notifications)
    Assert (@($notes | Where-Object { $_.text -match 'ready for Claude review' }).Count -eq 1) 'ready notice absent'
    Assert (@($notes | Where-Object { $_.level -eq 'warn' }).Count -ge 1) 'limit notice absent'
    Assert (@($notes | Where-Object { $_.level -eq 'action' -and $_.text -match 'suggested route' }).Count -eq 1) 'failure route notice absent'
    Assert (-not (Test-Path -LiteralPath (Join-Path (Split-Path $repo -Parent) 'bin/calls.log'))) 'tick launched Codex'
    # Lease recovery re-runs the same event (same key): its handler must not duplicate the notification.
    State-Edit { param($s) $s.eventQueue = @($s.eventQueue) + @(@{ id='E-replay01'; at=(Get-CcxNow); type='dispatch-finished'; key='dispatch:T1:1'; taskId='T1'; data=@{exit=0;status='READY_FOR_CLAUDE_REVIEW';dispatch=1;role='implement'}; status='processing'; attempts=1; nextAt=(Get-CcxNow); leaseUntil=[DateTime]::UtcNow.AddSeconds(-2).ToString('yyyy-MM-ddTHH:mm:ssZ') }) }
    $count = @((Get-CcxState).notifications).Count
    Check-Code (Run-Cli @('tick')) 0
    Assert (@((Get-CcxState).notifications).Count -eq $count) 'replayed handler duplicated notification'
    Assert (@((Get-CcxState).eventQueue | Where-Object { $_.id -eq 'E-replay01' }).Count -eq 0) 'replayed event was not completed'
    Queue 'verification-failed' 'block:T1' 'T1'
    Check-Code (Run-Cli @('tick')) 0
    Assert ((Task).status -eq 'blocked') 'block handler did not block task'
    $count = @((Get-CcxState).notifications).Count
    Queue 'verification-failed' 'block:T1' 'T1'
    Check-Code (Run-Cli @('tick')) 0
    Assert (@((Get-CcxState).notifications).Count -eq $count) 'keyed event produced duplicate notification'
  }
  Case 'verify pass, quick, skip, N/A, baseline and completion flow' {
    Add-Task; Check-Code (Run-Cli @('task','start','-Id','T1')) 0
    Write-Text (Join-Path $repo 'src/one.txt') 'changed'
    $r = Run-Cli @('verify','-TaskId','T1'); Check-Code $r 0
    Assert ($r.Out -match 'SKIP skipped' -and $r.Out -match 'N/A parse' -and $r.Out -match 'N/A not-applicable') 'skip or N/A absent'
    Assert ((Task).verification.status -eq 'PASS' -and (Task).verification.full) 'full PASS not recorded'
    Assert ((Task).verification.fingerprint -eq (Get-CcxFingerprint -Task (Task) -Root $repo)) 'fingerprint mismatch'
    $null = Run-Git @('add','src/one.txt'); $null = Run-Git @('-c','core.hooksPath=NUL','commit','-qm','owned change')
    $committed = Run-Cli @('verify','-TaskId','T1','-Stage','pass-command'); Check-Code $committed 0
    Assert ($committed.Out -match 'PASS pass-command') 'empty changed set did not use owns for applicability'
    $scan = Run-Cli @('verify','-TaskId','T1','-Stage','secrets'); Check-Code $scan 0
    Assert ($scan.Out -match 'PASS secrets') 'committed owned files were not secret-scanned'
    Check-Code (Run-Cli @('verify','-TaskId','T1','-Quick')) 0
    Assert (-not (Task).verification.full) 'quick verification marked full'
    Check-Code (Run-Cli @('task','done','-Id','T1')) 8
    Check-Code (Run-Cli @('verify','-TaskId','T1','-Baseline')) 0
    Assert (@((Get-CcxState).baselines).Count -eq 1) 'baseline absent'
    Check-Code (Run-Cli @('verify','-TaskId','T1')) 0
    Check-Code (Run-Cli @('task','review','-Id','T1','-Result','pass','-By','claude')) 0
    Check-Code (Run-Cli @('task','done','-Id','T1')) 0
  }
  Case 'verify failing command queues event and refuses completion' {
    $policy.verify.stages += @{name='fail-command';command='cmd /c exit 1';when=@('src/*');timeoutMinutes=1}; Save-Policy
    Add-Task; Check-Code (Run-Cli @('task','start','-Id','T1')) 0
    Write-Text (Join-Path $repo 'src/one.txt') 'changed'
    Check-Code (Run-Cli @('verify','-TaskId','T1')) 1
    Assert ((Task).verification.status -eq 'FAIL') 'failure not recorded'
    Assert (@((Get-CcxState).eventQueue | Where-Object { $_.type -eq 'verification-failed' }).Count -eq 1) 'verification event absent'
    Check-Code (Run-Cli @('task','done','-Id','T1')) 8
  }
  Case 'verify scope, parse, JSON and secret report only metadata' {
    Add-Task 'T1' 'src/'
    Check-Code (Run-Cli @('task','start','-Id','T1')) 0
    Write-Text (Join-Path $repo 'outside.txt') 'outside'
    Check-Code (Run-Cli @('verify','-TaskId','T1','-Stage','scope')) 1
    Write-Text (Join-Path $repo 'src/bad.ps1') 'function Broken {'
    Check-Code (Run-Cli @('verify','-TaskId','T1','-Stage','parse')) 1
    Write-Text (Join-Path $repo 'src/bad.json') '{ broken'
    Check-Code (Run-Cli @('verify','-TaskId','T1','-Stage','json')) 1
    $secret = 'ghp_' + ('A' * 36)
    Write-Text (Join-Path $repo 'src/secret.txt') $secret
    $r = Run-Cli @('verify','-TaskId','T1','-Stage','secrets'); Check-Code $r 1
    Assert (($r.Out + $r.Err) -notmatch [regex]::Escape($secret)) 'secret leaked in output'
    Assert ($r.Out -match 'secret.txt') 'secret file metadata absent'
    Write-Text (Join-Path $repo 'src/untracked.json') '{ invalid'
    Check-Code (Run-Cli @('verify','-Stage','json')) 0
    Check-Code (Run-Cli @('verify','-Stage','json','-Path','src/untracked.json')) 1
  }
  Case 'verify command timeout and unknown stage' {
    $pidFile = Join-Path (Split-Path $repo -Parent) 'sleep.pid'
    $sleepScript = Join-Path (Split-Path $repo -Parent) 'sleep.ps1'
    Write-Text $sleepScript ("[IO.File]::WriteAllText($(Quote-Ps $pidFile), [string]`$PID); Start-Sleep -Seconds 60")
    $command = 'powershell -NoProfile -ExecutionPolicy Bypass -File ' + (ConvertTo-CcxArgument $sleepScript)
    # 15 s: long enough for a slow PowerShell start (~4-5 s here), far shorter than the 60 s sleep.
    $policy.verify.stages += @{name='timeout';command=$command;when=@('src/*');timeoutMinutes=0.25}; Save-Policy
    Write-Text (Join-Path $repo 'src/one.txt') 'changed'
    Check-Code (Run-Cli @('verify','-Stage','timeout')) 1
    Assert ([IO.File]::Exists($pidFile)) 'sleep child did not start'
    $sleepPid = [int][IO.File]::ReadAllText($pidFile)
    Start-Sleep -Milliseconds 200
    Assert (-not (Get-Process -Id $sleepPid -ErrorAction SilentlyContinue)) 'timed-out child still running'
    Check-Code (Run-Cli @('verify','-Stage','unknown-stage')) 2
  }
  Case 'memory lint secret, line limit, duplicate and checkpoints' {
    $memory = Join-Path $repo 'MEMORY.md'
    $secret = 'ghp_' + ('B' * 36)
    Write-Text $memory ("$secret`n")
    $r = Run-Cli @('memory','lint','-Path','MEMORY.md'); Check-Code $r 1
    Assert (($r.Out + $r.Err) -notmatch [regex]::Escape($secret)) 'memory secret leaked'
    $policy.memory.maxLines['MEMORY.md'] = 2; $policy.memory.maxCheckpoints = 1; Save-Policy
    Write-Text $memory ("## Checkpoint one`nlong duplicated fixture line`nlong duplicated fixture line`n## Checkpoint two`n")
    $r = Run-Cli @('memory','lint','-Path','MEMORY.md'); Check-Code $r 1
    Assert ($r.Out -match 'WARN' -and $r.Out -match 'archive older checkpoints') 'memory warnings absent'
  }
  Case 'worktree add ownership, list, prune safety and apply' {
    Add-Task 'T1' 'src/one.txt'
    Add-Task 'T2' 'src/one.txt'
    Check-Code (Run-Cli @('task','start','-Id','T2')) 0
    Check-Code (Run-Cli @('worktree','add','-TaskId','T1')) 7
    Check-Code (Run-Cli @('task','update','-Id','T2','-Status','abandoned')) 0
    Check-Code (Run-Cli @('worktree','add','-TaskId','T1')) 0
    $task = Task 'T1'
    Assert ($task.worktreeCreatedBy -eq 'ccx' -and (Test-Path -LiteralPath $task.worktree)) 'created worktree not recorded'
    $listed = @(Cli-Json @('worktree','list') | Where-Object { $_.path -eq $task.worktree })
    Assert ($listed.Count -eq 1 -and $listed[0].merged -eq $true -and $listed[0].dirty -eq $false) 'worktree list merged/clean flags wrong'
    $manual = Join-Path (Split-Path $repo -Parent) 'manual-worktree'
    $null = Run-Git @('worktree','add','--detach',$manual,'HEAD')
    try {
      $dry = Run-Cli @('worktree','prune'); Check-Code $dry 0
      Assert (Test-Path -LiteralPath $task.worktree) 'dry run removed ccx worktree'
      Assert (Test-Path -LiteralPath $manual) 'dry run removed manual worktree'
      Write-Text (Join-Path $task.worktree 'dirty.txt') 'dirty'
      $dirtyList = @(Cli-Json @('worktree','list') | Where-Object { $_.path -eq $task.worktree })
      Assert ($dirtyList.Count -eq 1 -and $dirtyList[0].dirty -eq $true) 'worktree list did not report dirty checkout'
      State-Edit { param($s) $s.tasks.T1.status='done' }
      Check-Code (Run-Cli @('worktree','prune','-Apply')) 0
      Assert (Test-Path -LiteralPath $task.worktree) 'dirty ccx worktree was removed'
      Assert (Test-Path -LiteralPath $manual) 'manual worktree was removed'
      [IO.File]::Delete((Join-Path $task.worktree 'dirty.txt'))
      Check-Code (Run-Cli @('worktree','prune','-Apply')) 0
      Assert (-not (Test-Path -LiteralPath $task.worktree)) 'clean merged done ccx worktree retained'
      Assert (Test-Path -LiteralPath $manual) 'manual worktree was removed after prune'
      Assert (-not (Task 'T1').worktree) 'prune did not clear task worktree'
    } finally { $null = Run-Git @('worktree','remove',$manual) }
  }
  Case 'merge check clean, conflict and scope' {
    Add-Task 'T1' 'src/'
    $base = (Run-Git @('branch','--show-current')).Trim()
    $null = Run-Git @('checkout','-qb','feature-clean')
    Write-Text (Join-Path $repo 'src/one.txt') 'feature'; $null = Run-Git @('add','src/one.txt'); $null = Run-Git @('-c','core.hooksPath=NUL','commit','-qm','feature')
    Check-Code (Run-Cli @('merge-check','-Branch','feature-clean','-Into',$base)) 0
    Check-Code (Run-Cli @('task','update','-Id','T1','-Branch','feature-clean')) 0
    Write-Text (Join-Path $repo 'unowned.txt') 'unowned'; $null = Run-Git @('add','unowned.txt'); $null = Run-Git @('-c','core.hooksPath=NUL','commit','-qm','outside')
    $r = Run-Cli @('merge-check','-Branch','feature-clean','-Into',$base); Check-Code $r 1
    Assert ($r.Out -match 'SCOPE unowned.txt') 'merge scope not reported'
    $null = Run-Git @('checkout',$base)
    Write-Text (Join-Path $repo 'src/one.txt') 'base'; $null = Run-Git @('add','src/one.txt'); $null = Run-Git @('-c','core.hooksPath=NUL','commit','-qm','base')
    $r = Run-Cli @('merge-check','-Branch','feature-clean','-Into',$base); Check-Code $r 1
    Assert ($r.Out -match 'CONFLICT src/one.txt') 'merge conflict not reported'
  }
  Case 'health JSON, warning inventory, mythos and agent failures, cleanup' {
    # Health checks inspect agent definitions in the fixture repository.
    [void][IO.Directory]::CreateDirectory((Join-Path $repo '.claude/agents'))
    foreach ($name in @($policy.models.claude.cheapSubagent,$policy.models.claude.reviewSubagent)) {
      Write-Text (Join-Path $repo ".claude/agents/$name.md") "---`nname: $name`ndescription: Fixture`ntools: Read`n---`n"
    }
    $before = Run-Git @('worktree','list','--porcelain')
    $result = Cli-Json @('health')
    Assert (@($result).Count -gt 5) 'health JSON omitted checks'
    $r = Run-Cli @('health'); Check-Code $r 0
    Assert ($r.Out -match 'WARN.*extra_fixture') 'extra MCP server not warned'
    Assert ((Run-Git @('worktree','list','--porcelain')) -ceq $before) 'health left a registered worktree'
    $policy.models.mythos.available = $true; $policy.models.mythos.model = $null; Save-Policy
    Check-Code (Run-Cli @('health')) 1
    $policy.models.mythos.available = $false; Save-Policy
    [IO.File]::Delete((Join-Path $repo ".claude/agents/$($policy.models.claude.cheapSubagent).md"))
    Check-Code (Run-Cli @('health')) 1
  }
  Case 'status sections, bounded brief and JSON' {
    Add-Task; Queue 'user' 'status-tick'
    $r = Run-Cli @('status'); Check-Code $r 0
    foreach ($word in @('runtime','agents','tasks','worktree','approval','notification','routing')) { Assert ($r.Out -match $word) "status lacks $word" }
    $brief = Run-Cli @('status','-Brief'); Check-Code $brief 0
    Assert (@($brief.Out.Trim().Split([char]10)).Count -le 5) 'brief exceeds five lines'
    $null = Cli-Json @('status')
  }
  Case 'source files parse as strict UTF-8 without BOM' {
    foreach ($path in @($ops,$PSCommandPath)) {
      $tokens=$null; $errors=$null
      $null = [Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
      Assert ($errors.Count -eq 0) "PowerShell parse failed: $path"
      $bytes = [IO.File]::ReadAllBytes($path)
      Assert (-not ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191)) "BOM: $path"
      $strict = New-Object Text.UTF8Encoding($false,$true); $null = $strict.GetString($bytes)
    }
  }
} finally {
  Set-Location -LiteralPath $originalLocation
  foreach ($child in $children) { try { if (-not $child.HasExited) { $child.Kill(); [void]$child.WaitForExit(2000) } } catch { }; $child.Dispose() }
  foreach ($name in $oldEnv.Keys) { [Environment]::SetEnvironmentVariable($name,$oldEnv[$name],'Process') }
  if ($created) {
    $actual = [IO.Path]::GetFullPath($scratch).TrimEnd('\')
    Assert ((Split-Path $actual -Parent) -ieq ([IO.Path]::GetFullPath($env:TEMP).TrimEnd('\'))) 'fixture escaped TEMP'
    Assert ((Split-Path $actual -Leaf) -cmatch '^ccx-t2o-[0-9a-f]{32}$') 'fixture name mismatch'
    if (Test-Path -LiteralPath $actual) { Remove-Item -LiteralPath $actual -Recurse -Force }
  }
}
Write-Output "$passed/$total passed"
if ($passed -ne $total) { exit 1 }
exit 0
