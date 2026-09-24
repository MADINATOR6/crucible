<#
Dispatch-mode launcher for Codex. Run from the repo root:
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\codex-dispatch.ps1 [-Effort high] [-PromptFile <path>]
The execution-policy bypass applies to this one process only.
Prints Codex's report and its token usage; exits with Codex's exit code, or 3 if no report was written.
#>
param(
  [ValidateSet('medium', 'high')] [string]$Effort = 'medium',
  [string]$PromptFile,
  [string]$CaptureDir = (Join-Path $env:USERPROFILE 'codex-captures'),
  [ValidateSet('read-only', 'workspace-write', 'danger-full-access')] [string]$Sandbox = 'workspace-write'
)
$ErrorActionPreference = 'Stop'

$root = (git rev-parse --show-toplevel 2>$null)
if (-not $root) { throw 'Not inside a Git repository.' }
Set-Location ($root -replace '/', '\')
if (-not (Test-Path TASK.md) -and -not $PromptFile) { throw 'TASK.md not found.' }

# codex.cmd splits multi-line prompts, so longer instructions go in a file.
$prompt = 'Read HANDOFF.md and follow its Implementer instruction for TASK.md.'
if ($PromptFile) {
  $full = (Resolve-Path -LiteralPath $PromptFile).Path
  $prompt = "Read $full and follow it."
}

$base = Join-Path ([IO.Path]::GetFullPath($CaptureDir)) ('codex-' + [guid]::NewGuid().ToString('N'))
# Longest capture file name is base + '.events.jsonl'; stay under MAX_PATH (260). Check before creating anything.
if (($base.Length + 13) -ge 260) { throw "Capture path too long ($($base.Length + 13) chars). Pass a shorter -CaptureDir." }
New-Item -ItemType Directory -Force -Path $CaptureDir | Out-Null

$head = (git rev-parse --short HEAD)
Write-Output "Dispatching Codex: HEAD=$head effort=$Effort sandbox=$Sandbox"
$ErrorActionPreference = 'Continue'  # codex writes progress to stderr
& codex.cmd exec -s $Sandbox -c "model_reasoning_effort=$Effort" --json --output-last-message ($base + '.report.md') $prompt 1> ($base + '.events.jsonl') 2> ($base + '.stderr.log')
$code = $LASTEXITCODE
Set-Content -LiteralPath ($base + '.exit.txt') -Value $code -Encoding ascii

$usage = Get-Content -LiteralPath ($base + '.events.jsonl') -Encoding utf8 -ErrorAction SilentlyContinue |
  Where-Object { $_ -match '"type":"turn\.completed"' } |
  ForEach-Object { ($_ | ConvertFrom-Json).usage }
if ($usage) {
  $in = ($usage | Measure-Object input_tokens -Sum).Sum
  $cached = ($usage | Measure-Object cached_input_tokens -Sum).Sum
  $out = ($usage | Measure-Object output_tokens -Sum).Sum
  Write-Output "Codex tokens: input=$in (cached=$cached) output=$out"
} else {
  Write-Output 'Codex tokens: unknown (no turn.completed event)'
}

Write-Output "Codex exit=$code; capture=$base"
if (-not (Test-Path -LiteralPath ($base + '.report.md'))) {
  Write-Output 'NO REPORT: inspect the .events.jsonl and .stderr.log captures and the working-tree diff.'
  if ($code -eq 0) { exit 3 } else { exit $code }
}
Write-Output '--- report ---'
Get-Content -LiteralPath ($base + '.report.md') -Encoding utf8
exit $code
