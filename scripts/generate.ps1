$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'invoke-external-tool.ps1')
# Shared entry point for Claude and Codex; the Claude /generate skill runs the same script.
$python = Find-CruciblePython
$script = Join-Path (Split-Path -Parent $PSScriptRoot) '.claude\skills\generate\generate.py'
exit (Invoke-ExternalTool $python (@('-I', $script) + $args))
