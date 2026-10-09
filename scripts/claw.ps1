$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'invoke-external-tool.ps1')
. (Join-Path $PSScriptRoot 'claw-credential-store.ps1')
$ToolsDir = if ($env:CRUCIBLE_TOOLS_DIR) { $env:CRUCIBLE_TOOLS_DIR } else { Join-Path $env:USERPROFILE '.local\share\claude-codex-tools' }
$Executable = if ($env:CRUCIBLE_CLAW_EXE) { $env:CRUCIBLE_CLAW_EXE } else { Join-Path $ToolsDir 'claw-code\rust\target\x86_64-pc-windows-gnullvm\release\claw.exe' }
$previousPath = $env:PATH
$previousToken = $env:ANTHROPIC_AUTH_TOKEN
$savedSecret = $null
try {
    # Explicit session credentials win; version/help probes never decrypt stored credentials.
    $metadataOnly = $args.Count -eq 1 -and $args[0] -cin @('--version','--help','-V','version','help')
    if (-not $metadataOnly -and -not $env:ANTHROPIC_API_KEY -and -not $env:ANTHROPIC_AUTH_TOKEN) {
        $savedSecret = Read-ClawCredential
        if ($savedSecret) { $env:ANTHROPIC_AUTH_TOKEN = ([PSCredential]::new('claw',$savedSecret)).GetNetworkCredential().Password }
    }
    # The working Windows build needs libunwind.dll in the child search path.
    $env:PATH = (Join-Path $ToolsDir 'llvm-mingw-20260922-msvcrt-x86_64\x86_64-w64-mingw32\bin') + ';' + $previousPath
    $code = Invoke-ExternalTool $Executable $args
} finally {
    $env:PATH = $previousPath
    $env:ANTHROPIC_AUTH_TOKEN = $previousToken
    if ($savedSecret) { $savedSecret.Dispose() }
    Remove-Variable savedSecret,previousToken -ErrorAction SilentlyContinue
}
exit $code
