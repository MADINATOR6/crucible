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

function Find-CruciblePython {
    # CRUCIBLE_PYTHON_EXE wins as given (a wrong path then fails in Invoke-ExternalTool).
    if ($env:CRUCIBLE_PYTHON_EXE) { return $env:CRUCIBLE_PYTHON_EXE }
    # WindowsApps python.exe/python3.exe are Microsoft Store stubs: they print "Python was not found" and exit 9009.
    foreach ($name in 'python', 'python3') {
        foreach ($cmd in @(Get-Command $name -CommandType Application -All -ErrorAction SilentlyContinue)) {
            if ($cmd.Source -notmatch '\\WindowsApps\\') { return $cmd.Source }
        }
    }
    # Newest per-user python.org install, e.g. %LOCALAPPDATA%\Programs\Python\Python312\python.exe
    if ($env:LOCALAPPDATA) {
        $base = Join-Path $env:LOCALAPPDATA 'Programs\Python'
        if (Test-Path -LiteralPath $base) {
            $best = Get-ChildItem -LiteralPath $base -Directory -Filter 'Python3*' |
                Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'python.exe') } |
                Sort-Object { [int]($_.Name -replace '[^0-9]', '') } -Descending | Select-Object -First 1
            if ($best) { return (Join-Path $best.FullName 'python.exe') }
        }
    }
    throw 'Python 3 not found (the WindowsApps python is only a Microsoft Store stub). Install it from python.org or set CRUCIBLE_PYTHON_EXE.'
}
