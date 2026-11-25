<#
Regression tests for crucible.ps1 (the Obsidian bridge), the gemini/claude owner routes in ccx and
codex-dispatch.ps1, and check-sources.mjs. Everything runs in a scratch Git repository with its own
ccx state and policy, against fake gemini, codex and claude CLIs: no network, no real agent.
Run from the repository root with Windows PowerShell 5.1.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$crucible = Join-Path $PSScriptRoot 'crucible.ps1'
$ccx = Join-Path $PSScriptRoot 'ccx.ps1'
$scratch = Join-Path $env:TEMP ('crucible-t-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
$utf8 = New-Object Text.UTF8Encoding $false
$powershell = Join-Path $PSHOME 'powershell.exe'
$git = (Get-Command git.exe -ErrorAction Stop).Source
$node = (Get-Command node.exe -ErrorAction Stop).Source
$passed = 0; $total = 0
$clock = [Diagnostics.Stopwatch]::StartNew()

function Assert([bool]$Condition, [string]$Reason) { if (-not $Condition) { throw $Reason } }
function Write-File([string]$Path, [string]$Text) { [void][IO.Directory]::CreateDirectory((Split-Path $Path)); [IO.File]::WriteAllText($Path, $Text, $utf8) }
function Run([string]$Script, [string[]]$Arguments, [hashtable]$Env = @{}) {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $powershell
  $info.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $Script + '" ' + (($Arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' ')
  $info.WorkingDirectory = $repo
  $info.UseShellExecute = $false; $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
  $info.EnvironmentVariables['PATH'] = "$fake;" + (Split-Path $node) + ';' + (Split-Path $git) + ";$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
  $info.EnvironmentVariables['CCX_STATE_DIR'] = $state
  $info.EnvironmentVariables['CCX_POLICY'] = $policyPath
  $info.EnvironmentVariables['CRUCIBLE_INLINE'] = '1'
  $info.EnvironmentVariables['CRUCIBLE_FAKE_KEY'] = 'fake'
  $info.EnvironmentVariables['USERPROFILE'] = $scratch
  $info.EnvironmentVariables['LOCALAPPDATA'] = Join-Path $scratch 'AppData'
  foreach ($key in @('GEMINI_API_KEY', 'CLAUDECODE')) { [void]$info.EnvironmentVariables.Remove($key) }
  foreach ($key in $Env.Keys) { $info.EnvironmentVariables[$key] = $Env[$key] }
  $p = [Diagnostics.Process]::Start($info)
  $out = $p.StandardOutput.ReadToEndAsync(); $err = $p.StandardError.ReadToEndAsync()
  if (-not $p.WaitForExit(180000)) { $p.Kill(); throw "$Script timed out" }
  [pscustomobject]@{ Code = $p.ExitCode; Out = $out.Result + $err.Result }
}
function Crucible([string[]]$Arguments, [hashtable]$Env = @{}) { Run $crucible $Arguments $Env }
function Ccx([string[]]$Arguments) { Run $ccx $Arguments }
function State { [IO.File]::ReadAllText((Join-Path $state 'state.json'), $utf8) | ConvertFrom-Json }
function Case([string]$Name, [scriptblock]$Body) {
  $script:total++
  try { & $Body; $script:passed++; Write-Output "PASS $Name" } catch { Write-Output "FAIL $Name :: $($_.Exception.Message)" }
}
function New-Brief([string]$TaskId, [string]$Owner, [string]$Type, [string]$Owns, [string]$Checks = '', [string]$Class = 'normal') {
  Write-File (Join-Path $repo "tasks/$TaskId.md") @"
---
crucible: brief
id: $TaskId
owner: $Owner
type: $Type
class: $Class
risk: low
owns: [$Owns]
checks: [$Checks]
---
# $TaskId synthetic brief

## Outcome
Synthetic outcome for a test.

## Status
![[Status/$TaskId]]
"@
}

try {
  $repo = Join-Path $scratch 'repo'; $state = Join-Path $scratch 'state'; $fake = Join-Path $scratch 'fakebin'
  $policyPath = Join-Path $scratch 'policy.json'
  foreach ($dir in @($repo, $state, $fake)) { [void][IO.Directory]::CreateDirectory($dir) }
  # Policy: the real one, with fake commands and a fake key so nothing real can run.
  $policyText = [IO.File]::ReadAllText((Join-Path $root 'ccx/policy.json'), $utf8)
  $policyText = $policyText.Replace('"envKey": "GEMINI_API_KEY"', '"envKey": "CRUCIBLE_FAKE_KEY"').Replace('"command": "claude.exe"', '"command": "claude.cmd"')
  Write-File $policyPath $policyText
  # Fakes: each logs its arguments, writes the deliverable it is told about, and prints its CLI's result shape.
  Write-File (Join-Path $fake 'fake.js') @'
const fs = require('fs'); const path = require('path');
const [kind, ...args] = process.argv.slice(2);
fs.appendFileSync(path.join(process.env.USERPROFILE, kind + '-args.log'), JSON.stringify(args) + '\n');
const mode = fs.existsSync('fake-mode.txt') ? fs.readFileSync('fake-mode.txt', 'utf8').trim() : 'ok';
if (mode === 'deliver') fs.writeFileSync('Reference/out.md', '# Out\n\n> "Synthetic source line" -- [src](../src.md)\n');
const report = 'Status: READY_FOR_CLAUDE_REVIEW\nNext owner: codex\n';
if (kind === 'gemini') {
  if (mode === 'quota') { console.log(JSON.stringify({ error: { message: 'Quota exceeded for quota metric' } })); process.exit(1); }
  console.log(JSON.stringify({ response: report, stats: { models: { m: { tokens: { prompt: 5, cached: 1, candidates: 2, thoughts: 0 } } } } }));
} else if (kind === 'claude') {
  console.log(JSON.stringify({ type: 'result', is_error: false, result: report, usage: { input_tokens: 3, output_tokens: 2 } }));
} else {
  const out = args[args.indexOf('--output-last-message') + 1];
  fs.writeFileSync(out, report);
  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 4, cached_input_tokens: 0, output_tokens: 1 } }));
}
'@
  foreach ($kind in @('gemini', 'codex', 'claude')) {
    Write-File (Join-Path $fake "$kind.cmd") "@echo off`r`n`"$node`" `"%~dp0fake.js`" $kind %*`r`n"
  }
  # The fixture repository: HANDOFF.md (the launcher requires it) and one source file to cite.
  Write-File (Join-Path $repo 'HANDOFF.md') "# Handoff`n"
  Write-File (Join-Path $repo '.gitignore') "/Status/`n/Microsoft/`n"
  Write-File (Join-Path $repo 'src.md') "Synthetic source line for citations.`n"
  [void][IO.Directory]::CreateDirectory((Join-Path $repo 'scripts')); Copy-Item (Join-Path $PSScriptRoot 'check-sources.mjs') (Join-Path $repo 'scripts/check-sources.mjs')
  [void][IO.Directory]::CreateDirectory((Join-Path $repo 'Reference'))
  & $git -C $repo init -q; & $git -C $repo -c user.email=t@t -c user.name=t add -A; & $git -C $repo -c user.email=t@t -c user.name=t commit -q -m init

  Case 'new creates a brief with frontmatter, owner and its Status embed' {
    $r = Crucible @('new', '-Title', 'Write a guide!', '-Owner', 'gemini')
    Assert ($r.Code -eq 0) $r.Out
    $text = [IO.File]::ReadAllText((Join-Path $repo 'tasks/WRITE-A-GUIDE.md'), $utf8)
    Assert ($text -match 'owner: gemini' -and $text -match 'type: source-research' -and $text -match '!\[\[Status/WRITE-A-GUIDE\]\]') 'brief content wrong'
    $again = Crucible @('new', '-Title', 'Write a guide!')
    Assert ($again.Out.Trim() -eq 'tasks/WRITE-A-GUIDE-2.md') "second brief did not get a new id: $($again.Out)"
  }

  Case 'Gemini-owned brief: launch, deliverable, check, verify, status' {
    New-Brief 'G1' 'gemini' 'source-research' 'Reference/out.md' 'sources'
    Write-File (Join-Path $repo 'fake-mode.txt') 'deliver'
    $r = Crucible @('launch', '-Note', 'tasks/G1.md')
    Remove-Item (Join-Path $repo 'fake-mode.txt')
    Assert ($r.Code -eq 0) $r.Out
    $task = (State).tasks.G1
    Assert ($task.owner -eq 'gemini' -and $task.lastDispatch.provider -eq 'gemini' -and $task.lastDispatch.exit -eq 0) ('gemini run not recorded: ' + (Get-ChildItem (Join-Path $scratch 'codex-captures') -Filter 'crucible-G1-*.log' | Get-Content -Raw))
    Assert ($task.lastDispatch.input -match '^[0-9a-f]{12}$' -and @($task.runs).Count -eq 1) 'input version or run trail missing'
    $args = Get-Content (Join-Path $scratch 'gemini-args.log') -Raw
    Assert ($args -match '"auto_edit"' -and $args -match '"--policy"' -and $args -notmatch 'yolo') "gemini flags wrong: $args"
    $toml = Get-ChildItem (Join-Path $scratch 'codex-captures') -Filter *.policy.toml | Select-Object -First 1
    Assert ($toml -and (Get-Content $toml.FullName -Raw) -match 'commandPrefix = "node scripts/check-sources.mjs"') 'permitted checks not passed to Gemini'
    $status = [IO.File]::ReadAllText((Join-Path $repo 'Status/G1.md'), $utf8)
    Assert ($status -match 'node scripts/check-sources.mjs "Reference/out.md"`: \*\*PASS\*\*') "check evidence missing: $status"
    Assert ($status -match '\(current\)' -and $status -match '\[\[Reference/out.md\]\]' -and $status -match 'Agent suggests next: codex') 'status note incomplete'
    Assert ($task.verification.status -eq 'PASS') ('ccx verify did not pass: ' + (Get-ChildItem (Join-Path $scratch 'codex-captures') -Filter 'crucible-G1-*.log' | Get-Content -Raw))
    Assert ([IO.File]::ReadAllText((Join-Path $repo 'Status/Board.md'), $utf8) -match '(?s)## Ready to review or resume.*G1') 'board does not list G1 for review'
  }

  Case 'writing another brief during a run is not a scope violation, other files still are' {
    New-Brief 'OTHER' 'codex' 'implement' 'other.txt'
    $verify = Ccx @('verify', '-TaskId', 'G1')
    Assert ($verify.Code -eq 0) "a new brief broke G1's scope: $($verify.Out)"
    Write-File (Join-Path $repo 'stray.txt') 'not owned'
    $verify = Ccx @('verify', '-TaskId', 'G1')
    Assert ($verify.Code -ne 0 -and $verify.Out -match 'FAIL scope stray.txt') "stray file not caught: $($verify.Out)"
    Remove-Item (Join-Path $repo 'stray.txt'), (Join-Path $repo 'tasks/OTHER.md')
  }

  Case 'a repeated launch of the same brief is refused' {
    $r = Crucible @('launch', '-Note', 'tasks/G1.md')
    Assert ($r.Code -eq 3 -and $r.Out -match 'already ran on this exact brief') "duplicate not refused: $($r.Code) $($r.Out)"
    Assert (@((State).tasks.G1.runs).Count -eq 1) 'duplicate launch dispatched'
  }

  Case 'a launch while a run is live is refused' {
    $me = Get-Process -Id $PID
    Write-File (Join-Path $repo 'Status/.runs/G1.json') (ConvertTo-Json @{ pid = $PID; ticks = $me.StartTime.ToUniversalTime().Ticks; startedAt = '2026-01-01T00:00:00Z'; owner = 'gemini' } -Compress)
    $r = Crucible @('launch', '-Note', 'tasks/G1.md', '-Again')
    Assert ($r.Code -eq 3 -and $r.Out -match 'already running') "live run not detected: $($r.Out)"
    Remove-Item (Join-Path $repo 'Status/.runs/G1.json')
  }

  Case 'an interrupted run shows on the board and can be resumed' {
    Write-File (Join-Path $repo 'Status/.runs/G1.json') '{"pid":999999,"ticks":1,"startedAt":"2026-01-01T00:00:00Z","owner":"gemini"}'
    $null = Crucible @('board')
    Assert ([IO.File]::ReadAllText((Join-Path $repo 'Status/Board.md'), $utf8) -match '(?s)## Needs you.*G1.*Interrupted') 'interrupted run not surfaced'
    $r = Crucible @('launch', '-Note', 'tasks/G1.md', '-Again')
    Assert ($r.Code -eq 0 -and @((State).tasks.G1.runs).Count -eq 2) "resume failed: $($r.Out)"
  }

  Case 'editing the brief marks the result stale' {
    Add-Content (Join-Path $repo 'tasks/G1.md') "`n## Answers`nUse the second source too.`n"
    $null = Crucible @('board')
    Assert ([IO.File]::ReadAllText((Join-Path $repo 'Status/G1.md'), $utf8) -match 'STALE') 'stale result not flagged'
    Assert ([IO.File]::ReadAllText((Join-Path $repo 'Status/Board.md'), $utf8) -match '(?s)## Needs you.*G1.*brief changed') 'stale result not on board'
  }

  Case 'switching owner hands the same task to Codex' {
    $text = [IO.File]::ReadAllText((Join-Path $repo 'tasks/G1.md'), $utf8).Replace('owner: gemini', 'owner: codex')
    Write-File (Join-Path $repo 'tasks/G1.md') $text
    $r = Crucible @('launch', '-Note', 'tasks/G1.md')
    Assert ($r.Code -eq 0) $r.Out
    $task = (State).tasks.G1
    Assert ($task.owner -eq 'codex' -and $task.lastDispatch.provider -eq 'openai' -and @($task.runs).Count -eq 3) 'handoff to codex failed'
    Assert (@($task.checkpoints | Where-Object { $_.note -eq 'Owner gemini -> codex' }).Count -eq 1) 'handoff not recorded'
    $status = [IO.File]::ReadAllText((Join-Path $repo 'Status/G1.md'), $utf8)
    Assert ($status -match 'run 1 \*\*gemini\*\*' -and $status -match 'run 3 \*\*codex\*\*') 'run trail lost an agent'
  }

  Case 'Claude-owned brief runs headless with edits and permitted checks only' {
    New-Brief 'C1' 'claude' 'docs' 'Reference/c1.md' 'sources'
    $r = Crucible @('launch', '-Note', 'tasks/C1.md')
    Assert ($r.Code -eq 0) $r.Out
    $args = Get-Content (Join-Path $scratch 'claude-args.log') -Raw
    Assert ($args -match '"acceptEdits"' -and $args -match 'Bash\(node scripts/check-sources.mjs:\*\)' -and $args -notmatch 'bypassPermissions') "claude flags wrong: $args"
    Assert ((State).tasks.C1.lastDispatch.provider -eq 'claude') 'claude run not recorded'
  }

  Case 'automatic owner uses the type default (Gemini for ux-review)' {
    New-Brief 'A1' 'auto' 'ux-review' 'Reference/a1.md'
    $r = Crucible @('launch', '-Note', 'tasks/A1.md')
    Assert ($r.Code -eq 0 -and (State).tasks.A1.owner -eq 'gemini') "auto owner wrong: $($r.Out)"
  }

  Case 'Gemini at its limit: blocker and next action are on the board, Codex is untouched' {
    New-Brief 'Q1' 'gemini' 'creative' 'Reference/q1.md'
    Write-File (Join-Path $repo 'fake-mode.txt') 'quota'
    $r = Crucible @('launch', '-Note', 'tasks/Q1.md')
    Remove-Item (Join-Path $repo 'fake-mode.txt')
    $s = State
    Assert ($s.tasks.Q1.lastDispatch.exit -eq 4 -and $s.providerLimits.gemini -and -not $s.agents.codex.unavailableUntil) 'gemini limit not recorded on gemini alone'
    Assert ([IO.File]::ReadAllText((Join-Path $repo 'Status/Board.md'), $utf8) -match '(?s)## Blocked.*Q1.*usage limit') 'limit blocker not on board'
    $again = Crucible @('launch', '-Note', 'tasks/Q1.md', '-Again')
    $status = [IO.File]::ReadAllText((Join-Path $repo 'Status/Board.md'), $utf8)
    Assert ($status -match '(?s)Q1.*refused before any agent started') "deferred launch not explained: $($again.Out)"
  }

  Case 'unsandboxed agents get only agent-safe checks and cannot write the launcher stack' {
    $toml = Get-ChildItem (Join-Path $scratch 'codex-captures') -Filter *.policy.toml | Sort-Object LastWriteTime | Select-Object -Last 1
    $text = Get-Content $toml.FullName -Raw
    Assert ($text -notmatch 'playwright|node --test') 'code-executing check offered to an unsandboxed agent'
    Assert ($text -match '(?s)write_file.*\\\.obsidian.*decision = "deny"') 'launcher stack not write-protected for Gemini'
    $claudeArgs = Get-Content (Join-Path $scratch 'claude-args.log') -Raw
    Assert ($claudeArgs -match 'Edit\(\.obsidian/\*\*\)' -and $claudeArgs -match 'Edit\(scripts/\*\*\)') "launcher stack not write-protected for Claude: $claudeArgs"
  }

  Case 'a brief may not own the launcher stack or cmd metacharacters' {
    New-Brief 'S1' 'gemini' 'creative' 'scripts/crucible.ps1'
    $r = Crucible @('launch', '-Note', 'tasks/S1.md')
    Assert ($r.Code -eq 2 -and $r.Out -match 'launcher stack') "protected path accepted: $($r.Out)"
    New-Brief 'S2' 'gemini' 'creative' 'Reference/a%PATH%b.md'
    $r = Crucible @('launch', '-Note', 'tasks/S2.md')
    Assert ($r.Code -eq 2 -and $r.Out -match 'cmd.exe would interpret') "cmd metacharacter accepted: $($r.Out)"
  }

  Case 'checks come from the launch, and code-executing checks never run on code the agent wrote' {
    New-Brief 'K1' 'codex' 'implement' 'lib/k1.js' 'lt-unit'
    $r = Crucible @('launch', '-Note', 'tasks/K1.md')
    Assert ($r.Code -eq 0) $r.Out
    $evidence = Get-Content (Join-Path $repo 'Status/.data/K1.json') -Raw | ConvertFrom-Json
    Assert (@($evidence.runs)[-1].checks[0].result -eq 'NOT RUN') 'lt-unit ran on agent-owned code'
  }

  Case 'routine Codex work keeps one agent and no review round' {
    $route = (Ccx @('route', '-Type', 'implement', '-Class', 'routine', '-Risk', 'low', '-Json')).Out | ConvertFrom-Json
    Assert ($route.agent -eq 'codex' -and (@($route.verification) -join ',') -eq 'deterministic') "routine route changed: $($route.agent) $($route.verification)"
  }

  Case 'Codex fallback to Gemini still works while Codex is out' {
    $s = Get-Content (Join-Path $state 'state.json') -Raw | ConvertFrom-Json
    $s.agents.codex.unavailableUntil = [DateTime]::UtcNow.AddHours(1).ToString('yyyy-MM-ddTHH:mm:ssZ')
    $s.PSObject.Properties.Remove('providerLimits')
    Write-File (Join-Path $state 'state.json') ($s | ConvertTo-Json -Depth 30)
    $route = (Ccx @('route', '-Type', 'implement', '-Class', 'normal', '-Risk', 'low', '-Json')).Out | ConvertFrom-Json
    Assert ($route.agent -eq 'codex' -and $route.provider -eq 'gemini') "fallback lost: $($route.provider)"
  }

  Case 'check-sources passes real passages and fails invented ones' {
    Write-File (Join-Path $repo 'Reference/good.md') "> `"Synthetic source line`" -- [src](../src.md)`n"
    Write-File (Join-Path $repo 'Reference/bad.md') "> `"A line nobody wrote`" -- [src](../src.md)`n"
    Write-File (Join-Path $repo 'Reference/none.md') "No citations here.`n"
    $sources = Join-Path $PSScriptRoot 'check-sources.mjs'
    Push-Location $repo
    try {
      & $node $sources 'Reference/good.md' | Out-Null; $good = $LASTEXITCODE
      & $node $sources 'Reference/bad.md' | Out-Null; $bad = $LASTEXITCODE
      & $node $sources 'Reference/none.md' | Out-Null; $none = $LASTEXITCODE
    } finally { Pop-Location }
    Assert ($good -eq 0 -and $bad -eq 1 -and $none -eq 1) "check-sources exits: $good $bad $none"
  }

  Case 'a brief in a private folder is never launched' {
    $policy = [IO.File]::ReadAllText($policyPath, $utf8) -replace '"excludePaths": \["nursing-a2/"\]', '"excludePaths": ["nursing-a2/", "private/"]'
    Write-File $policyPath $policy
    [void][IO.Directory]::CreateDirectory((Join-Path $repo 'private'))
    Copy-Item (Join-Path $repo 'tasks/A1.md') (Join-Path $repo 'private/P1.md')
    $text = [IO.File]::ReadAllText((Join-Path $repo 'private/P1.md'), $utf8).Replace('id: A1', 'id: P1')
    Write-File (Join-Path $repo 'private/P1.md') $text
    $r = Crucible @('launch', '-Note', 'private/P1.md')
    Assert ($r.Code -eq 2 -and $r.Out -match 'private folder' -and -not (State).tasks.P1) "private brief launched: $($r.Out)"
  }
} finally {
  Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
}
$clock.Stop()
Write-Output "$passed/$total passed in $([math]::Round($clock.Elapsed.TotalSeconds))s"
if ($passed -ne $total) { exit 1 }
