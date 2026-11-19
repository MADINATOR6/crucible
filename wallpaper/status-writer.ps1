# Exports only public status fields. Run in a terminal; Ctrl+C stops the loop.
param(
  [string]$Repo = (Split-Path -Parent $PSScriptRoot),
  [ValidateRange(1, 3600)][int]$IntervalSec = 5,
  [switch]$Once
)
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot 'status.js'
$statePath = Join-Path $Repo '.git\ccx\state.json'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Utc($value) {
  if ($value -is [string]) {
    $parsed = [DateTimeOffset]::MinValue
    if ([DateTimeOffset]::TryParse($value, [ref]$parsed)) { return $parsed.UtcDateTime }
  }
  return [DateTime]::MinValue
}

function Empty-Status($now) {
  return [ordered]@{
    live = $false; updated = $now.ToString('o')
    codex = 'idle'; gemini = 'idle'; claude = 'idle'; stage = ''
    activeIds = @(); done = 0; open = 0; approvals = 0
  }
}

do {
  $now = [DateTime]::UtcNow
  $status = Empty-Status $now
  try {
    if (Test-Path -LiteralPath $statePath -PathType Leaf) {
      $s = [IO.File]::ReadAllText($statePath, $utf8) | ConvertFrom-Json
      if ($s.tasks -isnot [PSCustomObject]) { throw 'Invalid state' }
      $tasks = @($s.tasks.PSObject.Properties | ForEach-Object { $_.Value })
      $codexUntil = Utc $s.agents.codex.unavailableUntil
      $geminiUntil = Utc $s.providerLimits.gemini
      $lane = {
        param($provider, $until)
        if ($until -gt $now) { return 'limit' }
        $running = @($tasks | Where-Object {
          $dispatchProvider = $_.lastDispatch.provider
          if (-not $dispatchProvider -or $dispatchProvider -eq 'openai') { $dispatchProvider = 'codex' }
          $_.status -in 'active', 'verifying' -and $_.lastDispatch.startedAt -and
            -not $_.lastDispatch.endedAt -and $dispatchProvider -eq $provider
        })
        if ($running.Count) { 'working' } else { 'idle' }
      }
      $open = @($tasks | Where-Object { $_.status -in 'active', 'verifying' })
      $newest = $open | Sort-Object { Utc $_.updated } -Descending | Select-Object -First 1
      $claudeBusy = [bool](@($open | Where-Object { $_.owner -eq 'claude' }).Count)
      $status = [ordered]@{
        live = $true
        updated = $now.ToString('o')
        codex = (& $lane 'codex' $codexUntil)
        gemini = (& $lane 'gemini' $geminiUntil)
        claude = $(if ($claudeBusy) { 'working' } else { 'idle' })
        stage = $(if ($newest) { ([string]$newest.status).ToLowerInvariant() } else { '' })
        activeIds = @($open | ForEach-Object {
          if ($_.id -is [string] -and $_.id -cmatch '^[A-Za-z0-9._-]{1,24}\z') { $_.id }
        } | Select-Object -Unique -First 3)
        done = [Math]::Min(999999, @($tasks | Where-Object { $_.status -eq 'done' }).Count)
        open = [Math]::Min(999999, $open.Count)
        approvals = [Math]::Min(999999, @($s.approvals.PSObject.Properties | Where-Object { $_.Value.status -eq 'pending' }).Count)
      }
      if ($codexUntil -gt $now) { $status['codexUntil'] = $codexUntil.ToString('HH:mm') + ' UTC' }
      if ($geminiUntil -gt $now) { $status['geminiUntil'] = $geminiUntil.ToString('HH:mm') + ' UTC' }
    }
  } catch { $status = Empty-Status $now }

  $js = 'window.PALS_STATUS = ' + ($status | ConvertTo-Json -Compress -Depth 4) + ';'
  $temp = Join-Path $PSScriptRoot ('.status-' + [Guid]::NewGuid().ToString('N') + '.tmp')
  try {
    [IO.File]::WriteAllText($temp, $js, $utf8)
    # Replace is an atomic same-volume rename on Windows; Move handles first creation.
    if ([IO.File]::Exists($out)) { [IO.File]::Replace($temp, $out, [NullString]::Value) }
    else { [IO.File]::Move($temp, $out) }
  } finally {
    if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) }
  }
  if (-not $Once) { Start-Sleep -Seconds $IntervalSec }
} while (-not $Once)
