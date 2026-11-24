$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'invoke-external-tool.ps1')
# Shared MoneyPrinterTurbo (MPT) entry point for Claude and Codex. Free path only:
#   mpt.ps1 version | help | run -Project <name> <cli.py args...>
# MPT_HOME (config.toml, any keys, task storage) is fixed outside the repo; finished MP4s are
# copied to gitignored media-out/mpt/<project>/.
$repo = Split-Path -Parent $PSScriptRoot
$mptDir = if ($env:CRUCIBLE_MPT_DIR) { $env:CRUCIBLE_MPT_DIR } else { Join-Path $env:USERPROFILE '.local\share\claude-codex-tools\MoneyPrinterTurbo' }
$python = Join-Path $mptDir '.venv\Scripts\python.exe'
# Fixed, never inherited: an MPT_HOME inside the repo would put config and keys in the checkout.
$env:MPT_HOME = Join-Path $env:LOCALAPPDATA 'Crucible\mpt'
if (-not (Test-Path -LiteralPath $python)) { [Console]::Error.WriteLine("MPT not installed at $mptDir (see EXTERNAL-TOOLS.md, MoneyPrinterTurbo)."); exit 2 }
$cli = Join-Path $mptDir 'cli.py'
$command, $rest = $args
$rest = @($rest | Where-Object { $null -ne $_ })

# Allowlist of cli.py options (full names only; argparse would accept abbreviations). Anything that
# reaches an LLM, a paid generator, paid music or paid TTS is absent: --video-subject, prompts,
# --confirm-*, --sonilo-bgm-prompt, --video-music-prompt, --task-id, --batch-file.
$valueOptions = @('--video-script','--video-terms','--video-language','--video-source','--video-materials','--stop-at',
    '--video-count','--video-aspect','--video-fit-mode','--video-concat-mode','--image-motion','--video-transition-mode',
    '--video-clip-duration','--video-clip-speed','--n-threads','--voice-name','--voice-volume','--voice-rate',
    '--custom-audio-file','--bgm-type','--bgm-file','--bgm-volume','--font-name','--subtitle-position',
    '--subtitle-display-mode','--subtitle-animation','--custom-position','--text-fore-color','--font-size',
    '--stroke-color','--stroke-width','--subtitle-background-color')
$flagOptions = @('--match-materials-to-script','--no-match-materials-to-script','--subtitle-enabled','--no-subtitle-enabled',
    '--subtitle-background-enabled','--no-subtitle-background-enabled','--rounded-subtitle-background','--no-rounded-subtitle-background')

function Test-FreeRun([string[]]$CliArgs) {
    $opts = @{}
    for ($i = 0; $i -lt $CliArgs.Count; $i++) {
        $name, $value = $CliArgs[$i] -split '=', 2
        if ($flagOptions -contains $name -and $null -eq $value) { continue }
        if ($valueOptions -notcontains $name) { return "option not allowed: $($CliArgs[$i])" }
        if ($null -eq $value) { $i++; if ($i -ge $CliArgs.Count) { return "missing value for $name" }; $value = $CliArgs[$i] }
        if ($opts.ContainsKey($name)) { return "repeated option: $name" }
        $opts[$name] = $value
    }
    if (-not $opts['--video-script']) { return '--video-script is required (no LLM script generation)' }
    if ($opts['--video-source'] -ne 'local' -or -not $opts['--video-materials']) { return '--video-source local and --video-materials are required' }
    if ($opts['--bgm-type'] -notin @('none','custom')) { return '--bgm-type none or custom is required (bundled music is not cleared for publishing; AI music is paid)' }
    if ($opts['--bgm-type'] -eq 'custom') {
        # Only your own tracks, as a bare filename placed in MPT_HOME\storage\bgm (never resource/songs).
        $bgm = $opts['--bgm-file']
        if (-not $bgm -or $bgm -match '[\\/:]' -or -not (Test-Path -LiteralPath (Join-Path $env:MPT_HOME "storage\bgm\$bgm") -PathType Leaf)) {
            return "--bgm-type custom needs --bgm-file <name> of a file in $env:MPT_HOME\storage\bgm"
        }
    } elseif ($opts.ContainsKey('--bgm-file')) { return '--bgm-file needs --bgm-type custom' }
    $voice = $opts['--voice-name']
    $edgeVoice = $voice -cmatch '^[a-z]{2,3}-[A-Z][A-Za-z]+(-[A-Za-z]+)?-[A-Za-z]+Neural-(Male|Female)$'
    if (-not $opts['--custom-audio-file'] -and $voice -ne 'no-voice' -and -not $edgeVoice) {
        return '--voice-name must be an Edge TTS voice (e.g. en-US-AndrewNeural-Male) or no-voice, or pass --custom-audio-file'
    }
    return ''
}

switch ($command) {
    'version' {
        Write-Output "MPT dir: $mptDir"
        Write-Output "MPT_HOME: $env:MPT_HOME"
        & git -C $mptDir rev-parse HEAD
        exit (Invoke-ExternalTool $python @('-I', '-c', 'import sys,tomllib;print(sys.version.split()[0]);print(tomllib.load(open(sys.argv[1],"rb"))["project"]["version"])', (Join-Path $mptDir 'pyproject.toml')))
    }
    'help' { exit (Invoke-ExternalTool $python @($cli, '--help')) }
    'run' {
        if ($rest.Count -lt 2 -or $rest[0] -ne '-Project' -or $rest[1] -notmatch '^[A-Za-z0-9._-]+$') {
            [Console]::Error.WriteLine('Usage: mpt.ps1 run -Project <name> <cli.py args...>'); exit 2
        }
        $project = $rest[1]
        $cliArgs = @($rest | Select-Object -Skip 2)
        $problem = Test-FreeRun $cliArgs
        if ($problem) { [Console]::Error.WriteLine("Refused: $problem. See EXTERNAL-TOOLS.md, MoneyPrinterTurbo."); exit 2 }
        $taskId = [guid]::NewGuid().ToString()
        $code = Invoke-ExternalTool $python (@($cli) + $cliArgs + @('--task-id', $taskId))
        $taskDir = Join-Path $env:MPT_HOME "storage\tasks\$taskId"
        $out = Join-Path $repo "media-out\mpt\$project"
        $videos = @(Get-ChildItem -LiteralPath $taskDir -Filter '*.mp4' -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'final*' })
        if ($videos.Count) {
            New-Item -ItemType Directory -Force -Path $out | Out-Null
            foreach ($v in $videos) {
                $dest = Join-Path $out "$($taskId.Substring(0,8))-$($v.Name)"
                Copy-Item -LiteralPath $v.FullName -Destination $dest
                Write-Output "Saved: $dest"
            }
        }
        Write-Output "Task folder: $taskDir"
        exit $code
    }
    default { [Console]::Error.WriteLine('Usage: mpt.ps1 version | help | run -Project <name> <cli.py args...>'); exit 2 }
}
