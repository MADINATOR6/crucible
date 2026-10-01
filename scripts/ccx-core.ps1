# Dot-sourced CCX library. Windows PowerShell 5.1 / .NET Framework only.
Add-Type -AssemblyName System.Web.Extensions
$script:CcxUtf8 = New-Object Text.UTF8Encoding $false
$script:CcxJson = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$script:CcxJson.MaxJsonLength = [int]::MaxValue
$script:CcxLockState = $null
# Per-process caches: each lookup spawns git or re-validates the policy.
$script:CcxRootCache = @{}
$script:CcxCommonCache = @{}
$script:CcxPolicyCache = $null

function New-CcxError {
    param([string]$Message, [int]$Code = 1)
    $errorObject = New-Object System.Exception $Message
    $errorObject.Data['ccxExit'] = $Code
    return $errorObject
}
function Get-CcxNow { [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ') }
function ConvertTo-CcxArgument([string]$Value) {
    # Windows CommandLineToArgvW quoting, including trailing backslashes.
    '"' + [regex]::Replace([regex]::Replace($Value, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
}
function Invoke-CcxGit {
    param([string]$Root = (Get-Location).ProviderPath, [string[]]$Arguments)
    $info = New-Object Diagnostics.ProcessStartInfo
    foreach ($name in @('GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE')) {
        [void]$info.EnvironmentVariables.Remove($name)
    }
    $info.FileName = 'git.exe'
    $info.Arguments = (@($Arguments | ForEach-Object { ConvertTo-CcxArgument $_ }) -join ' ')
    $info.WorkingDirectory = $Root
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = $script:CcxUtf8
    $info.StandardErrorEncoding = $script:CcxUtf8
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw (New-CcxError 'Git command failed; check the repository and arguments.') }
        return $stdout.Result
    } finally { $process.Dispose() }
}
function Get-CcxRepoRoot {
    $here = (Get-Location).ProviderPath
    if (-not $script:CcxRootCache.ContainsKey($here)) {
        $script:CcxRootCache[$here] = (Invoke-CcxGit -Root $here -Arguments @('rev-parse', '--show-toplevel')).Trim()
    }
    $script:CcxRootCache[$here]
}
function Get-CcxMainRoot {
    param([string]$Root = (Get-CcxRepoRoot))
    foreach ($line in (Invoke-CcxGit -Root $Root -Arguments @('worktree', 'list', '--porcelain')).Split([char]10)) {
        if ($line.StartsWith('worktree ')) { return $line.Substring(9).TrimEnd([char]13) }
    }
    throw (New-CcxError 'No main worktree found.')
}
function Get-CcxStateDir {
    if ($env:CCX_STATE_DIR) { return [IO.Path]::GetFullPath($env:CCX_STATE_DIR) }
    $here = (Get-Location).ProviderPath
    if (-not $script:CcxCommonCache.ContainsKey($here)) {
        $script:CcxCommonCache[$here] = (Invoke-CcxGit -Root $here -Arguments @('rev-parse', '--path-format=absolute', '--git-common-dir')).Trim()
    }
    Join-Path $script:CcxCommonCache[$here] 'ccx'
}
function Get-CcxPolicy {
    $policyPath = if ($env:CCX_POLICY) { $env:CCX_POLICY } else { Join-Path (Get-CcxRepoRoot) 'ccx/policy.json' }
    try {
        $text = [IO.File]::ReadAllText($policyPath, $script:CcxUtf8)
        # Reuse the validated policy while the file text is unchanged.
        if ($script:CcxPolicyCache -and $script:CcxPolicyCache.path -ceq $policyPath -and $script:CcxPolicyCache.text -ceq $text) { return $script:CcxPolicyCache.policy }
        $policy = $script:CcxJson.DeserializeObject($text)
        foreach ($section in @('schema','models','effortLadder','classes','defaults','risk','escalation','adaptive','taskTypes','permissions','runtime','state','telemetry','redaction','privacy','memory','verify','worktrees','mcp')) {
            if (-not $policy.ContainsKey($section)) { throw "Missing section $section" }
        }
        if (-not $policy.classes.ContainsKey($policy.defaults.class) -or $policy.defaults.risk -notin $policy.risk.levels) { throw 'Invalid defaults' }
        foreach ($excluded in @($policy.privacy.excludePaths)) {
            if (-not ($excluded -is [string]) -or -not $excluded -or $excluded.Contains(':') -or $excluded.StartsWith('/') -or $excluded -match '(^|/)\.\.(/|$)') { throw 'Invalid privacy path' }
        }
        $ladder = @($policy.effortLadder)
        if ($ladder.Count -lt 2 -or @($ladder | Select-Object -Unique).Count -ne $ladder.Count) { throw 'Invalid effortLadder' }
        foreach ($className in $policy.classes.Keys) {
            $classPolicy = $policy.classes[$className]
            foreach ($agentName in @('codex','claude')) {
                foreach ($field in @('base','max')) {
                    if ($classPolicy.effort[$agentName][$field] -notin $ladder) { throw "Unknown effort in class $className" }
                }
                if ([array]::IndexOf($ladder, $classPolicy.effort[$agentName].base) -gt [array]::IndexOf($ladder, $classPolicy.effort[$agentName].max)) { throw "Inverted effort range in $className" }
            }
            if ($classPolicy.effort.min -notin $ladder) { throw "Unknown minimum effort in $className" }
            foreach ($field in @('maxDispatches','maxModelEscalations','maxReviewCycles','maxAgents','maxParallel','timeoutMinutes','tokenTarget')) {
                $number = $classPolicy.budget[$field]
                if ($null -eq $number -or $number -is [string] -or $number -is [bool] -or $number -isnot [ValueType] -or [double]$number -lt 0) { throw "Invalid budget $className.$field" }
            }
        }
        if ($policy.ContainsKey('providers')) {
            foreach ($name in @($policy.providers.Keys)) {
                $provider = $policy.providers[$name]
                # Provider fields reach the Codex command line: keep them to plain names and flags.
                if ($name -notmatch '^[a-z][a-z0-9-]{0,31}$' -or $name -eq 'openai' -or $provider.kind -notin @('local','cloud') -or
                    [string]$provider.model -notmatch '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' -or
                    @($provider.codexFlags | Where-Object { $_ -isnot [string] -or $_ -notmatch '^[A-Za-z0-9=_.:-]{1,64}$' }).Count -or
                    ($provider.ContainsKey('reasoningEffort') -and $provider.reasoningEffort -notin @('none','minimal','low','medium','high','xhigh')) -or
                    ($provider.kind -eq 'local' -and [string]$provider.command -notmatch '^[A-Za-z0-9._-]{1,64}$') -or
                    ($provider.kind -eq 'cloud' -and [string]$provider.envKey -notmatch '^[A-Z][A-Z0-9_]{0,63}$')) { throw "Invalid provider $name" }
            }
        }
        foreach ($fallback in $policy.models.mythos.fallback) {
            if ($fallback.effort -notin $ladder) { throw 'Unknown fallback effort' }
        }
        $levels = $policy.permissions.levels
        foreach ($level in @($policy.permissions.actions.Values) + @($policy.permissions.unknownActionLevel, $policy.models.mythos.maxPermissionLevel, $policy.runtime.maxAutonomousLevel, $policy.mcp.externalWriteLevel)) {
            if (-not $levels.ContainsKey($level)) { throw 'Unknown permission level' }
        }
        foreach ($entry in $policy.taskTypes.Values) {
            if (-not $levels.ContainsKey($entry.level)) { throw 'Unknown task permission level' }
        }
        foreach ($entry in $levels.Values) {
            if ($entry.mode -notin @('autonomous','logged','approval')) { throw 'Unknown permission mode' }
        }
        if (-not $policy.classes.ContainsKey($policy.risk.high.minClass)) { throw 'Unknown high-risk minimum class' }
        if (@($policy.classes.Keys).Count -lt 2 -or @($policy.risk.levels).Count -eq 0) { throw 'Missing default class or risk' }
        foreach ($pattern in $policy.redaction.patterns) { $null = New-Object regex $pattern }
        if ($policy.redaction.maxFieldChars -lt 3) { throw 'Invalid redaction limit' }
        foreach ($field in @('lockTimeoutSeconds','routingLogMax','notificationsMax','checkpointsMax','reviewsMax','historyMaxBytes')) {
            if ($null -eq $policy.state[$field] -or [double]$policy.state[$field] -le 0) { throw "Invalid state limit $field" }
        }
        $script:CcxPolicyCache = @{ path = $policyPath; text = $text; policy = $policy }
        return $policy
    } catch { throw (New-CcxError 'Invalid CCX policy: required sections, effort ranges, permission levels, budgets or limits are missing or invalid.') }
}
function Protect-CcxText {
    # -Full redacts without truncating (whole command output, before it is split into lines).
    param([AllowNull()][string]$Text, $Policy = (Get-CcxPolicy), [switch]$Full)
    if ($null -eq $Text) { return $null }
    foreach ($pattern in $Policy.redaction.patterns) { $Text = [regex]::Replace($Text, $pattern, '[REDACTED]') }
    $limit = [int]$Policy.redaction.maxFieldChars
    if (-not $Full -and $Text.Length -gt $limit) { $Text = $Text.Substring(0, $limit - 3) + '...' }
    return $Text
}
function Protect-CcxValue {
    param($Value, $Policy)
    if ($null -eq $Value) { return $null }
    if ($Value -is [string]) { return (Protect-CcxText -Text $Value -Policy $Policy) }
    if ($Value -is [Collections.IDictionary]) {
        $clean = [ordered]@{}
        foreach ($key in $Value.Keys) {
            $safeKey = Protect-CcxText -Text ([string]$key) -Policy $Policy
            if ($clean.Contains($safeKey)) { throw (New-CcxError 'Redaction would produce duplicate keys.') }
            $clean[$safeKey] = Protect-CcxValue -Value $Value[$key] -Policy $Policy
        }
        return $clean
    }
    if ($Value -is [Collections.IEnumerable]) {
        $items = @()
        foreach ($item in $Value) { $items += ,(Protect-CcxValue -Value $item -Policy $Policy) }
        return ,$items
    }
    return $Value
}
function Find-CcxSecrets {
    param([string]$Text, $Policy = (Get-CcxPolicy))
    for ($index = 0; $index -lt $Policy.redaction.patterns.Count; $index++) {
        foreach ($match in [regex]::Matches($Text, $Policy.redaction.patterns[$index])) {
            @{ patternIndex = $index; line = 1 + [regex]::Matches($Text.Substring(0, $match.Index), [string][char]10).Count }
        }
    }
}
function New-CcxState {
    @{
        schema = 1; updated = Get-CcxNow
        runtime = @{ enabled = $true; lastTick = $null }
        agents = @{ codex = @{ unavailableUntil = $null; reason = $null } }
        tasks = @{}; approvals = @{}; eventQueue = @(); eventKeys = @{}
        notifications = @(); routingLog = @()
        counters = @{ approval = 0; notification = 0 }
    }
}
function Update-CcxExpiry($State) {
    foreach ($approval in $State.approvals.Values) {
        if ($approval.status -eq 'approved' -and $approval.expires -and [DateTime]::Parse($approval.expires).ToUniversalTime() -le [DateTime]::UtcNow) {
            $approval.status = 'expired'
        }
    }
}
function Read-CcxSharedText {
    param([string]$Path)
    # Readers must allow replacement and rotation while they hold the old file open.
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    $reader = $null
    try {
        $reader = New-Object IO.StreamReader($stream, $script:CcxUtf8, $true)
        return $reader.ReadToEnd()
    } finally {
        if ($reader) { $reader.Dispose() } else { $stream.Dispose() }
    }
}
function Get-CcxState {
    $path = Join-Path (Get-CcxStateDir) 'state.json'
    if (-not [IO.File]::Exists($path)) { return (New-CcxState) }
    try {
        $state = $script:CcxJson.DeserializeObject((Read-CcxSharedText $path))
        if ($state.schema -ne 1 -or $state.tasks -isnot [Collections.IDictionary] -or $state.approvals -isnot [Collections.IDictionary]) { throw 'Invalid state' }
        Update-CcxExpiry $state
        return $state
    } catch { throw (New-CcxError 'Cannot read CCX state; preserve state.json and state.json.bak for recovery.') }
}
function Invoke-CcxLocked {
    param([Parameter(Mandatory=$true)][scriptblock]$ScriptBlock)
    if ($null -ne $script:CcxLockState) { return (& $ScriptBlock $script:CcxLockState) }
    $policy = Get-CcxPolicy
    $directory = Get-CcxStateDir
    [void][IO.Directory]::CreateDirectory($directory)
    $lock = $null
    $clock = [Diagnostics.Stopwatch]::StartNew()
    while ($null -eq $lock) {
        try { $lock = [IO.File]::Open((Join-Path $directory 'state.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
        catch [IO.IOException] {
            if ($clock.Elapsed.TotalSeconds -ge $policy.state.lockTimeoutSeconds) { throw (New-CcxError 'LOCK TIMEOUT') }
            Start-Sleep -Milliseconds 50
        }
    }
    $temporary = $null
    try {
        $state = Get-CcxState
        $script:CcxLockState = $state
        $result = & $ScriptBlock $state
        $state.updated = Get-CcxNow
        foreach ($pair in @(@('routingLog','routingLogMax'), @('notifications','notificationsMax'))) {
            $state[$pair[0]] = @($state[$pair[0]] | Select-Object -Last ([int]$policy.state[$pair[1]]))
        }
        foreach ($task in $state.tasks.Values) {
            $task.checkpoints = @($task.checkpoints | Select-Object -Last ([int]$policy.state.checkpointsMax))
            $task.reviews = @($task.reviews | Select-Object -Last ([int]$policy.state.reviewsMax))
        }
        $clean = Protect-CcxValue -Value $state -Policy $policy
        $path = Join-Path $directory 'state.json'
        $temporary = $path + '.tmp-' + [guid]::NewGuid().ToString('N')
        [IO.File]::WriteAllText($temporary, $script:CcxJson.Serialize($clean), $script:CcxUtf8)
        if ([IO.File]::Exists($path)) { [IO.File]::Replace($temporary, $path, ($path + '.bak')) }
        else { [IO.File]::Move($temporary, $path) }
        return $result
    } finally {
        $script:CcxLockState = $null
        if ($temporary -and [IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
        $lock.Dispose()
    }
}
function Write-CcxLog {
    param([string]$Name, $Record, [long]$MaxBytes)
    if ($null -eq $script:CcxLockState) {
        Invoke-CcxLocked { param($state) Write-CcxLog -Name $Name -Record $Record -MaxBytes $MaxBytes }
        return
    }
    $policy = Get-CcxPolicy
    $clean = Protect-CcxValue -Value $Record -Policy $policy
    $line = $script:CcxJson.Serialize($clean) + [char]10
    $path = Join-Path (Get-CcxStateDir) ($Name + '.jsonl')
    if ([IO.File]::Exists($path) -and ([IO.FileInfo]$path).Length + $script:CcxUtf8.GetByteCount($line) -gt $MaxBytes) {
        $archive = Join-Path (Get-CcxStateDir) ($Name + '.1.jsonl')
        if ([IO.File]::Exists($archive)) { [IO.File]::Delete($archive) }
        [IO.File]::Move($path, $archive)
    }
    [IO.File]::AppendAllText($path, $line, $script:CcxUtf8)
}
function Write-CcxTelemetry {
    param($Record)
    $policy = Get-CcxPolicy
    if ($policy.telemetry.enabled) { Write-CcxLog -Name telemetry -Record $Record -MaxBytes $policy.telemetry.maxBytes }
}
function Add-CcxHistory {
    param($Record)
    Write-CcxLog -Name history -Record $Record -MaxBytes (Get-CcxPolicy).state.historyMaxBytes
}
function Get-CcxTask {
    param($State = (Get-CcxState), [string]$Id)
    if (-not $Id -or -not $State.tasks.ContainsKey($Id)) { throw (New-CcxError 'Task not found.' 2) }
    $State.tasks[$Id]
}
function Add-CcxEvent {
    param($State, [string]$Type, [string]$Key, [string]$TaskId, $Data = @{})
    if ($null -eq $State) {
        return (Invoke-CcxLocked { param($state) Add-CcxEvent -State $state -Type $Type -Key $Key -TaskId $TaskId -Data $Data })
    }
    if (-not $Type -or $Data -isnot [Collections.IDictionary]) { throw (New-CcxError 'Event needs a type and JSON object data.' 2) }
    $policy = Get-CcxPolicy
    $Key = Protect-CcxText $Key $policy
    $cutoff = [DateTime]::UtcNow.AddMinutes(-[double]$policy.runtime.dedupWindowMinutes)
    foreach ($storedKey in @($State.eventKeys.Keys)) {
        if ([DateTime]::Parse($State.eventKeys[$storedKey].at).ToUniversalTime() -lt $cutoff) { $State.eventKeys.Remove($storedKey) | Out-Null }
    }
    if ($Key -and $State.eventKeys.ContainsKey($Key)) { return @{ id = $State.eventKeys[$Key].id; duplicate = $true } }
    $id = 'E-' + [guid]::NewGuid().ToString('N').Substring(0,8)
    $now = Get-CcxNow
    $event = @{ id = $id; at = $now; type = $Type; key = $Key; taskId = $TaskId; data = $Data; status = 'pending'; attempts = 0; nextAt = $now; leaseUntil = $null }
    $State.eventQueue = @($State.eventQueue) + @(Protect-CcxValue $event $policy)
    if ($Key) { $State.eventKeys[$Key] = @{ id = $id; at = $now } }
    return @{ id = $id; duplicate = $false }
}
function Add-CcxNotification {
    param($State, [string]$Level = 'info', [string]$Text, [string]$TaskId, [string]$Key)
    if ($null -eq $State) {
        return (Invoke-CcxLocked { param($state) Add-CcxNotification -State $state -Level $Level -Text $Text -TaskId $TaskId -Key $Key })
    }
    $policy = Get-CcxPolicy
    $Key = Protect-CcxText $Key $policy
    if ($Key) {
        foreach ($notification in $State.notifications) {
            if (-not $notification.ack -and $notification.key -ceq $Key) { return $notification }
        }
    }
    $State.counters.notification++
    $notification = Protect-CcxValue @{
        id = 'N-{0:d4}' -f [int]$State.counters.notification; at = Get-CcxNow
        level = $Level; text = $Text; taskId = $TaskId; key = $Key; ack = $false
    } $policy
    $State.notifications = @($State.notifications) + @($notification)
    return $notification
}
function Split-CcxList {
    param($Values)
    foreach ($value in $Values) {
        foreach ($part in ([string]$value).Split(',')) { $part.Trim() }
    }
}
function ConvertTo-CcxOwnedPath {
    param([string]$Path)
    $pathValue = $Path.Replace('\','/')
    if ([string]::IsNullOrWhiteSpace($pathValue) -or $pathValue.StartsWith('/') -or $pathValue.Contains(':') -or $pathValue -match '(^|/)\.\.(/|$)' -or $pathValue -match '[\x00-\x1f*?"<>|]' -or $pathValue -match '(^|/)\.(/|$)' -or $pathValue.Contains('//')) {
        throw (New-CcxError 'Owned paths must be nonempty, literal repo-relative paths without parent segments.' 2)
    }
    foreach ($segment in $pathValue.TrimEnd('/').Split('/')) {
        if ($segment.EndsWith('.') -or $segment.EndsWith(' ') -or $segment -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)') { throw (New-CcxError 'Invalid Windows path segment.' 2) }
    }
    if ($pathValue -match '^(?i:\.git)(/|$)') { throw (New-CcxError 'Protected path is outside CCX task scope.' 2) }
    foreach ($excluded in @((Get-CcxPolicy).privacy.excludePaths)) {
        $excludedPath = $excluded.Replace('\','/').TrimEnd('/') + '/'
        if (Test-CcxPathOverlap ($pathValue.TrimEnd('/') + '/') $excludedPath) { throw (New-CcxError 'Protected path is outside CCX task scope (privacy.excludePaths).' 2) }
    }
    if ((Protect-CcxText $pathValue) -cne $pathValue) { throw (New-CcxError 'Path exceeds the safe field limit or contains sensitive data.' 2) }
    return $pathValue
}
function Test-CcxPathOverlap {
    param([string]$A, [string]$B)
    ($A.Equals($B, [StringComparison]::OrdinalIgnoreCase) -or
     ($A.EndsWith('/') -and $B.StartsWith($A, [StringComparison]::OrdinalIgnoreCase)) -or
     ($B.EndsWith('/') -and $A.StartsWith($B, [StringComparison]::OrdinalIgnoreCase)) -or
     $A.TrimEnd('/').Equals($B.TrimEnd('/'), [StringComparison]::OrdinalIgnoreCase))
}
function Test-CcxPathOwned {
    param([string]$Path, [string[]]$Owns)
    foreach ($owned in $Owns) {
        if ($Path.Equals($owned, [StringComparison]::OrdinalIgnoreCase) -or ($owned.EndsWith('/') -and $Path.StartsWith($owned, [StringComparison]::OrdinalIgnoreCase))) { return $true }
    }
    return $false
}
function Get-CcxSafeFile {
    param([string]$Root, [string]$Path)
    $relative = ConvertTo-CcxOwnedPath $Path
    $basePath = [IO.Path]::GetFullPath($Root).TrimEnd('\','/')
    $fullPath = [IO.Path]::GetFullPath((Join-Path $basePath $relative))
    if (-not $fullPath.StartsWith($basePath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw (New-CcxError 'Path escaped task root.' 2) }
    $cursor = $basePath
    foreach ($segment in $relative.TrimEnd('/').Split('/')) {
        $cursor = Join-Path $cursor $segment
        if ([IO.File]::Exists($cursor) -or [IO.Directory]::Exists($cursor)) {
            if (([IO.File]::GetAttributes($cursor) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw (New-CcxError 'Reparse points cannot be scanned as task files.' 2) }
        }
    }
    return $fullPath
}
function Get-CcxChangedPaths {
    param([string]$Root = (Get-CcxRepoRoot))
    # Exclude private data (policy privacy.excludePaths) before Git enumerates untracked files.
    $pathspecs = @('.')
    foreach ($excluded in @((Get-CcxPolicy).privacy.excludePaths)) {
        $trimmed = $excluded.Replace('\','/').TrimEnd('/')
        $pathspecs += @((':(exclude,icase)' + $trimmed), (':(exclude,icase)' + $trimmed + '/**'))
    }
    $raw = Invoke-CcxGit -Root $Root -Arguments (@('status','--porcelain=v1','-z','--untracked-files=all','--') + $pathspecs)
    $entries = $raw.Split([char]0)
    $paths = @()
    for ($i = 0; $i -lt $entries.Count; $i++) {
        if (-not $entries[$i]) { continue }
        $status = $entries[$i].Substring(0,2)
        $paths += $entries[$i].Substring(3).Replace('\','/')
        if ($status -match '[RC]') { $i++; $paths += $entries[$i].Replace('\','/') }
    }
    $paths | Sort-Object -Unique
}
function Get-CcxFingerprint {
    param($Task, [string]$Root = (Get-CcxRepoRoot))
    $specs = @()
    foreach ($owned in $Task.owns) {
        $validated = ConvertTo-CcxOwnedPath $owned
        $null = Get-CcxSafeFile -Root $Root -Path $validated
        $specs += ':(literal)' + $validated
    }
    if ($specs.Count -eq 0) { throw (New-CcxError 'Task owns no paths.' 2) }
    $raw = Invoke-CcxGit -Root $Root -Arguments (@('ls-files','-z','--cached','--others','--exclude-standard','--') + $specs)
    $paths = @($raw.Split([char]0) | Where-Object { $_ } | Sort-Object -Unique)
    foreach ($owned in $Task.owns) {
        if (-not $owned.EndsWith('/') -and -not [IO.File]::Exists((Get-CcxSafeFile -Root $Root -Path $owned))) { $paths += $owned }
    }
    $lines = @()
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        foreach ($path in @($paths | Sort-Object -Unique)) {
            $fullPath = Get-CcxSafeFile -Root $Root -Path $path
            if ([IO.File]::Exists($fullPath)) {
                $stream = [IO.File]::OpenRead($fullPath)
                try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
                finally { $stream.Dispose() }
            } else { $hash = '<missing>' }
            $lines += $path + ':' + $hash
        }
        [BitConverter]::ToString($sha.ComputeHash($script:CcxUtf8.GetBytes(($lines -join [char]10)))).Replace('-','').ToLowerInvariant()
    } finally { $sha.Dispose() }
}
function Test-CcxScope {
    param($Task, [string]$Root = (Get-CcxRepoRoot))
    foreach ($path in @(Get-CcxChangedPaths -Root $Root)) {
        if (-not (Test-CcxPathOwned -Path $path -Owns $Task.owns) -and $path -notin $Task.baselineDirty) { $path }
    }
}
function Test-CcxSecretsInPaths {
    param([string]$Root, [string[]]$Paths)
    foreach ($path in $Paths) {
        $file = Get-CcxSafeFile -Root $Root -Path $path
        if (-not [IO.File]::Exists($file) -or ([IO.FileInfo]$file).Length -gt 1MB) { continue }
        $text = [IO.File]::ReadAllText($file, $script:CcxUtf8)
        if ($text.Contains([string][char]0)) { continue }
        foreach ($hit in @(Find-CcxSecrets -Text $text)) { @{ path = $path; patternIndex = $hit.patternIndex; line = $hit.line } }
    }
}
function Test-CcxPowerShellParse {
    param([string]$Root, [string[]]$Paths)
    foreach ($path in $Paths) {
        $file = Get-CcxSafeFile -Root $Root -Path $path
        if ([IO.Path]::GetExtension($path) -notin @('.ps1','.psm1') -or -not [IO.File]::Exists($file)) { continue }
        $tokens = $null; $parseErrors = $null
        $null = [Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$parseErrors)
        foreach ($parseError in $parseErrors) { @{ path = $path; line = $parseError.Extent.StartLineNumber; errorId = $parseError.ErrorId } }
    }
}
function Test-CcxJsonFiles {
    param([string]$Root, [string[]]$Paths)
    foreach ($path in $Paths) {
        $file = Get-CcxSafeFile -Root $Root -Path $path
        if ([IO.Path]::GetExtension($path) -ne '.json' -or -not [IO.File]::Exists($file)) { continue }
        try { $null = $script:CcxJson.DeserializeObject([IO.File]::ReadAllText($file, $script:CcxUtf8)) }
        catch { @{ path = $path; error = 'Invalid JSON' } }
    }
}
function Invoke-CcxQuickChecks {
    param($Task, [string]$Root = (Get-CcxRepoRoot))
    $paths = @(Get-CcxChangedPaths -Root $Root | Where-Object { Test-CcxPathOwned -Path $_ -Owns $Task.owns })
    $checks = [ordered]@{
        parse = @(Test-CcxPowerShellParse -Root $Root -Paths $paths)
        json = @(Test-CcxJsonFiles -Root $Root -Paths $paths)
        secrets = @(Test-CcxSecretsInPaths -Root $Root -Paths $paths)
        scope = @(Test-CcxScope -Task $Task -Root $Root)
    }
    $stages = @()
    foreach ($name in $checks.Keys) {
        $applicable = switch ($name) {
            'parse' { @($paths | Where-Object { [IO.Path]::GetExtension($_) -in @('.ps1','.psm1') }).Count -gt 0 }
            'json' { @($paths | Where-Object { [IO.Path]::GetExtension($_) -eq '.json' }).Count -gt 0 }
            'secrets' { $paths.Count -gt 0 }
            default { $true }
        }
        $result = if ($checks[$name].Count) { 'FAIL' } elseif ($applicable) { 'PASS' } else { 'N/A' }
        $stages += @{ name = $name; result = $result; details = @($checks[$name]) }
    }
    @{ pass = @($stages | Where-Object { $_.result -eq 'FAIL' }).Count -eq 0; stages = $stages }
}
function Get-CcxClass {
    param($Policy, [string]$Class, [string]$Risk)
    # Policy declaration order supplies class rank; defaults name the class and risk.
    $classes = @($Policy.classes.Keys)
    if (-not $Class) { $Class = $Policy.defaults.class }
    if (-not $Risk) { $Risk = $Policy.defaults.risk }
    if (-not $Policy.classes.ContainsKey($Class) -or $Risk -notin $Policy.risk.levels) { throw (New-CcxError 'Unknown task class or risk.' 2) }
    if ($Risk -eq $Policy.risk.levels[-1] -and [array]::IndexOf($classes,$Class) -lt [array]::IndexOf($classes,$Policy.risk.high.minClass)) { return $Policy.risk.high.minClass }
    return $Class
}
function Get-CcxVerification {
    param($Policy, [string]$Class, [string]$Risk, [string]$Type)
    # A type may set its own list: a verification task needs no verifier of its own.
    if ($Type -and $Policy.taskTypes.ContainsKey($Type) -and $Policy.taskTypes[$Type].ContainsKey('verification')) { return @($Policy.taskTypes[$Type].verification) }
    $requirements = @($Policy.classes[$Class].verification)
    if ($Risk -eq $Policy.risk.levels[-1]) { $requirements += @($Policy.risk.high.addVerification) }
    $requirements | Select-Object -Unique
}
function Get-CcxBudget {
    param($Policy, [string]$Class, $Task)
    $budget = @{}
    foreach ($key in $Policy.classes[$Class].budget.Keys) { $budget[$key] = $Policy.classes[$Class].budget[$key] }
    if ($Task) { foreach ($key in $Task.budget.Keys) { $budget[$key] = $Task.budget[$key] } }
    return $budget
}
function Get-CcxTelemetry {
    foreach ($name in @('telemetry.1.jsonl','telemetry.jsonl')) {
        $path = Join-Path (Get-CcxStateDir) $name
        if (-not [IO.File]::Exists($path)) { continue }
        try {
            foreach ($line in (Read-CcxSharedText $path).Split([char]10)) {
                if (-not $line) { continue }
                try { $script:CcxJson.DeserializeObject($line) }
                catch { [Console]::Error.WriteLine('WARNING: an incomplete telemetry record was skipped.') }
            }
        } catch { [Console]::Error.WriteLine('WARNING: telemetry could not be read.') }
    }
}
function Get-CcxStats {
    param($Records = @(Get-CcxTelemetry))
    $groups = @{}
    foreach ($record in $Records) {
        if ($record.kind -notin @('dispatch','task-done')) { continue }
        $key = $script:CcxJson.Serialize(@($record.type, $record.agent, $record.effort))
        if (-not $groups.ContainsKey($key)) {
            $groups[$key] = @{ type=$record.type; agent=$record.agent; effort=$record.effort; dispatches=0; failures=0; done=0; firstTryCount=0; effectiveTokens=0.0 }
        }
        $group = $groups[$key]
        if ($record.kind -eq 'dispatch') {
            $exitCode = if ($record.Keys -contains 'exitCode') { $record.exitCode } else { $record.exit }
            # Usage limits (4) and pre-launch refusals (6,7,8,10) say nothing about model quality.
            if ($exitCode -in @(4,6,7,8,10)) { continue }
            $group.dispatches++
            if ($exitCode -ne 0 -or $record.status -ne 'READY_FOR_CLAUDE_REVIEW') { $group.failures++ }
            $group.effectiveTokens += [double]$record.tokens.input - [double]$record.tokens.cached + [double]$record.tokens.output
        } elseif ($record.accepted) {
            $group.done++
            if ($record.firstTry) { $group.firstTryCount++ }
        }
    }
    foreach ($group in $groups.Values) {
        @{
            type=$group.type; agent=$group.agent; effort=$group.effort
            dispatches=$group.dispatches; failures=$group.failures; done=$group.done
            firstTryRate=$(if ($group.done) { $group.firstTryCount / [double]$group.done } else { 0.0 })
            meanEffectiveTokens=$(if ($group.dispatches) { $group.effectiveTokens / [double]$group.dispatches } else { 0.0 })
        }
    }
}
function Complete-CcxRoute {
    param($Decision, [string]$Type, [string]$TaskId)
    try {
        Invoke-CcxLocked {
            param($state)
            $record = @{ at=Get-CcxNow; kind='route'; taskId=$TaskId; type=$Type; agent=$Decision.agent; model=$Decision.model; effort=$Decision.effort; route=$Decision.route; reasons=$Decision.reasons }
            $state.routingLog = @($state.routingLog) + @($record)
            Write-CcxTelemetry -Record $record
        } | Out-Null
    } catch { [Console]::Error.WriteLine('WARNING: routing log was not written; routing decision remains available.') }
    return $Decision
}
function Get-CcxProvider {
    # First enabled provider (policy order) serving this purpose whose prerequisite exists:
    # a local CLI on PATH, or a cloud API key in the environment (setting the key is the opt-in).
    param($Policy, [string]$Purpose)
    if (-not $Policy.ContainsKey('providers')) { return $null }
    foreach ($name in @($Policy.providers.Keys)) {
        $provider = $Policy.providers[$name]
        if (-not $provider.enabled -or $Purpose -notin @($provider.use)) { continue }
        $ready = if ($provider.kind -eq 'local') { [bool](Get-Command $provider.command -CommandType Application -ErrorAction SilentlyContinue) }
                 else { [bool][Environment]::GetEnvironmentVariable($provider.envKey) }
        if ($ready) { return @{ name = $name; model = $provider.model; kind = $provider.kind } }
    }
    return $null
}
function Invoke-CcxRoute {
    param([string]$TaskId, [string]$Type, [string]$Class, [string]$Risk, [int]$Attempt = 0,
          [switch]$Ambiguous, [string]$AuthoredBy, [switch]$RequestMythos)
    $policy = Get-CcxPolicy
    $state = Get-CcxState
    $task = $null
    if ($TaskId) {
        $task = Get-CcxTask -State $state -Id $TaskId
        if (-not $Type) { $Type = $task.type }
        if (-not $Class) { $Class = $task.class }
        if (-not $Risk) { $Risk = $task.risk }
        # Attempts restart after a model escalation (task escalate records attemptBase).
        if (-not $Attempt) { $Attempt = [int]$task.dispatches - [int]$task.attemptBase + 1 }
    }
    if (-not $Type -or -not $policy.taskTypes.ContainsKey($Type)) { throw (New-CcxError ("Unknown type. Known types: " + ($policy.taskTypes.Keys -join ', ')) 2) }
    if (-not $Attempt) { $Attempt = 1 }
    if ($Attempt -lt 1) { throw (New-CcxError 'Attempt must be positive.' 2) }
    $typePolicy = $policy.taskTypes[$Type]
    $decision = [ordered]@{
        route=$typePolicy.route; llmRequired=$true; agent=$null; subagent=$null; codexRole=$typePolicy.codexRole
        model=$null; provider=$null; effort=$null; command=$typePolicy.command; verifyStage=$typePolicy.verifyStage
        class=$Class; risk=$Risk; attempt=$Attempt; verification=@(); budget=@()
        permissionLevel=$typePolicy.level; escalation=$null; fallbacks=@(); reasons=@()
    }
    if ($typePolicy.route -eq 'tool') {
        $decision.llmRequired = $false; $decision.agent = 'none'
        $decision.reasons += 'deterministic tool: no LLM required'
        return (Complete-CcxRoute $decision $Type $TaskId)
    }
    if (-not $Risk) { $Risk = $policy.defaults.risk }
    $effectiveClass = Get-CcxClass $policy $Class $Risk
    if ($Class -and $Class -ne $effectiveClass) { $decision.reasons += 'high risk raises the minimum class' }
    $Class = $effectiveClass
    $decision.class = $Class; $decision.risk = $Risk
    $decision.verification = @(Get-CcxVerification $policy $Class $Risk $Type)
    $decision.budget = Get-CcxBudget $policy $Class $task
    $decision.agent = $typePolicy.agent
    if ($decision.agent -eq 'cross-model') {
        if ($AuthoredBy -notin @('claude','codex')) { throw (New-CcxError 'Cross-model review requires AuthoredBy claude or codex.' 2) }
        $decision.agent = if ($AuthoredBy -eq 'claude') { 'codex' } else { 'claude' }
    }
    # The task's owner does its own type of work (an escalation changes the owner).
    $ownTaskWork = $task -and $Type -eq $task.type
    if ($ownTaskWork -and $decision.agent -in @('claude','codex') -and $task.owner -in @('claude','codex') -and $task.owner -ne $decision.agent) {
        $decision.reasons += 'task owner ' + $task.owner + ' replaces the type default ' + $decision.agent
        $decision.agent = $task.owner
        if ($decision.agent -ne 'codex') { $decision.codexRole = $null }
    }
    if ($Attempt -gt $decision.budget.maxDispatches) {
        $escalations = if ($task) { $task.modelEscalations } else { 0 }
        if ($escalations -lt $decision.budget.maxModelEscalations) {
            $decision.route = 'premium'; $decision.agent = 'claude'
            $decision.model = $policy.models.claude.lead
            $decision.effort = $policy.classes[$Class].effort.claude.max
            $decision.reasons += 'retry cap reached: escalate to the lead model'
            if ($TaskId) { $decision.reasons += 'record the escalation: ccx task escalate -Id ' + $TaskId + ' -Reason <why>' }
        } else {
            $decision.route = 'surface'
            $decision.reasons += 'retry and escalation caps reached: stop automated retries, collect evidence, decide or ask the user'
        }
        return (Complete-CcxRoute $decision $Type $TaskId)
    }
    $altProvider = $null
    if ($decision.agent -eq 'codex' -and $state.agents.codex.unavailableUntil -and [DateTime]::Parse($state.agents.codex.unavailableUntil).ToUniversalTime() -gt [DateTime]::UtcNow) {
        # Codex quota is out: a ready fallback provider takes the work, else wait.
        $altProvider = Get-CcxProvider $policy 'fallback'
        if (-not $altProvider) {
            $decision.route = 'defer'
            $decision.reasons += 'Codex unavailable until ' + $state.agents.codex.unavailableUntil
            return (Complete-CcxRoute $decision $Type $TaskId)
        }
        $decision.reasons += 'Codex unavailable until ' + $state.agents.codex.unavailableUntil + ': fallback provider ' + $altProvider.name
    }
    $mythosFallback = $false
    if ($RequestMythos) {
        $mythos = $policy.models.mythos
        if ($Class -notin $mythos.allowedClasses) { $decision.reasons += 'mythos request ignored: class is not allowed' }
        elseif ($mythos.available -and $mythos.model) {
            $decision.route = 'mythos'; $decision.agent = $mythos.agent; $decision.model = $mythos.model
            $decision.permissionLevel = $mythos.maxPermissionLevel
            $decision.verification = @($mythos.requiredVerification)
            return (Complete-CcxRoute $decision $Type $TaskId)
        } else {
            $decision.reasons += 'mythos-class not available: fallback'
            $fallback = $mythos.fallback[0]
            $decision.agent = $fallback.agent; $decision.model = $fallback.model; $decision.effort = $fallback.effort
            $decision.fallbacks = @($mythos.fallback | Select-Object -Skip 1)
            $mythosFallback = $true
        }
    }
    if (-not $mythosFallback) {
        switch ($decision.agent) {
            'codex' {
                # Local models take only first attempts of their classes; a retry goes back to GPT.
                if (-not $altProvider -and $Attempt -eq 1) {
                    $altProvider = Get-CcxProvider $policy $Class
                    if ($altProvider) { $decision.reasons += 'local provider ' + $altProvider.name + ' for ' + $Class + ' work' }
                }
                if ($altProvider) { $decision.provider = $altProvider.name; $decision.model = $altProvider.model; break }
                $decision.provider = 'openai'
                $decision.model = $policy.models.codex.default
                $catalogHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
                try {
                    $catalog = $script:CcxJson.DeserializeObject([IO.File]::ReadAllText((Join-Path $catalogHome $policy.models.codex.catalogFile), $script:CcxUtf8))
                    if (-not $catalog.ContainsKey('models')) { throw 'Invalid catalog' }
                    $slugs = @($catalog.models | ForEach-Object { $_.slug })
                    if ($decision.model -notin $slugs) {
                        $found = @($policy.models.codex.fallbacks | Where-Object { $_ -in $slugs } | Select-Object -First 1)
                        if ($found.Count) { $decision.model = $found[0]; $decision.reasons += 'default model absent from catalog: using configured fallback' }
                        else { $decision.route = 'surface'; $decision.reasons += 'catalog has no configured model'; return (Complete-CcxRoute $decision $Type $TaskId) }
                    }
                } catch { $decision.reasons += 'Codex catalog missing or unreadable: retaining default model' }
            }
            'claude' { $decision.model = $policy.models.claude.lead }
            'claude-subagent' { $decision.model = $policy.models.claude.cheap; $decision.subagent = $policy.models.claude.cheapSubagent; $decision.effort = 'agent-defined' }
            default { throw (New-CcxError 'Policy specifies an unsupported routing agent.') }
        }
        if ($decision.agent -in @('claude','codex')) {
            $ladder = @($policy.effortLadder)
            $efforts = $policy.classes[$Class].effort[$decision.agent]
            $baseIndex = [array]::IndexOf($ladder,$efforts.base)
            $maxIndex = [array]::IndexOf($ladder,$efforts.max)
            $steps = ($Attempt - 1) * $policy.escalation.stepsOnFailedAttempt
            if ($Ambiguous) { $steps += $policy.escalation.stepsOnAmbiguity }
            if ($ownTaskWork -and [int]$task.modelEscalations -gt 0) {
                $steps = $policy.escalation.maxSteps
                $decision.reasons += 'escalated task: class maximum effort'
            }
            $steps = [Math]::Min($steps,$policy.escalation.maxSteps)
            $index = [Math]::Min($baseIndex + $steps,$maxIndex)
            # Failed attempts before an escalation still count toward the highest effort.
            $priorFailures = ($Attempt - 1) + $(if ($ownTaskWork) { [int]$task.attemptBase } else { 0 })
            if ($index -eq $ladder.Count - 1 -and $priorFailures -lt $policy.escalation.maxEffortNeedsFailedAttempts) {
                $index = $ladder.Count - 2
                $decision.reasons += 'highest effort requires more failed attempts'
            }
            $decision.effort = $ladder[$index]
            if ($index -gt $baseIndex) { $decision.escalation = @{ from=$efforts.base; to=$decision.effort; reason='failed attempts or ambiguity' } }
            if ($policy.adaptive.enabled -and -not $decision.escalation) {
                $stats = @(Get-CcxStats | Where-Object { $_.type -eq $Type -and $_.agent -eq $decision.agent -and $_.effort -eq $decision.effort })
                if ($stats.Count) {
                    $sample = $stats[0]
                    $adaptiveStep = [Math]::Min(1, [int]$policy.adaptive.maxStepsPerDecision)
                    if ($sample.done -ge $policy.adaptive.minSamples -and $sample.firstTryRate -ge $policy.adaptive.downgradeFirstTryRate) {
                        $index = [Math]::Max($index - $adaptiveStep,[array]::IndexOf($ladder,$policy.classes[$Class].effort.min))
                        $decision.reasons += "adaptive downgrade: $($sample.done) done, first-try rate $($sample.firstTryRate)"
                    } elseif ($sample.dispatches -ge $policy.adaptive.minSamples -and ($sample.failures / [double]$sample.dispatches) -ge $policy.adaptive.upgradeFailureRate) {
                        $index = [Math]::Min($index + $adaptiveStep,$maxIndex)
                        if ($index -eq $ladder.Count - 1 -and $priorFailures -lt $policy.escalation.maxEffortNeedsFailedAttempts) { $index = $ladder.Count - 2 }
                        $decision.reasons += "adaptive upgrade: $($sample.failures) failures / $($sample.dispatches) dispatches"
                    }
                    $decision.effort = $ladder[$index]
                }
            }
        }
    }
    return (Complete-CcxRoute $decision $Type $TaskId)
}
function Assert-CcxExactField {
    param([string]$Value, [string]$Name)
    if ((Protect-CcxText $Value) -cne $Value) { throw (New-CcxError "$Name exceeds the safe field limit or contains sensitive data." 2) }
}
function Invoke-CcxGate {
    param([string]$Action, [AllowNull()]$Target, [string]$TaskId, [string]$Reason)
    if (-not $Action) { throw (New-CcxError 'Action is required.' 2) }
    Assert-CcxExactField $Action 'Action'
    if ($null -ne $Target) { Assert-CcxExactField $Target 'Target' }
    $policy = Get-CcxPolicy
    $level = if ($policy.permissions.actions.ContainsKey($Action)) { $policy.permissions.actions[$Action] } else { $policy.permissions.unknownActionLevel }
    $mode = $policy.permissions.levels[$level].mode
    if ($mode -eq 'autonomous') { return @{code=0; level=$level; message="ALLOWED $level $Action"} }
    Invoke-CcxLocked {
        param($state)
        if ($mode -eq 'logged') {
            Add-CcxHistory @{at=Get-CcxNow; kind='gate'; action=$Action; target=$Target; taskId=$TaskId; reason=$Reason; level=$level}
            return @{code=0; level=$level; message="ALLOWED $level $Action"}
        }
        foreach ($approval in $state.approvals.Values) {
            if ($approval.action -ceq $Action -and [object]::Equals($approval.target,$Target) -and $approval.status -eq 'approved') {
                $approval.status = 'used'
                Add-CcxHistory @{at=Get-CcxNow; kind='approval-used'; id=$approval.id; action=$Action; target=$Target}
                return @{code=0; level=$level; id=$approval.id; message="APPROVED $($approval.id)"}
            }
        }
        $pending = @($state.approvals.Values | Where-Object { $_.action -ceq $Action -and [object]::Equals($_.target,$Target) -and $_.status -eq 'pending' })
        if ($pending.Count) { $approval = $pending[0] }
        else {
            $state.counters.approval++
            $id = 'A-{0:d4}' -f [int]$state.counters.approval
            $approval = @{id=$id; action=$Action; level=$level; target=$Target; taskId=$TaskId; reason=$Reason; status='pending'; requested=Get-CcxNow; decided=$null; by=$null; provenance=$null; quote=$null; expires=$null}
            $state.approvals[$id] = $approval
        }
        $null = Add-CcxNotification -State $state -Level action -Text "Approval required: $Action $Target" -TaskId $TaskId -Key ('approval:' + $approval.id)
        $null = Add-CcxEvent -State $state -Type approval-requested -Key ('approval:' + $approval.id) -TaskId $TaskId -Data @{id=$approval.id}
        $command = 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 approve -Id ' + $approval.id
        return @{code=10; level=$level; id=$approval.id; message="APPROVAL REQUIRED $($approval.id) $level $Action $Target"; command=$command}
    }
}
function Write-CcxOutput {
    param($Value, $Parameters)
    $safe = Protect-CcxValue -Value $Value -Policy (Get-CcxPolicy)
    if ($Parameters.Json) { [Console]::Out.WriteLine($script:CcxJson.Serialize($safe)); return }
    if ($safe -is [string]) { [Console]::Out.WriteLine($safe) }
    elseif ($safe -is [Collections.IDictionary] -and $safe.Contains('message')) {
        [Console]::Out.WriteLine($safe.message)
        if ($safe.Contains('command') -and $safe.command) { [Console]::Out.WriteLine($safe.command) }
    } else { [Console]::Out.WriteLine($script:CcxJson.Serialize($safe)) }
}
function Invoke-CcxCmdRoute {
    param($Parameters)
    $arguments = @{}
    foreach ($key in @('TaskId','Type','Class','Risk','Attempt','Ambiguous','AuthoredBy','RequestMythos')) {
        if ($Parameters.ContainsKey($key)) { $arguments[$key] = $Parameters[$key] }
    }
    Write-CcxOutput (Invoke-CcxRoute @arguments) $Parameters
    return 0
}
function Invoke-CcxCmdGate {
    param($Parameters)
    $result = Invoke-CcxGate -Action $Parameters.Action -Target $Parameters.Target -TaskId $Parameters.TaskId -Reason $Parameters.Reason
    Write-CcxOutput $result $Parameters
    return [int]$result.code
}
function Invoke-CcxCmdApprove {
    param($Parameters)
    $policy = Get-CcxPolicy
    $result = Invoke-CcxLocked {
        param($state)
        $approval = $state.approvals[$Parameters.Id]
        if (-not $approval -or $approval.status -ne 'pending') { throw (New-CcxError 'Approval not found or not pending.' 11) }
        if ($Parameters.Chat) {
            if ('chat' -notin $policy.permissions.levels[$approval.level].approvalProvenance) { throw (New-CcxError "$($approval.level) needs interactive approval" 12) }
            if ([string]::IsNullOrWhiteSpace($Parameters.Quote)) { throw (New-CcxError 'Chat approval requires a nonempty Quote.' 2) }
            $approval.provenance = 'chat'
            $approval.quote = Protect-CcxText $Parameters.Quote $policy
            if ($approval.quote.Length -gt 300) { $approval.quote = $approval.quote.Substring(0,300) }
        } else {
            if (-not [Environment]::UserInteractive -or [Console]::IsInputRedirected) { throw (New-CcxError 'Interactive console required.' 12) }
            [Console]::Error.Write("Type $($approval.id) to approve: ")
            if ([Console]::ReadLine() -cne $approval.id) { throw (New-CcxError 'Approval confirmation did not match.' 12) }
            $approval.provenance = 'interactive'
        }
        $approval.status = 'approved'; $approval.decided = Get-CcxNow
        $approval.by = Protect-CcxText ([Environment]::UserName) $policy
        $approval.expires = [DateTime]::UtcNow.AddMinutes($policy.permissions.approvalTtlMinutes).ToString('yyyy-MM-ddTHH:mm:ssZ')
        Add-CcxHistory @{at=Get-CcxNow; kind='approval-decided'; id=$approval.id; status=$approval.status; provenance=$approval.provenance}
        return $approval
    }
    Write-CcxOutput $result $Parameters
    return 0
}
function Invoke-CcxCmdDeny {
    param($Parameters)
    $result = Invoke-CcxLocked {
        param($state)
        $approval = $state.approvals[$Parameters.Id]
        if (-not $approval -or $approval.status -ne 'pending') { throw (New-CcxError 'Approval not found or not pending.' 11) }
        $approval.status = 'denied'; $approval.decided = Get-CcxNow
        $approval.by = [Environment]::UserName
        Add-CcxHistory @{at=Get-CcxNow; kind='approval-decided'; id=$approval.id; status='denied'}
        return $approval
    }
    Write-CcxOutput $result $Parameters
    return 0
}
function Invoke-CcxCmdEvent {
    param($Parameters)
    if ($Parameters.Sub -ne 'add') { throw (New-CcxError 'Usage: event add -Type [-Key] [-TaskId] [-Data JSON-object]' 2) }
    $dataObject = @{}
    if ($Parameters.Data) {
        try { $dataObject = $script:CcxJson.DeserializeObject($Parameters.Data) }
        catch { throw (New-CcxError 'Data must be a JSON object.' 2) }
        if ($dataObject -isnot [Collections.IDictionary]) { throw (New-CcxError 'Data must be a JSON object.' 2) }
    }
    Write-CcxOutput (Add-CcxEvent -Type $Parameters.Type -Key $Parameters.Key -TaskId $Parameters.TaskId -Data $dataObject) $Parameters
    return 0
}
function Invoke-CcxCmdAck {
    param($Parameters)
    $result = Invoke-CcxLocked {
        param($state)
        $count = 0
        foreach ($notification in $state.notifications) {
            if ($Parameters.Id -eq 'all' -or $notification.id -eq $Parameters.Id) { $notification.ack = $true; $count++ }
        }
        if (-not $count -and $Parameters.Id -ne 'all') { throw (New-CcxError 'Notification not found.' 2) }
        return @{acknowledged=$count}
    }
    Write-CcxOutput $result $Parameters
    return 0
}
function Invoke-CcxCmdStats {
    param($Parameters)
    Write-CcxOutput @(Get-CcxStats) $Parameters
    return 0
}
function Assert-CcxTaskOwnership {
    param($State, $Task)
    foreach ($other in $State.tasks.Values) {
        if ($other.id -eq $Task.id -or $other.status -notin @('active','verifying','blocked')) { continue }
        foreach ($owned in $Task.owns) {
            foreach ($otherPath in $other.owns) {
                if (Test-CcxPathOverlap $owned $otherPath) { throw (New-CcxError "Ownership conflict with $($other.id): $owned overlaps $otherPath" 7) }
            }
        }
    }
}
function Start-CcxTaskInState {
    # Shared task-start logic (CLI, launcher, worktree add): ownership check, baseline, active.
    param($State, $Task, [string]$Worktree, [string]$Branch)
    if ($Task.status -in @('done','abandoned')) { throw (New-CcxError 'Terminal tasks cannot be restarted.' 2) }
    Assert-CcxTaskOwnership $State $Task
    $previousRoot = if ($Task.worktree) { $Task.worktree } else { Get-CcxRepoRoot }
    if ($Task.baselines -isnot [Collections.IDictionary]) {
        # Tasks started before per-worktree baselines keep their existing baseline for their current root.
        # Only a pristine task (planned, untouched since task add) takes a fresh baseline; any other
        # legacy task keeps its old one, so a reset to planned cannot re-baseline (CCX-4c). Fails closed.
        $Task.baselines = @{}
        $pristine = $Task.status -eq 'planned' -and [string]$Task.updated -eq [string]$Task.created
        if (-not $pristine) { $Task.baselines[[IO.Path]::GetFullPath($previousRoot).TrimEnd('\','/').ToLowerInvariant()] = @($Task.baselineDirty) }
    }
    if ($Worktree) { Assert-CcxExactField $Worktree 'Worktree'; $Task.worktree = $Worktree }
    if ($Branch) { Assert-CcxExactField $Branch 'Branch'; $Task.branch = $Branch }
    $root = if ($Task.worktree) { $Task.worktree } else { Get-CcxRepoRoot }
    $key = [IO.Path]::GetFullPath($root).TrimEnd('\','/').ToLowerInvariant()
    # One baseline per worktree, taken the first time the task is there: restarts, resets to planned,
    # naming the same root explicitly, and moving away and back never re-baseline (no laundering).
    if (-not $Task.baselines.ContainsKey($key)) {
        $Task.baselines[$key] = @(Get-CcxChangedPaths -Root $root | Where-Object { -not (Test-CcxPathOwned -Path $_ -Owns $Task.owns) })
    }
    $Task.baselineDirty = @($Task.baselines[$key])
    $Task.status = 'active'
    $Task.updated = Get-CcxNow
}
function Start-CcxTask {
    param([string]$Id, [string]$Worktree, [string]$Branch)
    Invoke-CcxLocked {
        param($state)
        $task = Get-CcxTask -State $state -Id $Id
        Start-CcxTaskInState -State $state -Task $task -Worktree $Worktree -Branch $Branch
        $task
    }
}
function Invoke-CcxCmdTask {
    param($Parameters)
    $policy = Get-CcxPolicy
    if ($Parameters.Sub -eq 'show') {
        Write-CcxOutput (Get-CcxTask -Id $Parameters.Id) $Parameters
        return 0
    }
    if ($Parameters.Sub -eq 'list') {
        $state = Get-CcxState
        Write-CcxOutput @($state.tasks.Values | Where-Object { $Parameters.All -or $_.status -ne 'done' } | Sort-Object { $_.id }) $Parameters
        return 0
    }
    if ($Parameters.Sub -notin @('add','start','update','review','done','budget','escalate')) { throw (New-CcxError 'Usage: task add|start|update|review|escalate|done|budget|show|list' 2) }
    if ($Parameters.Id -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$') { throw (New-CcxError 'Invalid task Id.' 2) }
    Assert-CcxExactField $Parameters.Id 'Id'
    $result = Invoke-CcxLocked {
        param($state)
        if ($Parameters.Sub -eq 'add') {
            if ($state.tasks.ContainsKey($Parameters.Id)) { throw (New-CcxError 'Duplicate task Id.' 2) }
            foreach ($name in @('Title','Type','Class','Risk','Owner','Owns')) {
                if (-not $Parameters[$name]) { throw (New-CcxError "task add requires $name." 2) }
            }
            if (-not $policy.taskTypes.ContainsKey($Parameters.Type) -or -not $policy.classes.ContainsKey($Parameters.Class) -or $Parameters.Risk -notin $policy.risk.levels -or $Parameters.Owner -notin @('claude','codex')) { throw (New-CcxError 'Unknown task type, class, risk or owner.' 2) }
            $owns = @(Split-CcxList $Parameters.Owns | ForEach-Object { ConvertTo-CcxOwnedPath $_ } | Select-Object -Unique)
            if (-not $owns.Count) { throw (New-CcxError 'Task must own at least one path.' 2) }
            $now = Get-CcxNow
            $task = @{
                id=$Parameters.Id; title=$Parameters.Title; type=$Parameters.Type; class=$Parameters.Class; risk=$Parameters.Risk
                owner=$Parameters.Owner; parent=$Parameters.Parent; dependsOn=@(Split-CcxList $Parameters.DependsOn)
                owns=$owns; taskFile=$Parameters.TaskFile; status='planned'; worktree=$null; branch=$null; baselineDirty=@(); baselines=@{}
                created=$now; updated=$now; checkpoints=@(); dispatches=0; modelEscalations=0; attemptBase=0; reviewCycles=0
                tokens=@{input=0; cached=0; output=0}; budget=@{}; lastDispatch=$null; verification=$null; reviews=@(); merge='none'
            }
            $state.tasks[$task.id] = $task
            return @{task=$task; code=0}
        }
        $task = Get-CcxTask -State $state -Id $Parameters.Id
        $effectiveClass = Get-CcxClass $policy $task.class $task.risk
        $budget = Get-CcxBudget $policy $effectiveClass $task
        $code = 0
        $message = $null
        switch ($Parameters.Sub) {
            'start' { Start-CcxTaskInState -State $state -Task $task -Worktree $Parameters.Worktree -Branch $Parameters.Branch }
            'update' {
                if ($Parameters.Status) {
                    if ($Parameters.Status -notin @('planned','active','verifying','blocked','abandoned') -or $task.status -in @('done','abandoned')) { throw (New-CcxError 'Status transition refused; use task done for completion.' 2) }
                    if ($Parameters.Status -in @('active','verifying','blocked')) { Assert-CcxTaskOwnership $state $task }
                    $task.status = $Parameters.Status
                }
                if ($Parameters.Merge) {
                    if ($Parameters.Merge -notin @('none','staged','merged')) { throw (New-CcxError 'Invalid merge status.' 2) }
                    $task.merge = $Parameters.Merge
                }
                foreach ($field in @('Worktree','Branch')) {
                    if ($Parameters.ContainsKey($field)) { Assert-CcxExactField $Parameters[$field] $field; $task[$field.ToLowerInvariant()] = $Parameters[$field] }
                }
                if ($Parameters.Note) { $task.checkpoints = @($task.checkpoints) + @(@{at=Get-CcxNow; note=$Parameters.Note}) }
            }
            'review' {
                $kind = if ($Parameters.Kind) { $Parameters.Kind } else { 'review' }
                if ($Parameters.Result -notin @('pass','changes') -or $Parameters.By -notin @('claude','codex') -or $kind -notin @('review','verifier')) { throw (New-CcxError 'Invalid review result, reviewer or kind.' 2) }
                if ($kind -eq 'review' -and $Parameters.By -eq $task.owner) { throw (New-CcxError 'author cannot review own work' 2) }
                $task.reviews = @($task.reviews) + @(@{at=Get-CcxNow; by=$Parameters.By; kind=$kind; result=$Parameters.Result; note=$Parameters.Note})
                if ($Parameters.Result -eq 'changes') { $task.reviewCycles++ }
                if ($task.reviewCycles -gt $budget.maxReviewCycles) {
                    $message = 'REVIEW CAP REACHED: orchestrator decides on evidence or asks the user'
                    $null = Add-CcxNotification -State $state -Level action -Text $message -TaskId $task.id -Key ('review-cap:' + $task.id)
                    $code = 8
                }
            }
            'escalate' {
                # A model escalation hands the task to another agent; attempts restart, the cap does not.
                if ([string]::IsNullOrWhiteSpace($Parameters.Reason)) { throw (New-CcxError 'Escalation requires Reason.' 2) }
                if ($task.status -in @('done','abandoned')) { throw (New-CcxError 'Terminal tasks cannot be escalated.' 2) }
                $target = if ($Parameters.Agent) { $Parameters.Agent } else { 'claude' }
                if ($target -notin @('claude','codex')) { throw (New-CcxError 'Escalation agent must be claude or codex.' 2) }
                if ([int]$task.modelEscalations -ge [int]$budget.maxModelEscalations) {
                    $null = Add-CcxNotification -State $state -Level action -Text ('Escalation cap reached for ' + $task.id + ': decide on evidence or ask the user') -TaskId $task.id -Key ('escalation-cap:' + $task.id)
                    throw (New-CcxError 'ESCALATION CAP REACHED: decide on evidence or ask the user.' 8)
                }
                $task.modelEscalations = [int]$task.modelEscalations + 1
                $task.attemptBase = [int]$task.dispatches
                $previousOwner = $task.owner
                $task.owner = $target
                $task.checkpoints = @($task.checkpoints) + @(@{at=Get-CcxNow; note=('Escalated from ' + $previousOwner + ' to ' + $target + ': ' + $Parameters.Reason)})
            }
            'budget' {
                if (-not $Parameters.Add -or [string]::IsNullOrWhiteSpace($Parameters.Reason)) { throw (New-CcxError 'Budget requires Add and Reason.' 2) }
                foreach ($addition in @(Split-CcxList $Parameters.Add)) {
                    if ($addition -notmatch '^(maxDispatches|maxModelEscalations|maxReviewCycles|tokenTarget)=(\d+)$') { throw (New-CcxError 'Invalid budget addition.' 2) }
                    $field = $Matches[1]
                    $amount = 0L
                    if (-not [long]::TryParse($Matches[2],[ref]$amount) -or $amount -gt [int]::MaxValue - [long]$budget[$field]) { throw (New-CcxError 'Budget addition is out of range.' 2) }
                    $budget[$field] = [long]$budget[$field] + $amount
                    $task.budget[$field] = $budget[$field]
                }
                $task.checkpoints = @($task.checkpoints) + @(@{at=Get-CcxNow; note=('Budget: ' + ($Parameters.Add -join ',') + '; ' + $Parameters.Reason)})
            }
            'done' {
                if ($task.status -in @('done','abandoned')) { throw (New-CcxError 'Terminal task cannot be completed again.' 8) }
                $missing = @()
                if (-not $task.verification -or $task.verification.status -ne 'PASS' -or $task.verification.full -ne $true) { $missing += 'full PASS verification' }
                $root = if ($task.worktree) { $task.worktree } else { Get-CcxRepoRoot }
                if (-not $task.verification -or $task.verification.fingerprint -ne (Get-CcxFingerprint -Task $task -Root $root)) { $missing += 'current verification fingerprint' }
                foreach ($requirement in @(Get-CcxVerification $policy $effectiveClass $task.risk $task.type)) {
                    switch ($requirement) {
                        'cross-model-review' {
                            # A human task-accept approval may stand in when the other model is unavailable (logged, quoted).
                            $humanAccept = @($state.approvals.Values | Where-Object { $_.action -eq 'task-accept' -and $_.target -ceq $task.id -and $_.status -in @('approved','used') }).Count
                            if (-not $humanAccept -and -not @($task.reviews | Where-Object { $_.kind -eq 'review' -and $_.result -eq 'pass' -and $_.by -ne $task.owner }).Count) { $missing += $requirement }
                        }
                        'independent-verifier' {
                            if (-not @($task.reviews | Where-Object { $_.kind -eq 'verifier' -and $_.result -eq 'pass' }).Count) { $missing += $requirement }
                        }
                        'human-approval' {
                            if (-not @($state.approvals.Values | Where-Object { $_.action -eq 'task-accept' -and $_.target -ceq $task.id -and $_.status -in @('approved','used') }).Count) { $missing += $requirement }
                        }
                        'deterministic' { } # Covered by full PASS verification above.
                        default { $missing += "unsupported verification requirement: $requirement" }
                    }
                }
                if ($missing.Count) { throw (New-CcxError ('Task not done: ' + ($missing -join ', ')) 8) }
                $task.status = 'done'
                Write-CcxTelemetry @{at=Get-CcxNow; kind='task-done'; taskId=$task.id; type=$task.type; agent=$task.owner; effort=$task.lastDispatch.effort; accepted=$true; firstTry=($task.dispatches -le 1); tokens=$task.tokens}
            }
        }
        $task.updated = Get-CcxNow
        return @{task=$task; code=$code; message=$message}
    }
    if ($result.message) { Write-CcxOutput @{message=$result.message; task=$result.task} $Parameters }
    else { Write-CcxOutput $result.task $Parameters }
    return [int]$result.code
}
