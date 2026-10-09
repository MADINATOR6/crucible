# Shared native argv handling for Windows PowerShell 5.1; dot-source from launchers.
function Invoke-ExternalTool([string]$Executable, [string[]]$ToolArguments) {
    $command = Get-Command $Executable -ErrorAction Stop
    $file = $command.Source
    if ($command.CommandType -eq 'ExternalScript') {
        & $file @ToolArguments | Out-Host
        return $LASTEXITCODE
    }
    if ([IO.Path]::GetExtension($file) -in @('.cmd','.bat')) { throw 'Use a native executable override, not a shell shim.' }
    # Always quote with Windows C-runtime rules; preserve empty strings and embedded quotes.
    $quoted = @($ToolArguments | ForEach-Object {
        '"' + ([regex]::Replace([regex]::Replace($_, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1')) + '"'
    }) -join ' '
    $info = New-Object Diagnostics.ProcessStartInfo -Property @{
        FileName=$file; Arguments=$quoted; UseShellExecute=$false
    }
    # shortcut: inherit console stdio for TUIs; capture this script as a child process for pipelines.
    $child = [Diagnostics.Process]::Start($info)
    try { $child.WaitForExit(); return $child.ExitCode }
    finally { $child.Dispose() }
}
