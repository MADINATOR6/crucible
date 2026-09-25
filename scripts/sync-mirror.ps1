<#
Mirror HEAD from the base checkout to $env:OneDrive\AgentWorkspace\<repo>.
Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sync-mirror.ps1 [-Create] [-DryRun]
Parameters: -Create starts a missing mirror (and AgentWorkspace if needed).
            -DryRun lists proposed changes without changing the destination.
Exit codes: 0 OK or skipped; 1 refused or failed.
Only committed files are eligible; never commit secrets intended to stay private.
#>
param([switch]$Create, [switch]$DryRun)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$previousEncoding = [Console]::OutputEncoding
$previousOutputEncoding = $OutputEncoding
$staging = $null
$code = 1

function Invoke-Native([string]$File, [string[]]$Arguments, [hashtable]$Environment = @{}) {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $File
  foreach ($name in $Environment.Keys) { $info.EnvironmentVariables[$name] = $Environment[$name] }
  # Windows native argument quoting, including trailing backslashes.
  $info.Arguments = ($Arguments | ForEach-Object {
    '"' + (($_ -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"'
  }) -join ' '
  $info.WorkingDirectory = (Get-Location).ProviderPath
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.StandardOutputEncoding = $utf8
  $info.StandardErrorEncoding = $utf8
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $info
  try {
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    return [pscustomobject]@{ Code = $process.ExitCode; Out = $stdout.Result; Err = $stderr.Result }
  } finally { $process.Dispose() }
}

function Test-Link($Item) {
  # OneDrive marks every synced item as a (cloud) reparse point; only real links are unsafe.
  return [bool](($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -and
                ($Item.LinkType -eq 'SymbolicLink' -or $Item.LinkType -eq 'Junction'))
}

function Assert-NoLinks([string]$Path, [switch]$Tree) {
  # Check ancestors too: a normal-looking destination below a junction is unsafe.
  $cursor = [IO.Path]::GetFullPath($Path)
  while ($cursor) {
    if (Test-Path -LiteralPath $cursor) {
      if (Test-Link (Get-Item -LiteralPath $cursor -Force)) {
        throw "Refusing linked path: $cursor"
      }
    }
    $cursor = [IO.Path]::GetDirectoryName($cursor)
  }
  if ($Tree -and (Test-Path -LiteralPath $Path -PathType Container)) {
    $pending = New-Object 'System.Collections.Generic.Stack[string]'
    $pending.Push($Path)
    while ($pending.Count) {
      foreach ($item in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
        if (Test-Link $item) {
          throw "Refusing linked path: $($item.FullName)"
        }
        if ($item.PSIsContainer) { $pending.Push($item.FullName) }
      }
    }
  }
}

try {
  [Console]::OutputEncoding = $utf8
  $OutputEncoding = $utf8
  do {
    $rootResult = Invoke-Native 'git.exe' @('rev-parse', '--show-toplevel')
    if ($rootResult.Code -ne 0 -or -not $rootResult.Out.Trim()) { throw 'Not inside a Git repository.' }
    $root = [IO.Path]::GetFullPath($rootResult.Out.Trim())
    # Absolute paths: from a subdirectory git prints one of these relative.
    $gitDir = Invoke-Native 'git.exe' @('rev-parse', '--path-format=absolute', '--git-dir')
    $commonDir = Invoke-Native 'git.exe' @('rev-parse', '--path-format=absolute', '--git-common-dir')
    if ($gitDir.Code -ne 0 -or $commonDir.Code -ne 0) { throw 'Cannot resolve Git directories.' }
    if ([IO.Path]::GetFullPath($gitDir.Out.Trim()).TrimEnd('\') -ine [IO.Path]::GetFullPath($commonDir.Out.Trim()).TrimEnd('\')) {
      throw 'Run from the base-branch checkout, not a worktree.'
    }
    if ([string]::IsNullOrWhiteSpace($env:OneDrive)) {
      Write-Output 'SKIPPED: OneDrive not set.'
      $code = 0
      break
    }
    $leaf = [IO.Path]::GetFileName($root.TrimEnd('\', '/'))
    if ([string]::IsNullOrWhiteSpace($leaf) -or $leaf -match '[:\\/]') { throw 'Repository leaf name is empty or invalid.' }
    $parent = [IO.Path]::GetFullPath((Join-Path $env:OneDrive 'AgentWorkspace'))
    $dest = [IO.Path]::GetFullPath((Join-Path $parent $leaf))
    if ([IO.Path]::GetDirectoryName($dest) -ine $parent) { throw 'Destination escaped AgentWorkspace.' }
    if (-not (Test-Path -LiteralPath $dest) -and -not $Create) {
      Write-Output "SKIPPED: no mirror at $dest. Pass -Create to start one."
      $code = 0
      break
    }
    Assert-NoLinks $dest -Tree
    if ((Test-Path -LiteralPath $parent) -and -not (Test-Path -LiteralPath $parent -PathType Container)) {
      throw "Mirror parent is not a folder: $parent"
    }
    # Git cannot contain a directory beneath a symlink. Refuse links before
    # extraction as well, so neither extraction nor copying can follow one.
    $tree = Invoke-Native 'git.exe' @('-C', $root, 'ls-tree', '-r', 'HEAD')
    if ($tree.Code -eq 0 -and $tree.Out -match '(?m)^120000 ') { throw 'Refusing symbolic links in HEAD.' }
    $tempRoot = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')
    Assert-NoLinks $tempRoot
    do {
      $candidate = Join-Path $tempRoot ('ccx-mirror-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    } while (Test-Path -LiteralPath $candidate)
    # /MIR would delete its own source if staging and destination contained each other.
    $stagingPrefix = $candidate.TrimEnd('\') + '\'
    $destPrefix = $dest.TrimEnd('\') + '\'
    if ($stagingPrefix.StartsWith($destPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        $destPrefix.StartsWith($stagingPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      throw 'TEMP and the mirror destination overlap; refusing.'
    }
    [void][IO.Directory]::CreateDirectory($candidate)
    $staging = $candidate
    $source = Join-Path $staging 'tree'
    [void][IO.Directory]::CreateDirectory($source)
    # A private index plus checkout-index writes every file committed at HEAD. Unlike git archive,
    # export-ignore attributes (including uncommitted .git/info/attributes) cannot drop files.
    $privateIndex = @{ GIT_INDEX_FILE = (Join-Path $staging 'index') }
    $read = Invoke-Native 'git.exe' @('-C', $root, 'read-tree', 'HEAD') $privateIndex
    if ($read.Code -ne 0) { throw "git read-tree HEAD failed ($($read.Code)): $($read.Err.Trim())" }
    $written = Invoke-Native 'git.exe' @('-C', $root, 'checkout-index', '--all', ('--prefix=' + ($source -replace '\\', '/') + '/')) $privateIndex
    if ($written.Code -ne 0) { throw "git checkout-index failed ($($written.Code)): $($written.Err.Trim())" }
    Assert-NoLinks $source -Tree
    if (-not (Get-ChildItem -LiteralPath $source -Recurse -Force -File | Select-Object -First 1)) {
      throw 'Staging folder has no files; destination was not touched.'
    }
    # Recheck immediately before the destructive copy, including existing children.
    Assert-NoLinks $dest -Tree
    # Reached without an existing destination only with -Create; this also creates AgentWorkspace.
    if (-not $DryRun -and -not (Test-Path -LiteralPath $dest)) { [void][IO.Directory]::CreateDirectory($dest) }
    $copyArgs = @($source, $dest, '/MIR', '/XD', '.git', 'node_modules', '/XF', '.git', '.env*', '*.pem', '*.key', '/R:1', '/W:1', '/NJH', '/NJS', '/NP')
    if ($DryRun) { $copyArgs += '/L' } else { $copyArgs += @('/NFL', '/NDL') }
    $copied = Invoke-Native (Join-Path $env:SystemRoot 'System32\robocopy.exe') $copyArgs
    if ($copied.Out.Trim()) { Write-Output $copied.Out.TrimEnd() }
    if ($copied.Err.Trim()) { Write-Output $copied.Err.TrimEnd() }
    if ($copied.Code -ge 0 -and $copied.Code -le 7) {
      Write-Output "MIRROR OK (robocopy $($copied.Code)): $dest"
      $code = 0
    } else {
      Write-Output "MIRROR FAILED (robocopy $($copied.Code)): $dest"
    }
  } while ($false)
} catch {
  Write-Output $_.Exception.Message
  $code = 1
} finally {
  try {
    if ($staging) {
      $actual = [IO.Path]::GetFullPath($staging)
      if ([IO.Path]::GetDirectoryName($actual) -ine $tempRoot -or
          [IO.Path]::GetFileName($actual) -notmatch '^ccx-mirror-[0-9a-f]{8}$') {
        throw 'Refusing cleanup outside the allocated staging folder.'
      }
      Assert-NoLinks $actual -Tree
      Remove-Item -LiteralPath $actual -Recurse -Force
    }
  } catch {
    Write-Output "Staging cleanup failed: $($_.Exception.Message)"
    $code = 1
  } finally {
    [Console]::OutputEncoding = $previousEncoding
    $OutputEncoding = $previousOutputEncoding
  }
}
exit $code
