<#
Obsidian bridge for ccx. The repository root is the Obsidian vault: briefs are ordinary task files
(tasks/<ID>.md with crucible frontmatter), ccx state stays the record, and Status/ holds generated
views (gitignored) that the briefs embed. Windows PowerShell 5.1.

  crucible.ps1 new -Title <text> [-Owner auto|gemini|claude|codex] [-Type <ccx type>]
  crucible.ps1 launch -Note <brief path> [-Again]     register/sync with ccx, start one background run
  crucible.ps1 stop -Note <brief path>                stop that brief's running run
  crucible.ps1 board                                  rebuild Status/Board.md and Status/<ID>.md
  crucible.ps1 run -Id <id>                           (internal) the background run started by launch

Exit codes: 0 done; 2 bad brief or arguments; 3 refused as a duplicate (already running, or already
ran on this exact brief); 1 other failure.
#>
param(
  [Parameter(Position = 0)][ValidateSet('new', 'launch', 'stop', 'board', 'run', 'review-pack', 'types')] [string]$Command = 'board',
  [string]$Note, [string]$Title, [string]$Owner = 'auto', [string]$Type, [string]$Id, [switch]$Again, [string]$Owns,
  [string]$TaskId, [string]$Base
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ccx-core.ps1')
$utf8 = New-Object Text.UTF8Encoding $false
$root = [IO.Path]::GetFullPath((Get-CcxRepoRoot)).TrimEnd([char]92)
$statusDir = Join-Path $root 'Status'
$runsDir = Join-Path $statusDir '.runs'
$powershell = Join-Path $PSHOME 'powershell.exe'
$owners = @('gemini', 'claude', 'codex')

function Fail([string]$Message, [int]$Code = 2) { $e = New-Object Exception $Message; $e.Data['code'] = $Code; throw $e }
function Write-Text([string]$Path, [string]$Text) {
  [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Path))
  [IO.File]::WriteAllText($Path, $Text.Replace("`r`n", "`n"), $utf8)
}
function Get-Sha([string]$Path) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($Path))).Replace('-', '').Substring(0, 12).ToLowerInvariant() } finally { $sha.Dispose() }
}
function Get-RelPath([string]$Path) {
  $full = [IO.Path]::GetFullPath($(if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $root $Path }))
  if (-not $full.StartsWith($root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { Fail "Not inside the vault: $Path" }
  $full.Substring($root.TrimEnd('\').Length + 1).Replace('\', '/')
}

function Read-Brief([string]$Path) {
  # A small YAML subset: key: value, key: [a, b], or a block list of "- item" lines.
  $rel = Get-RelPath $Path
  $full = Join-Path $root $rel
  if (-not [IO.File]::Exists($full)) { Fail "Brief not found: $rel" }
  $text = [IO.File]::ReadAllText($full, $utf8)
  $m = [regex]::Match($text.TrimStart([char]0xFEFF), '^---\r?\n(.*?)\r?\n---\r?\n', 'Singleline')
  if (-not $m.Success) { Fail "No frontmatter in $rel. Start from Crucible: New brief." }
  $fm = @{}; $listKey = $null
  foreach ($line in ($m.Groups[1].Value -split '\r?\n')) {
    $clean = ($line -replace '\s+#.*$', '').TrimEnd()
    if (-not $clean.Trim()) { continue }
    if ($listKey -and $clean -match '^\s*-\s*(.+)$') { $fm[$listKey] = @($fm[$listKey]) + $Matches[1].Trim().Trim('"', "'"); continue }
    if ($clean -notmatch '^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$') { continue }
    $key = $Matches[1].ToLowerInvariant(); $value = $Matches[2].Trim(); $listKey = $null
    if ($value -match '^\[(.*)\]$') { $fm[$key] = @($Matches[1].Split(',') | ForEach-Object { $_.Trim().Trim('"', "'") } | Where-Object { $_ }) }
    elseif (-not $value) { $fm[$key] = @(); $listKey = $key }
    else { $fm[$key] = $value.Trim('"', "'") }
  }
  if (-not $fm.id) { $fm.id = [IO.Path]::GetFileNameWithoutExtension($rel) }
  $titleMatch = [regex]::Match($text, '(?m)^#\s+(.+)$')
  @{ rel = $rel; full = $full; text = $text; fm = $fm; title = $(if ($titleMatch.Success) { $titleMatch.Groups[1].Value.Trim() } else { $fm.id }) }
}

function Test-BriefType($Policy, [string]$Name) {
  # A type a launch can actually run: a worker, cheap or script route (not tool or premium), an agent the
  # launcher dispatches (not a Claude subagent or a cross-model review), and no approval gate.
  $t = $Policy.taskTypes[$Name]
  $t -and $t.route -in @('worker', 'cheap', 'script') -and $t.agent -notin @('claude-subagent', 'cross-model') -and
    -not @($t.gates | Where-Object { $_ }).Count
}

function Assert-BriefType($Policy, [string]$Type, [string]$Owner) {
  if (-not (Test-BriefType $Policy $Type)) {
    Fail ("type must be one of: " + (@($Policy.taskTypes.Keys | Where-Object { Test-BriefType $Policy $_ } | Sort-Object) -join ', '))
  }
  # Gemini and headless Claude run only worker routes (codex-dispatch.ps1, runnable check).
  if ($Owner -in @('gemini', 'claude') -and $Policy.taskTypes[$Type].route -ne 'worker') { Fail "type $Type runs on a $($Policy.taskTypes[$Type].route) route, which $Owner cannot take; choose owner codex or auto." }
}

function Test-Brief($Brief, $Policy) {
  $fm = $Brief.fm
  if ($fm.id -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$') { Fail "id '$($fm.id)' must be letters, digits, dot, dash or underscore (40 max)." }
  if (-not $fm.owner) { $fm.owner = 'auto' }
  if ($fm.owner -notin @('auto') + $owners) { Fail "owner must be auto, gemini, claude or codex (got '$($fm.owner)')." }
  if (-not $fm.type) { $fm.type = 'implement' }
  Assert-BriefType $Policy $fm.type $fm.owner
  if (-not $fm.class) { $fm.class = 'normal' }
  if (-not $fm.risk) { $fm.risk = 'low' }
  if (-not $Policy.classes.ContainsKey($fm.class) -or $fm.risk -notin $Policy.risk.levels) { Fail 'class or risk is not in ccx/policy.json.' }
  $fm.owns = @($fm.owns | Where-Object { $_ })
  if (-not $fm.owns.Count) { Fail 'owns: list the files or folders this task may change (the deliverable).' }
  foreach ($path in $fm.owns) {
    # ccx splits owns on commas (task add), so one brief entry must be one path (UPGRADE-3 review 1b).
    if ($path -match ',') { Fail "owns path '$path' has a comma; list each file or folder as its own entry." }
    # ccx trims list entries, so " scripts/ccx.ps1" would be stored as scripts/ccx.ps1 (review R2-1): refuse it.
    if ($path -cne $path.Trim()) { Fail "owns path '$path' has leading or trailing whitespace; remove it." }
    # Check the launcher overlap on the path ccx will store: 'scripts\ccx.ps1' is scripts/ccx.ps1 (review 1a), and a
    # folder written without '/' (lifting-tracker) is stored as a folder (review R2-2). The folder form also covers a
    # folder that does not exist yet; a file name with '/' appended overlaps nothing it should not.
    $normalized = ConvertTo-CcxOwnedPath $path -Policy $Policy
    $asFolder = $normalized.TrimEnd('/') + '/'
    # Owned paths reach a cmd.exe command line as check arguments: no cmd metacharacters.
    if ($path -match '[%^&!()<>|`]') { Fail "owns path '$path' has a character cmd.exe would interpret (% ^ & ! ( ) < > | backtick)." }
    # ...nor YAML flow or comment syntax: the brief stores owns as an inline [list], which these would break.
    if ($path -match '[#\[\]{}''"\u0085\u2028\u2029]' -or $path -match '^[@&*!|>?:-]') { Fail "owns path '$path' has a character YAML would misread (# [ ] { } quotes, or a leading @ & * ! | > ? : -). Rename the file or folder." }
    foreach ($protected in @($Policy.agentProtectedPaths)) {
      if ((Test-CcxPathOverlap $path $protected) -or (Test-CcxPathOverlap $normalized $protected) -or (Test-CcxPathOverlap $asFolder $protected)) { Fail "owns '$path' is the launcher stack ($protected). Change it from a terminal ccx task with a review, not from a brief." }
    }
  }
  $fm.checks = @($fm.checks | Where-Object { $_ })
  foreach ($check in $fm.checks) {
    if (-not $Policy.ContainsKey('checks') -or -not ($Policy.checks[$check] -is [Collections.IDictionary])) {
      Fail "check '$check' is not a permitted check (ccx/policy.json, checks)."
    }
  }
}

function Invoke-Ccx([string[]]$Arguments) {
  $ErrorActionPreference = 'Continue' # PS 5.1 turns a child's stderr into a terminating error under Stop
  $out = & $powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'ccx.ps1') @Arguments 2>&1 | Out-String
  @{ code = $LASTEXITCODE; out = $out.Trim() }
}

function Get-Run([string]$TaskId) {
  # The run file says a background run started; it counts as live only while its process is.
  $path = Join-Path $runsDir "$TaskId.json"
  if (-not [IO.File]::Exists($path)) { return $null }
  try { $run = [IO.File]::ReadAllText($path, $utf8) | ConvertFrom-Json } catch { return @{ path = $path; live = $false; startedAt = $null } }
  $live = $false
  if ($run.pid) {
    $p = Get-Process -Id ([int]$run.pid) -ErrorAction SilentlyContinue
    $live = $p -and ($p.StartTime.ToUniversalTime().Ticks -eq [long]$run.ticks)
  } elseif ($run.startedAt -and ([DateTime]::UtcNow - [DateTime]::Parse($run.startedAt).ToUniversalTime()).TotalSeconds -lt 60) {
    $live = $true # claimed a moment ago and still starting
  }
  @{ path = $path; live = [bool]$live; pid = $run.pid; startedAt = $run.startedAt; input = $run.input; log = $run.log; owner = $run.owner; checks = @($run.checks) }
}

function Invoke-New {
  if ([string]::IsNullOrWhiteSpace($Title)) { Fail 'new needs -Title.' }
  if ($Owner -notin @('auto') + $owners) { Fail 'Owner must be auto, gemini, claude or codex.' }
  $slug = (($Title.ToUpperInvariant() -replace '[^A-Z0-9]+', '-').Trim('-'))
  if ($slug.Length -gt 28) { $slug = $slug.Substring(0, 28).Trim('-') }
  if (-not $slug) { $slug = 'BRIEF' }
  $taskId = $slug; $n = 2
  $state = Get-CcxState
  # BOARD and TERMINAL are reserved: the board writes Status/Board.md and Status/Terminal.md (Codex UPGRADE-3 reviews).
  while ([IO.File]::Exists((Join-Path $root "tasks/$taskId.md")) -or $state.tasks.ContainsKey($taskId) -or $taskId -in @('BOARD', 'TERMINAL')) { $taskId = "$slug-$n"; $n++ }
  $briefType = if ($Type) { $Type } elseif ($Owner -eq 'gemini') { 'source-research' } else { 'implement' }
  $ownsLine = '[]'
  if ($Type -or $Owner -ne 'auto') { Assert-BriefType (Get-CcxPolicy) $briefType $Owner }
  if ($Owns) {
    # From the Obsidian modal: validate exactly as a launch would, before any file exists.
    if ($Owns -match ',') { Fail "owns path '$Owns' has a comma; give one file or folder." }
    Test-Brief @{ fm = @{ id = $taskId; owner = $Owner; type = $briefType; owns = @($Owns.Trim()); checks = @() } } (Get-CcxPolicy)
    $ownsLine = "[$($Owns.Trim())]"
  }
  $rel = "tasks/$taskId.md"
  Write-Text (Join-Path $root $rel) @"
---
crucible: brief
id: $taskId
owner: $Owner          # gemini | claude | codex | auto (ccx picks by type)
type: $briefType      # implement, debug, docs, source-research, creative, ux-review, ...
class: normal       # routine (one agent, deterministic checks) | normal | complex
risk: low
owns: $ownsLine            # files or folders this task may change, e.g. [Reference/My note.md]
checks: []          # permitted checks from ccx/policy.json: sources, lt-unit, lt-browser
---
# $Title

## Outcome
What should exist when this is done, and who it is for.

## Inputs
Links to the notes, files or recordings to use. Only shareable material: launching sends what the agent reads to its provider.

## Done When
-

## Answers
Replies to an agent's question go here; launching again sends them.

## Status
![[Status/$taskId]]
"@
  Write-Output $rel
}

function Invoke-Launch {
  $policy = Get-CcxPolicy
  $brief = Read-Brief $Note
  Test-Brief $brief $policy
  $fm = $brief.fm; $taskId = $fm.id
  foreach ($excluded in @($policy.privacy.excludePaths)) {
    if ($brief.rel.StartsWith($excluded, [StringComparison]::OrdinalIgnoreCase)) { Fail 'This brief is in a private folder (privacy.excludePaths) and is never sent to an agent.' }
  }
  if ($brief.rel -notmatch '^tasks/[^/]+\.md$') { Fail 'Briefs live directly in tasks/ (tasks/<ID>.md); move this one there to launch it.' }
  if ($brief.text -notmatch [regex]::Escape("![[Status/$taskId]]")) {
    [IO.File]::AppendAllText($brief.full, "`n## Status`n![[Status/$taskId]]`n", $utf8)
    $brief = Read-Brief $Note; Test-Brief $brief $policy; $fm = $brief.fm
  }
  [void][IO.Directory]::CreateDirectory($runsDir)
  # Claim the launch atomically: a second click, or a second Obsidian window, finds the claim.
  $runPath = Join-Path $runsDir "$taskId.json"
  $existing = Get-Run $taskId
  if ($existing -and $existing.live) { Fail "$taskId is already running (since $($existing.startedAt)). Nothing launched." 3 }
  if ($existing) {
    try { Remove-Item -LiteralPath $runPath -Force } catch { Fail "$taskId is being launched by another click. Nothing launched." 3 }
  }
  try { $claim = [IO.File]::Open($runPath, 'CreateNew', 'Write', 'None') } catch [IO.IOException] { Fail "$taskId is being launched by another click. Nothing launched." 3 }
  $launched = $false
  try {
    $inputSha = Get-Sha $brief.full
    $owner = $fm.owner
    if ($owner -eq 'auto') {
      $route = Invoke-Ccx @('route', '-Type', $fm.type, '-Class', $fm.class, '-Risk', $fm.risk, '-Json')
      $agent = try { ($route.out | ConvertFrom-Json).agent } catch { $null }
      $owner = if ($agent -in $owners) { $agent } else { 'claude' }
    }
    $state = Get-CcxState
    $task = if ($state.tasks.ContainsKey($taskId)) { $state.tasks[$taskId] } else { $null }
    if ($task -and $task.status -in @('done', 'abandoned')) { Fail "$taskId is $($task.status) in ccx. Save the brief under a new id to start new work." }
    if ($task -and -not $Again -and $task.lastDispatch -and $task.lastDispatch.endedAt -and $task.lastDispatch.input -eq $inputSha -and
        $task.owner -eq $owner -and $task.lastDispatch.exit -eq 0) {
      Fail "$taskId already ran on this exact brief ($($task.lastDispatch.endedAt)); see its Status. Edit the brief, or launch with -Again." 3
    }
    if (-not $task) {
      $add = Invoke-Ccx (@('task', 'add', '-Id', $taskId, '-Title', $brief.title, '-Type', $fm.type, '-Class', $fm.class, '-Risk', $fm.risk,
        '-Owner', $owner, '-Owns', ($fm.owns -join ','), '-TaskFile', $brief.rel))
      if ($add.code -ne 0) { Fail "ccx task add refused: $($add.out)" 1 }
    } else {
      if ($task.taskFile -and $task.taskFile -ne $brief.rel) { Fail "ccx task $taskId belongs to $($task.taskFile); give this brief another id." }
      # A brief never inherits a terminal task's launcher-stack ownership (UPGRADE-3 review 1c).
      foreach ($owned in @($task.owns)) {
        foreach ($protected in @($policy.agentProtectedPaths)) {
          if (Test-CcxPathOverlap $owned $protected) { Fail "ccx task $taskId owns $owned (launcher stack); a brief cannot run it. Give this brief another id." }
        }
      }
      if ($task.owner -ne $owner) {
        $sync = Invoke-Ccx @('task', 'update', '-Id', $taskId, '-Owner', $owner, '-Note', "Owner set from $($brief.rel)")
        if ($sync.code -ne 0) { Fail "ccx refused the owner change: $($sync.out)" 1 }
      }
    }
    $log = Join-Path (Join-Path $env:USERPROFILE 'codex-captures') ("crucible-$taskId-" + [DateTime]::Now.ToString('yyyyMMdd-HHmmss') + '.log')
    # The checks this launch approved: the run uses these, never the brief as it reads after the agent ran.
    $checks = @($fm.checks)
    $claimText = ConvertTo-Json @{ startedAt = Get-CcxNow; input = $inputSha; owner = $owner; log = $log; checks = $checks } -Compress
    $bytes = $utf8.GetBytes($claimText); $claim.Write($bytes, 0, $bytes.Length); $claim.Dispose(); $claim = $null
    if ($env:CRUCIBLE_INLINE -eq '1') {
      # Tests and debugging: run in this process, with this process's environment (CCX_STATE_DIR, PATH).
      [IO.File]::WriteAllText($runPath, (ConvertTo-Json @{ startedAt = Get-CcxNow; input = $inputSha; owner = $owner; log = $log; checks = $checks; pid = $PID; ticks = (Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks } -Compress), $utf8)
      $launched = $true
      $script:Id = $taskId
      Invoke-Run
      Write-Output "Ran $taskId inline with $owner (input $inputSha)."
      return
    }
    # Started as a triggerless per-user scheduled task so the run belongs to no caller's job object: closing
    # Obsidian (or the terminal that launched it) does not end the run. Not WMI: under Win32_Process.Create
    # agy's sandboxed shell fails with "Access is denied." (GEMINI-ACCESS-1). The run writes its own pid.
    # ponytail: one task definition per brief id is kept and overwritten on the next launch; prune \Crucible\ if it grows.
    $record = @{ startedAt = Get-CcxNow; input = $inputSha; owner = $owner; log = $log; checks = $checks }
    [IO.File]::WriteAllText($runPath, (ConvertTo-Json $record -Compress), $utf8)
    try {
      $action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" run -Id $taskId" -WorkingDirectory $root
      $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
      $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
      Register-ScheduledTask -TaskName "Run $taskId" -TaskPath '\Crucible\' -Action $action -Principal $principal -Settings $settings -Force -ErrorAction Stop | Out-Null
      Start-ScheduledTask -TaskName "Run $taskId" -TaskPath '\Crucible\' -ErrorAction Stop
    } catch { Fail "Could not start the background run (scheduled task: $($_.Exception.Message))." 1 }
    $launched = $true
    Write-Output "Launched $taskId with $owner (input $inputSha). Follow it in Status/$taskId."
  } finally {
    if ($claim) { $claim.Dispose() }
    if (-not $launched -and [IO.File]::Exists($runPath)) { Remove-Item -LiteralPath $runPath -Force -ErrorAction SilentlyContinue }
  }
  Invoke-Board
}

function Get-ProtectedHashes { Get-CcxProtectedHashes -Root $root }

function Invoke-Run {
  $runPath = Join-Path $runsDir "$Id.json"
  $run = Get-Run $Id
  $log = if ($run -and $run.log) { $run.log } else { Join-Path (Join-Path $env:USERPROFILE 'codex-captures') "crucible-$Id.log" }
  [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($log))
  $launchedAt = Get-CcxNow
  # A scheduled-task run records its own pid, so stop and the board can find it (GEMINI-ACCESS-1).
  if ($run -and -not $run.pid -and [IO.File]::Exists($runPath)) {
    try {
      $record = [IO.File]::ReadAllText($runPath, $utf8) | ConvertFrom-Json
      $record | Add-Member -NotePropertyName pid -NotePropertyValue $PID -Force
      $record | Add-Member -NotePropertyName ticks -NotePropertyValue (Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks -Force
      [IO.File]::WriteAllText($runPath, (ConvertTo-Json $record -Compress), $utf8)
    } catch { }
  }
  # A background run inherits the PATH from logon; a CLI installed since (agy) is only in the registry.
  # It may also lack the profile folders those entries are written with (%LOCALAPPDATA%\agy\bin).
  if (-not $env:LOCALAPPDATA) { $env:LOCALAPPDATA = [Environment]::GetFolderPath('LocalApplicationData') }
  if (-not $env:APPDATA) { $env:APPDATA = [Environment]::GetFolderPath('ApplicationData') }
  # This process's PATH stays first (an inline test run's fake CLIs must win); registry entries are only appended.
  $env:Path = (@($env:Path -split ';') + @([Environment]::GetEnvironmentVariable('Path', 'Machine'), [Environment]::GetEnvironmentVariable('Path', 'User')) |
    Where-Object { $_ } | ForEach-Object { $_ -split ';' } | Where-Object { $_ } | ForEach-Object { [Environment]::ExpandEnvironmentVariables($_) } | Select-Object -Unique) -join ';'
  Add-Content -LiteralPath $log -Value "agy on PATH: $([bool](Get-Command agy.exe -ErrorAction SilentlyContinue))" -Encoding utf8
  try {
    Invoke-Board
    $protectedBefore = Get-ProtectedHashes
    $dispatch = Join-Path $PSScriptRoot 'codex-dispatch.ps1'
    $ErrorActionPreference = 'Continue'
    & $powershell -NoProfile -ExecutionPolicy Bypass -File $dispatch -TaskId $Id *>&1 | Out-File -LiteralPath $log -Encoding utf8
    $exit = $LASTEXITCODE
    Add-Content -LiteralPath $log -Value "`n=== dispatch exit $exit ===" -Encoding utf8
    $task = Get-CcxTask -Id $Id
    $protectedAfter = Get-ProtectedHashes
    # Unconditional for brief runs: a brief can never own the launcher stack (Test-Brief, Invoke-Launch), so any
    # protected change here is tampering, and checks and verify must not run on it (UPGRADE-3 review 1c, fix 2).
    $tampered = @(Compare-CcxProtectedHashes $protectedBefore $protectedAfter)
    foreach ($path in $tampered) { Add-Content -LiteralPath $log -Value "PROTECTED FILE CHANGED DURING RUN: $path" -Encoding utf8 }
    $results = @()
    $policyNow = Get-CcxPolicy
    # Code-executing checks run on this machine, outside any sandbox: only when the task owns plain documents.
    $docOnly = -not @($task.owns | Where-Object { $_.EndsWith('/') -or $_ -notmatch '\.(md|txt|csv)$' }).Count
    # Only a Codex run (its own sandbox) may be followed by checks that execute repository code.
    $docOnly = $docOnly -and $task.lastDispatch -and $task.lastDispatch.provider -eq 'openai'
    # A changed launcher stack runs nothing more: no checks, no verify. The user reviews it first.
    foreach ($check in @($run.checks | Where-Object { $_ -and -not $tampered.Count })) {
      if (-not ($policyNow.checks[$check] -is [Collections.IDictionary])) { continue }
      if ($policyNow.checks[$check].agentSafe -eq $true -or $docOnly) { $results += Invoke-Check $check $task }
      else { $results += @{ name = $check; command = $policyNow.checks[$check].run; result = 'NOT RUN'; tail = 'The task owns files that can hold code; run this check from a terminal or a Codex verify run.' } }
    }
    $verify = $null
    if ($exit -eq 0 -and -not $tampered.Count) {
      $verify = Invoke-Ccx @('verify', '-TaskId', $Id)
      Add-Content -LiteralPath $log -Value "`n=== ccx verify exit $($verify.code) ===`n$($verify.out)" -Encoding utf8
    }
    $evidencePath = Join-Path $statusDir ".data/$Id.json"
    $previous = @()
    if ([IO.File]::Exists($evidencePath)) { try { $previous = @(([IO.File]::ReadAllText($evidencePath, $utf8) | ConvertFrom-Json).runs) } catch { } }
    # fresh: the agent actually started; otherwise the launcher refused first (route, ownership, busy, approval).
    $fresh = $task.lastDispatch -and [string]$task.lastDispatch.startedAt -ge $launchedAt
    $tail = Protect-CcxText ((@(Get-Content -LiteralPath $log -Encoding utf8 | Where-Object { $_.Trim() }) | Select-Object -Last 4) -join ' | ') -Full
    $entry = @{ dispatch = $task.lastDispatch.n; input = $task.lastDispatch.input; at = Get-CcxNow; exit = $exit; fresh = [bool]$fresh; tail = $tail; tampered = @($tampered); log = $log; checks = $results
      verify = $(if ($verify) { @{ code = $verify.code } } else { $null }) }
    Write-Text $evidencePath (ConvertTo-Json @{ runs = @(@($previous | Select-Object -Last 19) + @($entry)) } -Depth 6)
  } finally {
    Remove-Item -LiteralPath $runPath -Force -ErrorAction SilentlyContinue
    Invoke-Board
  }
}

function Invoke-Check([string]$Name, $Task) {
  $ErrorActionPreference = 'Continue'
  $spec = (Get-CcxPolicy).checks[$Name]
  $cwd = if ($spec.cwd) { Join-Path $root $spec.cwd } else { $root }
  $argText = ''
  if ($spec.args -eq 'files') {
    $argText = (@($Task.owns | Where-Object { $_ -like '*.md' } | ForEach-Object { '"' + $_ + '"' }) -join ' ')
  }
  $command = ($spec.run + ' ' + $argText).Trim()
  $out = & (Join-Path ([Environment]::SystemDirectory) 'cmd.exe') /d /c "cd /d `"$cwd`" && $command" 2>&1 | Out-String
  $code = $LASTEXITCODE
  $lines = @($out.Trim() -split '\r?\n' | Select-Object -Last 8)
  @{ name = $Name; command = $command; result = $(if ($code -eq 0) { 'PASS' } else { 'FAIL' }); code = $code; tail = (Protect-CcxText ($lines -join "`n") -Full) }
}

function Get-StopTaskState([string]$TaskName) {
  # 'Missing' when the task was never registered; any other scheduler error fails Stop (Codex narrow check).
  try { return [string](Get-ScheduledTask -TaskName $TaskName -TaskPath '\Crucible\' -ErrorAction Stop).State }
  catch {
    if ($_.CategoryInfo.Category -eq 'ObjectNotFound') { return 'Missing' }
    Fail "Could not ask Task Scheduler about ${TaskName}: $($_.Exception.Message)" 1
  }
}

function Invoke-Stop {
  $brief = Read-Brief $Note
  $run = Get-Run $brief.fm.id
  # A scheduled-task run records its pid a moment after it starts, rewriting its record in place, so a
  # missing or unreadable record is not proof of an end: wait for the pid, and ask Task Scheduler when
  # there is none. A scheduler that cannot be asked fails Stop rather than guessing (GEMINI-ACCESS-1, Codex reviews).
  $taskName = "Run $($brief.fm.id)"
  if (-not ($run -and $run.pid)) {
    if (-not $run -and (Get-StopTaskState $taskName) -ne 'Running') { Write-Output "$($brief.fm.id) is not running."; return }
    for ($i = 0; $i -lt 30 -and -not ($run -and $run.pid); $i++) { Start-Sleep -Seconds 1; $run = Get-Run $brief.fm.id }
  }
  if (-not ($run -and $run.pid)) {
    if ((Get-StopTaskState $taskName) -ne 'Running') { Write-Output "$($brief.fm.id) is not running."; return }
    try { Stop-ScheduledTask -TaskName $taskName -TaskPath '\Crucible\' -ErrorAction Stop } catch { Fail "Could not stop $($brief.fm.id): $($_.Exception.Message)" 1 }
    if ((Get-StopTaskState $taskName) -eq 'Running') { Fail "Could not stop $($brief.fm.id): its scheduled task is still running." 1 }
    Write-Output "$($brief.fm.id) never recorded its process; its scheduled task was stopped. Check Status before launching again."
    Invoke-Board; return
  }
  if (-not $run.live) { Write-Output "$($brief.fm.id) is not running."; return }
  & (Join-Path ([Environment]::SystemDirectory) 'taskkill.exe') /T /F /PID $run.pid | Out-Null
  # A failed kill keeps the record, so Status still shows the run and Stop can be retried.
  if ($LASTEXITCODE -ne 0 -and (Get-Process -Id ([int]$run.pid) -ErrorAction SilentlyContinue)) { Fail "Could not stop $($brief.fm.id) (taskkill exit $LASTEXITCODE); it is still running." 1 }
  $null = Invoke-Ccx @('task', 'update', '-Id', $brief.fm.id, '-Note', 'Run stopped from Obsidian; partial output kept in the capture.')
  Remove-Item -LiteralPath $run.path -Force -ErrorAction SilentlyContinue
  Write-Output "Stopped $($brief.fm.id). Partial output stays in its capture; launch again to resume."
  Invoke-Board
}

function Get-FileLink([string]$Path, $Task) {
  # A link that opens the right version: the task's worktree while it exists, else the vault copy.
  $clean = $Path.TrimEnd('/')
  if ($Task.worktree -and [IO.Directory]::Exists($Task.worktree)) {
    $full = Join-Path $Task.worktree $clean
    return "[$clean (worktree $($Task.branch))](<file:///$($full.Replace('\', '/'))>)"
  }
  if ($Path.EndsWith('/')) { return "``$Path``" }
  return "[[$clean]]"
}

function Read-Evidence([string]$TaskId) {
  $path = Join-Path $statusDir ".data/$TaskId.json"
  if (-not [IO.File]::Exists($path)) { return @() }
  try { return @(([IO.File]::ReadAllText($path, $utf8) | ConvertFrom-Json).runs) } catch { return @() }
}

function Get-Report($Run) {
  if (-not $Run -or -not $Run.capture) { return $null }
  $file = $Run.capture + '.report.md'
  if ([IO.File]::Exists($file)) { return [IO.File]::ReadAllText($file, $utf8).Trim() }
  return $null
}

function Invoke-ReviewPack {
  if ($TaskId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}\z' -or
      $TaskId -match '^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])\.') { Fail 'review-pack needs a safe -TaskId.' }
  if ([string]::IsNullOrWhiteSpace($Base)) { Fail 'review-pack needs -Base <commit ref>.' }
  $task = (Get-CcxState).tasks[$TaskId]
  if (-not $task) { Fail "Unknown task: $TaskId" }
  $expected = if ($task.worktree) { $task.worktree } else { Get-CcxMainRoot -Root $root }
  if ($root -ne [IO.Path]::GetFullPath($expected).TrimEnd([char]92)) { Fail "Run review-pack from the task checkout: $expected" }

  try { $baseSha = (Invoke-CcxGit -Root $root -Arguments @('rev-parse', '--verify', '--end-of-options', "${Base}^{commit}")).Trim() }
  catch { Fail "Invalid base commit ref: $Base" }
  $headSha = (Invoke-CcxGit -Root $root -Arguments @('rev-parse', '--verify', 'HEAD^{commit}')).Trim()
  $range = "$baseSha..$headSha"
  $paths = (Invoke-CcxGit -Root $root -Arguments @('diff', '--name-only', $range, '--')).TrimEnd("`r", "`n")
  $handoff = [IO.File]::ReadAllText((Join-Path $root 'HANDOFF.md'), $utf8)
  $critique = [regex]::Match($handoff, '(?ms)^### Plan critique \(Claude\)[ \t]*\r?\n.*?(?=^#{1,3} |\z)')
  if (-not $critique.Success) { Fail 'HANDOFF.md is missing the Plan critique (Claude) section.' }

  $runs = @($task.runs)
  [array]::Reverse($runs)
  $report = $null
  foreach ($run in (@($task.lastDispatch) + $runs)) {
    try { $report = Get-Report $run } catch [IO.IOException], [UnauthorizedAccessException] { continue }
    if ($report) { break }
  }
  $untested = if ($report) {
    ([regex]::Matches($report, '(?im)^[ \t*-]*Untested[ \t*]*:[^\r\n]*') | ForEach-Object { $_.Value }) -join "`n"
  }
  if (-not $untested) { $untested = if ($report) { 'No Untested lines in the latest readable report.' } else { 'No readable report recorded.' } }
  $checklistPath = 'Reference/Review checklist.md'
  $checklist = if ([IO.File]::Exists((Join-Path $root $checklistPath))) {
    [IO.File]::ReadAllText((Join-Path $root $checklistPath), $utf8)
  } else { "Missing: $checklistPath" }

  $pack = @("# Review pack: $($task.id)", '', "Title: $($task.title)", "Task file: $($task.taskFile)", "Range: $range",
    '', '## Changed paths', '', $(if ($paths) { $paths -replace '(?m)^', '- ' } else { 'None.' }),
    '', '## Plan critique', '', $critique.Value.TrimEnd(), '', '## Untested', '', $untested,
    '', '## Review checklist', '', $checklist, '')
  $destination = "handoffs/$TaskId-review.md"
  Write-Text (Join-Path $root $destination) ($pack -join "`n")
  Write-Output $destination
}

function Get-TaskView($Task, $State, $Policy) {
  # Everything the board and the status note say about one task, derived only from ccx state, the brief and git.
  $briefFile = if ($Task.taskFile) { Join-Path $root $Task.taskFile } else { $null }
  $currentInput = if ($briefFile -and [IO.File]::Exists($briefFile)) { Get-Sha $briefFile } else { $null }
  $last = $Task.lastDispatch
  $run = Get-Run $Task.id
  $report = Get-Report $last
  $stale = $last -and $last.input -and $currentInput -and $last.input -ne $currentInput
  $nextLine = if ($report) { [regex]::Match($report, '(?im)^[ \t*-]*(?:Next owner|Next)[ \t*]*:[ \t*]*(.+)$') } else { $null }
  $evidence = Read-Evidence $Task.id
  $tamperedPaths = if ($evidence) { @($evidence[-1].tampered | Where-Object { $_ }) } else { @() }
  $refused = if ($evidence -and -not $evidence[-1].fresh -and $evidence[-1].exit -ne 0) { $evidence[-1] } else { $null }
  $approvals = @($State.approvals.Values | Where-Object { $_.status -eq 'pending' -and ($_.target -ceq $Task.id -or $_.taskId -ceq $Task.id) })
  $isBrief = $briefFile -and [IO.File]::Exists($briefFile) -and ([IO.File]::ReadAllText($briefFile, $utf8)).Contains("![[Status/$($Task.id)]]")
  $view = @{ brief = $isBrief; task = $Task; run = $run; report = $report; stale = $stale; input = $currentInput; approvals = $approvals; bucket = 'progress'; next = '' }
  if ($tamperedPaths.Count -and -not ($run -and $run.live)) { $view.bucket = 'needs'; $view.next = "SECURITY: the last run changed protected launcher files ($($tamperedPaths -join ', ')). Checks and verify were skipped. Review and undo them (git diff) before running anything else." }
  elseif ($run -and $run.live) { $view.bucket = 'running'; $view.next = "Wait: $($run.owner) is working (started $($run.startedAt))." }
  elseif ($run -and -not $run.live) { $view.bucket = 'needs'; $view.next = 'Interrupted: the run stopped without finishing. Partial output is in its capture; launch again to resume.' }
  elseif ($Task.status -eq 'done') { $view.bucket = 'done'; $view.next = 'Done.' }
  elseif ($Task.status -eq 'abandoned') { $view.bucket = 'done'; $view.next = 'Abandoned.' }
  elseif ($approvals.Count) { $view.bucket = 'needs'; $view.next = "Approve in a terminal: $(($approvals | ForEach-Object { 'scripts\ccx.ps1 approve -Id ' + $_.id }) -join '; ')" }
  elseif ($stale) { $view.bucket = 'needs'; $view.next = "The brief changed after the last run (input $($last.input) -> $currentInput): launch again so the result answers the current brief." }
  elseif ($refused) { $view.bucket = 'blocked'; $view.next = "The last launch was refused before any agent started (exit $($refused.exit)): $($refused.tail)" }
  elseif ($last -and $last.exit -eq 4) {
    $until = if ($last.provider -eq 'openai') { $State.agents.codex.unavailableUntil } elseif ($State.ContainsKey('providerLimits')) { $State.providerLimits[$last.provider] } else { $null }
    $when = if ($until) { 'until ' + [DateTime]::Parse($until).ToLocalTime().ToString('ddd HH:mm') } else { '' }
    $view.bucket = 'blocked'
    $view.next = "$($Task.owner) hit its usage limit $when. Outputs written so far are kept. Launch again after that, or change owner: in the brief and launch now."
  }
  elseif ($last -and $last.status -eq 'BLOCKED') { $view.bucket = 'needs'; $view.next = 'The agent is blocked and asked something (see report). Answer under ## Answers in the brief and launch again.' }
  elseif ($last -and $last.endedAt -and $last.exit -eq 0 -and $last.status -in @('READY_FOR_CLAUDE_REVIEW', 'NONE', 'PARTIAL')) {
    $view.bucket = 'review'
    $view.next = if ($Task.verification -and $Task.verification.status -eq 'PASS') { 'Ready to review: open the outputs below; a second agent reviews before ccx task done.' } else { 'Ready to review, but ccx verify has not passed yet.' }
  } elseif ($last -and $last.endedAt) { $view.bucket = 'blocked'; $view.next = "Last run ended with exit $($last.exit) ($($last.status)). Read the report, fix the brief, then launch again." }
  elseif ($Task.status -eq 'blocked') { $view.bucket = 'blocked'; $view.next = 'Blocked: see the latest checkpoint.' }
  elseif (-not $last) { $view.next = 'Not launched yet: run Crucible: Launch brief on the brief.' }
  if (-not $isBrief -and $view.bucket -in @('progress', 'blocked', 'review')) {
    $view.bucket = 'other'; $view.next = "ccx status $($Task.status), updated $($Task.updated); managed from a terminal."
  }
  $otherBriefs = @($last.briefsChanged | Where-Object { $_ })
  if ($last -and $otherBriefs.Count -and $view.bucket -ne 'done') { $view.next += " Briefs changed while it ran: $($otherBriefs -join ', '); if you did not edit them, read them before launching." }
  if ($nextLine -and $nextLine.Success -and $view.bucket -in @('review', 'progress')) { $view.next += " Agent suggests next: $($nextLine.Groups[1].Value.Trim())" }
  $view
}

function Invoke-Board {
  $policy = Get-CcxPolicy
  $state = Get-CcxState
  [void][IO.Directory]::CreateDirectory($statusDir)
  $views = @($state.tasks.Values | Sort-Object { $_.updated } -Descending | ForEach-Object { Get-TaskView $_ $state $policy })
  $recent = [DateTime]::UtcNow.AddDays(-7)
  foreach ($view in $views) {
    $task = $view.task
    if (-not $view.brief -or $task.id -in @('Board', 'Terminal')) { continue }
    if ($task.status -in @('done', 'abandoned') -and [DateTime]::Parse($task.updated).ToUniversalTime() -lt $recent) { continue }
    Write-Text (Join-Path $statusDir "$($task.id).md") (Format-StatusNote $view)
  }
  $section = {
    param([string]$Heading, [string]$Bucket, [string]$Empty)
    $rows = if ($Bucket -eq 'terminal') {
      @($views | Where-Object { -not $_.brief -and $_.task.status -notin @('done', 'abandoned') })
    } else {
      @($views | Where-Object { $_.brief -and $_.bucket -eq $Bucket -and ($Bucket -ne 'done' -or [DateTime]::Parse($_.task.updated).ToUniversalTime() -ge $recent) })
    }
    $lines = @("## $Heading")
    if (-not $rows.Count) { $lines += "_$($Empty)_" }
    foreach ($v in $rows) {
      $name = if ($v.task.taskFile) { "[[$($v.task.taskFile -replace '\.md$', '')|$($v.task.id)]]" } else { $v.task.id }
      $lines += "- **$name** ($($v.task.owner)) $($v.task.title): $($v.next)"
    }
    ($lines -join "`n") + "`n"
  }
  $pending = @($state.approvals.Values | Where-Object { $_.status -eq 'pending' })
  $actions = @($state.notifications | Where-Object {
    $_.level -eq 'action' -and -not $_.ack -and
      (-not $_.taskId -or $state.tasks[$_.taskId].status -notin @('done', 'abandoned'))
  } | Select-Object -Last 5)
  $board = @("# Board", "_Generated $([DateTime]::Now.ToString('yyyy-MM-dd HH:mm')) from ccx state. Edit briefs, not this note._", '')
  $board += & $section 'Needs you' 'needs' $(if ($pending.Count) { 'No brief is waiting on you; approvals below.' } else { 'Nothing waiting on you.' })
  if ($pending.Count) {
    $board += '**Approvals (terminal only; Obsidian never approves):**'
    $board += @($pending | ForEach-Object { "- $($_.id) $($_.level) $($_.action) $($_.target): ``powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 approve -Id $($_.id)``" })
    $board += ''
  }
  $board += & $section 'Running' 'running' 'Nothing running.'
  $board += & $section 'Ready to review or resume' 'review' 'Nothing to review.'
  $board += & $section 'Blocked' 'blocked' 'Nothing blocked.'
  $board += & $section 'In progress' 'progress' 'Nothing else open.'
  $board += & $section 'Done this week' 'done' 'Nothing finished this week.'
  $board += '[[Status/Terminal|Terminal tasks and notices]]'
  $terminal = @('# Terminal tasks and notices', '', (& $section 'Other open ccx tasks (not briefs)' 'terminal' 'None.'), '## ccx notices')
  if ($actions.Count) { $terminal += @($actions | ForEach-Object { "- $($_.id): $($_.text)" }) } else { $terminal += '_None._' }
  Write-Text (Join-Path $statusDir 'Terminal.md') ($terminal -join "`n")
  Write-Text (Join-Path $statusDir 'Board.md') ($board -join "`n")
}

function Format-StatusNote($View) {
  $task = $View.task; $last = $task.lastDispatch
  $out = @("> [!info] $($task.id): $($task.status), owner **$($task.owner)**", "> $($View.next)", '')
  $out += "_Generated $([DateTime]::Now.ToString('yyyy-MM-dd HH:mm')) from ccx state; edit the brief, not this note._"
  $out += ''
  $out += "**Input version:** $($View.input)" + $(if ($View.stale) { ' (STALE: the last result answered ' + $last.input + ')' } elseif ($last -and $last.input) { ' (current)' } else { '' })
  $out += ''
  $out += '### Outputs'
  foreach ($path in @($task.owns)) {
    $full = Join-Path $root $path.TrimEnd('/')
    $exists = [IO.File]::Exists($full) -or [IO.Directory]::Exists($full) -or ($task.worktree -and [IO.Directory]::Exists($task.worktree))
    $commit = (Invoke-CcxGit -Root $root -Arguments @('log', '-1', '--format=%h %cs', '--', $path.TrimEnd('/'))).Trim()
    $out += "- $(Get-FileLink $path $task)" + $(if (-not $exists) { ' (not created yet)' } elseif ($commit) { " (last commit $commit)" } else { ' (uncommitted)' })
  }
  $evidence = @(Read-Evidence $task.id | Where-Object { $_.fresh -ne $false })
  $out += ''
  $out += '### Evidence'
  if ($task.verification) { $out += "- ccx verify: **$($task.verification.status)**$(if ($task.verification.full) { ' (full)' }) at $($task.verification.at)" }
  $latest = if ($evidence) { $evidence[-1] } else { $null }
  if ($latest) {
    foreach ($c in @($latest.checks)) {
      $out += "- check ``$($c.command)``: **$($c.result)** (run $($latest.dispatch), input $($latest.input))"
      if ($c.tail) { $out += '  ```'; $out += @($c.tail -split "`n" | ForEach-Object { '  ' + $_ }); $out += '  ```' }
    }
    $out += "- Run log: [$([IO.Path]::GetFileName($latest.log))](<file:///$(([string]$latest.log).Replace('\', '/'))>)"
  }
  foreach ($r in @($task.reviews)) {
    $changedAfter = @($task.owns | Where-Object {
      $f = Join-Path $root $_.TrimEnd('/'); [IO.File]::Exists($f) -and [IO.File]::GetLastWriteTimeUtc($f) -gt [DateTime]::Parse($r.at).ToUniversalTime()
    }).Count
    $out += "- $($r.kind) by $($r.by): **$($r.result)** at $($r.at)$(if ($changedAfter) { ' (STALE: outputs changed after this review)' }) $($r.note)"
  }
  if (-not $task.verification -and -not $latest -and -not @($task.reviews).Count) { $out += '- none yet' }
  $out += ''
  $out += '### Runs'
  $runs = @($task.runs | Where-Object { $_ })
  if (-not $runs.Count -and $last) { $runs = @($last) }
  if (-not $runs.Count) { $out += '- none yet' }
  $number = 0
  foreach ($r in $runs) {
    $number++
    $agent = if ($r.provider -and $r.provider -ne 'openai') { $r.provider } else { 'codex' }
    # A run cut off by a usage limit or a timeout has no report; its stderr capture is the partial output.
    $evidenceFile = if ($r.capture -and [IO.File]::Exists($r.capture + '.report.md')) { @('report', $r.capture + '.report.md') }
                    elseif ($r.capture -and [IO.File]::Exists($r.capture + '.stderr.log')) { @('no report; stderr', $r.capture + '.stderr.log') } else { $null }
    $out += "- run $number **$agent** $($r.model) $($r.role) ($($r.startedAt)): exit $($r.exit), $($r.status), $($r.durationSec)s, input $($r.input)" +
      $(if (@($r.briefsChanged | Where-Object { $_ }).Count) { ' **Briefs changed during this run (check them): ' + (@($r.briefsChanged) -join ', ') + '**' } else { '' }) +
      $(if ($evidenceFile) { " ([$($evidenceFile[0])](<file:///$(([string]$evidenceFile[1]).Replace('\', '/'))>))" } else { '' })
  }
  if ($View.report) {
    $out += ''
    $out += '### Latest report'
    $out += @($View.report -split '\r?\n' | ForEach-Object { '> ' + $_ })
  }
  $out += ''
  $out += '### History'
  $out += @($task.checkpoints | Select-Object -Last 8 | ForEach-Object { "- $($_.at) $($_.note)" })
  ($out -join "`n") + "`n"
}

try {
  switch ($Command) {
    'new' { Invoke-New }
    'launch' { if (-not $Note) { Fail 'launch needs -Note <brief path>.' }; Invoke-Launch }
    'stop' { if (-not $Note) { Fail 'stop needs -Note <brief path>.' }; Invoke-Stop }
    'board' { Invoke-Board; Write-Output 'Board updated: Status/Board.md' }
    'review-pack' { Invoke-ReviewPack }
    'types' {
      # Types a brief may use (Test-BriefType, the rule a launch applies).
      $policy = Get-CcxPolicy
      @($policy.taskTypes.Keys | Where-Object { Test-BriefType $policy $_ } | Sort-Object) | ForEach-Object { Write-Output $_ }
    }
    'run' { if ($Id -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$') { Fail 'run needs -Id.' }; Invoke-Run }
  }
  exit 0
} catch {
  Write-Output $_.Exception.Message
  $code = if ($_.Exception.Data.Contains('code')) { [int]$_.Exception.Data['code'] } elseif ($_.Exception.Data.Contains('ccxExit')) { 2 } else { 1 }
  exit $code
}
