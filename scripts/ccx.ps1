[CmdletBinding()]
param(
    [Parameter(Position=0)][string]$Command,
    [Parameter(Position=1)][string]$Sub,
    [string]$Id, [string]$TaskId, [string]$Title, [string]$Type, [string]$Class, [string]$Risk,
    [string]$Owner, [string[]]$Owns, [string]$Parent, [string[]]$DependsOn, [string]$TaskFile,
    [string]$Status, [string]$Note, [string]$Result, [string]$By, [string]$Kind,
    [string]$Action, [AllowNull()][string]$Target, [string]$Reason, [string]$Quote,
    [string]$Key, [string]$Data, [string]$Max, [string[]]$Stage, [string[]]$Path,
    [string]$Agent, [string]$Base, [string]$Branch, [string]$Into, [string]$Attempt,
    [string]$AuthoredBy, [string[]]$Add, [string]$Worktree, [string]$Merge,
    [switch]$Chat, [switch]$Quick, [switch]$Baseline, [switch]$Apply, [switch]$Full,
    [switch]$Json, [switch]$Brief, [switch]$Ambiguous, [switch]$RequestMythos, [switch]$All
)
$ErrorActionPreference = 'Stop'
try {
    . (Join-Path $PSScriptRoot 'ccx-core.ps1')
    $parameters = @{}
    foreach ($keyName in $PSBoundParameters.Keys) { $parameters[$keyName] = $PSBoundParameters[$keyName] }
    $parameters.Sub = $Sub
    foreach ($keyName in @('Owns','DependsOn','Stage','Path','Add')) {
        if ($parameters.ContainsKey($keyName)) { $parameters[$keyName] = @(Split-CcxList $parameters[$keyName]) }
    }
    $null = Get-CcxPolicy
    if (-not $Command -or $Command -eq 'help') {
        Write-CcxOutput 'Usage: ccx.ps1 <command> [sub] [options]. Commands: task, route, gate, approve, deny, event, ack, stats. Use -Json for JSON output.' $parameters
        exit 0
    }
    $ops = Join-Path $PSScriptRoot 'ccx-ops.ps1'
    if ([IO.File]::Exists($ops)) { . $ops }
    if ($Command -notmatch '^[a-z]+(?:-[a-z]+)*$') { throw (New-CcxError ("Command not available: " + $Command) 2) }
    $suffix = ($Command.Split('-') | ForEach-Object { $_.Substring(0,1).ToUpperInvariant() + $_.Substring(1) }) -join ''
    $handler = Get-Command ('Invoke-CcxCmd' + $suffix) -CommandType Function -ErrorAction SilentlyContinue
    if (-not $handler) { throw (New-CcxError ("Command not available: " + $Command) 2) }
    $code = & $handler $parameters
    exit [int]$code
} catch {
    $code = 1
    $exception = $_.Exception
    while ($exception) {
        if ($exception.Data.Contains('ccxExit')) { $code = [int]$exception.Data['ccxExit']; break }
        $exception = $exception.InnerException
    }
    # If policy cannot be loaded, never echo parser errors or untrusted input.
    try { $message = Protect-CcxText $_.Exception.Message }
    catch { $message = 'Invalid CCX policy or unavailable configuration.' }
    if ($Json -and $script:CcxJson) { [Console]::Out.WriteLine($script:CcxJson.Serialize(@{error=$message; code=$code})) }
    else { [Console]::Out.WriteLine($message) }
    exit $code
}
