param(
    [Parameter(Position = 0)][ValidateSet('show', 'version', 'audit', 'render', 'check', 'test')][string]$Command = 'show',
    [string]$Blend,
    [string]$Out,
    [string]$Frames,
    [string]$Match,
    [string]$Scene,
    [string]$Camera,
    [string]$Engine,
    [int]$Samples = 0,
    [int]$Percent = 0,
    [ValidateSet('', 'CPU', 'GPU')][string]$Device = '',
    [string]$Cuts,
    [switch]$PersistentData,
    [switch]$AllowMismatch,
    [switch]$TrustedFile
)
# Shared Blender entry point for Claude and Codex (method: .claude/skills/blender/SKILL.md).
# Never installs anything, never opens a network connection, never saves a .blend.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'invoke-external-tool.ps1')
$root = Split-Path -Parent $PSScriptRoot
$skill = Join-Path (Join-Path $root '.claude') (Join-Path 'skills' 'blender')
$scripts = Join-Path $skill 'scripts'
function Fail([string]$Message) { [Console]::Error.WriteLine($Message); exit 2 }

function Find-Python {
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
    Fail 'Python 3 not found (the WindowsApps python is only a Microsoft Store stub). Install it from python.org or set CRUCIBLE_PYTHON_EXE.'
}

function Find-Blender {
    if ($env:CRUCIBLE_BLENDER_EXE) {
        if (Test-Path -LiteralPath $env:CRUCIBLE_BLENDER_EXE) { return $env:CRUCIBLE_BLENDER_EXE }
        Fail "CRUCIBLE_BLENDER_EXE does not exist: $env:CRUCIBLE_BLENDER_EXE"
    }
    $onPath = Get-Command blender -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($onPath) { return $onPath.Source }
    # Newest standard Windows install, e.g. C:\Program Files\Blender Foundation\Blender 5.2\blender.exe
    if ($env:ProgramFiles) {
        $base = Join-Path $env:ProgramFiles 'Blender Foundation'
        if (Test-Path -LiteralPath $base) {
            $best = $null; $bestVersion = $null
            foreach ($dir in Get-ChildItem -LiteralPath $base -Directory) {
                $exe = Join-Path $dir.FullName 'blender.exe'
                if (-not (Test-Path -LiteralPath $exe)) { continue }
                $version = $null
                if (-not [version]::TryParse(($dir.Name -replace '[^0-9.]', ''), [ref]$version)) { $version = [version]'0.0' }
                if ($null -eq $bestVersion -or $version -gt $bestVersion) { $best = $exe; $bestVersion = $version }
            }
            if ($best) { return $best }
        }
    }
    Fail 'Blender not found. Install it from blender.org (free) or set CRUCIBLE_BLENDER_EXE to blender.exe.'
}

function Need-Blend {
    if (-not $Blend) { Fail "$Command needs -Blend <file.blend>" }
    if (-not (Test-Path -LiteralPath $Blend -PathType Leaf)) { Fail "no such .blend: $Blend" }
    return (Resolve-Path -LiteralPath $Blend).Path
}

function Full([string]$Path) {
    # Absolute paths only: relative output paths in background Blender have resolved to the wrong place.
    if ([IO.Path]::IsPathRooted($Path)) { return $Path }
    return [IO.Path]::GetFullPath((Join-Path (Get-Location).Path $Path))
}

switch ($Command) {
    'show' {
        $utf8 = New-Object Text.UTF8Encoding($false)
        [Console]::Out.Write([IO.File]::ReadAllText((Join-Path $skill 'SKILL.md'), $utf8))
        exit 0
    }
    'version' {
        exit (Invoke-ExternalTool (Find-Blender) @('--version'))
    }
    'audit' {
        $file = Need-Blend
        if (-not $Out) { Fail 'audit needs -Out <new report.json>' }
        # Factory settings and no auto-run: an untrusted file cannot execute anything while it is inspected.
        $argv = @('--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', $file,
            '--python', (Join-Path $scripts 'audit.py'), '--', '--output', (Full $Out))
        if ($Match) { $argv += @('--match', $Match) }
        if ($Scene) { $argv += @('--scene', $Scene) }
        $code = Invoke-ExternalTool (Find-Blender) $argv
        if ($code -ne 0) { exit $code }
        $report = Get-Content -LiteralPath (Full $Out) -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($report.safety.verdict -ne 'clean') {
            [Console]::Out.WriteLine('REVIEW: the file holds scripts, scripted drivers, OSL nodes or linked libraries. Read them before opening it with auto-run on.')
            exit 3
        }
        exit 0
    }
    'render' {
        $file = Need-Blend
        if (-not $Out) { Fail 'render needs -Out <output folder>' }
        $argv = @('--background')
        # Auto-run stays off unless the user says this is their own file that needs its scripted drivers.
        if (-not $TrustedFile) { $argv += '--disable-autoexec' }
        $argv += @('--python-exit-code', '1', $file, '--python', (Join-Path $scripts 'render.py'), '--', '--output', (Full $Out))
        # One token: argparse reads a separate negative spec such as -2--1 as an option.
        if ($Frames) { $argv += "--frames=$Frames" }
        if ($Scene) { $argv += @('--scene', $Scene) }
        if ($Camera) { $argv += @('--camera', $Camera) }
        if ($Engine) { $argv += @('--engine', $Engine) }
        if ($Samples -gt 0) { $argv += @('--samples', [string]$Samples) }
        if ($Percent -gt 0) { $argv += @('--percent', [string]$Percent) }
        if ($Device) { $argv += @('--device', $Device) }
        if ($PersistentData) { $argv += '--persistent-data' }
        if ($AllowMismatch) { $argv += '--allow-mismatch' }
        exit (Invoke-ExternalTool (Find-Blender) $argv)
    }
    'check' {
        if (-not $Out) { Fail 'check needs -Out <rendered frame folder>' }
        $argv = @('-I', (Join-Path $scripts 'check_frames.py'), '--dir', (Full $Out))
        if ($Frames) { $argv += "--frames=$Frames" }
        if ($Cuts) { $argv += @('--cuts', $Cuts) }
        exit (Invoke-ExternalTool (Find-Python) $argv)
    }
    'test' {
        exit (Invoke-ExternalTool (Find-Python) @('-I', (Join-Path $scripts 'test_blender.py')))
    }
}
