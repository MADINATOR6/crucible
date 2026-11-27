$ErrorActionPreference = 'Stop'
# Offline checks for scripts/gemini-api.ps1 (GEMINI-API-1): a fake binary logs its arguments; nothing is sent.
$repo = Split-Path -Parent $PSScriptRoot
$wrapper = Join-Path $PSScriptRoot 'gemini-api.ps1'
$scratch = Join-Path $repo ('.test-scratch\gemini-api-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
[void][IO.Directory]::CreateDirectory($scratch)
$argLog = Join-Path $scratch 'args.txt'
$fake = Join-Path $scratch 'fake-gemini-api.ps1'
[IO.File]::WriteAllText($fake, "Set-Content -LiteralPath '$argLog' -Value (`$args -join '|'); exit 0")
$env:CRUCIBLE_GEMINI_API_EXE = $fake
$passed = 0; $failed = 0
function Run([string[]]$WrapperArgs) {
    if ([IO.File]::Exists($argLog)) { [IO.File]::Delete($argLog) }
    $ErrorActionPreference = 'Continue' # the wrapper's refusals go to stderr
    $text = (& powershell -NoProfile -ExecutionPolicy Bypass -File $wrapper @WrapperArgs 2>&1 | Out-String)
    @{ code = $LASTEXITCODE; text = $text; args = if ([IO.File]::Exists($argLog)) { [IO.File]::ReadAllText($argLog).Trim() } else { $null } }
}
function Case([string]$Name, [scriptblock]$Body) {
    try { & $Body; $script:passed++; Write-Output "PASS $Name" } catch { $script:failed++; Write-Output "FAIL $Name : $($_.Exception.Message)" }
}
function Assert($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }

$doc = Join-Path $scratch 'notes.txt'; [IO.File]::WriteAllText($doc, 'synthetic')
$env1 = Join-Path $scratch '.env'; [IO.File]::WriteAllText($env1, 'X=1')
$book = Join-Path $scratch 'book.xlsx'; [IO.File]::WriteAllText($book, 'x')
$nursing = Join-Path $scratch 'nursing-a2\week1.txt'; [void][IO.Directory]::CreateDirectory((Split-Path $nursing)); [IO.File]::WriteAllText($nursing, 'x')
try {
    Case 'analyze passes the file, the question and nothing else' {
        $r = Run @('analyze', '-Source', $doc, '-Question', 'Summarize')
        Assert ($r.code -eq 0) "exit $($r.code)"
        Assert ($r.args -eq "analyze|-i|$doc|--|Summarize") "args: $($r.args)"
    }
    Case '-DryRun adds --dry-run, before the question' {
        $r = Run @('analyze', '-Source', $doc, '-Question', 'Q', '-DryRun')
        Assert ($r.args -eq "analyze|-i|$doc|--dry-run|--|Q") "args: $($r.args)"
    }
    Case 'a question shaped like a flag stays the question (security review)' {
        $r = Run @('analyze', '-Source', $doc, '-Question', '--model=gemini-pro')
        Assert ($r.code -eq 0 -and $r.args -eq "analyze|-i|$doc|--|--model=gemini-pro") "args: $($r.args)"
    }
    Case 'a junction into a private folder is refused (security review)' {
        $link = Join-Path $scratch 'innocent'
        $null = & cmd.exe /d /c mklink /J "$link" "$(Split-Path $nursing)" 2>&1
        Assert (Test-Path (Join-Path $link 'week1.txt')) 'junction not created'
        $r = Run @('analyze', '-Source', (Join-Path $link 'week1.txt'))
        Assert ($r.code -eq 2 -and $null -eq $r.args) "code $($r.code), args $($r.args)"
    }
    foreach ($private in @($env1, $book, $nursing)) {
        Case "private file refused before anything runs: $([IO.Path]::GetFileName($private))" {
            $r = Run @('analyze', '-Source', $private)
            Assert ($r.code -eq 2 -and $null -eq $r.args) "code $($r.code), args $($r.args)"
        }
    }
    Case 'options outside the allowlist are refused (model override)' {
        $r = Run @('analyze', '-Source', $doc, '-Model', 'gemini-pro')
        Assert ($r.code -eq 2 -and $null -eq $r.args) "code $($r.code)"
    }
    Case 'other commands are refused (generate, image, video)' {
        foreach ($c in 'generate', 'image', 'video') { $r = Run @($c, '-Source', $doc); Assert ($r.code -eq 2 -and $null -eq $r.args) "$c ran" }
    }
    Case 'only YouTube URLs are allowed' {
        $ok = Run @('analyze', '-Source', 'https://youtu.be/abcDEF12345')
        Assert ($ok.code -eq 0 -and $ok.args -eq 'analyze|-i|https://youtu.be/abcDEF12345') "youtube: $($ok.args)"
        $bad = Run @('analyze', '-Source', 'https://example.com/a.pdf')
        Assert ($bad.code -eq 2 -and $null -eq $bad.args) 'other URL accepted'
    }
    Case 'transcripts land only under this checkout''s media-out/ (Codex review)' {
        $bad = Run @('transcribe', '-Source', $doc, '-Out', (Join-Path $repo 'handoffs\t.md'))
        Assert ($bad.code -eq 2 -and $null -eq $bad.args) 'transcript into a tracked folder accepted'
        $outside = Run @('transcribe', '-Source', $doc, '-Out', (Join-Path $scratch 'elsewhere\t.md'))
        Assert ($outside.code -eq 2 -and $null -eq $outside.args) 'transcript outside media-out accepted (could be another checkout)'
        [void][IO.Directory]::CreateDirectory((Join-Path $repo 'media-out'))
        $escape = Join-Path $repo 'media-out\gemini-api-escape'
        $null = & cmd.exe /d /c mklink /J "$escape" "$scratch" 2>&1
        Assert (Test-Path -LiteralPath $escape) 'junction not created'
        try {
            $via = Run @('transcribe', '-Source', $doc, '-Out', (Join-Path $escape 'new\t.md'))
            Assert ($via.code -eq 2 -and $null -eq $via.args -and $via.text -match 'leaves media-out/ through a link') "junction below media-out not refused for the link: $($via.text)"
            Assert (-not (Test-Path -LiteralPath (Join-Path $scratch 'new'))) 'a refused junction still got a folder created at its target'
        } finally { if (Test-Path -LiteralPath $escape) { [IO.Directory]::Delete($escape) } }
        # media-out itself as a junction: a throwaway copy of the repo layout, so no real folder is replaced.
        $fakeRepo = Join-Path $scratch 'fake-repo'
        foreach ($d in 'scripts', 'ccx') { [void][IO.Directory]::CreateDirectory((Join-Path $fakeRepo $d)) }
        foreach ($f in 'gemini-api.ps1', 'invoke-external-tool.ps1') { Copy-Item (Join-Path $PSScriptRoot $f) (Join-Path $fakeRepo "scripts\$f") }
        Copy-Item (Join-Path $repo 'ccx\policy.json') (Join-Path $fakeRepo 'ccx\policy.json')
        $elsewhere = Join-Path $scratch 'elsewhere-root'; [void][IO.Directory]::CreateDirectory($elsewhere)
        $null = & cmd.exe /d /c mklink /J "$(Join-Path $fakeRepo 'media-out')" "$elsewhere" 2>&1
        Assert (Test-Path -LiteralPath (Join-Path $fakeRepo 'media-out')) 'media-out junction not created'
        $saved = $wrapper; $script:wrapper = Join-Path $fakeRepo 'scripts\gemini-api.ps1'
        try {
            $root = Run @('transcribe', '-Source', $doc, '-Out', (Join-Path $fakeRepo 'media-out\t.md'))
            Assert ($root.code -eq 2 -and $null -eq $root.args -and $root.text -match 'media-out/ is a link') "transcript through a media-out junction not refused for the link: $($root.text)"
        } finally { $script:wrapper = $saved; [IO.Directory]::Delete((Join-Path $fakeRepo 'media-out')) }
        $good = Join-Path $repo 'media-out\gemini-api\t.md'
        $two = Run @('transcribe', '-Source', $doc, '-Source', $doc, '-Out', $good)
        Assert ($two.code -eq 2 -and $null -eq $two.args) 'two sources accepted (the CLI would treat -Out as a folder)'
        $ok = Run @('transcribe', '-Source', $doc, '-Out', $good, '-Format', 'srt')
        Assert ($ok.code -eq 0 -and $ok.args -eq "transcribe|-i|$doc|--format|srt|--out|$good") "args: $($ok.args)"
    }
} finally {
    Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "$passed/$($passed + $failed) passed"
if ($failed) { exit 1 }
