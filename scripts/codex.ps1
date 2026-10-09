$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'invoke-external-tool.ps1')
$ToolsDir = if ($env:CRUCIBLE_TOOLS_DIR) { $env:CRUCIBLE_TOOLS_DIR } else { Join-Path $env:USERPROFILE '.local\share\claude-codex-tools' }
$CodexHome = if ($env:CRUCIBLE_CODEX_HOME) { $env:CRUCIBLE_CODEX_HOME } else { Join-Path $ToolsDir 'lazycodex-profile' }
$Executable = $env:CRUCIBLE_CODEX_EXE
if (-not $Executable) {
    $npmRoot = Split-Path -Parent (Get-Command codex.cmd -CommandType Application).Source
    $Executable = Join-Path $npmRoot 'node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe'
}
$config = Join-Path $CodexHome 'config.toml'
if (-not (Test-Path -LiteralPath $config -PathType Leaf)) { throw 'Isolated OmO profile is missing; see EXTERNAL-TOOLS.md.' }
$configText = [IO.File]::ReadAllText($config)
$pluginSection = [regex]::Match($configText, '(?ms)^\[plugins\."omo@sisyphuslabs"\]\s*\r?\n(.*?)(?=^\[|\z)')
if (-not $pluginSection.Success -or $pluginSection.Groups[1].Value -notmatch '(?m)^enabled\s*=\s*true\s*$') { throw 'OmO plugin is not enabled in the isolated profile.' }
$manifestPath = Join-Path $CodexHome 'plugins\cache\sisyphuslabs\omo\5.1.13\.codex-plugin\plugin.json'
$manifests = @(Get-Item -LiteralPath $manifestPath -ErrorAction SilentlyContinue)
if (-not $manifests.Count) { throw 'OmO plugin manifest is missing.' }
$hasHooks = $false
foreach ($manifest in $manifests) {
    $plugin = [IO.File]::ReadAllText($manifest.FullName) | ConvertFrom-Json
    if (-not $plugin.hooks.Count) { continue }
    $pluginRoot = Split-Path -Parent $manifest.DirectoryName
    $missing = @($plugin.hooks | Where-Object { -not (Test-Path -LiteralPath (Join-Path $pluginRoot $_) -PathType Leaf) })
    if (-not $missing.Count) { $hasHooks = $true; break }
}
if (-not $hasHooks) { throw 'OmO hook files are missing; reinstall before launching.' }
$values = @{
    CODEX_HOME = $CodexHome
    OMO_CODEX_PROJECT = (Get-Location).ProviderPath
    OMO_CODEX_GIT_BASH_PATH = (Join-Path $ToolsDir 'PortableGit\bin\bash.exe')
    OMO_WRAPPER_PACKAGE_ROOT = (Join-Path $ToolsDir 'omo-5.1.13\package')
    OMO_EDITION = 'codex'; OMO_RUNTIME = 'node'
    DO_NOT_TRACK = '1'; OMO_DISABLE_POSTHOG = '1'
    LAZYCODEX_AUTO_UPDATE_DISABLED = '1'; OMO_CODEX_AUTO_UPDATE_DISABLED = '1'
}
$previous = @{}
foreach ($name in $values.Keys) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    foreach ($name in $values.Keys) { [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process') }
    # No hook-trust bypass, autonomous permissions, model override, or ccx dispatch replacement.
    $code = Invoke-ExternalTool $Executable $args
} finally {
    foreach ($name in $values.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
exit $code
