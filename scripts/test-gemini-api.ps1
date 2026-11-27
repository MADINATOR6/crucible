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
    $null = & powershell -NoProfile -ExecutionPolicy Bypass -File $wrapper @WrapperArgs 2>&1
    @{ code = $LASTEXITCODE; args = if ([IO.File]::Exists($argLog)) { [IO.File]::ReadAllText($argLog).Trim() } else { $null } }
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
        Assert ($r.args -eq "analyze|-i|$doc|Summarize") "args: $($r.args)"
    }
    Case '-DryRun adds --dry-run' {
        $r = Run @('analyze', '-Source', $doc, '-DryRun')
        Assert ($r.args -like '*|--dry-run') "args: $($r.args)"
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
    Case 'transcripts must land under media-out/ or outside the repo' {
        $bad = Run @('transcribe', '-Source', $doc, '-Out', (Join-Path $repo 'handoffs\t.md'))
        Assert ($bad.code -eq 2 -and $null -eq $bad.args) 'transcript into a tracked folder accepted'
        $good = Join-Path $repo 'media-out\gemini-api\t.md'
        $ok = Run @('transcribe', '-Source', $doc, '-Out', $good, '-Format', 'srt')
        Assert ($ok.code -eq 0 -and $ok.args -eq "transcribe|-i|$doc|--format|srt|--out|$good") "args: $($ok.args)"
    }
} finally {
    Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "$passed/$($passed + $failed) passed"
if ($failed) { exit 1 }
