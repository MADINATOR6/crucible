param(
    [Parameter(Position = 0)][ValidateSet('show', 'new', 'element', 'log', 'summary')][string]$Command = 'show',
    [string]$Project,
    [string]$Image = 'gpt_image_2',
    [string]$Video = 'seedance_2_0',
    [string]$Aspect = '16:9',
    [string]$Resolution = '1080p',
    [string]$Name,
    [ValidateSet('character', 'environment', 'prop')][string]$Category,
    [string]$Id,
    [ValidateSet('image', 'video', 'audio', 'upscale', 'other')][string]$Kind = 'other',
    [string]$Model,
    [double]$Credits = 0,
    [string]$Job,
    [string]$File,
    [string]$Prompt,
    [double]$Budget = 0,
    [string]$Dir
)
# Shared entry point for Claude and Codex (see .claude/skills/higgsfield/playbook.md).
# Bookkeeping only: never calls Higgsfield, spends nothing. State lives in gitignored media-out/higgsfield/<project>/.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object Text.UTF8Encoding($false)
function Fail($m) { [Console]::Error.WriteLine($m); exit 2 }

if ($Command -eq 'show') {
    [Console]::Out.Write([IO.File]::ReadAllText((Join-Path $root '.claude\skills\higgsfield\playbook.md'), $utf8))
    exit 0
}
if (-not $Project) { Fail "$Command needs -Project" }
if (-not $Dir) { $Dir = Join-Path $root 'media-out\higgsfield' }
$slug = ($Project.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
$pdir = Join-Path $Dir $slug
$pfile = Join-Path $pdir 'project.json'
$lfile = Join-Path $pdir 'log.jsonl'
function Save($o) { [IO.File]::WriteAllText($pfile, ($o | ConvertTo-Json -Depth 6), $utf8) }
function Load { if (-not (Test-Path -LiteralPath $pfile)) { Fail "no project '$slug'; run: higgsfield.ps1 new -Project $slug" }; [IO.File]::ReadAllText($pfile, $utf8) | ConvertFrom-Json }

switch ($Command) {
    'new' {
        if (Test-Path -LiteralPath $pfile) { Fail "project exists: $pfile" }
        New-Item -ItemType Directory -Force -Path $pdir | Out-Null
        # One image model for hero + every reference sheet: mixing models makes elements read differently.
        Save ([ordered]@{ name = $slug; imageModel = $Image; videoModel = $Video; aspect = $Aspect; resolution = $Resolution; elements = @() })
        [Console]::Out.WriteLine($pfile)
    }
    'element' {
        if (-not $Name -or -not $Category -or -not $Id) { Fail 'element needs -Name -Category -Id' }
        if ($Id -notmatch '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$') { Fail '-Id must be the element UUID' }
        $p = Load
        if (@($p.elements | Where-Object { $_.name -eq $Name }).Count) { Fail "element '$Name' already registered" }
        $p.elements = @($p.elements) + [pscustomobject]@{ name = $Name; category = $Category; id = $Id }
        Save $p
        [Console]::Out.WriteLine("<<<$Id>>>  = $Name ($Category)")
    }
    'log' {
        $null = Load
        $row = [ordered]@{ ts = (Get-Date).ToUniversalTime().ToString('s') + 'Z'; kind = $Kind; model = $Model; credits = $Credits; job = $Job; file = $File; prompt = $Prompt }
        [IO.File]::AppendAllText($lfile, (($row | ConvertTo-Json -Compress) + "`n"), $utf8)
    }
    'summary' {
        $p = Load
        [Console]::Out.WriteLine("project ${slug}: image=$($p.imageModel) video=$($p.videoModel) $($p.aspect) $($p.resolution)")
        foreach ($e in $p.elements) { [Console]::Out.WriteLine("  element $($e.name) [$($e.category)] <<<$($e.id)>>>") }
        $rows = @(); if (Test-Path -LiteralPath $lfile) { $rows = @(Get-Content -LiteralPath $lfile -Encoding UTF8 | Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json }) }
        foreach ($g in ($rows | Group-Object kind)) { [Console]::Out.WriteLine(('  {0,-8} {1,3} jobs {2,8:N1} credits' -f $g.Name, $g.Count, ($g.Group | Measure-Object credits -Sum).Sum)) }
        $total = [double](($rows | Measure-Object credits -Sum).Sum)
        [Console]::Out.WriteLine(('  total    {0:N1} credits' -f $total))
        if ($Budget -gt 0 -and $total -gt $Budget) { [Console]::Out.WriteLine("OVER BUDGET: $total > $Budget"); exit 1 }
    }
}
exit 0
