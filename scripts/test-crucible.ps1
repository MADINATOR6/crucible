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
# Codex's sandbox can deny TEMP (FRICTION.md 2026-11-12): fall back to the gitignored .test-scratch here.
$scratchParent = $env:TEMP
try { $probe = Join-Path $env:TEMP ('crucible-probe-' + [Guid]::NewGuid().ToString('N')); [void][IO.Directory]::CreateDirectory($probe); [IO.Directory]::Delete($probe) }
catch { $scratchParent = Join-Path $root '.test-scratch' }
$scratch = Join-Path $scratchParent ('crucible-t-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
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
  $policyText = $policyText.Replace('"command": "agy.exe"', '"command": "agy.cmd"').Replace('"command": "claude.exe"', '"command": "claude.cmd"')
  Write-File $policyPath $policyText
  # Fakes: each logs its arguments, writes the deliverable it is told about, and prints its CLI's result shape.
  Write-File (Join-Path $fake 'fake.js') @'
const fs = require('fs'); const path = require('path');
const [kind, ...args] = process.argv.slice(2);
fs.appendFileSync(path.join(process.env.USERPROFILE, kind + '-args.log'), JSON.stringify(args) + '\n');
const mode = fs.existsSync('fake-mode.txt') ? fs.readFileSync('fake-mode.txt', 'utf8').trim() : 'ok';
if (mode === 'tamper') {
  fs.mkdirSync('Scripts', { recursive: true });
  fs.writeFileSync('Scripts/planted.ps1', 'x');
  fs.mkdirSync('.obsidian/plugins/crucible', { recursive: true });
  fs.writeFileSync('.obsidian/plugins/crucible/main.js', 'x');
}
if (mode === 'deliver') {
  fs.writeFileSync('Reference/out.md', '# Out\n\n> "Synthetic source line" -- [src](../src.md)\n');
  // Simulate Obsidian saving its tab layout during the agent run.
  fs.mkdirSync('.obsidian', { recursive: true });
  fs.writeFileSync('.obsidian/workspace.json', '{"active":"synthetic"}');
}
const report = 'Status: READY_FOR_CLAUDE_REVIEW\nNext owner: codex\n';
if (kind === 'agy') {
  if (mode === 'quota') { console.log(JSON.stringify({ status: 'ERROR', error: { message: 'RESOURCE_EXHAUSTED: quota exceeded. Please retry in 2h5m.' } })); process.exit(1); }
  console.log(JSON.stringify({ status: 'SUCCESS', response: report, usage: { input_tokens: 5, cache_read_tokens: 1, output_tokens: 2, thinking_tokens: 0 } }));
} else if (kind === 'gemini') {
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
  foreach ($kind in @('agy', 'gemini', 'codex', 'claude')) {
    Write-File (Join-Path $fake "$kind.cmd") "@echo off`r`n`"$node`" `"%~dp0fake.js`" $kind %*`r`n"
  }
  # The fixture repository: HANDOFF.md (the launcher requires it) and one source file to cite.
  Write-File (Join-Path $repo 'HANDOFF.md') "# Handoff`n"
  Write-File (Join-Path $repo '.gitignore') "/Status/`n/Microsoft/`n/.obsidian/workspace.json`n"
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
  Case 'new validates a launch-ready brief' {
    $types = Crucible @('types')
    Assert ($types.Code -eq 0 -and $types.Out -match '(?m)^docs\r?$' -and $types.Out -notmatch '(?m)^(media-generate|test)\r?$') "types list wrong: $($types.Out)"
    $r = Crucible @('new', '-Title', 'Typed brief', '-Owner', 'claude', '-Type', 'docs', '-Owns', 'Reference/My note.md')
    Assert ($r.Code -eq 0) $r.Out
    $brief = Join-Path $repo 'tasks/TYPED-BRIEF.md'
    $text = [IO.File]::ReadAllText($brief, $utf8)
    Assert ($text -match 'type: docs' -and $text -match 'owns: \[Reference/My note\.md\]') "typed brief frontmatter wrong: $text"
    # Gemini review of UPGRADE-2A: types a launch refuses, YAML metacharacters, unvalidated -Type, owner/route mismatch.
    Assert ($types.Out -notmatch '(?m)^(plan|architecture|extract|review)\r?$') "types offers unlaunchable types: $($types.Out)"
    foreach ($bad in @(@('-Type', 'media-generate', '-Owns', 'Reference/x.md'), @('-Type', 'docs', '-Owns', 'scripts/x.ps1'), @('-Type', 'docs', '-Owns', 'a.md,b.md'),
                       @('-Type', 'media-generate'), @('-Type', 'plan'), @('-Owner', 'claude', '-Type', 'research', '-Owns', 'Reference/x.md'),
                       @('-Type', 'docs', '-Owns', 'Reference/a #b.md'), @('-Type', 'docs', '-Owns', 'AGENTS.md] #x'), @('-Type', 'docs', '-Owns', "'AGENTS.md'"),
                       @('-Type', 'docs', '-Owns', 'Reference/doc[1].md'), @('-Type', 'docs', '-Owns', 'Reference/{a}.md'))) {
      $refused = Crucible (@('new', '-Title', 'Refused brief') + $bad)
      Assert ($refused.Code -ne 0 -and -not [IO.File]::Exists((Join-Path $repo 'tasks/REFUSED-BRIEF.md'))) "bad brief was created: $($bad -join ' ') -> $($refused.Out)"
    }
    [IO.File]::Delete($brief)
  }

  Case 'Gemini-owned brief: launch, deliverable, layout save, check, verify, status' {
    New-Brief 'G1' 'gemini' 'source-research' 'Reference/out.md' 'sources'
    Write-File (Join-Path $repo 'fake-mode.txt') 'deliver'
    $r = Crucible @('launch', '-Note', 'tasks/G1.md')
    Remove-Item (Join-Path $repo 'fake-mode.txt')
    Assert ($r.Code -eq 0) $r.Out
    $task = (State).tasks.G1
    Assert ($task.owner -eq 'gemini' -and $task.lastDispatch.provider -eq 'gemini' -and $task.lastDispatch.exit -eq 0) ('gemini run not recorded: ' + (Get-ChildItem (Join-Path $scratch 'codex-captures') -Filter 'crucible-G1-*.log' | Get-Content -Raw))
    Assert ($task.lastDispatch.input -match '^[0-9a-f]{12}$' -and @($task.runs).Count -eq 1) 'input version or run trail missing'
    $args = Get-Content (Join-Path $scratch 'agy-args.log') -Raw
    Assert ($args -match '"accept-edits"' -and $args -match '"--sandbox"' -and $args -match '"--settings"' -and $args -notmatch 'dangerously') "agy flags wrong: $args"
    Assert ($args -match '"--model","gemini-4-neon-medium"' -and $args -notmatch '"--effort"') "normal Gemini brief should route to gemini-4-neon-medium without conflicting --effort: $args"
    $settings = Get-ChildItem (Join-Path $scratch 'codex-captures') -Filter *.settings.json | Select-Object -First 1
    $settingsText = Get-Content $settings.FullName -Raw
    $agySettings = $settingsText | ConvertFrom-Json
    # UPGRADE-3 (user decision 2026-11-26): the shell is allowed inside agy's read-only sandbox; credit purchases stay off.
    Assert ($agySettings.useG1Credits -eq $false -and @($agySettings.permissions.allow) -contains 'command(*)' -and $agySettings.enableTerminalSandbox -eq $true) 'agy must keep its sandbox, allow the sandboxed shell and disable credit purchases'
    Assert ($args -match 'read-only and offline.*start HEAD [0-9a-f]+ and initial git status') "sandboxed-shell prompt or Git baseline missing: $args"
    $status = [IO.File]::ReadAllText((Join-Path $repo 'Status/G1.md'), $utf8)
    Assert ($status -match 'node scripts/check-sources.mjs "Reference/out.md"`: \*\*PASS\*\*') "check evidence missing: $status"
    Assert ($status -match '\(current\)' -and $status -match '\[\[Reference/out.md\]\]' -and $status -match 'Agent suggests next: codex') 'status note incomplete'
    Assert ($task.verification.status -eq 'PASS') ('ccx verify did not pass: ' + (Get-ChildItem (Join-Path $scratch 'codex-captures') -Filter 'crucible-G1-*.log' | Get-Content -Raw))
    Assert ([IO.File]::ReadAllText((Join-Path $repo 'Status/Board.md'), $utf8) -match '(?s)## Ready to review or resume.*G1') 'board does not list G1 for review'
  }

  Case 'Gemini routes by class to tiered Antigravity models and escalates effort' {
    $rRoutine = (Ccx @('route', '-Type', 'source-research', '-Class', 'routine', '-Json')).Out | ConvertFrom-Json
    $rNormal = (Ccx @('route', '-Type', 'source-research', '-Class', 'normal', '-Json')).Out | ConvertFrom-Json
    $rComplex = (Ccx @('route', '-Type', 'source-research', '-Class', 'complex', '-Json')).Out | ConvertFrom-Json
    $rCritical = (Ccx @('route', '-Type', 'source-research', '-Class', 'critical', '-Json')).Out | ConvertFrom-Json
    $rRetry = (Ccx @('route', '-Type', 'source-research', '-Class', 'normal', '-Attempt', '2', '-Json')).Out | ConvertFrom-Json
    $rRoutineRetry = (Ccx @('route', '-Type', 'source-research', '-Class', 'routine', '-Attempt', '2', '-Json')).Out | ConvertFrom-Json
    Assert ($rRoutine.model -eq 'gemini-3.8-flash-low' -and $rRoutine.effort -eq 'low') "routine Gemini route wrong: $($rRoutine | ConvertTo-Json -Compress)"
    Assert ($rNormal.model -eq 'gemini-4-neon-medium' -and $rNormal.effort -eq 'medium') "normal Gemini route wrong: $($rNormal | ConvertTo-Json -Compress)"
    Assert ($rComplex.model -eq 'gemini-4-neon-high' -and $rComplex.effort -eq 'high') "complex Gemini route wrong: $($rComplex | ConvertTo-Json -Compress)"
    Assert ($rCritical.model -eq 'gemini-4-neon-xhigh' -and $rCritical.effort -eq 'xhigh') "critical Gemini route wrong: $($rCritical | ConvertTo-Json -Compress)"
    Assert ($rRetry.model -eq 'gemini-4-neon-high' -and $rRetry.effort -eq 'high') "normal retry escalation did not upgrade Gemini model tier: $($rRetry | ConvertTo-Json -Compress)"
    Assert ($rRoutineRetry.model -eq 'gemini-3.8-flash-medium' -and $rRoutineRetry.effort -eq 'medium') "routine retry escalation did not upgrade Gemini model tier: $($rRoutineRetry | ConvertTo-Json -Compress)"
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
    # The fake Codex must have answered: a nonzero exit here once meant the real codex.cmd ran (PATH order).
    Assert ($task.lastDispatch.exit -eq 0 -and (Get-Content (Join-Path $scratch 'codex-args.log') -Raw)) "Codex run did not use the fake CLI: exit $($task.lastDispatch.exit)"
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
    $settings = Get-ChildItem (Join-Path $scratch 'codex-captures') -Filter *.settings.json | Sort-Object LastWriteTime | Select-Object -Last 1
    $text = Get-Content $settings.FullName -Raw
    Assert ($text -notmatch 'command\([^)]*(playwright|node --test)') 'code-executing check offered to Gemini'
    # Deny paths are absolute since UPGRADE-3 (agy's sandbox rejects relative ones).
    $denies = @(($text | ConvertFrom-Json).permissions.deny)
    Assert (@($denies | Where-Object { $_ -match '^write_file\(.*[\\/]\.obsidian[\\/]\)$' }).Count -and @($denies | Where-Object { $_ -match '^write_file\(.*[\\/]scripts[\\/]\)$' }).Count -and
      -not @($denies | Where-Object { -not [IO.Path]::IsPathRooted(($_ -replace '^write_file\((.*)\)$', '$1')) }).Count -and $text -notmatch 'edit_file') "launcher stack not write-protected with absolute agy paths: $($denies -join '; ')"
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
    # Gemini review of UPGRADE-3: a backslash path, a comma-smuggled scalar, and a terminal task that owns the launcher.
    New-Brief 'S3' 'gemini' 'creative' 'scripts\crucible.ps1'
    $r = Crucible @('launch', '-Note', 'tasks/S3.md')
    Assert ($r.Code -eq 2 -and $r.Out -match 'launcher stack') "backslash launcher path accepted: $($r.Out)"
    Write-File (Join-Path $repo 'tasks/S4.md') "---`ncrucible: brief`nid: S4`nowner: gemini`ntype: creative`nowns: Reference/s4.md,scripts/`n---`n# S4`n`n## Status`n![[Status/S4]]`n"
    $r = Crucible @('launch', '-Note', 'tasks/S4.md')
    Assert ($r.Code -eq 2 -and $r.Out -match 'comma') "comma-smuggled owns accepted: $($r.Out)"
    Assert (-not (State).tasks.S4) 'comma-smuggled brief was registered'
    Assert ((Ccx @('task', 'add', '-Id', 'S5', '-Title', 'Terminal launcher task', '-Type', 'implement', '-Class', 'normal', '-Risk', 'low', '-Owner', 'gemini', '-Owns', 'scripts/', '-TaskFile', 'tasks/S5.md')).Code -eq 0) 'could not register the terminal task'
    New-Brief 'S5' 'gemini' 'creative' 'Reference/s5.md'
    $r = Crucible @('launch', '-Note', 'tasks/S5.md')
    Assert ($r.Code -ne 0 -and $r.Out -match 'launcher stack') "brief inherited a terminal task's launcher ownership: $($r.Out)"
    # Round 2: a quoted leading space (ccx would trim it) and a folder written without '/' (ccx would add it).
    Write-File (Join-Path $repo 'tasks/S6.md') "---`ncrucible: brief`nid: S6`nowner: gemini`ntype: creative`nowns: `" scripts/ccx.ps1`"`n---`n# S6`n`n## Status`n![[Status/S6]]`n"
    $r = Crucible @('launch', '-Note', 'tasks/S6.md')
    Assert ($r.Code -eq 2 -and $r.Out -match 'whitespace' -and -not (State).tasks.S6) "space-padded launcher path accepted: $($r.Out)"
    # Codex review of UPGRADE-3 (fixed in UPGRADE-3R): Windows PowerShell 5.1 must read the line-break check as
    # intended. U+2028 is refused; a euro sign is an ordinary character. Built with [char], never typed literally.
    $lsep = [string][char]0x2028; $euro = [string][char]0x20AC
    $r = Crucible @('new', '-Title', 'Line separator', '-Type', 'docs', '-Owns', "Reference/a${lsep}b.md")
    Assert ($r.Code -ne 0 -and -not [IO.File]::Exists((Join-Path $repo 'tasks/LINE-SEPARATOR.md'))) "U+2028 in owns accepted: $($r.Out)"
    $r = Crucible @('new', '-Title', 'Euro sign', '-Type', 'docs', '-Owns', "Reference/cost${euro}.md")
    Assert ($r.Code -eq 0 -and [IO.File]::Exists((Join-Path $repo 'tasks/EURO-SIGN.md'))) "an ordinary non-ASCII file name was refused: $($r.Out)"
    [IO.File]::Delete((Join-Path $repo 'tasks/EURO-SIGN.md'))
    # The board owns Status/Terminal.md: a brief titled Terminal gets another id.
    $r = Crucible @('new', '-Title', 'Terminal')
    Assert ($r.Code -eq 0 -and $r.Out.Trim() -ne 'tasks/TERMINAL.md' -and -not [IO.File]::Exists((Join-Path $repo 'tasks/TERMINAL.md'))) "a brief took the reserved TERMINAL id: $($r.Out)"
    New-Brief 'S7' 'gemini' 'creative' 'lifting-tracker'
    $r = Crucible @('launch', '-Note', 'tasks/S7.md')
    Assert ($r.Code -eq 2 -and $r.Out -match 'launcher stack' -and -not (State).tasks.S7) "folder without '/' covering protected files accepted: $($r.Out)"
  }

  Case 'checks come from the launch, and code-executing checks never run on code the agent wrote' {
    New-Brief 'K1' 'codex' 'implement' 'lib/k1.js' 'lt-unit'
    $r = Crucible @('launch', '-Note', 'tasks/K1.md')
    Assert ($r.Code -eq 0) $r.Out
    $evidence = Get-Content (Join-Path $repo 'Status/.data/K1.json') -Raw | ConvertFrom-Json
    Assert (@($evidence.runs)[-1].checks[0].result -eq 'NOT RUN') 'lt-unit ran on agent-owned code'
  }

  Case 'a run that changes the launcher stack (any letter case) skips checks and verify and is flagged' {
    New-Brief 'T1' 'gemini' 'creative' 'Reference/t1.md' 'sources'
    $s = Get-Content (Join-Path $state 'state.json') -Raw | ConvertFrom-Json
    $s.PSObject.Properties.Remove('providerLimits')
    Write-File (Join-Path $state 'state.json') ($s | ConvertTo-Json -Depth 30)
    Write-File (Join-Path $repo 'fake-mode.txt') 'tamper'
    $r = Crucible @('launch', '-Note', 'tasks/T1.md')
    Remove-Item (Join-Path $repo 'fake-mode.txt')
    $evidence = @((Get-Content (Join-Path $repo 'Status/.data/T1.json') -Raw | ConvertFrom-Json).runs)[-1]
    Assert (@($evidence.tampered) -contains 'scripts/planted.ps1' -and @($evidence.tampered) -contains '.obsidian/plugins/crucible/main.js' -and -not @($evidence.checks).Count -and -not $evidence.verify) "tampering not caught: $($r.Out)"
    Assert ((State).tasks.T1.lastDispatch.exit -eq 9) 'the launcher did not fail the run that changed protected files'
    Assert ([IO.File]::ReadAllText((Join-Path $repo 'Status/Board.md'), $utf8) -match '(?s)## Needs you.*T1.*SECURITY') 'tampering not on the board'
    Remove-Item -Recurse (Join-Path $repo 'Scripts\planted.ps1')
    Remove-Item -LiteralPath (Join-Path $repo '.obsidian/plugins/crucible/main.js')
  }

  Case 'routine Codex work keeps one agent and no review round' {
    # implement now defaults to Gemini with a review (GEMINI-PRIMARY); debug still defaults to Codex.
    $route = (Ccx @('route', '-Type', 'debug', '-Class', 'routine', '-Risk', 'low', '-Json')).Out | ConvertFrom-Json
    Assert ($route.agent -eq 'codex' -and (@($route.verification) -join ',') -eq 'deterministic') "routine route changed: $($route.agent) $($route.verification)"
  }

  Case 'Codex fallback to Gemini still works while Codex is out' {
    $s = Get-Content (Join-Path $state 'state.json') -Raw | ConvertFrom-Json
    $s.agents.codex.unavailableUntil = [DateTime]::UtcNow.AddHours(1).ToString('yyyy-MM-ddTHH:mm:ssZ')
    $s.PSObject.Properties.Remove('providerLimits')
    Write-File (Join-Path $state 'state.json') ($s | ConvertTo-Json -Depth 30)
    $route = (Ccx @('route', '-Type', 'debug', '-Class', 'normal', '-Risk', 'low', '-Json')).Out | ConvertFrom-Json
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
  Case 'board separates briefs from terminal work' {
    New-Brief 'TERMINAL' 'codex' 'implement' 'Reference/terminal.md'
    $s = State
    $updated = [DateTime]::UtcNow.ToString('o')
    foreach ($entry in @(
      @{ id = 'TERMINAL'; status = 'planned'; taskFile = 'tasks/TERMINAL.md' },
      @{ id = 'CLI-OPEN'; status = 'active' },
      @{ id = 'CLI-DONE'; status = 'done' },
      @{ id = 'CLI-ABANDONED'; status = 'abandoned' }
    )) {
      $entry.updated = $updated
      $entry.owner = 'codex'
      $entry.title = $entry.id
      $s.tasks | Add-Member -NotePropertyName $entry.id -NotePropertyValue $entry
    }
    $s.approvals | Add-Member -NotePropertyName 'BOARD-APPROVAL' -NotePropertyValue @{
      id = 'BOARD-APPROVAL'; action = 'push'; level = 'L4'; status = 'pending'; target = 'CLI-OPEN'
    }
    $s.notifications = @(
      @{ id = 'EXTRA-NOTICE'; level = 'action'; text = 'older extra' }
      1..5 | ForEach-Object { @{ id = "KEEP-NOTICE-$_"; level = 'action'; text = 'open notice'; taskId = 'NO-MATCH' } }
      @{ id = 'DONE-NOTICE'; level = 'action'; taskId = 'CLI-DONE' }
      @{ id = 'ABANDONED-NOTICE'; level = 'action'; taskId = 'CLI-ABANDONED' }
      @{ id = 'ACK-NOTICE'; level = 'action'; ack = $true }
      @{ id = 'INFO-NOTICE'; level = 'info' }
    )
    Write-File (Join-Path $state 'state.json') ($s | ConvertTo-Json -Depth 30)
    $r = Crucible @('board')
    Assert ($r.Code -eq 0) $r.Out
    $board = [IO.File]::ReadAllText((Join-Path $repo 'Status/Board.md'), $utf8)
    $terminal = [IO.File]::ReadAllText((Join-Path $repo 'Status/Terminal.md'), $utf8)
    Assert ($board -match '\|TERMINAL\]\]' -and $board -match 'BOARD-APPROVAL' -and
      $board -notmatch '\*\*CLI-OPEN\*\*|ccx notices|KEEP-NOTICE' -and
      $board.TrimEnd().EndsWith('[[Status/Terminal|Terminal tasks and notices]]')) 'board rows, approvals or footer wrong'
    Assert ($terminal.StartsWith('# Terminal tasks and notices') -and $terminal -match '\*\*CLI-OPEN\*\*.*Approve in a terminal' -and
      $terminal -notmatch 'CLI-DONE|CLI-ABANDONED|EXTRA-NOTICE|DONE-NOTICE|ABANDONED-NOTICE|ACK-NOTICE|INFO-NOTICE' -and
      ([regex]::Matches($terminal, 'KEEP-NOTICE-')).Count -eq 5) 'terminal tasks or filtered notices wrong'
  }

  Case 'review pack uses explicit commit range and recorded evidence' {
    $base = (& $git -C $repo rev-parse HEAD).Trim()
    Write-File (Join-Path $repo 'HANDOFF.md') "# Handoff`n`n### Plan critique (Claude)`n`n1. Synthetic critique.`n`n### Worked examples`nExcluded example.`n"
    Write-File (Join-Path $repo 'review-output.md') 'Committed review output.'
    & $git -C $repo add -- review-output.md
    & $git -C $repo -c user.email=t@t -c user.name=t commit -q -m review-output
    Assert ($LASTEXITCODE -eq 0) 'could not commit synthetic review output'
    $head = (& $git -C $repo rev-parse HEAD).Trim()
    $s = State
    $task = $s.tasks.G1
    $capture = Join-Path $scratch 'older-review.log'
    Write-File "$capture.report.md" "Status: READY_FOR_CLAUDE_REVIEW`nUntested: synthetic device check`n"
    $task.runs = @(@{ capture = $capture })
    $task.lastDispatch.capture = Join-Path $scratch 'missing-review.log'
    $stateFile = Join-Path $state 'state.json'
    Write-File $stateFile ($s | ConvertTo-Json -Depth 30)
    $checklist = Join-Path $repo 'Reference/Review checklist.md'
    Write-File $checklist '- Synthetic review criterion.'
    $destination = Join-Path $repo 'handoffs/G1-review.md'
    $argsForPack = @('review-pack', '-TaskId', 'G1')
    $r = Crucible ($argsForPack + @('-Base', 'HEAD~1'))
    Assert ($r.Code -eq 0) $r.Out
    $pack = [IO.File]::ReadAllText($destination, $utf8)
    Assert ($pack.Contains("Range: $base..$head") -and $pack.Contains('Task file: tasks/G1.md') -and
      $pack.Contains("Title: $($task.title)") -and $pack.Contains('- review-output.md') -and
      $pack.Contains('1. Synthetic critique.') -and -not $pack.Contains('Excluded example.') -and
      $pack.Contains('Untested: synthetic device check') -and $pack.Contains('- Synthetic review criterion.')) 'review evidence wrong'
    Remove-Item -LiteralPath $checklist
    $r = Crucible ($argsForPack + @('-Base', $base))
    Assert ($r.Code -eq 0) $r.Out
    $pack = [IO.File]::ReadAllText($destination, $utf8)
    Assert ($pack.Contains('Missing: Reference/Review checklist.md')) 'missing checklist not reported'
    foreach ($badBase in @(@{ args = @() }, @{ args = @('-Base', 'missing-ref') }, @{ args = @('-Base', 'HEAD:review-output.md') })) {
      $r = Crucible ($argsForPack + $badBase.args)
      Assert ($r.Code -ne 0 -and [IO.File]::ReadAllText($destination, $utf8) -ceq $pack) 'bad base overwrote valid pack'
    }
    $task.worktree = Join-Path $scratch 'another-checkout'
    Write-File $stateFile ($s | ConvertTo-Json -Depth 30)
    $r = Crucible ($argsForPack + @('-Base', $base))
    Assert ($r.Code -ne 0 -and $r.Out -match 'task checkout' -and
      [IO.File]::ReadAllText($destination, $utf8) -ceq $pack) 'wrong checkout overwrote valid pack'
  }
} finally {
  # Delete only this run's own folder under the chosen parent (TEMP or .test-scratch), as the other suites do.
  $actual = [IO.Path]::GetFullPath($scratch).TrimEnd('\')
  if ((Split-Path $actual -Parent) -ieq [IO.Path]::GetFullPath($scratchParent).TrimEnd('\') -and (Split-Path $actual -Leaf) -cmatch '^crucible-t-[0-9a-f]{8}$') {
    Remove-Item -LiteralPath $actual -Recurse -Force -ErrorAction SilentlyContinue
  } else { Write-Output "NOT REMOVED: scratch path $actual is outside $scratchParent" }
}
$clock.Stop()
Write-Output "$passed/$total passed in $([math]::Round($clock.Elapsed.TotalSeconds))s"
if ($passed -ne $total) { exit 1 }
