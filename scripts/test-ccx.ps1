<#
CCX-1 synthetic regression suite. Run with Windows PowerShell 5.1.
Every fixture, state store and catalog stays inside this run's private temp root.
#>
$ErrorActionPreference = 'Stop'
$cli = Join-Path $PSScriptRoot 'ccx.ps1'
$core = Join-Path $PSScriptRoot 'ccx-core.ps1'
$sourcePolicy = Join-Path (Split-Path $PSScriptRoot -Parent) 'ccx/policy.json'
$utf8 = New-Object Text.UTF8Encoding $false
$powershell = Join-Path $PSHOME 'powershell.exe'
$git = (Get-Command git.exe -ErrorAction Stop).Source
Add-Type -AssemblyName System.Web.Extensions
$json = New-Object Web.Script.Serialization.JavaScriptSerializer
$json.MaxJsonLength = [int]::MaxValue
$scratch = Join-Path $env:TEMP ('ccx-t1-' + [guid]::NewGuid().ToString('N'))
$originalLocation = Get-Location
$oldEnv = @{}
foreach ($name in @('CCX_STATE_DIR', 'CCX_POLICY', 'CODEX_HOME')) {
  $oldEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$passed = 0
$total = 0
$failures = New-Object 'Collections.Generic.List[string]'
$children = New-Object 'Collections.Generic.List[object]'
$clock = [Diagnostics.Stopwatch]::StartNew()
$createdScratch = $false

function Write-Utf8File([string]$Path, [string]$Value) {
  [IO.File]::WriteAllText($Path, $Value, $utf8)
}
function Read-Json([string]$Path) { return $json.DeserializeObject([IO.File]::ReadAllText($Path)) }
function Write-Json([string]$Path, $Value) { Write-Utf8File $Path ($json.Serialize($Value)) }
function Assert([bool]$Condition, [string]$Reason) { if (-not $Condition) { throw $Reason } }
function Quote-Ps([string]$Value) { return "'" + $Value.Replace("'", "''") + "'" }
function Check-Code($Result, [int]$Expected) {
  Assert ($Result.Code -eq $Expected) "exit $($Result.Code), expected $Expected; stdout=$($Result.Stdout); stderr=$($Result.Stderr)"
}
function Start-Child([string]$Command, [string[]]$FileArguments) {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $powershell
  if ($FileArguments) {
    $quoted = (@($cli) + $FileArguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
    $info.Arguments = '-NoProfile -ExecutionPolicy Bypass -File ' + $quoted
  } else {
    # Process WorkingDirectory alone does not set PS location for paths containing brackets.
    $Command = "Set-Location -LiteralPath $(Quote-Ps $script:repo); " + $Command
    $info.Arguments = '-NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
  }
  $info.WorkingDirectory = $script:repo
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  foreach ($name in @('CCX_STATE_DIR', 'CCX_POLICY', 'CODEX_HOME')) {
    $info.EnvironmentVariables[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  }
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $info
  [void]$process.Start()
  $process.StandardInput.Close()
  $out = $process.StandardOutput.ReadToEndAsync()
  $err = $process.StandardError.ReadToEndAsync()
  $child = @{ Process = $process; Out = $out; Err = $err }
  $children.Add($child)
  return $child
}
function Finish-Child($Child, [int]$TimeoutSeconds = 30) {
  $p = $Child.Process
  if (-not $p.WaitForExit($TimeoutSeconds * 1000)) { throw "child exceeded ${TimeoutSeconds}s" }
  Assert ($Child.Out.Wait(5000) -and $Child.Err.Wait(5000)) 'child capture pipes did not close'
  return @{ Code = $p.ExitCode; Stdout = $Child.Out.Result; Stderr = $Child.Err.Result }
}
function Start-Cli([string[]]$Arguments) {
  # Invoke the CLI exactly as a script, preserving comma-separated values and odd paths.
  $parts = foreach ($arg in $Arguments) {
    if ($arg -cmatch '^-[A-Za-z]+$') { $arg } else { Quote-Ps $arg }
  }
  return Start-Child ("& $(Quote-Ps $cli) " + ($parts -join ' ') + '; exit $LASTEXITCODE')
}
function Run-Cli([string[]]$Arguments) { return Finish-Child (Start-Cli $Arguments) }
function Cli-Json([string[]]$Arguments) {
  $r = Run-Cli ($Arguments + @('-Json'))
  Check-Code $r 0
  try { return $json.DeserializeObject($r.Stdout) } catch { throw "CLI did not print one JSON document: $($r.Stdout)" }
}
function Run-Git([string[]]$Arguments) {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $git
  $info.Arguments = ($Arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
  $info.WorkingDirectory = $script:repo
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  foreach ($key in @('GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE')) {
    [void]$info.EnvironmentVariables.Remove($key)
  }
  $p = New-Object Diagnostics.Process
  $p.StartInfo = $info
  try {
    [void]$p.Start()
    $out = $p.StandardOutput.ReadToEndAsync()
    $err = $p.StandardError.ReadToEndAsync()
    Assert ($p.WaitForExit(15000)) 'git fixture command timed out'
    $null = $out.Result
    Assert ($p.ExitCode -eq 0) ("git fixture command failed: " + $err.Result)
  } finally { if (-not $p.HasExited) { $p.Kill() }; $p.Dispose() }
}
function New-Fixture {
  $fixture = Join-Path $scratch ('case-' + $script:total)
  $script:repo = Join-Path $fixture "repo & (test) [1]'s"
  [void][IO.Directory]::CreateDirectory($script:repo)
  $env:CCX_STATE_DIR = Join-Path $fixture 'state'
  $env:CCX_POLICY = Join-Path $fixture 'policy.json'
  $env:CODEX_HOME = Join-Path $fixture 'catalog'
  [void][IO.Directory]::CreateDirectory($env:CODEX_HOME)
  $script:policy = Read-Json $sourcePolicy
  # Synthetic providers: a real Ollama install or API key on this machine never changes a route.
  $script:policy.providers = @{
    fakelocal = @{ kind='local'; enabled=$true; command='ccx-fake-local'; codexFlags=@('--oss','--local-provider','ollama'); model='fake-local'; use=@('routine') }
    fakecloud = @{ kind='cloud'; enabled=$true; envKey='CCX_TEST_CLOUD_KEY'; codexFlags=@('-c','model_provider=fakecloud'); model='fake-cloud'; use=@('fallback') }
  }
  Write-Json $env:CCX_POLICY $script:policy
  Write-Json (Join-Path $env:CODEX_HOME $script:policy.models.codex.catalogFile) @{ models = @(@{ slug = $script:policy.models.codex.default }) }
  Set-Location -LiteralPath $script:repo
  Run-Git @('init', '-q')
  Run-Git @('config', 'user.name', 'CCX synthetic test')
  Run-Git @('config', 'user.email', 'ccx@example.test')
  [void][IO.Directory]::CreateDirectory((Join-Path $script:repo 'src'))
  Write-Utf8File (Join-Path $script:repo 'src/one.txt') 'fixture'
  Write-Utf8File (Join-Path $script:repo '.gitignore') "ignored/`n"
  Run-Git @('add', 'src/one.txt', '.gitignore')
  Run-Git @('-c', 'core.hooksPath=NUL', 'commit', '-qm', 'synthetic fixture')
}
function Case([string]$Name, [scriptblock]$Body) {
  $script:total++
  try {
    New-Fixture
    & $Body
    $script:passed++
    Write-Output "PASS $Name"
  } catch {
    $message = ($_.Exception.Message -replace '\s+', ' ').Trim()
    $script:failures.Add("FAIL ${Name}: $message")
    Write-Output "FAIL ${Name}: $message"
  }
}
function Add-Task([string]$Id = 'T1', [string]$Owns = 'src/', [string]$Class = 'normal', [string]$Risk = 'low') {
  Check-Code (Run-Cli @('task', 'add', '-Id', $Id, '-Title', 'Synthetic task', '-Type', 'implement', '-Class', $Class, '-Risk', $Risk, '-Owner', 'codex', '-Owns', $Owns)) 0
}
function Get-TestTask([string]$Id = 'T1') { return (Get-CcxState).tasks[$Id] }
function Set-Verification([string]$Id = 'T1', [string]$Fingerprint = '', [bool]$Full = $true) {
  $task = Get-TestTask $Id
  if (-not $Fingerprint) { $Fingerprint = Get-CcxFingerprint -Task $task -Root $script:repo }
  $value = @{ status = 'PASS'; at = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'); fingerprint = $Fingerprint; full = $Full; stages = @(@{name='parse';result='PASS'}) }
  Invoke-CcxLocked { param($state) $state.tasks[$Id].verification = $value } | Out-Null
}
function Pending-Id([string]$Action, [string]$Target = '') {
  $r = Run-Cli @('gate', '-Action', $Action, '-Target', $Target)
  Check-Code $r 10
  Assert ($r.Stdout -match 'A-\d{4}') 'approval identifier missing'
  return $Matches[0]
}
function Remove-Scratch {
  if (-not $createdScratch) { return }
  $actual = [IO.Path]::GetFullPath($scratch).TrimEnd('\')
  $parent = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')
  Assert ((Split-Path $actual -Parent) -ieq $parent) 'scratch escaped TEMP'
  Assert ((Split-Path $actual -Leaf) -cmatch '^ccx-t1-[0-9a-f]{32}$') 'scratch name is not owned by this run'
  if (Test-Path -LiteralPath $actual) { Remove-Item -LiteralPath $actual -Recurse -Force }
}

try {
  Assert (-not (Test-Path -LiteralPath $scratch)) 'random scratch directory already exists'
  [void][IO.Directory]::CreateDirectory($scratch)
  $createdScratch = $true
  # Dot-source only after isolating every location used by the library.
  $env:CCX_STATE_DIR = Join-Path $scratch 'bootstrap-state'
  $env:CCX_POLICY = Join-Path $scratch 'bootstrap-policy.json'
  $env:CODEX_HOME = Join-Path $scratch 'bootstrap-catalog'
  Write-Utf8File $env:CCX_POLICY ([IO.File]::ReadAllText($sourcePolicy))
  . $core

  Case 'help, unknown command, JSON, task schema and comma-separated fields' {
    Check-Code (Run-Cli @('help')) 0
    Check-Code (Run-Cli @('not-a-command')) 2
    Add-Task 'T1' 'src/one.txt,src/two.txt'
    $task = Get-TestTask
    Assert (@($task.owns).Count -eq 2) 'Owns was not split on comma'
    foreach ($name in @('id','title','type','class','risk','owner','parent','dependsOn','owns','taskFile','status','worktree','branch','baselineDirty','created','updated','checkpoints','dispatches','modelEscalations','reviewCycles','tokens','budget','lastDispatch','verification','reviews','merge')) {
      Assert ($task.ContainsKey($name)) "task schema missing $name"
    }
    $null = Cli-Json @('task', 'show', '-Id', 'T1')
    $null = Cli-Json @('task', 'list')
    Check-Code (Run-Cli @('task', 'add', '-Id', 'T1', '-Title', 'Duplicate', '-Type', 'implement', '-Class', 'normal', '-Risk', 'low', '-Owner', 'codex', '-Owns', 'other/')) 2
  }
  Case 'real File invocation splits comma arguments and escalates complex attempt two' {
    $r = Finish-Child (Start-Child -FileArguments @('route','-Type','implement','-Class','complex','-Attempt','2','-Json'))
    Check-Code $r 0
    $route = $json.DeserializeObject($r.Stdout)
    Assert ($route.model -eq $policy.models.codex.default) 'File route ignored policy model'
    Assert ($route.effort -eq $policy.classes.complex.effort.codex.max) 'complex attempt two did not reach class effort maximum'
    Assert ($route.escalation.from -eq $policy.classes.complex.effort.codex.base -and $route.escalation.to -eq $route.effort) 'complex attempt two escalation metadata missing'
    $r = Finish-Child (Start-Child -FileArguments @('task','add','-Id','FILE1','-Title','File argument fixture','-Type','implement','-Class','normal','-Risk','low','-Owner','codex','-Owns','src/one.txt,src/two.txt,src/item[1].txt','-DependsOn','DEP1,DEP2','-Json'))
    Check-Code $r 0
    $task = $json.DeserializeObject($r.Stdout)
    Assert (@($task.owns).Count -eq 3 -and $task.owns -contains 'src/one.txt' -and $task.owns -contains 'src/two.txt' -and $task.owns -contains 'src/item[1].txt') 'File Owns comma splitting or literal bracket path failed'
    Assert (@($task.dependsOn).Count -eq 2 -and $task.dependsOn -contains 'DEP1' -and $task.dependsOn -contains 'DEP2') 'File DependsOn comma splitting failed'
  }
  Case 'owned paths reject absolute, drive-relative, traversal and blank elements' {
    $i = 0
    foreach ($path in @('C:/escape.txt','C:escape.txt','/escape.txt','../escape.txt','src/../escape.txt','src/one.txt,','\\server\share\x')) {
      $i++
      Check-Code (Run-Cli @('task','add','-Id',"BAD$i",'-Title','Bad path','-Type','implement','-Class','normal','-Risk','low','-Owner','codex','-Owns',$path)) 2
    }
    Check-Code (Run-Cli @('task','add','-Id','bad/id','-Title','Bad ID','-Type','implement','-Class','normal','-Risk','low','-Owner','codex','-Owns','src/')) 2
  }
  Case 'five concurrent mutations preserve checkpoints and atomic backup' {
    Add-Task
    $jobs = @()
    foreach ($i in 1..5) { $jobs += Start-Cli @('task','update','-Id','T1','-Note',"concurrent-$i") }
    foreach ($job in $jobs) { Check-Code (Finish-Child $job) 0 }
    $notes = @((Get-TestTask).checkpoints | ForEach-Object { $_.note })
    foreach ($i in 1..5) { Assert ($notes -contains "concurrent-$i") "checkpoint $i lost" }
    Assert (Test-Path -LiteralPath (Join-Path $env:CCX_STATE_DIR 'state.json.bak')) 'atomic backup absent'
    $null = Read-Json (Join-Path $env:CCX_STATE_DIR 'state.json.bak')
    Assert (@(Get-ChildItem -LiteralPath $env:CCX_STATE_DIR -Filter 'state.json.tmp-*').Count -eq 0) 'temporary state file leaked'
  }
  Case 'lock timeout is bounded and leaves state intact' {
    Add-Task
    $policy.state.lockTimeoutSeconds = 0.2
    Write-Json $env:CCX_POLICY $policy
    $before = [IO.File]::ReadAllText((Join-Path $env:CCX_STATE_DIR 'state.json'))
    $lock = [IO.File]::Open((Join-Path $env:CCX_STATE_DIR 'state.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    try {
      $r = Run-Cli @('task','update','-Id','T1','-Note','must not land')
      Check-Code $r 1
      Assert (($r.Stdout + $r.Stderr) -match 'LOCK TIMEOUT') 'lock timeout message missing'
    } finally { $lock.Dispose() }
    Assert ([IO.File]::ReadAllText((Join-Path $env:CCX_STATE_DIR 'state.json')) -ceq $before) 'timed-out writer changed state'
  }
  Case 'overlap refusal includes paths; sibling non-overlap and baseline dirty work' {
    Write-Utf8File (Join-Path $repo 'unrelated.txt') 'pre-existing change'
    Add-Task 'T1' 'src/'
    Add-Task 'T2' 'SRC/one.txt'
    Add-Task 'T3' 'src-other/'
    Check-Code (Run-Cli @('task','start','-Id','T1')) 0
    $r = Run-Cli @('task','start','-Id','T2')
    Check-Code $r 7
    Assert ($r.Stdout -match 'T1' -and $r.Stdout -match '(?i)src') 'overlap diagnostic omitted owner or path'
    Check-Code (Run-Cli @('task','start','-Id','T3')) 0
    Assert ((Get-TestTask).baselineDirty -contains 'unrelated.txt') 'baseline omitted pre-existing change'
    Assert (@(Test-CcxScope -Task (Get-TestTask) -Root $repo).Count -eq 0) 'baseline dirty change blamed on task'
    Write-Utf8File (Join-Path $repo 'later.txt') 'new out-of-scope change'
    Assert (@(Test-CcxScope -Task (Get-TestTask) -Root $repo).Count -gt 0) 'new out-of-scope change missed'
    # CCX-4 F3: restarting must not launder the stray change into baselineDirty.
    Check-Code (Run-Cli @('task','start','-Id','T1')) 0
    Assert (@(Test-CcxScope -Task (Get-TestTask) -Root $repo) -contains 'later.txt') 'restart laundered a stray change into the baseline'
    # CCX-4b F3 residuals: naming the same root explicitly, or a reset to planned, must not re-baseline either.
    Check-Code (Run-Cli @('task','start','-Id','T1','-Worktree',$repo)) 0
    Assert (@(Test-CcxScope -Task (Get-TestTask) -Root $repo) -contains 'later.txt') 'explicit same worktree laundered a stray change'
    Check-Code (Run-Cli @('task','update','-Id','T1','-Status','planned')) 0
    Check-Code (Run-Cli @('task','start','-Id','T1')) 0
    Assert (@(Test-CcxScope -Task (Get-TestTask) -Root $repo) -contains 'later.txt') 'reset to planned laundered a stray change'
    # CCX-4c: a legacy task (no per-worktree baselines) reset to planned keeps its old baseline too.
    Invoke-CcxLocked { param($state) $state.tasks.T1.Remove('baselines') | Out-Null; $state.tasks.T1.status = 'planned' } | Out-Null
    Check-Code (Run-Cli @('task','start','-Id','T1')) 0
    Assert (@(Test-CcxScope -Task (Get-TestTask) -Root $repo) -contains 'later.txt') 'legacy task reset to planned re-baselined'
    $verifyRoute = Cli-Json @('route','-Type','verify','-Class','complex','-Risk','high')
    Assert (@($verifyRoute.verification) -notcontains 'independent-verifier') 'verify tasks must not need a verifier of their own'
    Assert (Test-CcxPathOverlap -A 'Src/' -B 'src/one.txt') 'directory overlap is not case insensitive'
    Assert (-not (Test-CcxPathOverlap -A 'src/' -B 'src-other/a.txt')) 'sibling incorrectly overlaps'
  }
  Case 'review author rule, verifier exception, review cap and budget extension' {
    Add-Task
    $r = Run-Cli @('task','review','-Id','T1','-Result','pass','-By','codex')
    Check-Code $r 2
    Assert ($r.Stdout -match 'author cannot review own work') 'author diagnostic missing'
    Check-Code (Run-Cli @('task','review','-Id','T1','-Result','pass','-By','codex','-Kind','verifier')) 0
    Check-Code (Run-Cli @('task','review','-Id','T1','-Result','changes','-By','claude')) 0
    $r = Run-Cli @('task','review','-Id','T1','-Result','changes','-By','claude')
    Check-Code $r 8
    Assert ($r.Stdout -match 'REVIEW CAP REACHED') 'review cap message missing'
    Assert ((Get-TestTask).reviewCycles -eq 2) 'capped review was not recorded'
    Assert (@((Get-CcxState).notifications | Where-Object { $_.level -eq 'action' }).Count -gt 0) 'cap notification missing'
    Check-Code (Run-Cli @('task','budget','-Id','T1','-Add','maxReviewCycles=2,maxDispatches=1','-Reason','Synthetic extension')) 0
    $route = Cli-Json @('route','-TaskId','T1')
    $classBudget = $policy.classes.normal.budget
    Assert ($route.budget.maxReviewCycles -eq $classBudget.maxReviewCycles + 2 -and $route.budget.maxDispatches -eq $classBudget.maxDispatches + 1) 'budget did not add to class limits'
  }
  Case 'done requires full current verification and review; terminal update refused' {
    Add-Task
    Check-Code (Run-Cli @('task','done','-Id','T1')) 8
    Set-Verification -Fingerprint 'stale'
    Check-Code (Run-Cli @('task','done','-Id','T1')) 8
    Set-Verification -Full $false
    Check-Code (Run-Cli @('task','done','-Id','T1')) 8
    Set-Verification
    Check-Code (Run-Cli @('task','done','-Id','T1')) 8
    Check-Code (Run-Cli @('task','review','-Id','T1','-Result','pass','-By','claude')) 0
    Check-Code (Run-Cli @('task','update','-Id','T1','-Status','done')) 2
    Check-Code (Run-Cli @('task','done','-Id','T1')) 0
    Assert ((Get-TestTask).status -eq 'done') 'done did not persist'
    Check-Code (Run-Cli @('task','update','-Id','T1','-Status','active')) 2
    $records = @([IO.File]::ReadAllLines((Join-Path $env:CCX_STATE_DIR 'telemetry.jsonl')) | ForEach-Object { $json.DeserializeObject($_) })
    Assert (@($records | Where-Object { $_.kind -eq 'task-done' -and $_.accepted -and $_.firstTry }).Count -eq 1) 'accepted first-try telemetry missing'
  }
  Case 'critical completion requires independent verifier and human approval' {
    Add-Task 'T1' 'src/' 'critical'
    Set-Verification
    Check-Code (Run-Cli @('task','review','-Id','T1','-Result','pass','-By','claude')) 0
    Check-Code (Run-Cli @('task','done','-Id','T1')) 8
    Check-Code (Run-Cli @('task','review','-Id','T1','-Result','pass','-By','codex','-Kind','verifier')) 0
    Check-Code (Run-Cli @('task','done','-Id','T1')) 8
    $id = Pending-Id 'task-accept' 'T1'
    Check-Code (Run-Cli @('approve','-Id',$id,'-Chat','-Quote','Approve synthetic task T1')) 0
    Check-Code (Run-Cli @('task','done','-Id','T1')) 0
  }
  Case 'tool routing, normal model, high risk and routine ambiguity' {
    $r = Cli-Json @('route','-Type','git-state')
    Assert ($r.route -eq 'tool' -and -not $r.llmRequired -and $r.agent -eq 'none') 'tool used an LLM'
    $r = Cli-Json @('route','-Type','implement','-Class','normal')
    Assert ($r.model -eq $policy.models.codex.default -and $r.effort -eq $policy.classes.normal.effort.codex.base) 'normal route differs from policy'
    $r = Cli-Json @('route','-Type','implement','-Class','routine','-Risk','high')
    Assert ($r.class -eq $policy.risk.high.minClass -and $r.verification -contains 'independent-verifier') 'high-risk class or verification missing'
    $r = Cli-Json @('route','-Type','implement','-Class','routine','-Ambiguous')
    Assert ([array]::IndexOf($policy.effortLadder,$r.effort) -le [array]::IndexOf($policy.effortLadder,'medium')) 'routine ambiguity exceeded medium'
  }
  Case 'max effort requires two failures and retry caps escalate then surface' {
    foreach ($attempt in 1..3) {
      $r = Cli-Json @('route','-Type','architecture','-Class','exceptional','-Attempt',([string]$attempt))
      if ($attempt -lt 3) { Assert ($r.effort -ne 'max') 'max effort arrived before two failures' }
      else { Assert ($r.effort -eq 'max') 'max effort unavailable after two failures' }
    }
    Add-Task
    $r = Cli-Json @('route','-TaskId','T1','-Attempt','4')
    Assert ($r.route -eq 'premium' -and $r.agent -eq 'claude') 'retry cap did not escalate to lead'
    Invoke-CcxLocked { param($state) $state.tasks.T1.modelEscalations = 1 } | Out-Null
    $r = Cli-Json @('route','-TaskId','T1','-Attempt','4')
    Assert ($r.route -eq 'surface') 'exhausted escalation cap did not surface'
  }
  Case 'Codex unavailability defers and cross-model review validates author' {
    Invoke-CcxLocked { param($state) $state.agents.codex.unavailableUntil = [DateTime]::UtcNow.AddHours(1).ToString('yyyy-MM-ddTHH:mm:ssZ') } | Out-Null
    Assert ((Cli-Json @('route','-Type','implement')).route -eq 'defer') 'unavailable Codex did not defer'
    Check-Code (Run-Cli @('route','-Type','review')) 2
    $r = Cli-Json @('route','-Type','review','-AuthoredBy','codex')
    Assert ($r.agent -eq 'claude') 'cross-model review chose the author'
    Check-Code (Run-Cli @('route','-Type','made-up')) 2
  }
  Case 'providers: cloud fallback when Codex is out, local on first routine attempt only' {
    $oldPath = $env:PATH
    try {
      Invoke-CcxLocked { param($state) $state.agents.codex.unavailableUntil = [DateTime]::UtcNow.AddHours(1).ToString('yyyy-MM-ddTHH:mm:ssZ') } | Out-Null
      $env:CCX_TEST_CLOUD_KEY = 'x'
      $r = Cli-Json @('route','-Type','implement')
      Assert ($r.route -ne 'defer' -and $r.provider -eq 'fakecloud' -and $r.model -eq 'fake-cloud') 'cloud fallback not used while Codex is out'
      Remove-Item Env:CCX_TEST_CLOUD_KEY
      Invoke-CcxLocked { param($state) $state.agents.codex.unavailableUntil = $null } | Out-Null
      $bin = Join-Path $scratch 'fakebin'
      [void][IO.Directory]::CreateDirectory($bin)
      Write-Utf8File (Join-Path $bin 'ccx-fake-local.cmd') '@exit /b 0'
      $env:PATH = $bin + ';' + $oldPath
      $r = Cli-Json @('route','-Type','implement','-Class','routine')
      Assert ($r.provider -eq 'fakelocal' -and $r.model -eq 'fake-local') 'local provider not used for first routine attempt'
      $r = Cli-Json @('route','-Type','implement','-Class','routine','-Attempt','2')
      Assert ($r.provider -eq 'openai') 'retry did not return to OpenAI'
      Assert ((Cli-Json @('route','-Type','implement','-Class','normal')).provider -eq 'openai') 'local provider used beyond routine work'
    } finally { $env:PATH = $oldPath; Remove-Item Env:CCX_TEST_CLOUD_KEY -ErrorAction SilentlyContinue }
  }
  Case 'Mythos fallback and available test policy' {
    $r = Cli-Json @('route','-Type','implement','-Class','exceptional','-RequestMythos')
    Assert ($r.agent -eq 'claude' -and $r.effort -eq 'max') 'unavailable Mythos fallback differs'
    $policy.models.mythos.available = $true
    $policy.models.mythos.agent = 'synthetic-mythos'
    $policy.models.mythos.model = 'synthetic-model'
    Write-Json $env:CCX_POLICY $policy
    $r = Cli-Json @('route','-Type','implement','-Class','exceptional','-RequestMythos')
    Assert ($r.route -eq 'mythos' -and $r.permissionLevel -eq 'L0' -and $r.model -eq 'synthetic-model') 'available Mythos was not constrained by policy'
  }
  Case 'catalog fallback, missing catalog and unreadable catalog' {
    $catalog = Join-Path $env:CODEX_HOME $policy.models.codex.catalogFile
    Write-Json $catalog @{ models = @(@{slug=$policy.models.codex.fallbacks[0]}) }
    Assert ((Cli-Json @('route','-Type','implement')).model -eq $policy.models.codex.fallbacks[0]) 'catalog fallback ignored'
    Remove-Item -LiteralPath $catalog
    Assert ((Cli-Json @('route','-Type','implement')).model -eq $policy.models.codex.default) 'missing catalog did not retain default'
    Write-Utf8File $catalog '{bad json'
    Assert ((Cli-Json @('route','-Type','implement')).model -eq $policy.models.codex.default) 'invalid catalog did not retain default'
  }
  Case 'adaptive downgrade follows successful done samples' {
    foreach ($i in 1..$policy.adaptive.minSamples) {
      Write-CcxTelemetry -Record @{kind='task-done';type='implement';agent='codex';effort='medium';accepted=$true;firstTry=$true;tokens=@{input=100;cached=20;output=10}} | Out-Null
    }
    $r = Cli-Json @('route','-Type','implement','-Class','normal')
    Assert ($r.effort -eq 'low') 'successful telemetry did not downgrade effort'
    Assert (($r.reasons -join ' ') -match '3|100|1\.0') 'adaptive reason lacks sample evidence'
  }
  Case 'adaptive upgrade follows failed dispatches and explicit escalation wins' {
    foreach ($i in 1..$policy.adaptive.minSamples) {
      # Usage-limit exits must never count as model failures.
      Write-CcxTelemetry -Record @{kind='dispatch';type='implement';agent='codex';effort='medium';exit=4;status='NONE';tokens=@{input=0;cached=0;output=0}} | Out-Null
    }
    Assert ((Cli-Json @('route','-Type','implement','-Class','normal')).effort -eq 'medium') 'usage-limit exits upgraded effort'
    foreach ($i in 1..$policy.adaptive.minSamples) {
      Write-CcxTelemetry -Record @{kind='dispatch';type='implement';agent='codex';effort='medium';exit=1;exitCode=1;status='FAILED';tokens=@{input=100;cached=20;output=10}} | Out-Null
    }
    Assert ((Cli-Json @('route','-Type','implement','-Class','normal')).effort -eq 'high') 'failed telemetry did not upgrade effort'
    Assert ((Cli-Json @('route','-Type','implement','-Class','normal','-Attempt','2')).effort -eq 'high') 'adaptive routing exceeded class maximum'
    $stats = @(Cli-Json @('stats') | Where-Object { $_.type -eq 'implement' -and $_.agent -eq 'codex' -and $_.effort -eq 'medium' })
    Assert ($stats.Count -eq 1) 'synthetic stats group missing or duplicated'
    Assert ($stats[0].dispatches -eq $policy.adaptive.minSamples) 'stats dispatch count differs from synthetic records'
    Assert ($stats[0].failures -eq $policy.adaptive.minSamples) 'stats failure count differs from synthetic records'
    Assert ($stats[0].meanEffectiveTokens -eq 90) 'stats effective tokens did not subtract cached input'
  }
  Case 'L2 allowed and L3 audited' {
    Check-Code (Run-Cli @('gate','-Action','test')) 0
    Check-Code (Run-Cli @('gate','-Action','local-commit','-Target','synthetic')) 0
    $history = [IO.File]::ReadAllText((Join-Path $env:CCX_STATE_DIR 'history.jsonl'))
    Assert ($history -match 'local-commit') 'L3 audit absent'
  }
  Case 'L4 approval dedup, chat provenance and single use' {
    $id = Pending-Id 'push' 'synthetic-origin'
    Assert ((Pending-Id 'push' 'synthetic-origin') -eq $id) 'pending approval not reused'
    Assert (@((Get-CcxState).notifications | Where-Object { -not $_.ack }).Count -eq 1) 'approval notification duplicated'
    Check-Code (Run-Cli @('approve','-Id',$id,'-Chat','-Quote','I approve this synthetic push')) 0
    $approval = (Get-CcxState).approvals[$id]
    Assert ($approval.provenance -eq 'chat' -and $approval.expires) 'approval provenance or expiry missing'
    $r = Run-Cli @('gate','-Action','push','-Target','synthetic-origin')
    Check-Code $r 0
    Assert ($r.Stdout -match "APPROVED $id") 'consumed approval message missing'
    Assert ((Get-CcxState).approvals[$id].status -eq 'used') 'approval not consumed'
    Assert ((Pending-Id 'push' 'synthetic-origin') -ne $id) 'used approval reused'
    Check-Code (Run-Cli @('approve','-Id',$id,'-Chat','-Quote','repeat')) 11
  }
  Case 'L5 chat refusal, redirected console refusal, missing quote and denial' {
    $id = Pending-Id 'force-push' 'synthetic-origin'
    $r = Run-Cli @('approve','-Id',$id,'-Chat','-Quote','Synthetic request')
    Check-Code $r 12
    Assert ($r.Stdout -match 'L5 needs interactive approval') 'L5 refusal message missing'
    Check-Code (Run-Cli @('approve','-Id',$id)) 12
    $l4 = Pending-Id 'publish' 'synthetic-page'
    $r = Run-Cli @('approve','-Id',$l4,'-Chat')
    Assert ($r.Code -ne 0) 'chat approval accepted without a quote'
    Check-Code (Run-Cli @('deny','-Id',$l4)) 0
    Assert ((Get-CcxState).approvals[$l4].status -eq 'denied') 'deny did not persist'
    Check-Code (Run-Cli @('approve','-Id',$l4,'-Chat','-Quote','late')) 11
    Check-Code (Run-Cli @('approve','-Id','A-9999','-Chat','-Quote','missing')) 11
  }
  Case 'unknown action fails closed and expired approval cannot authorize' {
    $id = Pending-Id 'unknown-action' 'synthetic-target'
    Assert ((Get-CcxState).approvals[$id].level -eq 'L4') 'unknown action did not fail closed'
    Check-Code (Run-Cli @('approve','-Id',$id,'-Chat','-Quote','Synthetic approval')) 0
    Invoke-CcxLocked { param($state) $state.approvals[$id].expires = [DateTime]::UtcNow.AddMinutes(-1).ToString('yyyy-MM-ddTHH:mm:ssZ') } | Out-Null
    Assert ((Pending-Id 'unknown-action' 'synthetic-target') -ne $id) 'expired approval authorized action'
    Assert ((Get-CcxState).approvals[$id].status -eq 'expired') 'expired approval not marked'
  }
  Case 'event dedup window, JSON object validation and notification acknowledgement' {
    $one = Cli-Json @('event','add','-Type','user','-Key','same','-Data','{"value":1}')
    $two = Cli-Json @('event','add','-Type','user','-Key','same','-Data','{"value":2}')
    Assert ($one.id -eq $two.id -and $two.duplicate) 'event dedup failed'
    Assert (@((Get-CcxState).eventQueue).Count -eq 1) 'dedup appended an event'
    Check-Code (Run-Cli @('event','add','-Type','user','-Data','[1,2]')) 2
    $policy.runtime.dedupWindowMinutes = 0
    Write-Json $env:CCX_POLICY $policy
    $three = Cli-Json @('event','add','-Type','user','-Key','same')
    Assert ($three.id -ne $one.id) 'expired event key did not permit new event'
    Invoke-CcxLocked {
      param($state)
      Add-CcxNotification -State $state -Level info -Text 'first' -Key 'notice' | Out-Null
      Add-CcxNotification -State $state -Level info -Text 'second' -Key 'notice' | Out-Null
    } | Out-Null
    Assert (@((Get-CcxState).notifications).Count -eq 1) 'unread notification not deduplicated'
    Check-Code (Run-Cli @('ack','-Id','all')) 0
    Assert (@((Get-CcxState).notifications | Where-Object { -not $_.ack }).Count -eq 0) 'ack left unread notification'
  }
  Case 'all secret patterns redact, metadata-only scanning and truncation' {
    $samples = @(
      ('-----BEGIN ' + 'PRIVATE KEY-----'),
      ('AK' + 'IA' + ('A' * 16)),
      ('gh' + 'p_' + ('a' * 36)),
      ('github' + '_pat_' + ('a' * 40)),
      ('sk' + '-ant-' + ('a' * 24)),
      ('s' + 'k-' + ('a' * 24)),
      ('xo' + 'xb-' + ('a' * 16)),
      ('AI' + 'za' + ('a' * 35)),
      ('ey' + 'J' + ('a' * 12) + '.ey' + 'J' + ('b' * 12) + '.' + ('c' * 12)),
      ('pass' + 'word=' + ('a' * 12))
    )
    for ($i = 0; $i -lt $samples.Count; $i++) {
      Assert ((Protect-CcxText $samples[$i]) -eq '[REDACTED]') "redaction pattern $i failed"
      $hits = @(Find-CcxSecrets -Text $samples[$i])
      Assert ($hits.Count -gt 0 -and $hits[0].patternIndex -eq $i -and $hits[0].line -eq 1) "secret metadata $i incorrect"
      Assert (($json.Serialize($hits)) -notlike ('*' + $samples[$i] + '*')) "scanner exposed pattern $i"
    }
    # CCX-4 F1: the whole PEM block goes, body included, terminated or cut off.
    $body = 'MIIEpAIBAAKCAQEA' + ('Q' * 40)
    $pem = 'before ' + '-----BEGIN ' + 'RSA PRIVATE KEY-----' + "`n$body`n" + '-----END ' + 'RSA PRIVATE KEY-----' + ' after'
    $red = Protect-CcxText $pem -Full
    Assert ($red -notmatch [regex]::Escape($body) -and $red -match '^before \[REDACTED\] after$') 'PEM key body leaked'
    Assert ((Protect-CcxText ('-----BEGIN ' + 'PRIVATE KEY-----' + "`n$body") -Full) -notmatch [regex]::Escape($body)) 'unterminated PEM body leaked'
    $cut = Protect-CcxText ('z' * ($policy.redaction.maxFieldChars + 100))
    Assert ($cut.Length -le $policy.redaction.maxFieldChars -and $cut.EndsWith('...')) 'truncation missing or over limit'
    Add-Task
    Check-Code (Run-Cli @('task','update','-Id','T1','-Note',$samples[1])) 0
    Write-CcxTelemetry -Record @{kind='synthetic';nested=@{value=$samples[2]}} | Out-Null
    Add-CcxHistory -Record @{kind='synthetic';note=$samples[3]} | Out-Null
    Add-CcxEvent -Type 'user' -Data @{note=$samples[4]} | Out-Null
    foreach ($file in @(Get-ChildItem -LiteralPath $env:CCX_STATE_DIR -File | Where-Object { $_.Name -match '\.(json|jsonl|bak)$' })) {
      $content = [IO.File]::ReadAllText($file.FullName)
      foreach ($sample in $samples) { Assert (-not $content.Contains($sample)) "secret persisted in $($file.Name)" }
    }
  }
  Case 'telemetry/history rotation and bounded state lists' {
    $policy.telemetry.maxBytes = 180
    $policy.state.historyMaxBytes = 180
    $policy.state.checkpointsMax = 2
    $policy.state.routingLogMax = 2
    Write-Json $env:CCX_POLICY $policy
    foreach ($i in 1..5) {
      Write-CcxTelemetry -Record @{kind='synthetic';note=('x' * 100);number=$i} | Out-Null
      Add-CcxHistory -Record @{kind='synthetic';note=('x' * 100);number=$i} | Out-Null
    }
    foreach ($name in @('telemetry.1.jsonl','history.1.jsonl')) {
      Assert (Test-Path -LiteralPath (Join-Path $env:CCX_STATE_DIR $name)) "$name rotation absent"
      foreach ($line in [IO.File]::ReadAllLines((Join-Path $env:CCX_STATE_DIR $name))) { $null = $json.DeserializeObject($line) }
    }
    Add-Task
    foreach ($i in 1..3) {
      Check-Code (Run-Cli @('task','update','-Id','T1','-Note',"bounded-$i")) 0
      $null = Cli-Json @('route','-Type','implement')
    }
    Assert (@((Get-TestTask).checkpoints).Count -eq 2) 'checkpoint bound ignored'
    Assert (@((Get-CcxState).routingLog).Count -eq 2) 'routing log bound ignored'
    Assert ((Get-TestTask).checkpoints[-1].note -eq 'bounded-3') 'oldest instead of newest checkpoint retained'
  }
  Case 'fingerprint tracks owned files, missing files and stays stable across commit' {
    Add-Task 'T1' 'src/,missing.txt'
    $task = Get-TestTask
    $first = Get-CcxFingerprint -Task $task -Root $repo
    Write-Utf8File (Join-Path $repo 'src/new.txt') 'new'
    $second = Get-CcxFingerprint -Task $task -Root $repo
    Assert ($first -ne $second) 'new owned file did not alter fingerprint'
    Run-Git @('add','src/new.txt')
    Run-Git @('-c','core.hooksPath=NUL','commit','-qm','commit owned content')
    Assert ((Get-CcxFingerprint -Task $task -Root $repo) -eq $second) 'commit changed content fingerprint'
    Write-Utf8File (Join-Path $repo 'unowned.txt') 'unowned'
    Assert ((Get-CcxFingerprint -Task $task -Root $repo) -eq $second) 'unowned content changed fingerprint'
    Write-Utf8File (Join-Path $repo 'missing.txt') 'now exists'
    Assert ((Get-CcxFingerprint -Task $task -Root $repo) -ne $second) 'owned missing marker not tracked'
  }
  Case 'rename records both paths and quick checks catch parse, JSON, secrets and scope' {
    Add-Task
    Check-Code (Run-Cli @('task','start','-Id','T1')) 0
    Run-Git @('mv','src/one.txt','src/renamed.txt')
    $changed = @(Get-CcxChangedPaths -Root $repo)
    Assert ($changed -contains 'src/one.txt' -and $changed -contains 'src/renamed.txt') 'rename lost a path'
    Write-Utf8File (Join-Path $repo 'src/broken.ps1') 'function Broken {'
    Write-Utf8File (Join-Path $repo 'src/broken.json') '{ broken'
    Write-Utf8File (Join-Path $repo 'src/sample.txt') ('gh' + 'p_' + ('a' * 36))
    Write-Utf8File (Join-Path $repo 'outside.txt') 'scope violation'
    $check = Invoke-CcxQuickChecks -Task (Get-TestTask) -Root $repo
    Assert (-not $check.pass) 'bad files passed quick checks'
    foreach ($name in @('parse','json','secrets','scope')) {
      Assert (@($check.stages | Where-Object { $_.name -eq $name -and $_.result -eq 'FAIL' }).Count -eq 1) "$name failure missing"
    }
    Write-Utf8File (Join-Path $repo 'src/broken.ps1') 'function Fixed { return 1 }'
    Write-Utf8File (Join-Path $repo 'src/broken.json') '{}'
    Write-Utf8File (Join-Path $repo 'src/sample.txt') 'safe fixture'
    Remove-Item -LiteralPath (Join-Path $repo 'outside.txt')
    Assert ((Invoke-CcxQuickChecks -Task (Get-TestTask) -Root $repo).pass) 'repaired quick checks still fail'
  }
  Case 'invalid policy refuses unknown effort, action level and nonnumeric budget' {
    foreach ($mutation in @('effort','level','budget')) {
      $bad = Read-Json $sourcePolicy
      switch ($mutation) {
        'effort' { $bad.classes.normal.effort.codex.base = 'invalid' }
        'level' { $bad.permissions.actions.read = 'invalid' }
        'budget' { $bad.classes.normal.budget.maxDispatches = 'invalid' }
      }
      Write-Json $env:CCX_POLICY $bad
      $r = Run-Cli @('route','-Type','implement')
      Check-Code $r 1
      Assert (($r.Stdout + $r.Stderr) -match '(?i)policy|effort|level|budget') 'policy failure diagnostic missing'
    }
  }
  Case 'routing still returns JSON when telemetry storage cannot be created' {
    $unwritable = Join-Path (Split-Path $env:CCX_POLICY -Parent) 'not-a-directory'
    Write-Utf8File $unwritable 'blocks directory creation'
    $env:CCX_STATE_DIR = Join-Path $unwritable 'state'
    $r = Run-Cli @('route','-Type','implement','-Json')
    Check-Code $r 0
    $decision = $json.DeserializeObject($r.Stdout)
    Assert ($decision.route -eq 'worker') 'route failed when log unavailable'
    Assert ($r.Stderr -match '(?i)warn|log|writ') 'failed log write produced no warning'
  }
  Case 'privacy excludes, named defaults, owner routing and escalation' {
    $policy.privacy.excludePaths = @('private-data/')
    Write-Json $env:CCX_POLICY $policy
    Check-Code (Run-Cli @('task','add','-Id','P1','-Title','Private','-Type','implement','-Class','normal','-Risk','low','-Owner','codex','-Owns','private-data/notes.txt')) 2
    Check-Code (Run-Cli @('task','add','-Id','P2','-Title','Private dir','-Type','implement','-Class','normal','-Risk','low','-Owner','codex','-Owns','Private-Data/')) 2
    [void][IO.Directory]::CreateDirectory((Join-Path $repo 'private-data'))
    Write-Utf8File (Join-Path $repo 'private-data/notes.txt') 'private'
    Write-Utf8File (Join-Path $repo 'visible.txt') 'visible'
    $changed = @(Get-CcxChangedPaths -Root $repo)
    Assert ($changed -contains 'visible.txt') 'visible change missing'
    Assert (@($changed | Where-Object { $_ -like 'private-data*' }).Count -eq 0) 'excluded path was listed'
    $r = Cli-Json @('route','-Type','implement')
    Assert ($r.class -eq $policy.defaults.class -and $r.risk -eq $policy.defaults.risk) 'named defaults not applied'
    Check-Code (Run-Cli @('task','add','-Id','C1','-Title','Claude work','-Type','implement','-Class','normal','-Risk','low','-Owner','claude','-Owns','src/c1.txt')) 0
    $r = Cli-Json @('route','-TaskId','C1')
    Assert ($r.agent -eq 'claude' -and $r.model -eq $policy.models.claude.lead -and -not $r.codexRole) 'task owner did not choose the agent'
    $started = Start-CcxTask -Id 'C1'
    Assert ($started.status -eq 'active' -and (Get-TestTask 'C1').baselineDirty -contains 'visible.txt') 'Start-CcxTask did not start the task with its baseline'
    Add-Task 'E1' 'src/e1.txt' 'normal'
    Invoke-CcxLocked { param($state) $state.tasks.E1.dispatches = 3 } | Out-Null
    Assert ((Cli-Json @('route','-TaskId','E1')).route -eq 'premium') 'retry cap did not escalate'
    Check-Code (Run-Cli @('task','escalate','-Id','E1')) 2
    Check-Code (Run-Cli @('task','escalate','-Id','E1','-Reason','Codex failed three times')) 0
    $task = Get-TestTask 'E1'
    Assert ($task.owner -eq 'claude' -and $task.modelEscalations -eq 1 -and $task.attemptBase -eq 3) 'escalation not recorded'
    $r = Cli-Json @('route','-TaskId','E1')
    Assert ($r.route -eq 'worker' -and $r.agent -eq 'claude' -and $r.attempt -eq 1 -and $r.effort -eq $policy.classes.normal.effort.claude.max) 'escalated task routed wrongly'
    $r = Run-Cli @('task','escalate','-Id','E1','-Reason','Second escalation')
    Check-Code $r 8
    Assert ($r.Stdout -match 'ESCALATION CAP REACHED') 'escalation cap message missing'
  }
  Case 'human task-accept stands in for an unavailable cross-model review' {
    Add-Task
    Set-Verification
    Check-Code (Run-Cli @('task','done','-Id','T1')) 8
    $id = Pending-Id 'task-accept' 'T1'
    Check-Code (Run-Cli @('approve','-Id',$id,'-Chat','-Quote','Let Claude finish it as codex hit its limits')) 0
    Check-Code (Run-Cli @('task','done','-Id','T1')) 0
  }
  Case 'source files parse and use UTF-8 without BOM' {
    foreach ($path in @($cli,$core,$PSCommandPath)) {
      $tokens = $null; $errors = $null
      $null = [Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
      Assert ($errors.Count -eq 0) "parse errors in $path"
      $bytes = [IO.File]::ReadAllBytes($path)
      Assert (-not ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191)) "UTF-8 BOM in $path"
      $strict = New-Object Text.UTF8Encoding($false,$true)
      $null = $strict.GetString($bytes)
    }
  }
} finally {
  Set-Location -LiteralPath $originalLocation.Path
  foreach ($child in $children) {
    try { if (-not $child.Process.HasExited) { $child.Process.Kill(); [void]$child.Process.WaitForExit(2000) } } catch { }
    $child.Process.Dispose()
  }
  foreach ($name in $oldEnv.Keys) { [Environment]::SetEnvironmentVariable($name,$oldEnv[$name],'Process') }
  Remove-Scratch
}
$clock.Stop()
Write-Output "$passed/$total passed in $([math]::Round($clock.Elapsed.TotalSeconds))s"
if ($passed -ne $total) { exit 1 }
exit 0