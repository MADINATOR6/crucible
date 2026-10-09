$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'invoke-external-tool.ps1')
$ToolsDir = if ($env:CRUCIBLE_TOOLS_DIR) { $env:CRUCIBLE_TOOLS_DIR } else { Join-Path $env:USERPROFILE '.local\share\claude-codex-tools' }
$Executable = if ($env:CRUCIBLE_CLAW_EXE) { $env:CRUCIBLE_CLAW_EXE } else { Join-Path $ToolsDir 'claw-code\rust\target\x86_64-pc-windows-gnullvm\release\claw.exe' }
$previousPath = $env:PATH
try {
    # The working Windows build needs libunwind.dll in the child search path.
    $env:PATH = (Join-Path $ToolsDir 'llvm-mingw-20260922-msvcrt-x86_64\x86_64-w64-mingw32\bin') + ';' + $previousPath
    $code = Invoke-ExternalTool $Executable $args
} finally { $env:PATH = $previousPath }
exit $code
