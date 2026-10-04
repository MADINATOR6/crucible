<#
Read-only external tool checks. Exit 0 if all six pass, otherwise 1.
Child commands receive closed stdin and have a 60 second timeout.
#>
param(
  [string]$ToolsDir = (Join-Path $env:USERPROFILE '.local\share\claude-codex-tools'),
  [string]$GjcExe = (Join-Path $env:LOCALAPPDATA 'gjc\gjc.exe'),
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference = 'Stop'
$script:failed = 0

function Test-Check([string]$Name, [scriptblock]$Check) {
  try {
    if (-not (& $Check)) { throw 'Check did not pass.' }
    Write-Output "PASS: $Name"
  } catch {
    # Do not echo tool output or exception messages: they may contain account data.
    Write-Output "FAIL: $Name"
    $script:failed++
  }
}

function Invoke-Version([string]$File) {
  if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { throw 'Missing command.' }
  $File = [IO.Path]::GetFullPath($File)
  $info = New-Object Diagnostics.ProcessStartInfo
  if ([IO.Path]::GetExtension($File) -ieq '.cmd') {
    # cmd.exe requires the outer quotes around a quoted command path.
    if ($File -match '["%\r\n]') { throw 'Unsafe command path.' }
    $info.FileName = Join-Path ([Environment]::SystemDirectory) 'cmd.exe'
    $info.Arguments = '/d /s /c ""' + $File + '" --version"'
  } else {
    $info.FileName = $File
    $info.Arguments = '--version'
  }
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $info
  try {
    [void]$process.Start()
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(60000)) { throw 'Command timed out.' }
    $remaining = [Math]::Max(0, 60000 - [int]$timer.ElapsedMilliseconds)
    if (-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($stdout, $stderr), $remaining)) {
      throw 'Command output timed out.'
    }
    if ($process.ExitCode -ne 0) { throw 'Command failed.' }
    return $stdout.Result + "`n" + $stderr.Result
  } finally {
    # Kill the wrapper and its descendants if a command or its output hangs.
    if ($null -ne $timer -and (-not $process.HasExited -or $timer.ElapsedMilliseconds -ge 60000)) {
      $killInfo = New-Object Diagnostics.ProcessStartInfo
      $killInfo.FileName = Join-Path ([Environment]::SystemDirectory) 'taskkill.exe'
      $killInfo.Arguments = '/PID ' + $process.Id + ' /T /F'
      $killInfo.UseShellExecute = $false
      $killInfo.CreateNoWindow = $true
      $killInfo.RedirectStandardOutput = $true
      $killInfo.RedirectStandardError = $true
      $killer = [Diagnostics.Process]::Start($killInfo)
      try { [void]$killer.WaitForExit(5000) } finally { $killer.Dispose() }
    }
    $process.Dispose()
  }
}

Test-Check 'gjc-sha256' {
  (Get-FileHash -LiteralPath $GjcExe -Algorithm SHA256).Hash -ieq
    'd574517f49c8dbbbbe79ad5f082dadae5bee52bb17bb138b1af5720852794402'
}
Test-Check 'gjc-version' { (Invoke-Version $GjcExe) -match '(?m)^gjc/0\.15\.3\s*$' }
Test-Check 'claw-version' {
  $output = Invoke-Version (Join-Path $ToolsDir 'claw.cmd')
  $output -match '0\.1\.3' -and $output -match '08106b0c3771'
}
Test-Check 'lazycodex-version' {
  (Invoke-Version (Join-Path $ToolsDir 'lazycodex-codex.cmd')) -match 'codex-cli'
}
Test-Check 'primary-codex-unchanged' {
  $baseline = Get-Content -LiteralPath (Join-Path $ToolsDir 'primary-config-before.json') -Raw |
    ConvertFrom-Json
  if ($baseline -isnot [pscustomobject]) { throw 'Expected a flat object.' }
  $entries = @($baseline.PSObject.Properties)
  if ($entries.Count -eq 0) { throw 'Empty baseline.' }
  $root = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.codex')).TrimEnd('\') + '\'
  foreach ($entry in $entries) {
    $relative = $entry.Name
    # Validate before hashing. Reject traversal and credential-bearing components.
    if ([IO.Path]::IsPathRooted($relative) -or $relative -match '[:]' -or
        $relative -match '(^|[\\/])\.\.([\\/]|$)' -or
        $relative -match '(?i)(^|[\\/])(auth\.json|agent\.db|models\.db|broker\.json|[^\\/]*\.secret|credential[^\\/]*)([\\/]|$)' -or
        $entry.Value -isnot [string] -or $entry.Value -notmatch '^[0-9a-fA-F]{64}$') {
      throw 'Unsafe baseline entry.'
    }
    $path = [IO.Path]::GetFullPath((Join-Path $root $relative))
    if (-not $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path escaped root.' }
    # A link could redirect even an innocuous filename into a credential store.
    $cursor = $path
    while ($cursor) {
      if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'Linked baseline path.'
      }
      $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $entry.Value) {
      throw 'Hash differs.'
    }
  }
  $true
}
Test-Check 'skills' {
  foreach ($name in @('offensive-reporting', 'offensive-bug-identification')) {
    $path = Join-Path $RepoRoot ('.claude\skills\' + $name + '\SKILL.md')
    $content = Get-Content -LiteralPath $path -Raw
    $frontmatter = [regex]::Match($content, '\A---\r?\n(.*?)\r?\n---(?:\r?\n|\z)', 'Singleline')
    if (-not $frontmatter.Success) { throw 'Missing frontmatter.' }
    $names = [regex]::Matches($frontmatter.Groups[1].Value, '(?m)^name:\s*([^\r\n]+?)\s*$')
    if ($names.Count -ne 1 -or $names[0].Groups[1].Value.Trim() -cne $name) {
      throw 'Skill name differs.'
    }
  }
  $true
}

if ($script:failed -eq 0) {
  Write-Output 'RESULT: PASS'
  exit 0
}
Write-Output "RESULT: FAIL ($script:failed of 6)"
exit 1
