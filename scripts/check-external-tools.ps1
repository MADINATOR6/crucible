# Read-only checks; child commands have closed stdin and a 60 second timeout.
param(
  [string]$ToolsDir = (Join-Path $env:USERPROFILE '.local\share\claude-codex-tools'),
  [string]$GjcExe = (Join-Path $env:LOCALAPPDATA 'gjc\gjc.exe'),
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$SkillRoot = (Join-Path $env:USERPROFILE '.claude\skills\claude-red'),
  [switch]$Inventory,
  [switch]$Json
)
$ToolsDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ToolsDir)
$GjcExe = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($GjcExe)
$RepoRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($RepoRoot)
$ErrorActionPreference = 'Stop'
$script:failed = 0
$script:gjcTrusted = $false

function Test-Check([string]$Name, [scriptblock]$Check) {
  try {
    if (-not (& $Check)) { throw 'Check did not pass.' }
    Write-Output "PASS: $Name"
  } catch { Write-Output "FAIL: $Name"; $script:failed++ } # Never disclose exception text.
}

function Invoke-Version([string]$File, [string]$Arguments = '--version') {
  if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { throw 'Missing command.' }
  $info = New-Object Diagnostics.ProcessStartInfo -Property @{
    FileName = $File; Arguments = $Arguments; UseShellExecute = $false; CreateNoWindow = $true
    RedirectStandardInput = $true; RedirectStandardOutput = $true; RedirectStandardError = $true
  }
  if ([IO.Path]::GetExtension($File) -ieq '.cmd') {
    if ($File -match '["%\r\n]') { throw 'Unsafe command path.' }
    $info.FileName = Join-Path ([Environment]::SystemDirectory) 'cmd.exe'
    $info.Arguments = '/d /s /c ""' + $File + '" --version"'
  }
  $process = New-Object Diagnostics.Process -Property @{ StartInfo = $info }
  $timer = $null
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
    try {
      if ($null -ne $timer -and (-not $process.HasExited -or $timer.ElapsedMilliseconds -ge 60000)) {
        $killInfo = New-Object Diagnostics.ProcessStartInfo -Property @{
          FileName = (Join-Path ([Environment]::SystemDirectory) 'taskkill.exe')
          Arguments = ('/PID ' + $process.Id + ' /T /F'); UseShellExecute = $false; CreateNoWindow = $true
          RedirectStandardOutput = $true; RedirectStandardError = $true
        }
        $killer = [Diagnostics.Process]::Start($killInfo)
        try {
          $killer.BeginOutputReadLine(); $killer.BeginErrorReadLine()
          if (-not $killer.WaitForExit(5000)) { $killer.Kill() }
        } finally { $killer.Dispose() }
      }
    } finally { $process.Dispose() }
  }
}

if ($Inventory -or $Json) {
$rows = @()
foreach ($tool in @('gjc','claw','codex')) {
    $flag = if ($tool -eq 'codex') { '--help' } else { '--version' }
    $status = 'unavailable'
    try {
        # Existing wrappers perform native resolution and isolated OmO manifest/hook checks.
        $wrapper = Join-Path $PSScriptRoot ($tool + '.ps1')
        $null = Invoke-Version (Join-Path $PSHOME 'powershell.exe') ('-NoProfile -ExecutionPolicy Bypass -File "' + $wrapper + '" ' + $flag)
        $status = 'cli-pass'
    } catch { $status = 'unavailable' }
    $rows += [PSCustomObject]@{
        Tool = if ($tool -eq 'codex') { 'omo' } else { $tool }
        AvailableTo = if ($tool -eq 'codex') { 'Codex; Claude uses native workflow' } else { 'Both' }
        Status = $status
        Check = $flag
    }
}
$libraryStatus = 'unavailable'
try {
    if (Test-Path -LiteralPath $SkillRoot -PathType Container) {
        $markdown = Get-ChildItem -LiteralPath $SkillRoot -Filter '*.md' -File -Recurse | Select-Object -First 1
        if ($markdown) { $libraryStatus = 'files-present' }
    }
} catch { $libraryStatus = 'unavailable' }
$rows += [PSCustomObject]@{ Tool='claude-red'; AvailableTo='Both'; Status=$libraryStatus; Check='Markdown storage only; no content executed' }
if ($Json) { ConvertTo-Json -InputObject @($rows) -Depth 3 }
else {
    $rows | Format-Table -AutoSize
    Write-Output 'Optional inventory only. cli-pass does not prove provider access or interactive OmO hooks. ccx alone approves done.'
    Write-Output 'For unavailable tools use tool: none and the normal Claude/Codex workflow. See EXTERNAL-TOOLS.md.'
}
# Missing enhancements never turn this inventory into a mandatory workflow dependency.
exit 0
}

Test-Check 'gjc-sha256' {
  $script:gjcTrusted = (Get-FileHash -LiteralPath $GjcExe -Algorithm SHA256).Hash -ieq
    'd574517f49c8dbbbbe79ad5f082dadae5bee52bb17bb138b1af5720852794402'
  $script:gjcTrusted
}
Test-Check 'gjc-version' {
  if (-not $script:gjcTrusted) { throw 'Untrusted executable.' }
  (Invoke-Version $GjcExe) -match '(?m)^gjc/0\.15\.3\s*$'
}
Test-Check 'claw-version' {
  $output = Invoke-Version (Join-Path $ToolsDir 'claw.cmd')
  $output -match '0\.1\.3' -and $output -match '08106b0c3771'
}
Test-Check 'lazycodex-version' {
  (Invoke-Version (Join-Path $ToolsDir 'lazycodex-codex.cmd')) -match 'codex-cli'
}
Test-Check 'primary-codex-unchanged' {
  $baseline = Get-Content -LiteralPath (Join-Path $ToolsDir 'primary-config-before.json') -Raw | ConvertFrom-Json
  if ($baseline -isnot [pscustomobject]) { throw 'Expected a flat object.' }
  $entries = @($baseline.PSObject.Properties)
  if ($entries.Count -eq 0) { throw 'Empty baseline.' }
  $root = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.codex')).TrimEnd('\') + '\'
  foreach ($entry in $entries) {
    $relative = $entry.Name.Replace('/', '\')
    if ([IO.Path]::IsPathRooted($relative) -or $relative -match ':' -or
        $relative -match '(^|[\\/])\.\.([\\/]|$)' -or
        $entry.Value -isnot [string] -or $entry.Value -notmatch '^[0-9a-fA-F]{64}$') {
      throw 'Unsafe baseline entry.'
    }
    $path = [IO.Path]::GetFullPath((Join-Path $root $relative))
    if (-not $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path escaped root.' }
    # Comparing the canonical path rejects altered spellings of components.
    $canonical = ($path.Substring($root.Length).Split('\') | ForEach-Object { $_.TrimEnd(' ', '.') }) -join '\'
    if ($canonical -cne $relative -or
        $canonical -match '(?i)(^|\\)(auth\.json|agent\.db|models\.db|broker\.json|[^\\]*\.secret|credential[^\\]*)(\\|$)') {
      throw 'Unsafe canonical entry.'
    }
    # Inspect every component through .codex, never its parents.
    $cursor = $path
    while ($true) {
      if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked baseline path.' }
      if ($cursor -ieq $root.TrimEnd('\')) { break }
      $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $entry.Value) { throw 'Hash differs.' }
  }
  $true
}
Test-Check 'skills' {
  foreach ($name in @('offensive-reporting', 'offensive-bug-identification')) {
    $path = Join-Path $RepoRoot ('.claude\skills\' + $name + '\SKILL.md')
    $content = Get-Content -LiteralPath $path -Raw
    $frontmatter = [regex]::Match($content, '\A---\r?\n(.*?)\r?\n---(?:\r?\n|\z)', 'Singleline')
    if (-not $frontmatter.Success) { throw 'Missing frontmatter.' }
    $names = [regex]::Matches($frontmatter.Groups[1].Value, '(?m)^name:[ \t]*([^\r\n]+?)[ \t]*\r?$')
    if ($names.Count -ne 1) { throw 'Missing or duplicate skill name.' }
    $value = $names[0].Groups[1].Value.Trim()
    if ($value -match '^("|'')(.+)\1$') { $value = $Matches[2] }
    if ($value -cne $name) { throw 'Skill name differs.' }
  }
  $true
}

if ($script:failed -eq 0) { Write-Output 'RESULT: PASS'; exit 0 }
Write-Output "RESULT: FAIL ($script:failed of 6)"
exit 1
