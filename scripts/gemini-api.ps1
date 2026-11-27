$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'invoke-external-tool.ps1')
# Shared Gemini API entry point for Claude, Codex and Gemini (GEMINI-API-1, user-approved 2026-11-27):
#   gemini-api.ps1 version
#   gemini-api.ps1 analyze -Source <file|youtube url> [-Source ...] [-Question <text>] [-DryRun]
#   gemini-api.ps1 transcribe -Source <file> -Out <file under media-out/ or outside the repo> [-Format md|text|json|srt] [-DryRun]
# Only these two understanding commands, on their default models, with requests not stored server-side
# (the CLI's default). The key is GEMINI_API_KEY from the environment; it is never printed. Private paths
# (privacy.excludePaths, secrets, workbooks) are refused before anything is sent.
$repo = Split-Path -Parent $PSScriptRoot
$exe = if ($env:CRUCIBLE_GEMINI_API_EXE) { $env:CRUCIBLE_GEMINI_API_EXE } else { Join-Path $env:LOCALAPPDATA 'Crucible\tools\gemini-api\v0.5.0\bin\gemini-api.exe' }
if (-not (Test-Path -LiteralPath $exe)) { [Console]::Error.WriteLine("gemini-api not installed at $exe (see EXTERNAL-TOOLS.md, Gemini API)."); exit 2 }

function Stop-Usage([string]$Message) { [Console]::Error.WriteLine($Message); exit 2 }

function Test-Private([string]$Full) {
    $rel = $Full.Replace('\', '/')
    $patterns = @('(^|/)\.env($|\.)', '\.(pem|key|pfx|p12|xlsx|xls|xlsm)$', '(^|/)id_rsa', '(^|/)nursing-a2/', '(^|/)lifting-tracker/(data/)?private/', '(^|/)Status/\.runs/', '(^|/)\.git/')
    $policyPath = Join-Path $repo 'ccx/policy.json'
    foreach ($p in @((Get-Content -LiteralPath $policyPath -Raw | ConvertFrom-Json).privacy.excludePaths)) {
        if ($p) { $patterns += '(^|/)' + [regex]::Escape($p.Replace('\', '/').TrimEnd('/')) + '(/|$)' }
    }
    foreach ($pattern in $patterns) { if ($rel -match "(?i)$pattern") { return $true } }
    return $false
}

$command, $rest = $args
$rest = @($rest | Where-Object { $null -ne $_ })
$sources = @(); $question = $null; $out = $null; $format = 'md'; $dryRun = $false
for ($i = 0; $i -lt $rest.Count; $i++) {
    $name = $rest[$i]
    if ($name -eq '-DryRun') { $dryRun = $true; continue }
    if ($name -notin @('-Source', '-Question', '-Out', '-Format')) { Stop-Usage "option not allowed: $name" }
    $i++; if ($i -ge $rest.Count) { Stop-Usage "missing value for $name" }
    switch ($name) { '-Source' { $sources += $rest[$i] } '-Question' { $question = $rest[$i] } '-Out' { $out = $rest[$i] } '-Format' { $format = $rest[$i] } }
}

$toolArgs = @()
foreach ($source in $sources) {
    if ($source -match '^https://(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[A-Za-z0-9_-]+') {
        if ($command -ne 'analyze') { Stop-Usage 'transcribe takes local files only' }
        $toolArgs += @('-i', $source); continue
    }
    if ($source -match '^[a-z]+://') { Stop-Usage "only local files and YouTube URLs are allowed: $source" }
    $full = [IO.Path]::GetFullPath($source)
    if (-not [IO.File]::Exists($full)) { Stop-Usage "not a file: $source" }
    if (Test-Private $full) { Stop-Usage "refused: $source is private (privacy.excludePaths, secrets or workbooks)" }
    $toolArgs += @('-i', $full)
}

switch ($command) {
    'version' { exit (Invoke-ExternalTool $exe @('--version')) }
    'analyze' {
        if (-not $sources.Count) { Stop-Usage 'Usage: gemini-api.ps1 analyze -Source <file|youtube url> [-Question <text>] [-DryRun]' }
        if ($out) { Stop-Usage '-Out is for transcribe' }
        $toolArgs = @('analyze') + $toolArgs
        if ($question) { $toolArgs += $question }
    }
    'transcribe' {
        if (-not $sources.Count -or -not $out) { Stop-Usage 'Usage: gemini-api.ps1 transcribe -Source <file> -Out <file> [-Format md|text|json|srt] [-DryRun]' }
        if ($question) { Stop-Usage '-Question is for analyze' }
        if ($format -notin @('md', 'text', 'json', 'srt')) { Stop-Usage "format not allowed: $format" }
        $outFull = [IO.Path]::GetFullPath($out)
        $repoFull = [IO.Path]::GetFullPath($repo).TrimEnd('\') + '\'
        $mediaOut = $repoFull + 'media-out\'
        # Transcripts stay out of Git: under gitignored media-out/, or outside the repository.
        if ($outFull.StartsWith($repoFull, [StringComparison]::OrdinalIgnoreCase) -and -not $outFull.StartsWith($mediaOut, [StringComparison]::OrdinalIgnoreCase)) {
            Stop-Usage "-Out must be under media-out/ or outside the repository: $out"
        }
        $toolArgs = @('transcribe') + $toolArgs + @('--format', $format, '--out', $outFull)
    }
    default { Stop-Usage 'Usage: gemini-api.ps1 version | analyze ... | transcribe ...' }
}
if ($dryRun) { $toolArgs += '--dry-run' }
exit (Invoke-ExternalTool $exe $toolArgs)
