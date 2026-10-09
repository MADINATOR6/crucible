$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'invoke-external-tool.ps1')
$executable = if ($env:CRUCIBLE_GJC_EXE) { $env:CRUCIBLE_GJC_EXE } else { Join-Path $env:LOCALAPPDATA 'gjc\gjc.exe' }
exit (Invoke-ExternalTool $executable $args)
