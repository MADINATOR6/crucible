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
# Agents that can own a task, review one or take an escalation.
$script:CcxOwners = @('claude','codex','gemini')

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
    # Never run a repository-configured fsmonitor helper (.git/config is agent-writable in some routes).
    $info.Arguments = '-c core.fsmonitor=false ' + (@($Arguments | ForEach-Object { ConvertTo-CcxArgument $_ }) -join ' ')
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
            if ($classPolicy.ContainsKey('codexModel') -and [string]$classPolicy.codexModel -notmatch '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$') { throw "Invalid codexModel in $className" }
            if ($classPolicy.ContainsKey('geminiModel') -and [string]$classPolicy.geminiModel -notmatch '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$') { throw "Invalid geminiModel in $className" }
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
                    ($provider.ContainsKey('cli') -and $provider.cli -notin @('gemini', 'agy')) -or
                    ($provider.ContainsKey('probeUrl') -and [string]$provider.probeUrl -notmatch '^http://(localhost|127\.0\.0\.1):\d{1,5}/[A-Za-z0-9/._-]*$') -or
                    (($provider.kind -eq 'local' -or $provider.ContainsKey('command')) -and [string]$provider.command -notmatch '^[A-Za-z0-9._-]{1,64}$') -or
                    ($provider.kind -eq 'cloud' -and $provider.auth -ne 'account' -and [string]$provider.envKey -notmatch '^[A-Z][A-Z0-9_]{0,63}$')) { throw "Invalid provider $name" }
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
            if ($entry.ContainsKey('gates')) {
                foreach ($gate in @($entry.gates)) {
                    if ($gate -isnot [string] -or -not $policy.permissions.actions.ContainsKey($gate)) { throw 'Unknown task gate' }
                }
            }
            if ($entry.ContainsKey('ledger')) {
                if ($entry.ledger -isnot [string] -or -not $entry.ledger.EndsWith('/')) { throw 'Invalid task ledger' }
                $null = ConvertTo-CcxOwnedPath $entry.ledger -Policy $policy
            }
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
    param([string]$Path, $Policy = (Get-CcxPolicy))
    $pathValue = $Path.Replace('\','/')
    if ([string]::IsNullOrWhiteSpace($pathValue) -or $pathValue.StartsWith('/') -or $pathValue.Contains(':') -or $pathValue -match '(^|/)\.\.(/|$)' -or $pathValue -match '[\x00-\x1f*?"<>|]' -or $pathValue -match '(^|/)\.(/|$)' -or $pathValue.Contains('//')) {
        throw (New-CcxError 'Owned paths must be nonempty, literal repo-relative paths without parent segments.' 2)
    }
    foreach ($segment in $pathValue.TrimEnd('/').Split('/')) {
        if ($segment.EndsWith('.') -or $segment.EndsWith(' ') -or $segment -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)') { throw (New-CcxError 'Invalid Windows path segment.' 2) }
    }
    if ($pathValue -match '^(?i:\.git)(/|$)') { throw (New-CcxError 'Protected path is outside CCX task scope.' 2) }
    foreach ($excluded in @($Policy.privacy.excludePaths)) {
        $excludedPath = $excluded.Replace('\','/').TrimEnd('/') + '/'
        if (Test-CcxPathOverlap ($pathValue.TrimEnd('/') + '/') $excludedPath) { throw (New-CcxError 'Protected path is outside CCX task scope (privacy.excludePaths).' 2) }
    }
    if ((Protect-CcxText $pathValue -Policy $Policy) -cne $pathValue) { throw (New-CcxError 'Path exceeds the safe field limit or contains sensitive data.' 2) }
    return $pathValue
}
# GEMINI-REVIEWER (user-approved 2026-11-27): Gemini may review and verify Claude's and Codex's work, never its own
# work or anything that decides Gemini's routing or access. Checked against the task's owns, its uncommitted scope
# (verify's scope stage) and, for a worktree task, everything committed on its branch since it left the base
# branch: ccx's scope stage sees only uncommitted changes (Codex review, GEMINI-REVIEWER-2).
$script:CcxGeminiProtected = @('ccx/policy.json', 'scripts/codex-dispatch.ps1', 'scripts/crucible.ps1', 'scripts/ccx-core.ps1',
    'GEMINI.md', '.agents/', 'AGENTS.md', 'CLAUDE.md')
function Get-CcxGeminiReviewBlock {
    param($Task)
    if ($Task.owner -eq 'gemini') { return 'Gemini owns this task' }
    # geminiImplemented is sticky: the run history keeps only the latest runs (Codex review, GEMINI-REVIEWER-2).
    $runs = @($Task.runs) + @($Task.lastDispatch) | Where-Object { $_ }
    if ($Task.geminiImplemented -or @($runs | Where-Object { $_.provider -eq 'gemini' -and $_.role -eq 'implement' }).Count) { return 'Gemini implemented part of this task' }
    # 1. What the task may change: its owns.
    $block = Find-CcxGeminiProtected @($Task.owns | ForEach-Object { ([string]$_).Replace('\', '/') })
    if ($block) { return $block }
    # 2. What it did change: everything since its recorded start commit on every tip it has (its branch, read from the
    # main repo, and its worktree's HEAD), plus uncommitted changes. Fails closed (security reviews, Codex review):
    # no recorded start (never started, started before reviewBase existed, or the start could not be found), a gone
    # branch, a worktree with no recorded branch, or a failed diff all block Gemini. --no-renames lists both names.
    if (-not $Task.reviewBase) { return 'no start commit is recorded, so the review range is unknown' }
    $subjects = @()
    try {
        $main = Get-CcxMainRoot
        $tips = @()
        if ($Task.branch) {
            $ref = (Invoke-CcxGit -Root $main -Arguments @('rev-parse', '--verify', '--quiet', ('refs/heads/' + $Task.branch))).Trim()
            if (-not $ref) { return "its branch $($Task.branch) is gone, so the review range is unknown" }
            $tips += @{ root = $main; tip = $ref }
        }
        if ($Task.worktree) {
            # A worktree's HEAD is the agent's to move, so it is never the only tip (security review).
            if (-not $Task.branch) { return 'its worktree has no recorded branch, so the review range is unknown' }
            # Only worktree prune clears a recorded worktree, so a missing one (moved, deleted) is abnormal (verifier).
            if (-not [IO.Directory]::Exists([string]$Task.worktree)) { return "its worktree $($Task.worktree) is missing, so the review range is unknown" }
            $tips += @{ root = [string]$Task.worktree; tip = 'HEAD' }
            $subjects += @(Get-CcxChangedPaths -Root $Task.worktree)
        }
        # The main checkout always counts too, worktree or not (Codex reviews, independent verifier): a task without a
        # worktree lives there, a worktree task's agent can commit there, and a branch merged into main and then
        # rewound leaves its change on main. Both main's HEAD and the branch it had at task add count, so switching
        # the main checkout away hides nothing. ponytail: refuses Gemini whenever any protected file lands on main
        # during the task's life (fail closed); attribute main commits to tasks if that over-blocks.
        # Known limits (deliberate concealment by the task's own author, caught by the merge review and push gate,
        # not here): commits made before task add, edits hidden with git update-index --skip-worktree or
        # --assume-unchanged, and gitignored files.
        if ($Task.addBranch) {
            $addRef = (Invoke-CcxGit -Root $main -Arguments @('rev-parse', '--verify', '--quiet', ('refs/heads/' + $Task.addBranch))).Trim()
            if (-not $addRef) { return "its base branch $($Task.addBranch) is gone, so the review range is unknown" }
            $tips += @{ root = $main; tip = $addRef }
        }
        $tips += @{ root = $main; tip = 'HEAD' }
        $subjects += @(Get-CcxChangedPaths -Root $main)
        foreach ($t in $tips) {
            $subjects += @((Invoke-CcxGit -Root $t.root -Arguments @('diff', '--no-renames', '--name-only', '-z', $Task.reviewBase, $t.tip, '--')).Split([char]0) | Where-Object { $_ })
        }
    } catch { return 'its committed changes cannot be listed, so the review range is unknown' }
    return (Find-CcxGeminiProtected $subjects)
}
function Find-CcxGeminiProtected([string[]]$Subjects) {
    foreach ($subject in $Subjects) {
        foreach ($protected in $script:CcxGeminiProtected) {
            if (Test-CcxPathOverlap -A $subject -B $protected) { return "the task touches $subject, which decides Gemini's routing or access" }
        }
    }
    return $null
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
    # The baseline of the checkout being checked, never another checkout's (no laundering between worktrees).
    # Legacy tasks without a baselines map keep their single baselineDirty.
    $baseline = if ($Task.baselines -is [Collections.IDictionary]) {
        $key = [IO.Path]::GetFullPath($Root).TrimEnd('\','/').ToLowerInvariant()
        @($Task.baselines[$key] | Where-Object { $_ })
    } else { @($Task.baselineDirty) }
    foreach ($path in @(Get-CcxChangedPaths -Root $Root)) {
        if (-not (Test-CcxPathOwned -Path $path -Owns $Task.owns) -and $path -notin $baseline -and -not (Test-CcxBrief -Root $Root -Path $path)) { $path }
    }
}
function Get-CcxProtectedHashes {
    # Protected launcher files, keyed case-insensitively like the file system.
    # Agent deny rules are a first line; this before/after comparison is what decides.
    param([string]$Root, $Policy = (Get-CcxPolicy))
    $Root = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    $hashes = New-Object 'System.Collections.Generic.Dictionary[string,string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($protected in @($Policy.agentProtectedPaths | Where-Object { $_ })) {
        $full = Join-Path $Root $protected.TrimEnd('/')
        $files = if ([IO.Directory]::Exists($full)) { @(Get-ChildItem -LiteralPath $full -Recurse -File -Force -ErrorAction SilentlyContinue) } elseif ([IO.File]::Exists($full)) { @(Get-Item -LiteralPath $full -Force) } else { @() }
        foreach ($file in $files) {
            $relative = $file.FullName.Substring($Root.Length + 1).Replace('\', '/')
            # Obsidian saves this ignored tab layout during runs. Agent write rules still cover .obsidian/.
            if ($relative -ieq '.obsidian/workspace.json') { continue }
            $hashes[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
        }
    }
    return ,$hashes
}
function Compare-CcxProtectedHashes($Before, $After) {
    @(@($After.Keys | Where-Object { -not $Before.ContainsKey($_) -or $Before[$_] -ne $After[$_] }) + @($Before.Keys | Where-Object { -not $After.ContainsKey($_) }))
}
function Test-CcxBrief {
    # An Obsidian brief (tasks/*.md with "crucible: brief" frontmatter) is the user's input, edited while
    # other runs work; each run records its brief's input version, so a change shows as STALE, not as scope.
    param([string]$Root, [string]$Path)
    if ($Path -notmatch '^tasks/[^/]+\.md$') { return $false }
    $file = Join-Path $Root $Path
    if (-not [IO.File]::Exists($file)) { return $false }
    $head = [IO.File]::ReadAllText($file, $script:CcxUtf8).TrimStart([char]0xFEFF)
    return [regex]::IsMatch($head.Substring(0, [Math]::Min(400, $head.Length)), '^---\r?\n(?:.*\r?\n)*?crucible:\s*brief\s*(?:#.*)?\r?\n')
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
    # A type may also add to its class's list, never remove from it (GEMINI-PRIMARY: Gemini-led types need a non-owner review).
    if ($Type -and $Policy.taskTypes.ContainsKey($Type) -and $Policy.taskTypes[$Type].ContainsKey('addVerification')) { $requirements += @($Policy.taskTypes[$Type].addVerification) }
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
function Get-CcxLearningSession {
    param($State, $Task)
    if (-not $Task.routeContext) { return }
    $session = if ($Task.parent) { $State.tasks[$Task.parent] } else { $Task }
    if ($session -and -not $session.parent -and $session.status -notin @('done','abandoned')) { $session }
}
function Get-CcxLessonKey {
    param($Task, [string]$Class, [string]$Agent, [string]$Provider, [string]$Channel)
    (@($Task.routeContext, $Task.type, $Class, $Task.risk, $Agent, $Provider, $Channel) -join '/').ToLowerInvariant()
}
function Save-CcxRoutingLesson {
    param($State, $Task, $Parameters, $Policy, [string]$Class)
    $session = Get-CcxLearningSession $State $Task
    if (-not $session) { throw (New-CcxError 'task learn requires -Key and a non-terminal session root.' 2) }
    $kind = $Parameters.Kind
    $channel = switch ($kind) {
        'focused-failure' { 'preference' }
        'verified-success' { 'preference' }
        'user-correction' { 'choice' }
        'ownership-overlap' { 'scope' }
        'tool-unavailable' { 'capability' }
        default { throw (New-CcxError 'Unknown routing lesson kind.' 2) }
    }
    foreach ($field in @('Note','Reason')) {
        if ([string]::IsNullOrWhiteSpace($Parameters[$field])) { throw (New-CcxError "task learn requires $field." 2) }
        Assert-CcxExactField $Parameters[$field] $field
    }
    $expectedRole = if ($Task.type -in @('research','verify')) { $Task.type } else { 'implement' }
    $dispatch = $Task.lastDispatch
    if ($Task.owner -ne 'codex' -or $dispatch.role -ne $expectedRole -or -not $dispatch.endedAt) { $dispatch = $null }
    switch ($kind) {
        'focused-failure' {
            $partial = $dispatch.status -eq 'PARTIAL' -and $dispatch.exit -in @(0,3)
            if (-not $partial -and -not ($Task.verification.full -and $Task.verification.status -eq 'FAIL')) {
                throw (New-CcxError 'Focused failure requires a completed partial dispatch or failed full verification.' 2)
            }
        }
        'verified-success' {
            if ($Task.status -ne 'done' -or -not $Task.verification.full -or $Task.verification.status -ne 'PASS') {
                throw (New-CcxError 'Verified success requires task done.' 2)
            }
            if ($dispatch.exit -ne 0 -or $dispatch.status -ne 'READY_FOR_CLAUDE_REVIEW') { $dispatch = $null }
        }
        'user-correction' {
            if ($Parameters.Result -notin @($Policy.effortLadder)) { throw (New-CcxError 'User correction requires -Result <effort> from the policy ladder.' 2) }
        }
        'tool-unavailable' {
            if ($Parameters.Target -notmatch '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$') { throw (New-CcxError 'Tool unavailable requires -Target <tool>.' 2) }
            Assert-CcxExactField $Parameters.Target 'Target'
        }
    }
    $agent = if ($Policy.taskTypes[$Task.type].agent -eq 'claude-subagent') { 'claude-subagent' } else { $Task.owner }
    $provider = if ($agent -eq 'codex') {
        if ($dispatch.provider) { $dispatch.provider } else { 'openai' }
    } else { '' }
    $key = Get-CcxLessonKey $Task $Class $agent $provider $channel
    $prior = @($session.routingLessons | Where-Object { $_.key -eq $key } | Select-Object -Last 1)[0]
    $target = if ($kind -eq 'tool-unavailable') { $Parameters.Target } elseif ($kind -eq 'user-correction') { $Parameters.Result }
    $stamp = if ($dispatch) { $dispatch.endedAt } elseif ($kind -in @('focused-failure','verified-success')) { $Task.verification.at }
    $sameLesson = $prior -and $prior.kind -eq $kind -and $prior.target -eq $target
    if ($sameLesson -and $prior.taskId -eq $Task.id -and $prior.observedAt -eq $stamp -and $prior.note -ceq $Parameters.Note -and $prior.evidence -ceq $Parameters.Reason) { return }
    $observed = if ($sameLesson) { @($prior.observedTasks) } else { @() }
    if ($Task.id -notin $observed -and $observed.Count -lt 3) { $observed = @($observed) + @($Task.id) }
    $lesson = @{
        id=('L-' + [guid]::NewGuid().ToString('N').Substring(0,12)); key=$key; kind=$kind
        taskId=$Task.id; at=Get-CcxNow; observedAt=$stamp; note=$Parameters.Note; evidence=$Parameters.Reason
        target=$target; model=$dispatch.model; effort=$dispatch.effort
        observedTasks=@($observed); projectCandidate=(@($observed).Count -ge 3)
    }
    $session.routingLessons = @((@($session.routingLessons | Where-Object { $_ -and $_.key -ne $key }) + @($lesson)) |
        Select-Object -Last ([int]$Policy.state.checkpointsMax))
}
function Get-CcxRouteLesson {
    param($Session, $Task, $Decision, [string]$Channel)
    $key = Get-CcxLessonKey $Task $Decision.class $Decision.agent $Decision.provider $Channel
    $Session.routingLessons | Where-Object { $_.key -eq $key } | Select-Object -Last 1
}
function Get-CcxRoutePreference {
    param($Session, $Task, $Decision)
    $choice = Get-CcxRouteLesson $Session $Task $Decision 'choice'
    if ($choice) { return $choice }
    Get-CcxRouteLesson $Session $Task $Decision 'preference'
}
function Add-CcxRouteLesson {
    param($Decision, $Lesson, [string]$Reason)
    if ($Lesson.id -notin @($Decision.learning | ForEach-Object { $_.id })) {
        $Decision.learning += @{id=$Lesson.id; kind=$Lesson.kind; taskId=$Lesson.taskId; projectCandidate=$Lesson.projectCandidate}
    }
    $Decision.reasons += "session lesson $($Lesson.id) ($($Lesson.kind) from $($Lesson.taskId)): $Reason"
}
function Set-CcxLearnedEffort {
    param($Decision, $Lesson, $Policy, $Efforts, [int]$PriorFailures, [switch]$Constrained)
    if (-not $Lesson) { return }
    $ladder = @($Policy.effortLadder)
    $current = [array]::IndexOf($ladder, $Decision.effort)
    $index = switch ($Lesson.kind) {
        'focused-failure' {
            $observed = [array]::IndexOf($ladder, $Lesson.effort)
            if ($observed -lt 0) { $observed = [array]::IndexOf($ladder, $Efforts.base) }
            [Math]::Max($current, $observed + 1)
        }
        'verified-success' { [Math]::Max($current, [array]::IndexOf($ladder, $Lesson.effort)) }
        'user-correction' {
            $requested = [array]::IndexOf($ladder, $Lesson.target)
            if ($Constrained) { [Math]::Max($requested, $current) } else { $requested }
        }
    }
    $floor = [array]::IndexOf($ladder, $Policy.classes[$Decision.class].effort.min)
    $ceiling = [array]::IndexOf($ladder, $Efforts.max)
    if ($ceiling -eq $ladder.Count - 1 -and $PriorFailures -lt $Policy.escalation.maxEffortNeedsFailedAttempts) { $ceiling-- }
    $index = [Math]::Min([Math]::Max($index, $floor), $ceiling)
    if ($index -ne $current) {
        $Decision.effort = $ladder[$index]
        Add-CcxRouteLesson $Decision $Lesson "reasoning effort $($ladder[$current]) -> $($Decision.effort)"
    }
}
function Complete-CcxRoute {
    param($Decision, [string]$Type, [string]$TaskId)
    # The launcher defers the log of a review dispatch until its eligibility checks pass, then logs the route that
    # runs (GEMINI-REVIEWER, Codex narrow check): a refused review never appears as a route.
    if ($script:CcxDeferRouteLog) { return $Decision }
    try {
        Invoke-CcxLocked {
            param($state)
            $record = @{ at=Get-CcxNow; kind='route'; taskId=$TaskId; type=$Type; agent=$Decision.agent; model=$Decision.model; effort=$Decision.effort; route=$Decision.route; reasons=$Decision.reasons }
            if ($Decision.strategy) { $record.strategy = $Decision.strategy }
            if ($Decision.learning) { $record.learning = $Decision.learning }
            $state.routingLog = @($state.routingLog) + @($record)
            Write-CcxTelemetry -Record $record
        } | Out-Null
    } catch { [Console]::Error.WriteLine('WARNING: routing log was not written; routing decision remains available.') }
    return $Decision
}
function Get-CcxProviderKey([string]$Name) {
    # Returns the key's value for passing to a child process only; never print or log it.
    $value = [Environment]::GetEnvironmentVariable($Name)
    if (-not $value) { $value = [Environment]::GetEnvironmentVariable($Name, 'User') }
    return $value
}

function Get-CcxProviderBlocker {
    # Why a provider cannot take work now, or $null when it can: disabled, at its own usage limit
    # (state.providerLimits, set by the launcher), CLI missing, cloud key unset, or local server silent.
    param($Policy, [string]$Name, $State)
    if (-not $Policy.ContainsKey('providers') -or -not $Policy.providers.ContainsKey($Name)) { return 'not configured' }
    $provider = $Policy.providers[$Name]
    if (-not $provider.enabled) { return 'disabled in policy' }
    if ($State -and $State.ContainsKey('providerLimits') -and $State.providerLimits.ContainsKey($Name) -and
        [DateTime]::Parse($State.providerLimits[$Name]).ToUniversalTime() -gt [DateTime]::UtcNow) { return 'at its usage limit until ' + $State.providerLimits[$Name] }
    if ($provider.command -and -not (Get-Command $provider.command -CommandType Application -ErrorAction SilentlyContinue)) { return $provider.command + ' not on PATH' }
    # auth account: the CLI holds the user's own sign-in (agy); a cloud API provider needs its key set.
    if ($provider.kind -eq 'cloud' -and $provider.auth -ne 'account' -and -not (Get-CcxProviderKey $provider.envKey)) { return $provider.envKey + ' is not set' }
    # Installed is not running: a local server that does not answer would waste an attempt.
    if ($provider.probeUrl) {
        try { $null = Invoke-WebRequest -Uri $provider.probeUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop } catch { return 'local server not answering' }
    }
    return $null
}
function Get-CcxProvider {
    # First enabled provider (policy order) serving this purpose whose prerequisite exists:
    # a local CLI on PATH, or a cloud API key in the environment (setting the key is the opt-in).
    param($Policy, [string]$Purpose, $State)
    if (-not $Policy.ContainsKey('providers')) { return $null }
    foreach ($name in @($Policy.providers.Keys)) {
        $provider = $Policy.providers[$name]
        if (-not $provider.enabled -or $Purpose -notin @($provider.use)) { continue }
        if ($null -eq (Get-CcxProviderBlocker $Policy $name $State)) { return @{ name = $name; model = $provider.model; kind = $provider.kind } }
    }
    return $null
}
function Invoke-CcxRoute {
    param([string]$TaskId, [string]$Type, [string]$Class, [string]$Risk, [int]$Attempt = 0,
          [switch]$Ambiguous, [string]$AuthoredBy, [switch]$RequestMythos, [switch]$IgnoreSessionPreference)
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
        gates=@($typePolicy.gates | Where-Object { $null -ne $_ }); creditCap=$(if ($task) { $task.creditCap } else { $null })
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
        if ($AuthoredBy -notin $script:CcxOwners) { throw (New-CcxError 'Cross-model review requires AuthoredBy claude, codex or gemini.' 2) }
        $decision.agent = if ($AuthoredBy -eq 'claude') { 'codex' } else { 'claude' }
    }
    # The task's owner does its own type of work (an escalation changes the owner).
    $ownTaskWork = $task -and $Type -eq $task.type
    if ($ownTaskWork -and $typePolicy.agent -ne 'cross-model' -and $decision.agent -in $script:CcxOwners -and $task.owner -in $script:CcxOwners -and $task.owner -ne $decision.agent) {
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
        $altProvider = Get-CcxProvider $policy 'fallback' $state
        if (-not $altProvider) {
            $decision.route = 'defer'
            $decision.reasons += 'Codex unavailable until ' + $state.agents.codex.unavailableUntil
            return (Complete-CcxRoute $decision $Type $TaskId)
        }
        $decision.reasons += 'Codex unavailable until ' + $state.agents.codex.unavailableUntil + ': fallback provider ' + $altProvider.name
    }
    $session = if ($ownTaskWork -and $effectiveClass -eq (Get-CcxClass $policy $task.class $task.risk) -and $Risk -eq $task.risk) {
        Get-CcxLearningSession $state $task
    }
    if ($session) {
        $decision.learning = @()
        $delegate = $Type -in @('review','verify','extract') -or ($task.parent -and ($Class -ne 'routine' -or $session.owner -ne $decision.agent))
        $decision.strategy = @{
            sessionId=$session.id; context=$task.routeContext; lead=$session.owner
            mode=$(if ($delegate) { 'delegate' } else { 'lead' }); owner=$decision.agent; owns=$task.owns; taskFile=$task.taskFile
        }
        if ($task.parent) {
            foreach ($owned in $task.owns) {
                if (@($session.owns | Where-Object { Test-CcxPathOverlap -A $_ -B $owned }).Count) {
                    $decision.route = 'surface'
                    $decision.reasons += 'delegation overlaps the lead task; assign disjoint ownership before dispatch'
                    return (Complete-CcxRoute $decision $Type $TaskId)
                }
            }
        }
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
                    $altProvider = Get-CcxProvider $policy $Class $state
                    if ($altProvider) { $decision.reasons += 'local provider ' + $altProvider.name + ' for ' + $Class + ' work' }
                }
                if ($altProvider) {
                    $decision.provider = $altProvider.name; $decision.model = $altProvider.model
                    # Gemini as fallback takes the same class-tier model as Gemini-owned work.
                    if ($altProvider.name -eq 'gemini' -and $policy.classes[$Class].geminiModel) { $decision.model = $policy.classes[$Class].geminiModel }
                    break
                }
                $decision.provider = 'openai'
                # The class's model (cheaper workhorse for routine/normal work), else the default.
                $preferred = @(@($policy.classes[$Class].codexModel, $policy.models.codex.default) | Where-Object { $_ })
                $baseModel = $preferred[0]
                $modelLesson = if ($session -and -not $IgnoreSessionPreference -and -not $RequestMythos) {
                    Get-CcxRoutePreference $session $task $decision
                }
                if ($modelLesson.kind -eq 'focused-failure') {
                    $preferred = @($policy.models.codex.default) + $preferred
                }
                $decision.model = $preferred[0]
                $catalogHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
                try {
                    $catalog = $script:CcxJson.DeserializeObject([IO.File]::ReadAllText((Join-Path $catalogHome $policy.models.codex.catalogFile), $script:CcxUtf8))
                    if (-not $catalog.ContainsKey('models')) { throw 'Invalid catalog' }
                    $slugs = @($catalog.models | ForEach-Object { $_.slug })
                    if ($decision.model -notin $slugs) {
                        $found = @(@($preferred) + @($policy.models.codex.fallbacks) | Where-Object { $_ -in $slugs } | Select-Object -First 1)
                        if ($found.Count) { $decision.model = $found[0]; $decision.reasons += 'model ' + $preferred[0] + ' absent from catalog: using configured fallback ' + $found[0] }
                        else { $decision.route = 'surface'; $decision.reasons += 'catalog has no configured model'; return (Complete-CcxRoute $decision $Type $TaskId) }
                    }
                } catch {
                    $decision.model = $baseModel
                    $decision.reasons += 'Codex catalog missing or unreadable: retaining default model'
                }
                if ($modelLesson.kind -eq 'focused-failure' -and $decision.model -eq $policy.models.codex.default -and $decision.model -ne $baseModel) {
                    Add-CcxRouteLesson $decision $modelLesson "model $baseModel -> $($decision.model)"
                }
            }
            'claude' { $decision.model = $policy.models.claude.lead }
            'gemini' {
                # Gemini leads its own task through the Gemini CLI provider; it is never silently replaced.
                $blocker = Get-CcxProviderBlocker $policy 'gemini' $state
                if ($blocker) {
                    $decision.route = 'defer'
                    $decision.reasons += 'Gemini unavailable: ' + $blocker + '. Wait, or switch the owner.'
                    return (Complete-CcxRoute $decision $Type $TaskId)
                }
                $decision.provider = 'gemini'
                $preferred = @(@($policy.classes[$Class].geminiModel, $policy.providers.gemini.model) | Where-Object { $_ })
                $decision.model = $preferred[0]
            }
            'claude-subagent' { $decision.model = $policy.models.claude.cheap; $decision.subagent = $policy.models.claude.cheapSubagent; $decision.effort = 'agent-defined' }
            default { throw (New-CcxError 'Policy specifies an unsupported routing agent.') }
        }
        if ($session) {
            $capability = Get-CcxRouteLesson $session $task $decision 'capability'
            $ownership = Get-CcxRouteLesson $session $task $decision 'scope'
            if ($capability) {
                $decision.route = 'surface'
                Add-CcxRouteLesson $decision $capability "required tool $($capability.target) unavailable in this runtime; resolve before dispatch"
                return (Complete-CcxRoute $decision $Type $TaskId)
            }
            if ($ownership -and $delegate) {
                $decision.strategy.ownership = 'explicit files'
                Add-CcxRouteLesson $decision $ownership 'delegate explicit files after overlapping edits'
                if (@($task.owns | Where-Object { $_.EndsWith('/') }).Count) {
                    $decision.route = 'surface'
                    return (Complete-CcxRoute $decision $Type $TaskId)
                }
            }
        }
        if ($decision.agent -in @('claude','codex','gemini')) {
            $ladder = @($policy.effortLadder)
            $efforts = if ($policy.classes[$Class].effort.ContainsKey($decision.agent)) { $policy.classes[$Class].effort[$decision.agent] } else { $policy.classes[$Class].effort.codex }
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
            if ($index -gt $baseIndex) {
                $decision.escalation = @{ from=$efforts.base; to=$decision.effort; reason='failed attempts or ambiguity' }
                if (($decision.agent -eq 'gemini' -or $decision.provider -eq 'gemini') -and $decision.model) {
                    $tier = if ($decision.effort -eq 'max') { 'xhigh' } else { $decision.effort }
                    if ($decision.model -match '^(gemini-3\.8-flash)-(low|medium|high)$' -and $tier -in @('low','medium','high')) {
                        $decision.model = $Matches[1] + '-' + $tier
                    } elseif ($decision.model -match '^(gemini-4-neon|gemini-4-hydrogen)-(low|medium|high|xhigh)$' -and $tier -in @('low','medium','high','xhigh')) {
                        $decision.model = $Matches[1] + '-' + $tier
                    }
                }
            }
            if ($session -and -not $IgnoreSessionPreference -and -not $RequestMythos -and $decision.provider -in @($null,'openai')) {
                $lesson = Get-CcxRoutePreference $session $task $decision
                Set-CcxLearnedEffort $decision $lesson $policy $efforts $priorFailures -Constrained:($Ambiguous -or $Attempt -gt 1 -or $Class -notin @('routine','normal') -or $Risk -eq $policy.risk.levels[-1])
            } elseif (-not $session -and $policy.adaptive.enabled -and -not $decision.escalation) {
                # Keep session outcomes available to stats, but out of project-wide routing decisions.
                $records = @(Get-CcxTelemetry | Where-Object { -not $_.taskId -or -not $state.tasks[[string]$_.taskId].routeContext })
                $stats = @(Get-CcxStats -Records $records | Where-Object { $_.type -eq $Type -and $_.agent -eq $decision.agent -and $_.effort -eq $decision.effort })
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
function Clear-CcxReviewBaseOnRepoint($Task, [string]$Field, [string]$Value) {
    # Called whenever worktree or branch is being set. Pointing a started task elsewhere (or clearing it) would move
    # the tips a Gemini review diffs, so its recorded start is dropped and Gemini may no longer review it
    # (independent verifier).
    if ($Task.reviewBase -and $Value -cne [string]$Task[$Field]) { $Task.Remove('reviewBase') | Out-Null }
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
    if ($Worktree) { Assert-CcxExactField $Worktree 'Worktree'; Clear-CcxReviewBaseOnRepoint $Task 'worktree' $Worktree; $Task.worktree = $Worktree }
    if ($Branch) { Assert-CcxExactField $Branch 'Branch'; Clear-CcxReviewBaseOnRepoint $Task 'branch' $Branch; $Task.branch = $Branch }
    $root = if ($Task.worktree) { $Task.worktree } else { Get-CcxRepoRoot }
    $key = [IO.Path]::GetFullPath($root).TrimEnd('\','/').ToLowerInvariant()
    # One baseline per worktree, taken the first time the task is there: restarts, resets to planned,
    # naming the same root explicitly, and moving away and back never re-baseline (no laundering).
    if (-not $Task.baselines.ContainsKey($key)) {
        $Task.baselines[$key] = @(Get-CcxChangedPaths -Root $root | Where-Object { -not (Test-CcxPathOwned -Path $_ -Owns $Task.owns) })
    }
    $Task.baselineDirty = @($Task.baselines[$key])
    # The commit the task's work starts from (reviewBase), recorded once on a first start: a Gemini review checks
    # everything changed since it (security reviews, Codex reviews, independent verifier). It comes from main's HEAD
    # at task add (addHead), never from HEAD at the start, so commits made after registration stay in range. A task
    # without a worktree starts at addHead; a worktree task where its recorded branch meets addHead, read in the main
    # repo (its worktree HEAD is the agent's to move). A first start is told apart by the sticky started mark, not by
    # status: task add writes started=$false, every start sets it, and task update sets it on any move to or from a
    # non-planned status. A task older than the mark or addHead, or whose start cannot be found (no branch, failed
    # merge-base), gets none and Gemini may not review it.
    $firstStart = $Task.ContainsKey('started') -and -not $Task.started -and $Task.status -eq 'planned'
    $Task.started = $true
    if ($firstStart -and -not $Task.reviewBase -and $Task.addHead) {
        try {
            if (-not $Task.worktree) { $Task.reviewBase = [string]$Task.addHead }
            elseif ($Task.branch) {
                $Task.reviewBase = (Invoke-CcxGit -Root (Get-CcxMainRoot) -Arguments @('merge-base', [string]$Task.addHead, ('refs/heads/' + $Task.branch))).Trim()
            }
        } catch { }
    }
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
    if ($Parameters.Sub -notin @('add','start','update','review','done','budget','escalate','learn','forget')) { throw (New-CcxError 'Usage: task add|start|update|review|escalate|done|budget|show|list|learn|forget' 2) }
    if ($Parameters.Id -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$') { throw (New-CcxError 'Invalid task Id.' 2) }
    Assert-CcxExactField $Parameters.Id 'Id'
    $result = Invoke-CcxLocked {
        param($state)
        if ($Parameters.Sub -eq 'add') {
            if ($state.tasks.ContainsKey($Parameters.Id)) { throw (New-CcxError 'Duplicate task Id.' 2) }
            foreach ($name in @('Title','Type','Class','Risk','Owner','Owns')) {
                if (-not $Parameters[$name]) { throw (New-CcxError "task add requires $name." 2) }
            }
            if (-not $policy.taskTypes.ContainsKey($Parameters.Type) -or -not $policy.classes.ContainsKey($Parameters.Class) -or $Parameters.Risk -notin $policy.risk.levels -or $Parameters.Owner -notin $script:CcxOwners) { throw (New-CcxError 'Unknown task type, class, risk or owner.' 2) }
            $owns = @(Split-CcxList $Parameters.Owns | ForEach-Object {
                $owned = ConvertTo-CcxOwnedPath $_
                if (-not $owned.EndsWith('/') -and (Test-Path -LiteralPath (Join-Path (Get-CcxRepoRoot) $owned) -PathType Container)) {
                    Write-Host "Owns: treated folder '$owned' as '$owned/'"
                    $owned += '/'
                }
                $owned
            } | Select-Object -Unique)
            if (-not $owns.Count) { throw (New-CcxError 'Task must own at least one path.' 2) }
            $typePolicy = $policy.taskTypes[$Parameters.Type]
            $creditCap = $null
            if (@($typePolicy.gates) -contains 'paid-action') {
                $parsedCap = 0.0
                if (-not [double]::TryParse($Parameters.CreditCap, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsedCap) -or
                    [double]::IsNaN($parsedCap) -or [double]::IsInfinity($parsedCap) -or $parsedCap -le 0) { throw (New-CcxError 'task add requires -CreditCap to be a finite number above 0.' 2) }
                $creditCap = $parsedCap
            } elseif ($Parameters.ContainsKey('CreditCap')) { throw (New-CcxError '-CreditCap is only valid for paid-action task types.' 2) }
            if ($typePolicy.ledger -and -not @($owns | Where-Object { $_.StartsWith($typePolicy.ledger, [StringComparison]::OrdinalIgnoreCase) -and $_.Length -gt $typePolicy.ledger.Length -and $_.EndsWith('/') }).Count) {
                throw (New-CcxError ('Task must own a project folder under ' + $typePolicy.ledger) 2)
            }
            if ($Parameters.ContainsKey('Key')) {
                if ($Parameters.Key -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$' -or $typePolicy.route -eq 'tool') {
                    throw (New-CcxError 'Key must be a context slug for a model task.' 2)
                }
                Assert-CcxExactField $Parameters.Key 'Key'
                if ($Parameters.Parent) {
                    $session = Get-CcxTask -State $state -Id $Parameters.Parent
                    if ($session.parent -or $session.status -in @('done','abandoned')) {
                        throw (New-CcxError 'Parent must be a non-terminal root task for session learning.' 2)
                    }
                    if (-not $Parameters.TaskFile) { throw (New-CcxError 'A delegated session task requires a task file.' 2) }
                }
            }
            $now = Get-CcxNow
            # Baseline at registration: files already dirty here belong to other work, so verify can run on a
            # task that is never dispatched. task start keeps it for this checkout; another worktree takes its own.
            $addRoot = Get-CcxRepoRoot
            $addKey = [IO.Path]::GetFullPath($addRoot).TrimEnd('\','/').ToLowerInvariant()
            $addDirty = @(Get-CcxChangedPaths -Root $addRoot | Where-Object { -not (Test-CcxPathOwned -Path $_ -Owns $owns) })
            # Main's HEAD at registration: the earliest point ccx can tie to the task, so commits made between add and
            # the first start stay in a Gemini review's range (independent verifier). Unreadable: none, so ineligible.
            # ponytail: commits made before task add cannot be tied to the task; register before starting work.
            $addHead = $null; $addBranch = $null
            try {
                $addMain = Get-CcxMainRoot
                $addHead = (Invoke-CcxGit -Root $addMain -Arguments @('rev-parse', 'HEAD')).Trim()
                $addBranch = (Invoke-CcxGit -Root $addMain -Arguments @('rev-parse', '--abbrev-ref', 'HEAD')).Trim()
                if ($addBranch -eq 'HEAD') { $addBranch = $null }
            } catch { }
            $task = @{
                id=$Parameters.Id; title=$Parameters.Title; type=$Parameters.Type; class=$Parameters.Class; risk=$Parameters.Risk
                owner=$Parameters.Owner; parent=$Parameters.Parent; dependsOn=@(Split-CcxList $Parameters.DependsOn)
                owns=$owns; taskFile=$Parameters.TaskFile; status='planned'; started=$false; addHead=$addHead; addBranch=$addBranch; worktree=$null; branch=$null; baselineDirty=$addDirty; baselines=@{ $addKey = $addDirty }
                created=$now; updated=$now; checkpoints=@(); dispatches=0; modelEscalations=0; attemptBase=0; reviewCycles=0
                tokens=@{input=0; cached=0; output=0}; budget=@{}; lastDispatch=$null; verification=$null; reviews=@(); merge='none'
                creditCap=$creditCap
            }
            if ($Parameters.Key) { $task.routeContext = $Parameters.Key }
            $state.tasks[$task.id] = $task
            return @{task=$task; code=0}
        }
        $task = Get-CcxTask -State $state -Id $Parameters.Id
        $effectiveClass = Get-CcxClass $policy $task.class $task.risk
        $budget = Get-CcxBudget $policy $effectiveClass $task
        $code = 0
        $message = $null
        switch ($Parameters.Sub) {
            'learn' { Save-CcxRoutingLesson $state $task $Parameters $policy $effectiveClass }
            'forget' {
                if ($task.parent) { throw (New-CcxError 'task forget requires the session root Id.' 2) }
                if ($Parameters.Key) {
                    if ($Parameters.Key -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$') { throw (New-CcxError 'Key must be a context slug.' 2) }
                    $task.routingLessons = @($task.routingLessons | Where-Object { $_ -and -not $_.key.StartsWith($Parameters.Key + '/', [StringComparison]::OrdinalIgnoreCase) })
                } else { $task.Remove('routingLessons') | Out-Null }
            }
            'start' { Start-CcxTaskInState -State $state -Task $task -Worktree $Parameters.Worktree -Branch $Parameters.Branch }
            'update' {
                if ($Parameters.Status) {
                    if ($Parameters.Status -notin @('planned','active','verifying','blocked','abandoned') -or $task.status -in @('done','abandoned')) { throw (New-CcxError 'Status transition refused; use task done for completion.' 2) }
                    if ($Parameters.Status -in @('active','verifying','blocked')) { Assert-CcxTaskOwnership $state $task }
                    # Work may begin without a start here, or may have begun before (block-task sets blocked), so a
                    # later start is not a first start (Codex verifier).
                    if (($Parameters.Status -ne 'planned' -or $task.status -ne 'planned') -and $task.ContainsKey('started')) { $task.started = $true }
                    $task.status = $Parameters.Status
                }
                if ($Parameters.Merge) {
                    if ($Parameters.Merge -notin @('none','staged','merged')) { throw (New-CcxError 'Invalid merge status.' 2) }
                    $task.merge = $Parameters.Merge
                }
                foreach ($field in @('Worktree','Branch')) {
                    if ($Parameters.ContainsKey($field)) { Assert-CcxExactField $Parameters[$field] $field; Clear-CcxReviewBaseOnRepoint $task $field.ToLowerInvariant() $Parameters[$field]; $task[$field.ToLowerInvariant()] = $Parameters[$field] }
                }
                if ($Parameters.Owner -and $Parameters.Owner -ne $task.owner) {
                    # A user handoff, not an escalation: no escalation cap, and the new owner gets its own attempts.
                    if ($Parameters.Owner -notin $script:CcxOwners) { throw (New-CcxError 'Owner must be claude, codex or gemini.' 2) }
                    if ($task.status -in @('done','abandoned')) { throw (New-CcxError 'Terminal tasks cannot change owner.' 2) }
                    $task.checkpoints = @($task.checkpoints) + @(@{at=Get-CcxNow; note=('Owner ' + $task.owner + ' -> ' + $Parameters.Owner)})
                    $task.owner = $Parameters.Owner
                    $task.attemptBase = [int]$task.dispatches
                }
                if ($Parameters.Note) { $task.checkpoints = @($task.checkpoints) + @(@{at=Get-CcxNow; note=$Parameters.Note}) }
            }
            'review' {
                $kind = if ($Parameters.Kind) { $Parameters.Kind } else { 'review' }
                if ($Parameters.Result -notin @('pass','changes') -or $Parameters.By -notin $script:CcxOwners -or $kind -notin @('review','verifier')) { throw (New-CcxError 'Invalid review result, reviewer or kind.' 2) }
                if ($kind -eq 'review' -and $Parameters.By -eq $task.owner) { throw (New-CcxError 'author cannot review own work' 2) }
                if ($Parameters.By -eq 'gemini') {
                    $block = Get-CcxGeminiReviewBlock $task
                    if ($block) { throw (New-CcxError "Gemini may not review or verify this task: $block" 2) }
                }
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
                if ($target -notin $script:CcxOwners) { throw (New-CcxError 'Escalation agent must be claude, codex or gemini.' 2) }
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
                # Gemini rows count only on a task Gemini may review; this also discards older rows recorded before
                # the guard, or made stale by an owner handoff (GEMINI-REVIEWER).
                $geminiBlock = Get-CcxGeminiReviewBlock $task
                $validReviews = @($task.reviews | Where-Object { $_.by -ne 'gemini' -or -not $geminiBlock })
                if (-not $task.verification -or $task.verification.status -ne 'PASS' -or $task.verification.full -ne $true) { $missing += 'full PASS verification' }
                $root = if ($task.worktree) { $task.worktree } else { Get-CcxRepoRoot }
                if (-not $task.verification -or $task.verification.fingerprint -ne (Get-CcxFingerprint -Task $task -Root $root)) { $missing += 'current verification fingerprint' }
                foreach ($requirement in @(Get-CcxVerification $policy $effectiveClass $task.risk $task.type)) {
                    switch ($requirement) {
                        'cross-model-review' {
                            # A human task-accept approval may stand in when the other model is unavailable (logged, quoted).
                            $humanAccept = @($state.approvals.Values | Where-Object { $_.action -eq 'task-accept' -and $_.target -ceq $task.id -and $_.status -in @('approved','used') }).Count
                            if (-not $humanAccept -and -not @($validReviews | Where-Object { $_.kind -eq 'review' -and $_.result -eq 'pass' -and $_.by -ne $task.owner }).Count) { $missing += $requirement }
                        }
                        'independent-verifier' {
                            if (-not @($validReviews | Where-Object { $_.kind -eq 'verifier' -and $_.result -eq 'pass' }).Count) { $missing += $requirement }
                        }
                        'human-approval' {
                            if (-not @($state.approvals.Values | Where-Object { $_.action -eq 'task-accept' -and $_.target -ceq $task.id -and $_.status -in @('approved','used') }).Count) { $missing += $requirement }
                        }
                        'deterministic' { } # Covered by full PASS verification above.
                        default { $missing += "unsupported verification requirement: $requirement" }
                    }
                }
                $typePolicy = $policy.taskTypes[$task.type]
                if (@($typePolicy.gates) -contains 'paid-action') {
                    if (-not @($state.approvals.Values | Where-Object { $_.action -ceq 'paid-action' -and ($_.taskId -ceq $task.id -or $_.target -ceq $task.id) -and $_.status -in @('approved','used') }).Count) { $missing += 'paid-action approval' }
                    $total = 0.0
                    try {
                        foreach ($owned in @($task.owns | Where-Object { $typePolicy.ledger -and $_.StartsWith($typePolicy.ledger, [StringComparison]::OrdinalIgnoreCase) -and $_.EndsWith('/') })) {
                            $ledger = Get-CcxSafeFile -Root $root -Path ($owned + 'log.jsonl')
                            if ([IO.File]::Exists($ledger)) {
                                foreach ($line in [IO.File]::ReadLines($ledger, $script:CcxUtf8)) {
                                    $row = $script:CcxJson.DeserializeObject($line)
                                    if ($row.task -ceq $task.id) { $total += [double]$row.credits }
                                }
                            }
                        }
                    } catch { $missing += 'readable ledger' }
                    if ($total -gt $task.creditCap) { $missing += "ledger total $total exceeds credit cap $($task.creditCap)" }
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
