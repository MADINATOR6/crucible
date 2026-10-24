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
    Check ((Run new -Project 'Demo One' -Dir $d -Budget 45).Code -eq 0) 'new'
    $project = Get-Content -LiteralPath (Join-Path $d 'demo-one\project.json') -Raw | ConvertFrom-Json
    Check ($project.budget -eq 45) 'new stores budget'
    Check ((Run new -Project 'Demo One' -Dir $d).Code -eq 2) 'new refuses duplicate'
    Check ((Run element -Project demo-one -Dir $d -Name runner -Category character -Id $id).Out -match [regex]::Escape("<<<$id>>>")) 'element prints placeholder'
    Check ((Run element -Project demo-one -Dir $d -Name runner -Category character -Id $id).Code -eq 2) 'element refuses duplicate name'
    Check ((Run element -Project demo-one -Dir $d -Name x -Category prop -Id nope).Code -eq 2) 'element rejects bad uuid'
    Check ((Run log -Project demo-one -Dir $d -Task 'bad id' -Credits 1).Code -eq 2) 'log rejects bad task id'
    $null = Run log -Project demo-one -Dir $d -Task HF-1 -Kind image -Model gpt_image_2 -Credits 6.5 -Job j1
    $null = Run log -Project demo-one -Dir $d -Task OTHER -Kind video -Model seedance_2_0 -Credits 40 -Job j2
    $first = Get-Content -LiteralPath (Join-Path $d 'demo-one\log.jsonl') -First 1 | ConvertFrom-Json
    Check ($first.task -ceq 'HF-1') 'log stores task id'
    $r = Run summary -Project demo-one -Dir $d
    Check ($r.Code -eq 1 -and $r.Out -match 'total\s+46\.5' -and $r.Out -match 'budget\s+45') 'summary uses project budget'
    Check ((Run summary -Project demo-one -Dir $d -Budget 50).Code -eq 0) 'summary budget override'
    $r = Run summary -Project demo-one -Dir $d -Task HF-1
    Check ($r.Code -eq 0 -and $r.Out -match 'task\s+HF-1' -and $r.Out -match 'total\s+6\.5') 'summary filters task'
    $r = Run summary -Project demo-one -Dir $d -Task HF-1 -Next 39
    Check ($r.Code -eq 1 -and $r.Out -match 'OVER BUDGET: 6\.5 \+ next 39 > 45') 'summary rejects pending call over cap'
    Check ((Run summary -Project demo-one -Dir $d -Task HF-1 -Next 38).Code -eq 0) 'summary permits pending call within cap'
} finally { Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue }
if ($script:bad) { exit 1 }
Write-Host 'PASS'
