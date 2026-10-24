# Offline self-check for scripts/higgsfield.ps1 (temp dir, no network). Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-higgsfield.ps1
$ErrorActionPreference = 'Stop'
$s = Join-Path $PSScriptRoot 'higgsfield.ps1'
$d = Join-Path ([IO.Path]::GetTempPath()) ("hf-test-" + [guid]::NewGuid().ToString('N'))
$id = [guid]::NewGuid().ToString()
function Run {
    $ErrorActionPreference = 'Continue'  # expected-failure cases write to stderr; don't let that throw
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $s @args 2>&1 | Out-String
    [pscustomobject]@{ Code = $LASTEXITCODE; Out = $out }
}
function Check($c, $m) { if (-not $c) { Write-Host "FAIL: $m"; $script:bad = $true } }
try {
    Check ((Run show).Out -match 'Higgsfield playbook') 'show prints playbook'
    Check ((Run new -Project 'Demo One' -Dir $d).Code -eq 0) 'new'
    Check ((Run new -Project 'Demo One' -Dir $d).Code -eq 2) 'new refuses duplicate'
    Check ((Run element -Project demo-one -Dir $d -Name runner -Category character -Id $id).Out -match [regex]::Escape("<<<$id>>>")) 'element prints placeholder'
    Check ((Run element -Project demo-one -Dir $d -Name runner -Category character -Id $id).Code -eq 2) 'element refuses duplicate name'
    Check ((Run element -Project demo-one -Dir $d -Name x -Category prop -Id nope).Code -eq 2) 'element rejects bad uuid'
    $null = Run log -Project demo-one -Dir $d -Kind image -Model gpt_image_2 -Credits 6.5 -Job j1
    $null = Run log -Project demo-one -Dir $d -Kind video -Model seedance_2_0 -Credits 40 -Job j2
    $r = Run summary -Project demo-one -Dir $d
    Check ($r.Code -eq 0 -and $r.Out -match 'total\s+46\.5') 'summary totals credits'
    Check ((Run summary -Project demo-one -Dir $d -Budget 40).Code -eq 1) 'summary flags over budget'
} finally { Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue }
if ($script:bad) { exit 1 }
Write-Host 'PASS'
