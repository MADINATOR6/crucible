<#
Regression tests for sync-mirror.ps1 on Windows PowerShell 5.1.
Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-sync-mirror.ps1
Synthetic repositories and child OneDrive/TEMP paths stay under TEMP\ccx-t3.
#>
$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'sync-mirror.ps1'
$scratch = [IO.Path]::GetFullPath((Join-Path $env:TEMP 'ccx-t3')).TrimEnd('\')
$fakeDrive = Join-Path $scratch 'OneDrive'
$childTemp = Join-Path $scratch 'temp'
$realOneDrive = $env:OneDrive
$utf8 = New-Object Text.UTF8Encoding($false)
$powershell = Join-Path $PSHOME 'powershell.exe'
$passed = 0
$total = 0
$skipped = 0
$ownsScratch = $false
$clock = [Diagnostics.Stopwatch]::StartNew()

function Assert([bool]$Condition, [string]$Reason) {
  if (-not $Condition) { throw $Reason }
}
function Quote-Ps([string]$Value) { return "'" + $Value.Replace("'", "''") + "'" }
function Write-Utf8File([string]$Path, [string]$Value) { [IO.File]::WriteAllText($Path, $Value, $utf8) }
function New-Directory([string]$Path) { [void][IO.Directory]::CreateDirectory($Path) }
function Check-NoLinks([string]$Path) {
  $cursor = [IO.Path]::GetFullPath($Path)
  while ($cursor) {
    if (Test-Path -LiteralPath $cursor) {
      Assert (-not ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) "SAFETY: linked test path $cursor"
    }
    $cursor = [IO.Path]::GetDirectoryName($cursor)
  }
}
function Run-Process([string]$File, [string]$Arguments, [string]$Cwd, [bool]$UnsetDrive = $false) {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $File
  $info.Arguments = $Arguments
  $info.WorkingDirectory = $Cwd
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.RedirectStandardInput = $true
  $info.StandardOutputEncoding = $utf8
  $info.StandardErrorEncoding = $utf8
  $info.EnvironmentVariables['OneDrive'] = $fakeDrive
  if ($UnsetDrive) { $info.EnvironmentVariables.Remove('OneDrive') }
  $info.EnvironmentVariables['TEMP'] = $childTemp
  $info.EnvironmentVariables['TMP'] = $childTemp
  # Keep inherited Git overrides from redirecting synthetic Git operations.
  foreach ($key in @($info.EnvironmentVariables.Keys)) {
    if ($key -like 'GIT_*') { $info.EnvironmentVariables.Remove($key) }
  }
  $info.EnvironmentVariables['GIT_CONFIG_NOSYSTEM'] = '1'
  $info.EnvironmentVariables['GIT_CONFIG_GLOBAL'] = Join-Path $scratch 'no-global-config'
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $info
  try {
    [void]$process.Start()
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    # Hang guard only; a child mirror run takes several seconds on a busy machine.
    if (-not $process.WaitForExit(60000)) { throw "Child timed out: $File" }
    return [pscustomobject]@{ Code = $process.ExitCode; Out = $stdout.Result; Err = $stderr.Result }
  } finally {
    if ($process.Id -and -not $process.HasExited) {
      # The child may exit first; taskkill's error must not mask the original failure.
      try { $ErrorActionPreference = 'Continue'; & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /T /F /PID $process.Id *> $null } catch { }
      [void]$process.WaitForExit(3000)
    }
    $process.Dispose()
  }
}
function Run-Git([string[]]$Arguments) {
  $quoted = ($Arguments | ForEach-Object { '"' + (($_ -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"' }) -join ' '
  $r = Run-Process 'git.exe' $quoted $scratch
  Assert ($r.Code -eq 0) "git $($Arguments -join ' ') failed: $($r.Err)"
}
function Run-Mirror([string]$Cwd, [string]$Flags = '', [switch]$UnsetDrive) {
  Assert ($Flags -in @('', '-Create', '-DryRun', '-Create -DryRun')) 'unexpected test flags'
  Check-NoLinks $fakeDrive
  $guard = if ($UnsetDrive) {
    "if (`$env:OneDrive) { throw 'SAFETY: OneDrive must be unset' };"
  } else {
    "if (`$env:OneDrive -cne $(Quote-Ps $fakeDrive)) { throw 'SAFETY: unexpected OneDrive' };"
  }
  $command = "`$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = New-Object Text.UTF8Encoding(`$false); Set-Location -LiteralPath $(Quote-Ps $Cwd); $guard & $(Quote-Ps $launcher) $Flags; exit `$LASTEXITCODE"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
  $r = Run-Process $powershell ('-NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + $encoded) $Cwd ([bool]$UnsetDrive)
  Assert ($r.Err -notmatch 'SAFETY:') $r.Err
  Assert (@(Get-ChildItem -LiteralPath $childTemp -Force).Count -eq 0) 'staging files remained after child exit'
  return $r
}
function Check-Result($Result, [int]$Code, [string]$Pattern) {
  Assert ($Result.Code -eq $Code) "expected exit $Code, got $($Result.Code): $($Result.Out) $($Result.Err)"
  Assert ($Result.Out -match $Pattern) "missing '$Pattern': $($Result.Out) $($Result.Err)"
}
function Case([string]$Name, [scriptblock]$Body) {
  $script:total++
  try {
    & $Body
    $script:passed++
    Write-Output "PASS $Name"
  } catch {
    $message = ($_.Exception.Message -replace '\s+', ' ').Trim()
    if ($message -like 'SKIP:*') {
      $script:total--; $script:skipped++
      Write-Output "SKIP ${Name}: $($message.Substring(5).Trim())"
    } else { Write-Output "FAIL ${Name}: $message" }
  }
}
function Snapshot([string]$Path) {
  return (@(Get-ChildItem -LiteralPath $Path -Recurse -Force | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($Path.Length)
    if ($_.PSIsContainer) { 'D ' + $relative } else { 'F ' + $relative + ' ' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
  }) -join "`n")
}

try {
  # Abort before any case if the prospective OneDrive can alias the real one.
  Check-NoLinks $scratch
  $fakeFull = [IO.Path]::GetFullPath($fakeDrive).TrimEnd('\')
  Assert ($fakeFull.StartsWith($scratch + '\', [StringComparison]::OrdinalIgnoreCase)) 'SAFETY: fake OneDrive outside scratch'
  if ($realOneDrive) {
    $realFull = [IO.Path]::GetFullPath($realOneDrive).TrimEnd('\')
    Assert ($fakeFull -ine $realFull -and -not $fakeFull.StartsWith($realFull + '\', [StringComparison]::OrdinalIgnoreCase)) 'SAFETY: test OneDrive resolves inside real OneDrive'
    Assert (-not $scratch.StartsWith($realFull + '\', [StringComparison]::OrdinalIgnoreCase) -and $scratch -ine $realFull) 'SAFETY: scratch is inside real OneDrive'
  }
  Assert (-not (Test-Path -LiteralPath $scratch)) "Scratch already exists; inspect it before retrying: $scratch"
  New-Directory $scratch
  $ownsScratch = $true
  New-Directory $childTemp
  New-Directory $fakeDrive
  $parent = Join-Path $fakeDrive 'AgentWorkspace'
  New-Directory $parent
  $repoName = 'repo ' + [char]0x00e9 + " [1]'s"
  $repo = Join-Path $scratch $repoName
  New-Directory $repo
  Run-Git @('init', $repo)
  Run-Git @('-C', $repo, 'config', 'user.name', 'Synthetic Test')
  Run-Git @('-C', $repo, 'config', 'user.email', 'test@example.test')
  Write-Utf8File (Join-Path $repo '.gitignore') "ignored.txt`nsecrets/`n"
  Write-Utf8File (Join-Path $repo 'readme.txt') 'committed content'
  Write-Utf8File (Join-Path $repo 'obsolete.txt') 'remove next commit'
  $unicodeName = 'caf' + [char]0x00e9 + '.txt'
  Write-Utf8File (Join-Path $repo $unicodeName) ('content ' + [char]0x00e9)
  foreach ($name in @('.env', '.env.local', 'x.pem', 'y.key')) { Write-Utf8File (Join-Path $repo $name) 'synthetic excluded content' }
  New-Directory (Join-Path $repo 'node_modules')
  Write-Utf8File (Join-Path $repo 'node_modules\package.txt') 'excluded module'
  Run-Git @('-C', $repo, 'add', '.')
  Run-Git @('-C', $repo, 'commit', '-m', 'synthetic baseline')
  Write-Utf8File (Join-Path $repo 'ignored.txt') 'synthetic secret'
  New-Directory (Join-Path $repo 'secrets')
  Write-Utf8File (Join-Path $repo 'secrets\fake.json') '{"synthetic":true}'
  Write-Utf8File (Join-Path $repo 'untracked.txt') 'not committed'
  Write-Utf8File (Join-Path $repo 'readme.txt') 'uncommitted content'
  $dest = Join-Path $parent $repoName
  $other = Join-Path $parent 'other'
  New-Directory $other
  Write-Utf8File (Join-Path $other 'keep.txt') 'sibling sentinel'

  Case 'OneDrive unset' {
    Check-Result (Run-Mirror $repo -UnsetDrive) 0 'SKIPPED: OneDrive not set\.'
    Assert (-not (Test-Path -LiteralPath $dest)) 'destination created'
  }
  Case 'missing destination skips without creation' {
    $before = Snapshot $fakeDrive
    Check-Result (Run-Mirror $repo) 0 'SKIPPED: no mirror at .*Pass -Create to start one\.'
    Assert ((Snapshot $fakeDrive) -ceq $before) 'OneDrive changed'
  }
  Case 'Create with DryRun creates nothing' {
    $before = Snapshot $fakeDrive
    Check-Result (Run-Mirror $repo '-Create -DryRun') 0 'MIRROR OK \(robocopy [0-7]\)'
    Assert ((Snapshot $fakeDrive) -ceq $before) 'dry run changed OneDrive'
  }
  Case 'Create copies committed files' {
    Check-Result (Run-Mirror $repo '-Create') 0 'MIRROR OK \(robocopy [0-7]\)'
    Assert ([IO.File]::ReadAllText((Join-Path $dest 'readme.txt')) -ceq 'committed content') 'committed content missing'
  }
  Case 'ignored untracked and uncommitted content excluded' {
    foreach ($name in @('ignored.txt', 'secrets', 'untracked.txt', '.git')) {
      Assert (-not (Test-Path -LiteralPath (Join-Path $dest $name))) "$name leaked"
    }
    Assert ([IO.File]::ReadAllText((Join-Path $dest 'readme.txt')) -ceq 'committed content') 'working edit leaked'
  }
  Case 'committed sensitive patterns and node_modules excluded' {
    foreach ($name in @('.env', '.env.local', 'x.pem', 'y.key', 'node_modules')) {
      Assert (-not (Test-Path -LiteralPath (Join-Path $dest $name))) "$name copied"
    }
  }
  Case 'non-ASCII repo and file names preserved' {
    Assert ([IO.File]::ReadAllText((Join-Path $dest $unicodeName), $utf8) -ceq ('content ' + [char]0x00e9)) 'non-ASCII file missing or corrupt'
  }
  Case 'committed deletion removes old mirror file' {
    Run-Git @('-C', $repo, 'rm', 'obsolete.txt')
    Run-Git @('-C', $repo, 'commit', '-m', 'synthetic deletion')
    Check-Result (Run-Mirror $repo) 0 'MIRROR OK'
    Assert (-not (Test-Path -LiteralPath (Join-Path $dest 'obsolete.txt'))) 'deleted file persisted'
  }
  Case 'sibling folder untouched' {
    Assert ([IO.File]::ReadAllText((Join-Path $other 'keep.txt')) -ceq 'sibling sentinel') 'sibling changed'
    Assert (@(Get-ChildItem -LiteralPath $other -Force).Count -eq 1) 'sibling entries changed'
  }
  Case 'invocation in a subdirectory mirrors the entire HEAD' {
    $nested = Join-Path $repo 'nested'
    New-Directory $nested
    Check-Result (Run-Mirror $nested) 0 'MIRROR OK'
    Assert ([IO.File]::ReadAllText((Join-Path $dest 'readme.txt')) -ceq 'committed content') 'root file missing'
    Assert (Test-Path -LiteralPath (Join-Path $dest $unicodeName)) 'non-ASCII root file missing'
  }
  Case 'linked worktree refused' {
    $linked = Join-Path $scratch 'linked'
    Run-Git @('-C', $repo, 'worktree', 'add', '--detach', $linked, 'HEAD')
    $before = Snapshot $fakeDrive
    Check-Result (Run-Mirror $linked '-Create') 1 'Run from the base-branch checkout, not a worktree\.'
    Assert ((Snapshot $fakeDrive) -ceq $before) 'refusal changed mirror'
  }
  Case 'outside repository refused' {
    Check-Result (Run-Mirror $scratch '-Create') 1 'Not inside a Git repository\.'
  }
  Case 'DryRun lists changes and preserves mirror' {
    Write-Utf8File (Join-Path $dest 'extra.txt') 'would delete'
    Write-Utf8File (Join-Path $dest 'readme.txt') 'would replace'
    $before = Snapshot $fakeDrive
    $r = Run-Mirror $repo '-DryRun'
    Check-Result $r 0 'MIRROR OK'
    Assert ($r.Out -match 'extra.txt' -and $r.Out -match 'readme.txt') 'dry run file list missing'
    Assert ((Snapshot $fakeDrive) -ceq $before) 'dry run modified mirror'
  }
  Case 'junction inside mirror refused' {
    $target = Join-Path $scratch 'junction-target'
    New-Directory $target
    Write-Utf8File (Join-Path $target 'sentinel.txt') 'must survive'
    $link = Join-Path $dest 'linked'
    $made = Run-Process (Join-Path $env:SystemRoot 'System32\cmd.exe') ('/d /c mklink /J "' + $link + '" "' + $target + '"') $scratch
    # Some sandboxed hosts forbid creating junctions; that is not a mirror defect.
    if ($made.Code -ne 0 -and ($made.Out + $made.Err) -match 'Access is denied') { throw 'SKIP: this host refuses to create junctions (mklink: Access is denied)' }
    Assert ($made.Code -eq 0) "mklink failed: $($made.Out) $($made.Err)"
    try {
      Check-Result (Run-Mirror $repo) 1 'Refusing linked path'
      Assert ([IO.File]::ReadAllText((Join-Path $target 'sentinel.txt')) -ceq 'must survive') 'junction target changed'
    } finally { [IO.Directory]::Delete($link) }
  }
  Case 'local export-ignore cannot drop committed files' {
    $attributes = Join-Path $repo '.git\info\attributes'
    New-Directory (Split-Path $attributes -Parent)
    Write-Utf8File $attributes "readme.txt export-ignore`n"
    try {
      Check-Result (Run-Mirror $repo) 0 'MIRROR OK'
      Assert ((Test-Path -LiteralPath (Join-Path $dest 'readme.txt')) -and
              [IO.File]::ReadAllText((Join-Path $dest 'readme.txt')) -ceq 'committed content') 'committed file dropped or stale'
      Assert (-not (Test-Path -LiteralPath (Join-Path $dest 'extra.txt'))) 'extra mirror file not removed'
    } finally { Remove-Item -LiteralPath $attributes -Force }
  }
  Case 'staging inside destination refused' {
    $script:childTemp = Join-Path $dest 'tmp'
    try {
      New-Directory $childTemp
      $before = Snapshot $fakeDrive
      Check-Result (Run-Mirror $repo) 1 'TEMP and the mirror destination overlap'
      Assert ((Snapshot $fakeDrive) -ceq $before) 'refusal changed mirror'
    } finally {
      Remove-Item -LiteralPath $childTemp -Recurse -Force -ErrorAction SilentlyContinue
      $script:childTemp = Join-Path $scratch 'temp'
    }
  }
  Case 'unborn HEAD leaves destination untouched' {
    $unborn = Join-Path $scratch 'unborn'
    New-Directory $unborn
    Run-Git @('init', $unborn)
    $before = Snapshot $fakeDrive
    Check-Result (Run-Mirror $unborn '-Create') 1 'git read-tree HEAD failed'
    Assert ((Snapshot $fakeDrive) -ceq $before) 'unborn HEAD changed destination'
  }
  Case 'empty commit leaves destination untouched' {
    $empty = Join-Path $scratch 'empty'
    New-Directory $empty
    Run-Git @('init', $empty)
    Run-Git @('-C', $empty, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--allow-empty', '-m', 'empty')
    $before = Snapshot $fakeDrive
    Check-Result (Run-Mirror $empty '-Create') 1 'Staging folder has no files'
    Assert ((Snapshot $fakeDrive) -ceq $before) 'empty commit changed destination'
  }
  Case 'robocopy failure reported' {
    $failureRepo = Join-Path $scratch 'failure'
    Run-Git @('clone', '--quiet', '--no-hardlinks', $repo, $failureRepo)
    $failureDest = Join-Path $parent 'failure'
    Write-Utf8File $failureDest 'file blocks destination directory'
    Check-Result (Run-Mirror $failureRepo) 1 'MIRROR FAILED \(robocopy (?:[89]|[1-9][0-9]+)\)'
    Assert ([IO.File]::ReadAllText($failureDest) -ceq 'file blocks destination directory') 'blocking file changed'
  }
  Case 'Create makes a missing AgentWorkspace parent' {
    $script:fakeDrive = Join-Path $scratch 'OneDrive2'
    try {
      New-Directory $fakeDrive
      Check-Result (Run-Mirror $repo '-Create') 0 'MIRROR OK'
      Assert (Test-Path -LiteralPath (Join-Path $fakeDrive ('AgentWorkspace\' + $repoName + '\readme.txt'))) 'mirror not created under a new AgentWorkspace'
    } finally { $script:fakeDrive = Join-Path $scratch 'OneDrive' }
  }
  Case 'no staging folders remain' {
    Assert (@(Get-ChildItem -LiteralPath $childTemp -Force).Count -eq 0) 'staging leftovers'
  }
} catch {
  $total++
  Write-Output "FAIL setup: $(($_.Exception.Message -replace '\s+', ' ').Trim())"
} finally {
  if ($ownsScratch) {
    try {
      $expected = [IO.Path]::GetFullPath((Join-Path $env:TEMP 'ccx-t3')).TrimEnd('\')
      Assert ($scratch -ieq $expected) 'SAFETY: scratch cleanup escaped test root'
      Check-NoLinks $scratch
      foreach ($item in Get-ChildItem -LiteralPath $scratch -Recurse -Force) {
        Assert (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) 'SAFETY: cleanup tree contains a link'
      }
      Remove-Item -LiteralPath $scratch -Recurse -Force
    } catch {
      $total++
      Write-Output "FAIL cleanup: $(($_.Exception.Message -replace '\s+', ' ').Trim())"
    }
  }
}
Write-Output "$passed/$total passed, $skipped skipped, in $([math]::Round($clock.Elapsed.TotalSeconds))s"
if ($passed -eq $total) { exit 0 }
exit 1
