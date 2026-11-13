param(
    [Parameter(Position = 0)][ValidateSet('show', 'new', 'check')][string]$Command = 'show',
    [string]$Topic,
    [string]$Source = '(unspecified)',
    [string]$Path,
    [switch]$Force
)
# Shared entry point for Claude and Codex (see .claude/skills/nursing-notes/SKILL.md).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$skill = Join-Path $root '.claude\skills\nursing-notes'
$utf8 = New-Object Text.UTF8Encoding($false)

switch ($Command) {
    'show' {
        [Console]::Out.Write([IO.File]::ReadAllText((Join-Path $skill 'SKILL.md'), $utf8))
        exit 0
    }
    'new' {
        if (-not $Topic) { [Console]::Error.WriteLine('new needs -Topic'); exit 2 }
        if (-not $Path) {
            $slug = ($Topic.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
            $Path = Join-Path $root "nursing-a2\study\$slug.md"
        }
        if ((Test-Path -LiteralPath $Path) -and -not $Force) {
            [Console]::Error.WriteLine("exists, not overwriting (use -Force): $Path"); exit 2
        }
        $dir = Split-Path -Parent $Path
        if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
        $text = [IO.File]::ReadAllText((Join-Path $skill 'template.md'), $utf8).Replace('{{TOPIC}}', $Topic).Replace('{{SOURCE}}', $Source)
        [IO.File]::WriteAllText($Path, $text, $utf8)
        [Console]::Out.WriteLine($Path)
        exit 0
    }
    'check' {
        if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { [Console]::Error.WriteLine('check needs an existing -Path'); exit 2 }
        $text = [IO.File]::ReadAllText($Path, $utf8)
        $fail = New-Object Collections.Generic.List[string]
        foreach ($h in 'Snapshot', 'Notes', 'Memory hooks', 'Reviewer', 'Flashcards', 'Questions', 'Case scenarios', 'Source map') {
            if ($text -notmatch "(?m)^#{2,3} $([regex]::Escape($h))\s*$") { $fail.Add("missing section: $h") }
        }
        if ($text -notmatch "lecturer's material") { $fail.Add('missing study-support disclaimer line') }
        if ($text -match '\{\{') { $fail.Add('unfilled template placeholder') }
        $cards = ([regex]::Matches($text, '(?m)^\s*(?:[-*]\s*)?Q\d*[:.)]')).Count
        if ($cards -lt 25) { $fail.Add("expected at least 25 Q items (15 flashcards + 10 questions), found $cards") }
        $tags = ([regex]::Matches($text, '\[S: [^\]]+\]')).Count
        if ($tags -lt 5) { $fail.Add("too few source tags [S: file p.N]: $tags") }
        if ($text -match '(?i)\b\d+(\.\d+)?\s?(mg|mcg|ml|mmol|mmhg)\b') {
            foreach ($line in ($text -split "`r?`n")) {
                if ($line -match '(?i)\b\d+(\.\d+)?\s?(mg|mcg|ml|mmol|mmhg)\b' -and $line -notmatch '\[S: |\[GK\]|UNVERIFIED') {
                    $fail.Add('dose/value without source tag: ' + $line.Trim().Substring(0, [Math]::Min(80, $line.Trim().Length)))
                }
            }
        }
        if ($fail.Count -eq 0) { [Console]::Out.WriteLine('PASS'); exit 0 }
        foreach ($f in $fail) { [Console]::Out.WriteLine("FAIL: $f") }
        exit 1
    }
}
