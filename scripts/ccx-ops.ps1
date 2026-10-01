# Dot-sourced CCX operations. Windows PowerShell 5.1; core owns state and policy.
function Get-CcxQueueCounts($State) {
    $counts = [ordered]@{}
    foreach ($status in @('pending','processing','failed','dead')) {
        $counts[$status] = @($State.eventQueue | Where-Object { $_.status -eq $status }).Count
    }
    return $counts
}

function Invoke-CcxStaleScan($State) {
    $cutoff = [DateTime]::UtcNow.AddHours(-[double](Get-CcxPolicy).runtime.staleTaskHours)
    foreach ($task in $State.tasks.Values) {
        if ($task.status -in @('active','verifying') -and [DateTime]::Parse($task.updated).ToUniversalTime() -lt $cutoff) {
            $null = Add-CcxNotification -State $State -Level warn -TaskId $task.id -Key ('stale:' + $task.id) -Text ("$($task.id) has no recent update")
        }
        if ($task.worktree -and -not [IO.Directory]::Exists($task.worktree)) {
            $null = Add-CcxNotification -State $State -Level warn -TaskId $task.id -Key ('missing-worktree:' + $task.id) -Text ("$($task.id) worktree is missing")
        }
    }
    foreach ($approval in $State.approvals.Values) {
        if ($approval.status -in @('approved','pending') -and $approval.expires -and [DateTime]::Parse($approval.expires).ToUniversalTime() -le [DateTime]::UtcNow) { $approval.status = 'expired' }
    }
}

function Invoke-CcxEventHandler($Event) {
    $policy = Get-CcxPolicy
    $handler = $policy.runtime.handlers[$Event.type]
    if (-not $handler) { $handler = $policy.runtime.defaultHandler }
    # Only these local handlers are executable; policy strings are never commands.
    $action = if ($handler -eq 'run-health') { 'test' } else { 'edit' }
    $levels = @($policy.permissions.levels.Keys)
    if ([array]::IndexOf($levels, $policy.permissions.actions[$action]) -gt [array]::IndexOf($levels, $policy.runtime.maxAutonomousLevel)) {
        throw (New-CcxError 'Handler exceeds runtime.maxAutonomousLevel.')
    }
    $key = if ($Event.key) { $Event.key } else { 'event:' + $Event.id }
    $level = 'info'
    $message = $null
    switch ($handler) {
        'notify-dispatch' {
            # The launcher's event key is unique per run (verify runs and usage-limit runs included).
            if ($Event.data.exit -eq 0 -and $Event.data.status -eq 'READY_FOR_CLAUDE_REVIEW') {
                $message = "$($Event.taskId) ready for Claude review"
            } elseif ($Event.data.exit -eq 4) {
                $level = 'warn'
                $message = "$($Event.taskId) Codex unavailable until $((Get-CcxState).agents.codex.unavailableUntil)"
            } else {
                $route = Invoke-CcxRoute -TaskId $Event.taskId
                $level = 'action'
                $message = "$($Event.taskId) dispatch $($Event.data.dispatch) ended exit $($Event.data.exit) status $($Event.data.status); suggested route: $($route.route) $($route.agent) $($route.model) $($route.effort)"
            }
        }
        'block-task' {
            Invoke-CcxLocked {
                param($state)
                $task = Get-CcxTask -State $state -Id $Event.taskId
                if ($task.status -ne 'done') { $task.status = 'blocked'; $task.updated = Get-CcxNow }
                $null = Add-CcxNotification -State $state -Level action -Text ("$($task.id) verification failed; review required") -TaskId $task.id -Key $key
            }
            return 'blocked'
        }
        'run-health' {
            $health = Invoke-CcxHealth -Quick
            if (-not $health.pass) { $level = 'action'; $message = 'Quick health checks failed' }
            else { return 'healthy' }
        }
        'stale-scan' { Invoke-CcxLocked { param($state) Invoke-CcxStaleScan $state }; return 'scanned' }
        'notify' { $message = "$($Event.type): " + (Protect-CcxText ($script:CcxJson.Serialize($Event.data))) }
        default { $level = 'warn'; $message = "Unknown handler ${handler}; $($Event.type): " + (Protect-CcxText ($script:CcxJson.Serialize($Event.data))) }
    }
    $null = Add-CcxNotification -Level $level -Text $message -TaskId $Event.taskId -Key $key
    return 'notified'
}

function Invoke-CcxTick {
    param([int]$Max = 0)
    $policy = Get-CcxPolicy
    if (-not $Max) { $Max = [int]$policy.runtime.maxEventsPerTick }
    if ($Max -lt 1) { throw (New-CcxError 'Max must be positive.' 2) }
    $claim = Invoke-CcxLocked {
        param($state)
        if (-not $state.runtime.enabled) { return @{ disabled=$true; events=@() } }
        $now = [DateTime]::UtcNow
        $due = @($state.eventQueue | Where-Object {
            ($_.status -in @('pending','failed') -and [DateTime]::Parse($_.nextAt).ToUniversalTime() -le $now) -or
            ($_.status -eq 'processing' -and $_.leaseUntil -and [DateTime]::Parse($_.leaseUntil).ToUniversalTime() -le $now)
        } | Sort-Object { $_.at }, { $_.id } | Select-Object -First $Max)
        foreach ($event in $due) {
            $event.status = 'processing'
            $event.leaseUntil = $now.AddSeconds([double]$policy.runtime.leaseSeconds).ToString('yyyy-MM-ddTHH:mm:ssZ')
            $event.attempts++
        }
        return @{ disabled=$false; events=$due; notifications=[int]$state.counters.notification }
    }
    if ($claim.disabled) { return @{ disabled=$true; message='runtime disabled' } }
    $counts = @{ processed=0; failed=0; dead=0; notDue=0; notificationsAdded=0 }
    foreach ($event in $claim.events) {
        $errorText = $null; $result = $null
        try { $result = Invoke-CcxEventHandler $event }
        catch { $errorText = Protect-CcxText $_.Exception.Message }
        $outcome = Invoke-CcxLocked {
            param($state)
            $current = @($state.eventQueue | Where-Object { $_.id -eq $event.id -and $_.status -eq 'processing' -and $_.attempts -eq $event.attempts -and $_.leaseUntil -eq $event.leaseUntil })
            # A recovered lease belongs to its new claimant; never overwrite it.
            if (-not $current.Count) { return 'superseded' }
            $current = $current[0]
            if ($null -eq $errorText) {
                $record = @{}; foreach ($field in $current.Keys) { $record[$field] = $current[$field] }
                $record.kind = 'event'; $record.result = $result; $record.finished = Get-CcxNow
                Add-CcxHistory $record
                $state.eventQueue = @($state.eventQueue | Where-Object { $_.id -ne $event.id })
                return 'processed'
            }
            $current.error = $errorText; $current.leaseUntil = $null
            if ($current.attempts -ge $policy.runtime.maxAttempts) {
                $current.status = 'dead'
                $null = Add-CcxNotification -State $state -Level warn -TaskId $current.taskId -Key ('dead:' + $current.id) -Text ("Event $($current.id) exhausted retries: $errorText")
                return 'dead'
            }
            $current.status = 'failed'
            $delay = [Math]::Min([double]$policy.runtime.backoffMaxSeconds, [double]$policy.runtime.backoffBaseSeconds * [Math]::Pow(2, $current.attempts - 1))
            $current.nextAt = [DateTime]::UtcNow.AddSeconds($delay).ToString('yyyy-MM-ddTHH:mm:ssZ')
            return 'failed'
        }
        if ($counts.ContainsKey($outcome)) { $counts[$outcome]++ }
    }
    Invoke-CcxLocked {
        param($state)
        Invoke-CcxStaleScan $state
        $state.runtime.lastTick = Get-CcxNow
        $now = [DateTime]::UtcNow
        $counts.notDue = @($state.eventQueue | Where-Object {
            ($_.status -in @('pending','failed') -and [DateTime]::Parse($_.nextAt).ToUniversalTime() -gt $now) -or
            ($_.status -eq 'processing' -and $_.leaseUntil -and [DateTime]::Parse($_.leaseUntil).ToUniversalTime() -gt $now)
        }).Count
        $counts.notificationsAdded = [int]$state.counters.notification - $claim.notifications
    }
    return $counts
}

function Invoke-CcxCmdTick($P) {
    $maximum = 0
    if ($P.ContainsKey('Max') -and (-not [int]::TryParse($P.Max, [ref]$maximum) -or $maximum -lt 1)) { throw (New-CcxError 'Max must be positive.' 2) }
    $result = Invoke-CcxTick -Max $maximum
    if ($P.Json -or $result.disabled) { Write-CcxOutput $result $P }
    else { Write-CcxOutput "processed=$($result.processed) failed=$($result.failed) dead=$($result.dead) not due=$($result.notDue) notifications added=$($result.notificationsAdded)" $P }
    return 0
}

function Invoke-CcxCmdRuntime($P) {
    if ($P.Sub -notin @('on','off','show')) { throw (New-CcxError 'Usage: runtime on|off|show' 2) }
    if ($P.Sub -ne 'show') {
        Invoke-CcxLocked {
            param($state)
            $state.runtime.enabled = $P.Sub -eq 'on'
            Add-CcxHistory @{ kind='runtime'; at=Get-CcxNow; enabled=$state.runtime.enabled }
        }
    }
    $state = Get-CcxState
    Write-CcxOutput @{ enabled=$state.runtime.enabled; lastTick=$state.runtime.lastTick; queue=(Get-CcxQueueCounts $state); dedupKeys=$state.eventKeys.Count } $P
    return 0
}

function Invoke-CcxMemoryLint {
    param([string[]]$Path, [string]$Root = (Get-CcxRepoRoot))
    $policy = Get-CcxPolicy
    $paths = if ($Path) { @(Split-CcxList $Path) } else { @($policy.memory.files) }
    $checks = @()
    foreach ($relative in $paths) {
        $file = Get-CcxSafeFile -Root $Root -Path $relative
        if (-not [IO.File]::Exists($file)) { continue }
        $text = [IO.File]::ReadAllText($file, $script:CcxUtf8)
        $lines = [IO.File]::ReadAllLines($file, $script:CcxUtf8)
        $details = @(); $failed = $false
        foreach ($hit in @(Find-CcxSecrets $text)) {
            $details += "pattern $($hit.patternIndex) line $($hit.line)"; $failed = $true
        }
        if ($policy.memory.maxLines.ContainsKey($relative) -and $lines.Count -gt $policy.memory.maxLines[$relative]) {
            $details += "line count $($lines.Count) exceeds $($policy.memory.maxLines[$relative])"; $failed = $true
        }
        $checks += @{ name=$relative; result=$(if ($failed) { 'FAIL' } else { 'PASS' }); details=$details }
        $seen = @{}
        for ($index = 0; $index -lt $lines.Count; $index++) {
            $line = $lines[$index].Trim()
            if ($line.Length -lt 20 -or $line.StartsWith('#') -or $line -match '^\|?[\s:|\-]+\|?$') { continue }
            if ($seen.ContainsKey($line)) { $checks += @{ name=$relative; result='WARN'; details=@("duplicate line $($index + 1)") } }
            else { $seen[$line] = $true }
        }
        if ([IO.Path]::GetFileName($relative) -eq 'MEMORY.md') {
            $checkpoints = 0; $inCheckpoints = $false
            foreach ($line in $lines) {
                if ($line -match '^##\s+Checkpoint\b(.*)$') {
                    $inCheckpoints = $true
                    if ($Matches[1].Trim()) { $checkpoints++ }
                    continue
                }
                if ($line -match '^##\s') { $inCheckpoints = $false }
                if ($inCheckpoints -and $line -match '^\s*(?:[-*]\s|\d+\.\s|###\s)') { $checkpoints++ }
            }
            if ($checkpoints -gt $policy.memory.maxCheckpoints) { $checks += @{ name=$relative; result='WARN'; details=@('archive older checkpoints to MEMORY-ARCHIVE.md') } }
        }
    }
    return @{ pass=(@($checks | Where-Object { $_.result -eq 'FAIL' }).Count -eq 0); stages=$checks }
}

function Write-CcxChecks($Result, $P) {
    if ($P.Json) { Write-CcxOutput $Result $P; return }
    foreach ($stage in $Result.stages) {
        Write-CcxOutput ("$($stage.result) $($stage.name) " + (@($stage.details | Select-Object -First 1) -join '')) $P
        foreach ($detail in @($stage.details | Select-Object -Skip 1)) { Write-CcxOutput ([string]$detail) $P }
    }
}

function Invoke-CcxCmdMemory($P) {
    if ($P.Sub -ne 'lint') { throw (New-CcxError 'Usage: memory lint [-Path p]' 2) }
    $result = Invoke-CcxMemoryLint -Path $P.Path
    Write-CcxChecks $result $P
    return [int](-not $result.pass)
}

function Invoke-CcxProcess {
    param([string]$FileName, [string]$Arguments, [string]$Root, [double]$TimeoutMinutes)
    if ($TimeoutMinutes -le 0) { throw (New-CcxError 'Command timeoutMinutes must be positive.') }
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $FileName; $info.Arguments = $Arguments; $info.WorkingDirectory = $Root
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true; $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    foreach ($name in @($info.EnvironmentVariables.Keys)) {
        if ($name -like 'GIT_*') { [void]$info.EnvironmentVariables.Remove($name) }
    }
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    try {
        [void]$process.Start(); $process.StandardInput.Close()
        $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
        $timedOut = -not $process.WaitForExit([int][Math]::Min([int]::MaxValue, $TimeoutMinutes * 60000))
        if ($timedOut) {
            $killer = New-Object Diagnostics.ProcessStartInfo
            $killer.FileName = Join-Path ([Environment]::SystemDirectory) 'taskkill.exe'
            $killer.Arguments = '/PID ' + $process.Id + ' /T /F'
            $killer.UseShellExecute = $false; $killer.CreateNoWindow = $true
            $killer.RedirectStandardOutput = $true; $killer.RedirectStandardError = $true
            $kill = New-Object Diagnostics.Process; $kill.StartInfo = $killer
            try {
                [void]$kill.Start()
                $killOut = $kill.StandardOutput.ReadToEndAsync(); $killErr = $kill.StandardError.ReadToEndAsync()
                $kill.WaitForExit()
                if (-not $process.WaitForExit(10000)) { throw (New-CcxError 'Timed out process could not be terminated.') }
                $null = $killOut.Result; $null = $killErr.Result
            } finally { $kill.Dispose() }
        }
        if (-not $stdout.Wait(10000) -or -not $stderr.Wait(10000)) { throw (New-CcxError 'Command output pipes did not close.') }
        return @{ code=$process.ExitCode; timeout=$timedOut; stdout=$stdout.Result; stderr=$stderr.Result }
    } finally { $process.Dispose() }
}

function Invoke-CcxCommandStage {
    param($Stage, [string]$Root, [string]$TaskId)
    if ($null -eq $Stage.command) { return @{ name=$Stage.name; result='SKIP'; details=@($Stage.note) } }
    $result = Invoke-CcxProcess -FileName (Join-Path ([Environment]::SystemDirectory) 'cmd.exe') -Arguments ('/d /s /c "' + $Stage.command + '"') -Root $Root -TimeoutMinutes $Stage.timeoutMinutes
    $logDir = Join-Path (Get-CcxStateDir) 'logs'
    $safeName = [regex]::Replace([string]$Stage.name, '[^A-Za-z0-9._-]', '_')
    $safeTask = if ($TaskId) { [regex]::Replace($TaskId, '[^A-Za-z0-9._-]', '_') } else { 'none' }
    $logPath = Join-Path $logDir ("verify-$safeTask-$safeName-" + [DateTime]::UtcNow.ToString('yyyyMMddHHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8) + '.log')
    # Redact before persistence as well as display; command output can contain credentials.
    # Whole text first: a secret can span lines (PEM blocks); then cap each line.
    $clean = Protect-CcxText -Text ($result.stdout + [char]10 + $result.stderr) -Full
    $lines = @($clean -split '\r?\n' | ForEach-Object { Protect-CcxText $_ })
    Invoke-CcxLocked {
        param($state)
        [void][IO.Directory]::CreateDirectory($logDir)
        [IO.File]::WriteAllLines($logPath, [string[]]$lines, $script:CcxUtf8)
        foreach ($old in @(Get-ChildItem -LiteralPath $logDir -Filter 'verify-*.log' -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -Skip ([int](Get-CcxPolicy).verify.logsMax))) { [IO.File]::Delete($old.FullName) }
    }
    $pass = -not $result.timeout -and $result.code -eq 0
    $details = @($(if ($result.timeout) { 'timeout' } else { "exit $($result.code)" }))
    if (-not $pass) { $details += @($lines | Select-Object -Last 15) }
    return @{ name=$Stage.name; result=$(if ($pass) { 'PASS' } else { 'FAIL' }); details=$details; log=$logPath }
}

function Invoke-CcxVerify {
    param([string]$TaskId, [string[]]$Stage, [switch]$Quick, [switch]$Baseline, [string[]]$Path)
    $policy = Get-CcxPolicy
    $task = if ($TaskId) { Get-CcxTask -Id $TaskId } else { $null }
    $root = if ($task -and $task.worktree) { $task.worktree } else { Get-CcxRepoRoot }
    if (-not [IO.Directory]::Exists($root)) { throw (New-CcxError 'Task worktree is missing.') }
    $selected = @(Split-CcxList $Stage)
    foreach ($name in $selected) {
        if ($name -notin @($policy.verify.stages | ForEach-Object { $_.name })) { throw (New-CcxError "Unknown verify stage: $name" 2) }
    }
    if ($task) {
        # Certify all owned content (the fingerprint's file set), committed or not: checking only
        # changed files let committed broken code pass beside a dirty sibling.
        $raw = Invoke-CcxGit -Root $root -Arguments (@('ls-files','-z','--cached','--others','--exclude-standard','--') + @($task.owns | ForEach-Object { ':(literal)' + $_ }))
        $paths = @($raw.Split([char]0) | Where-Object { $_ })
    } else {
        $specs = @('.')
        foreach ($excluded in $policy.privacy.excludePaths) {
            $trimmed = $excluded.TrimEnd('/')
            $specs += @((':(exclude,icase)' + $trimmed), (':(exclude,icase)' + $trimmed + '/**'))
        }
        $raw = Invoke-CcxGit -Root $root -Arguments (@('diff','--name-only','-z','HEAD','--') + $specs)
        $paths = @($raw.Split([char]0) | Where-Object { $_ }) + @(Split-CcxList $Path)
    }
    $paths = @($paths | Sort-Object -Unique)
    foreach ($pathItem in $paths) { $null = Get-CcxSafeFile -Root $root -Path $pathItem }
    $applicability = if ($task -and -not $paths.Count) { @($task.owns) } else { $paths }
    # Capture before running commands: a stage that edits owned inputs cannot certify its new output.
    $fingerprint = if ($task) { Get-CcxFingerprint -Task $task -Root $root } else { $null }
    $checks = @()
    :stageLoop foreach ($entry in $policy.verify.stages) {
        if (($selected.Count -and $entry.name -notin $selected) -or ($Quick -and -not $entry.quick)) { continue }
        $applies = -not $entry.when
        foreach ($glob in $entry.when) {
            if (@($applicability | Where-Object { $_.Replace('\','/') -like $glob.Replace('\','/') }).Count) { $applies = $true; break }
        }
        if (-not $applies) { $checks += @{ name=$entry.name; result='N/A'; details=@() }; continue }
        try {
            $hits = @(); $applicable = $true
            if ($entry.builtin) {
                switch ($entry.builtin) {
                    'powershell-parse' {
                        $applicable = @($paths | Where-Object { [IO.Path]::GetExtension($_) -in @('.ps1','.psm1') }).Count -gt 0
                        $hits = @(Test-CcxPowerShellParse -Root $root -Paths $paths | ForEach-Object { "$($_.path):$($_.line) $($_.errorId)" })
                    }
                    'json-valid' {
                        $null = Get-CcxPolicy
                        $hits = @(Test-CcxJsonFiles -Root $root -Paths $paths | ForEach-Object { "$($_.path): invalid JSON" })
                    }
                    'secret-scan' { $hits = @(Test-CcxSecretsInPaths -Root $root -Paths $paths | ForEach-Object { "$($_.path): pattern $($_.patternIndex) line $($_.line)" }) }
                    'task-scope' {
                        $applicable = $null -ne $task
                        if ($task) { $hits = @(Test-CcxScope -Task $task -Root $root) }
                    }
                    'memory-lint' {
                        $lint = Invoke-CcxMemoryLint -Root $root
                        $details = @($lint.stages | Where-Object { $_.result -ne 'PASS' } | ForEach-Object { "$($_.result) $($_.name): " + ($_.details -join '; ') })
                        $checks += @{ name=$entry.name; result=$(if ($lint.pass) { 'PASS' } else { 'FAIL' }); details=$details }
                        continue stageLoop
                    }
                    default { throw (New-CcxError "Unknown verify builtin: $($entry.builtin)") }
                }
                $checks += @{ name=$entry.name; result=$(if ($hits.Count) { 'FAIL' } elseif ($applicable) { 'PASS' } else { 'N/A' }); details=$hits }
            } else { $checks += Invoke-CcxCommandStage -Stage $entry -Root $root -TaskId $TaskId }
        } catch { $checks += @{ name=$entry.name; result='FAIL'; details=@((Protect-CcxText $_.Exception.Message)) } }
    }
    if ($task -and (Get-CcxFingerprint -Task $task -Root $root) -ne $fingerprint) {
        $checks += @{ name='fingerprint'; result='FAIL'; details=@('Owned files changed while verification was running; run verification again.') }
    }
    $pass = @($checks | Where-Object { $_.result -eq 'FAIL' }).Count -eq 0
    $status = if ($pass) { 'PASS' } else { 'FAIL' }
    $at = Get-CcxNow
    Invoke-CcxLocked {
        param($state)
        if ($Baseline) {
            $state.baselines = @(@($state.baselines) + @(@{ at=$at; head=(Invoke-CcxGit -Root $root -Arguments @('rev-parse','HEAD')).Trim(); taskId=$TaskId; stages=$checks }) | Where-Object { $null -ne $_ } | Select-Object -Last 10)
        } elseif ($task) {
            $current = Get-CcxTask -State $state -Id $TaskId
            $current.verification = @{ status=$status; at=$at; fingerprint=$fingerprint; full=(-not $Quick -and -not $selected.Count); stages=$checks }
            $current.updated = $at
        }
        Write-CcxTelemetry @{ kind='verify'; at=$at; taskId=$TaskId; type=$task.type; class=$task.class; pass=@($checks | Where-Object { $_.result -eq 'PASS' }).Count; fail=@($checks | Where-Object { $_.result -eq 'FAIL' }).Count; skip=@($checks | Where-Object { $_.result -in @('SKIP','N/A') }).Count }
        if (-not $pass -and $task) { $null = Add-CcxEvent -State $state -Type verification-failed -TaskId $TaskId -Key ("verify:${TaskId}:$fingerprint") -Data @{ status=$status } }
    }
    return @{ pass=$pass; stages=$checks }
}

function Invoke-CcxCmdVerify($P) {
    $arguments = @{}
    foreach ($name in @('TaskId','Stage','Quick','Baseline','Path')) { if ($P.ContainsKey($name)) { $arguments[$name] = $P[$name] } }
    $result = Invoke-CcxVerify @arguments
    Write-CcxChecks $result $P
    return [int](-not $result.pass)
}

function Invoke-CcxGitResult {
    # Core's Git wrapper deliberately throws for nonzero exits; merge queries need the exit code.
    param([string]$Root, [string[]]$Arguments)
    $policy = Get-CcxPolicy
    Invoke-CcxProcess -FileName 'git.exe' -Arguments (($Arguments | ForEach-Object { ConvertTo-CcxArgument $_ }) -join ' ') -Root $Root -TimeoutMinutes $policy.classes[$policy.defaults.class].budget.timeoutMinutes
}

function Get-CcxWorktrees {
    param([string]$Root = (Get-CcxRepoRoot), $State = (Get-CcxState))
    $main = Get-CcxMainRoot -Root $Root
    $into = (Invoke-CcxGit -Root $main -Arguments @('symbolic-ref','--short','HEAD')).Trim()
    $raw = Invoke-CcxGit -Root $Root -Arguments @('worktree','list','--porcelain','-z')
    $items = @(); $item = $null
    foreach ($field in $raw.Split([char]0)) {
        if ($field.StartsWith('worktree ')) {
            if ($item) { $items += $item }
            $item = @{ path=[IO.Path]::GetFullPath($field.Substring(9)); branch=$null; head=$null }
        } elseif ($item -and $field.StartsWith('HEAD ')) { $item.head = $field.Substring(5) }
        elseif ($item -and $field.StartsWith('branch ')) { $item.branch = $field.Substring(7) -replace '^refs/heads/', '' }
    }
    if ($item) { $items += $item }
    foreach ($item in $items) {
        $task = @($State.tasks.Values | Where-Object { $_.worktree -and [IO.Path]::GetFullPath($_.worktree).TrimEnd('\','/') -eq [IO.Path]::GetFullPath($item.path).TrimEnd('\','/') } | Select-Object -First 1)
        $task = if ($task.Count) { $task[0] } else { $null }
        $item.taskId = $task.id; $item.status = $task.status; $item.createdBy = $task.worktreeCreatedBy
        $item.exists = [IO.Directory]::Exists($item.path)
        $item.dirty = $true; $item.merged = $false; $item.stale = $false
        if ($item.exists) {
            # Normal untracked mode detects dirt without walking unrelated private directories.
            $item.dirty = -not [string]::IsNullOrWhiteSpace((Invoke-CcxGit -Root $item.path -Arguments @('status','--porcelain','--untracked-files=normal')))
        }
        if ($item.branch) {
            $merge = Invoke-CcxGitResult -Root $main -Arguments @('merge-base','--is-ancestor',$item.branch,$into)
            if ($merge.timeout -or $merge.code -notin @(0,1)) { throw (New-CcxError 'Cannot determine worktree merge status.') }
            $item.merged = $merge.code -eq 0
        }
        if ($item.createdBy -eq 'ccx' -and $item.status -notin @('active','verifying')) {
            $last = (Invoke-CcxGit -Root $main -Arguments @('show','-s','--format=%cI',$item.head)).Trim()
            $item.stale = [DateTime]::Parse($last).ToUniversalTime() -lt [DateTime]::UtcNow.AddDays(-[double](Get-CcxPolicy).worktrees.staleDays)
        }
        $item
    }
}

function Invoke-CcxCmdWorktree($P) {
    $policy = Get-CcxPolicy; $main = Get-CcxMainRoot
    if ($P.Sub -eq 'add') {
        $task = Get-CcxTask -Id $P.TaskId
        if ($task.status -in @('done','abandoned')) { throw (New-CcxError 'Terminal tasks cannot create a worktree.' 2) }
        $agent = if ($P.Agent) { $P.Agent } else { $task.owner }
        if ($agent -notin @('claude','codex') -or -not $policy.worktrees.branchPrefix.ContainsKey($agent)) { throw (New-CcxError 'Unknown worktree agent.' 2) }
        $relative = $policy.worktrees.root.Replace('\','/').TrimEnd('/') + '/' + $agent + '-' + $task.id
        $path = Get-CcxSafeFile -Root $main -Path $relative
        $branch = $policy.worktrees.branchPrefix[$agent] + $task.id.ToLowerInvariant()
        Assert-CcxExactField $path 'Worktree'
        Assert-CcxExactField $branch 'Branch'
        $branchExists = Invoke-CcxGitResult -Root $main -Arguments @('show-ref','--verify','--quiet',('refs/heads/' + $branch))
        if ([IO.Directory]::Exists($path) -or [IO.File]::Exists($path) -or $branchExists.code -eq 0 -or $task.worktree) { throw (New-CcxError 'Worktree path or branch already exists.' 2) }
        if ($branchExists.timeout -or $branchExists.code -ne 1) { throw (New-CcxError 'Cannot inspect worktree branch.') }
        $baseInput = if ($P.Base) { $P.Base } else { 'HEAD' }
        if ($baseInput.StartsWith('-')) { throw (New-CcxError 'Invalid base ref.' 2) }
        # Resolve in the caller's worktree: worktree add runs in the main checkout, where HEAD means main.
        $baseRef = (Invoke-CcxGit -Arguments @('rev-parse','--verify',($baseInput + '^{commit}'))).Trim()
        $gate = Invoke-CcxGate -Action create-worktree -Target $path -TaskId $task.id
        if ($gate.code) { Write-CcxOutput $gate $P; return [int]$gate.code }
        $result = Invoke-CcxLocked {
            param($state)
            $current = Get-CcxTask -State $state -Id $task.id
            # Keep the ownership check and registration in one lock. Check only, before git: a task
            # start here would record a baseline for the caller's worktree, where the task never works.
            if ($current.status -in @('done','abandoned')) { throw (New-CcxError 'Terminal tasks cannot create a worktree.' 2) }
            Assert-CcxTaskOwnership $state $current
            $null = Invoke-CcxGit -Root $main -Arguments @('worktree','add','-b',$branch,$path,$baseRef)
            Start-CcxTaskInState -State $state -Task $current -Worktree $path -Branch $branch
            $current.worktreeCreatedBy = 'ccx'
            Add-CcxHistory @{ kind='worktree-add'; at=Get-CcxNow; taskId=$current.id; path=$path; branch=$branch }
            return @{ path=$path; branch=$branch }
        }
        Write-CcxOutput $result $P
        return 0
    }
    if ($P.Sub -notin @('list','prune')) { throw (New-CcxError 'Usage: worktree add|list|prune' 2) }
    if ($P.Sub -eq 'list') {
        $items = @(Get-CcxWorktrees)
        if ($P.Json) { Write-CcxOutput $items $P }
        else {
            foreach ($item in $items) { Write-CcxOutput "$($item.path) branch=$($item.branch) HEAD=$($item.head) task=$($item.taskId) status=$($item.status) dirty=$($item.dirty) merged=$($item.merged) stale=$($item.stale)" $P }
        }
        return 0
    }
    $reports = Invoke-CcxLocked {
        param($state)
        foreach ($item in @(Get-CcxWorktrees -Root $main -State $state)) {
            $reason = if ($item.path -eq [IO.Path]::GetFullPath($main)) { 'main worktree' }
                elseif ($item.createdBy -ne 'ccx') { 'not ccx-created' }
                elseif ($item.status -notin @('done','abandoned')) { 'task is not terminal' }
                elseif (-not $item.exists) { 'worktree is missing' }
                elseif ($item.dirty) { 'dirty' }
                elseif (-not $item.branch -or -not $item.merged) { 'branch is not merged' }
                else { $null }
            if ($reason) { @{ path=$item.path; result='KEEP'; reason=$reason }; continue }
            if (-not $P.Apply) { @{ path=$item.path; result='CANDIDATE'; reason='clean, merged, ccx-created terminal task' }; continue }
            $task = Get-CcxTask -State $state -Id $item.taskId
            # Refuse a forged/stale state entry before any deletion. Resolve inside the configured root.
            $expectedRoot = Get-CcxSafeFile -Root $main -Path ($policy.worktrees.root.Replace('\','/').TrimEnd('/') + '/')
            $actual = [IO.Path]::GetFullPath($item.path)
            if (-not $actual.StartsWith($expectedRoot.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or $task.branch -ne $item.branch) { throw (New-CcxError 'Worktree removal target is outside its recorded CCX location.') }
            $relative = $actual.Substring([IO.Path]::GetFullPath($main).TrimEnd('\','/').Length + 1).Replace('\','/')
            $null = Get-CcxSafeFile -Root $main -Path $relative
            $gate = Invoke-CcxGate -Action remove-worktree -Target $actual -TaskId $task.id
            if ($gate.code) { throw (New-CcxError $gate.message $gate.code) }
            # Git rechecks cleanliness; never use force, including if the worktree changed after inspection.
            $null = Invoke-CcxGit -Root $main -Arguments @('worktree','remove',$actual)
            $null = Invoke-CcxGit -Root $main -Arguments @('branch','-d',$item.branch)
            $task.worktree = $null; $task.updated = Get-CcxNow
            $task.checkpoints = @($task.checkpoints) + @(@{ at=Get-CcxNow; note='Pruned clean merged CCX worktree ' + $item.branch })
            @{ path=$item.path; result='REMOVED'; reason='clean and merged' }
        }
    }
    if ($P.Json) { Write-CcxOutput @($reports) $P }
    else { foreach ($report in $reports) { Write-CcxOutput "$($report.result) $($report.path) $($report.reason)" $P } }
    return 0
}

function Invoke-CcxCmdMergeCheck($P) {
    if (-not $P.Branch -or $P.Branch.StartsWith('-') -or ($P.Into -and $P.Into.StartsWith('-'))) { throw (New-CcxError 'merge-check requires valid Branch and Into refs.' 2) }
    $main = Get-CcxMainRoot
    $into = if ($P.Into) { $P.Into } else { (Invoke-CcxGit -Root $main -Arguments @('symbolic-ref','--short','HEAD')).Trim() }
    $merge = Invoke-CcxGitResult -Root $main -Arguments @('merge-tree','--write-tree','--name-only','--no-messages',$into,$P.Branch)
    if ($merge.timeout -or $merge.code -notin @(0,1)) { throw (New-CcxError 'merge-tree failed; check refs and Git support.') }
    $lines = @(); $failed = $merge.code -eq 1
    if ($failed) {
        foreach ($line in @($merge.stdout -split '\r?\n' | Select-Object -Skip 1 | Where-Object { $_ })) { $lines += 'CONFLICT ' + $line }
    }
    # --no-renames: a rename from an unowned path must show its deleted source too.
    $raw = Invoke-CcxGit -Root $main -Arguments @('diff','--name-only','--no-renames','-z',("$into...$($P.Branch)"))
    $paths = @($raw.Split([char]0) | Where-Object { $_ })
    $state = Get-CcxState
    $task = @($state.tasks.Values | Where-Object { $_.branch -eq $P.Branch } | Select-Object -First 1)
    if ($task.Count) {
        foreach ($path in $paths) {
            if (-not (Test-CcxPathOwned -Path $path -Owns $task[0].owns)) { $lines += "SCOPE $path"; $failed = $true }
        }
    }
    foreach ($other in $state.tasks.Values) {
        if ($other.branch -eq $P.Branch -or $other.status -notin @('active','verifying','blocked')) { continue }
        foreach ($path in $paths) {
            if (Test-CcxPathOwned -Path $path -Owns $other.owns) { $lines += "WARN overlap $($other.id) $path" }
        }
    }
    if (-not $failed) { $lines += 'MERGE CLEAN' }
    if ($P.Json) { Write-CcxOutput @{ pass=(-not $failed); details=$lines } $P }
    else { foreach ($line in $lines) { Write-CcxOutput $line $P } }
    return [int]$failed
}

function Invoke-CcxHealthSelfTests {
    param([string]$Root)
    $savedState = $env:CCX_STATE_DIR; $savedPolicy = $env:CCX_POLICY
    $scratch = Join-Path $env:TEMP ('ccx-t2o-' + [guid]::NewGuid().ToString('N'))
    $created = $false
    try {
        [void][IO.Directory]::CreateDirectory($scratch); $created = $true
        $policy = $script:CcxJson.DeserializeObject($script:CcxJson.Serialize((Get-CcxPolicy)))
        $policy.models.mythos.available = $false; $policy.adaptive.enabled = $false
        $env:CCX_STATE_DIR = Join-Path $scratch 'state'
        $env:CCX_POLICY = Join-Path $scratch 'policy.json'
        [IO.File]::WriteAllText($env:CCX_POLICY, $script:CcxJson.Serialize($policy), $script:CcxUtf8)
        $route = Invoke-CcxRoute -Type git-state
        if ($route.route -ne 'tool' -or $route.llmRequired) { throw 'Deterministic routing failed.' }
        $class = $policy.risk.high.minClass
        $route = Invoke-CcxRoute -Type implement -Class $class -Attempt 2
        if (-not $route.escalation) { throw 'Retry escalation failed.' }
        $route = Invoke-CcxRoute -Type implement -Class $policy.models.mythos.allowedClasses[0] -RequestMythos
        if ($route.route -eq 'mythos' -or $route.model -ne $policy.models.mythos.fallback[0].model) { throw 'Mythos fallback failed.' }
        $gate = Invoke-CcxGate -Action push -Target 'health-self-test'
        if ($gate.code -ne 10 -or (Get-CcxState).approvals[$gate.id].status -ne 'pending') { throw 'Approval gate failed.' }
        if ((Invoke-CcxGate -Action test).code -ne 0) { throw 'Local execution gate failed.' }
        $route = Invoke-CcxRoute -Type implement -Class $class -Attempt ([int]$policy.classes[$class].budget.maxDispatches + 1)
        if ($route.route -notin @('premium','surface')) { throw 'Budget cap failed.' }
        Invoke-CcxLocked {
            param($state)
            # Remove the synthetic approval event so the tick assertion has exactly one input.
            $state.eventQueue = @(); $state.notifications = @()
            $first = Add-CcxEvent -State $state -Type user -Key health-once -Data @{ message='synthetic' }
            $second = Add-CcxEvent -State $state -Type user -Key health-once -Data @{ message='synthetic' }
            if (-not $second.duplicate -or $first.id -ne $second.id) { throw 'Event dedup failed.' }
        }
        $one = Invoke-CcxTick; $two = Invoke-CcxTick
        if ($one.processed -ne 1 -or $two.processed -ne 0 -or (Get-CcxState).eventQueue.Count -ne 0) { throw 'Tick exactly-once test failed.' }
        return @{ name='self-tests'; result='PASS'; details=@('router, gate, budget, events, tick') }
    } catch { return @{ name='self-tests'; result='FAIL'; details=@((Protect-CcxText $_.Exception.Message)) } }
    finally {
        $env:CCX_STATE_DIR = $savedState; $env:CCX_POLICY = $savedPolicy
        if ($created) {
            $resolved = [IO.Path]::GetFullPath($scratch)
            $tempRoot = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
            if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'ccx-t2o-*') { throw (New-CcxError 'Unsafe health fixture cleanup path.') }
            Remove-Item -LiteralPath $resolved -Recurse -Force
        }
    }
}

function Invoke-CcxHealth {
    param([switch]$Quick, [switch]$Full, [string]$Root = (Get-CcxRepoRoot))
    $checks = @()
    try { $policy = Get-CcxPolicy; $checks += @{ name='policy'; result='PASS'; details=@('validated') } }
    catch { return @{ pass=$false; stages=@(@{ name='policy'; result='FAIL'; details=@('Invalid policy') }) } }
    $checks += @{ name='powershell'; result=$(if ($PSVersionTable.PSVersion -ge [version]'5.1') { 'PASS' } else { 'FAIL' }); details=@([string]$PSVersionTable.PSVersion) }
    try {
        $null = Get-Command git.exe -ErrorAction Stop
        $null = Invoke-CcxGit -Root $Root -Arguments @('rev-parse','--show-toplevel')
        $checks += @{ name='git/repo'; result='PASS'; details=@($Root) }
    } catch { $checks += @{ name='git/repo'; result='FAIL'; details=@('Git or repository unavailable') } }
    try {
        Invoke-CcxLocked {
            param($state)
            $probe = Join-Path (Get-CcxStateDir) ('probe-' + [guid]::NewGuid().ToString('N'))
            try {
                [IO.File]::WriteAllText($probe, 'ccx', $script:CcxUtf8)
                if ([IO.File]::ReadAllText($probe) -ne 'ccx') { throw 'State probe mismatch.' }
            } finally { if ([IO.File]::Exists($probe)) { [IO.File]::Delete($probe) } }
        }
        $checks += @{ name='state-dir'; result='PASS'; details=@('write/read/delete under lock') }
    } catch { $checks += @{ name='state-dir'; result='FAIL'; details=@((Protect-CcxText $_.Exception.Message)) } }
    if (-not $Quick) { $checks += Invoke-CcxHealthSelfTests -Root $Root }
    else { $checks += @{ name='self-tests'; result='SKIP'; details=@('quick health') } }
    try {
        $lint = Invoke-CcxMemoryLint -Root $Root
        $checks += @{ name='memory'; result=$(if ($lint.pass) { 'PASS' } else { 'FAIL' }); details=@($lint.stages | Where-Object { $_.result -ne 'PASS' } | ForEach-Object { "$($_.result) $($_.name) " + ($_.details -join '; ') }) }
    } catch { $checks += @{ name='memory'; result='FAIL'; details=@((Protect-CcxText $_.Exception.Message)) } }
    $codex = Get-Command codex.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $codex) { $checks += @{ name='codex'; result='FAIL'; details=@('codex.cmd missing') } }
    elseif ($Quick) { $checks += @{ name='codex'; result='PASS'; details=@('codex.cmd present; CLI checks skipped in quick health') } }
    else {
        $timeout = $policy.classes[$policy.defaults.class].budget.timeoutMinutes
        foreach ($check in @(@{ name='codex-version'; arguments='--version' }, @{ name='codex-login'; arguments='login status < NUL' })) {
            try {
                $command = '"' + $codex.Source + '" ' + $check.arguments
                $child = Invoke-CcxProcess -FileName (Join-Path ([Environment]::SystemDirectory) 'cmd.exe') -Arguments ('/d /s /c "' + $command + '"') -Root $Root -TimeoutMinutes $timeout
                $ok = -not $child.timeout -and $child.code -eq 0
                $detail = if ($check.name -eq 'codex-login') { if ($ok) { 'logged in' } else { 'not logged in' } }
                    elseif ($ok) { Protect-CcxText $child.stdout.Trim() } else { 'version command failed' }
                $checks += @{ name=$check.name; result=$(if ($ok) { 'PASS' } else { 'FAIL' }); details=@($detail) }
            } catch { $checks += @{ name=$check.name; result='FAIL'; details=@('CLI check failed') } }
        }
    }
    $catalogHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
    try {
        $catalog = $script:CcxJson.DeserializeObject([IO.File]::ReadAllText((Join-Path $catalogHome $policy.models.codex.catalogFile), $script:CcxUtf8))
        $slugs = @($catalog.models | ForEach-Object { $_.slug })
        $available = $policy.models.codex.default -in $slugs
        $fallback = @($policy.models.codex.fallbacks | Where-Object { $_ -in $slugs } | Select-Object -First 1)
        $checks += @{ name='codex-model'; result=$(if ($available) { 'PASS' } else { 'WARN' }); details=@($(if ($available) { $policy.models.codex.default } elseif ($fallback.Count) { 'default absent; fallback ' + $fallback[0] } else { 'no configured model in catalog' })) }
    } catch { $checks += @{ name='codex-model'; result='WARN'; details=@('catalog missing or unreadable') } }
    $claude = @(Get-Command claude.exe,claude -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1)
    # Presence only: health never invokes Claude.
    $checks += @{ name='claude'; result=$(if ($claude.Count) { 'PASS' } else { 'WARN' }); details=@($(if ($claude.Count) { 'CLI present' } else { 'CLI missing; desktop app may be in use' })) }
    $mythos = $policy.models.mythos
    $checks += @{ name='mythos'; result=$(if ($mythos.available -and -not $mythos.model) { 'FAIL' } else { 'PASS' }); details=@($(if (-not $mythos.available) { 'not configured; escalation falls back to ' + (($mythos.fallback | ForEach-Object { $_.model }) -join ', ') } elseif (-not $mythos.model) { 'available without model' } else { $mythos.model })) }
    if ($policy.ContainsKey('providers')) {
        $codexConfigPath = Join-Path $catalogHome 'config.toml'
        $codexConfig = if ([IO.File]::Exists($codexConfigPath)) { [IO.File]::ReadAllText($codexConfigPath, $script:CcxUtf8) } else { '' }
        foreach ($name in @($policy.providers.Keys)) {
            $provider = $policy.providers[$name]
            # Presence only: never print a key value, never call the provider.
            $result = 'SKIP'; $detail = 'disabled'
            if (-not $provider.enabled) { }
            elseif ($provider.kind -eq 'local') {
                if (Get-Command $provider.command -CommandType Application -ErrorAction SilentlyContinue) { $result = 'PASS'; $detail = "$($provider.command) present; model $($provider.model)" }
                else { $detail = "$($provider.command) not installed; route skips it" }
            } elseif (-not [Environment]::GetEnvironmentVariable($provider.envKey)) { $detail = "$($provider.envKey) not set; route skips it" }
            elseif ($codexConfig -notmatch ('(?m)^\s*\[model_providers\.' + [regex]::Escape($name) + '\]')) { $result = 'WARN'; $detail = "$($provider.envKey) set but [model_providers.$name] missing in Codex config.toml" }
            else { $result = 'PASS'; $detail = "$($provider.envKey) set; model $($provider.model)" }
            $checks += @{ name="provider-$name"; result=$result; details=@($detail) }
        }
    }
    foreach ($agentName in @($policy.models.claude.cheapSubagent, $policy.models.claude.reviewSubagent)) {
        try {
            $agentPath = Get-CcxSafeFile -Root $Root -Path ('.claude/agents/' + $agentName + '.md')
            $text = [IO.File]::ReadAllText($agentPath, $script:CcxUtf8)
            $front = [regex]::Match($text, '(?s)\A---\r?\n(.*?)\r?\n---(?:\r?\n|$)')
            if (-not $front.Success) { throw 'Missing frontmatter.' }
            foreach ($key in @('name','description','tools')) {
                if ($front.Groups[1].Value -notmatch ('(?m)^' + $key + ':\s*\S')) { throw ('Missing frontmatter key ' + $key) }
            }
            $toolsField = [regex]::Match($front.Groups[1].Value, '(?ms)^tools:\s*([^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*)').Groups[1].Value
            $mcpTools = @([regex]::Matches($toolsField, 'mcp__[A-Za-z0-9_-]+') | ForEach-Object { $_.Value })
            foreach ($tool in $mcpTools) {
                if ($tool -notin @($policy.mcp.subagents[$agentName])) { throw 'Agent has an unapproved MCP tool.' }
            }
            $checks += @{ name=('agent:' + $agentName); result='PASS'; details=@('frontmatter and MCP tools') }
        } catch { $checks += @{ name=('agent:' + $agentName); result='FAIL'; details=@((Protect-CcxText $_.Exception.Message)) } }
    }
    try {
        $config = Join-Path $catalogHome 'config.toml'
        $servers = @()
        if ([IO.File]::Exists($config)) {
            foreach ($line in [IO.File]::ReadLines($config)) {
                # Server name only: [mcp_servers.node_repl.env] is a sub-table of node_repl.
                if ($line -match "^\s*\[mcp_servers\.(?:`"([^`"]+)`"|'([^']+)'|([^.\]\s]+))") { $servers += @($Matches[1], $Matches[2], $Matches[3] | Where-Object { $_ })[0] }
            }
        }
        $extra = @($servers | Select-Object -Unique | Where-Object { $_ -notin $policy.mcp.codexAllowedServers })
        $checks += @{ name='codex-mcp'; result=$(if ($extra.Count) { 'WARN' } else { 'PASS' }); details=@($(if ($extra.Count) { 'extra servers: ' + ($extra -join ', ') } else { 'allowed headers only' })) }
        $project = Get-CcxSafeFile -Root $Root -Path '.mcp.json'
        $extra = @()
        if ([IO.File]::Exists($project)) {
            $config = $script:CcxJson.DeserializeObject([IO.File]::ReadAllText($project, $script:CcxUtf8))
            $extra = @($config.mcpServers.Keys | Where-Object { $_ -notin $policy.mcp.projectAllowedServers })
        }
        $checks += @{ name='project-mcp'; result=$(if ($extra.Count) { 'WARN' } else { 'PASS' }); details=@($(if ($extra.Count) { 'extra servers: ' + ($extra -join ', ') } else { 'allowed servers or absent' })) }
    } catch { $checks += @{ name='mcp'; result='FAIL'; details=@('MCP inventory could not be read') } }
    if ($Quick) { $checks += @{ name='worktree'; result='SKIP'; details=@('quick health never creates worktrees') } }
    else {
        $scratch = Join-Path $env:TEMP ('ccx-t2o-' + [guid]::NewGuid().ToString('N'))
        $worktree = [IO.Path]::GetFullPath((Join-Path $scratch ('ccx-hc-' + [guid]::NewGuid().ToString('N'))))
        if (-not $worktree.StartsWith([IO.Path]::GetFullPath($scratch).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw (New-CcxError 'Unsafe health worktree path.') }
        $created = $false; $failure = $null
        try {
            [void][IO.Directory]::CreateDirectory($scratch)
            $null = Invoke-CcxGit -Root $Root -Arguments @('worktree','add','--detach',$worktree,'HEAD'); $created = $true
            $expected = (Invoke-CcxGit -Root $Root -Arguments @('rev-parse','HEAD')).Trim()
            if ((Invoke-CcxGit -Root $worktree -Arguments @('rev-parse','HEAD')).Trim() -ne $expected) { throw 'Temporary worktree HEAD mismatch.' }
        } catch { $failure = Protect-CcxText $_.Exception.Message }
        finally {
            try {
                if ($created) {
                    $null = Invoke-CcxGit -Root $Root -Arguments @('worktree','remove',$worktree)
                    $null = Invoke-CcxGit -Root $Root -Arguments @('worktree','prune')
                }
                # Empty-only cleanup cannot recursively delete an unexpectedly dirty checkout.
                if ([IO.Directory]::Exists($scratch)) { [IO.Directory]::Delete($scratch, $false) }
            } catch { $failure = 'Temporary health worktree cleanup failed: ' + (Protect-CcxText $_.Exception.Message) }
        }
        $checks += @{ name='worktree'; result=$(if ($failure) { 'FAIL' } else { 'PASS' }); details=@($(if ($failure) { $failure } else { 'temporary detached worktree created, verified and removed' })) }
    }
    try {
        $raw = Invoke-CcxGit -Root $Root -Arguments @('ls-files','-z','--','scripts/*.ps1')
        $paths = @($raw.Split([char]0) | Where-Object { $_ })
        $errors = @(Test-CcxPowerShellParse -Root $Root -Paths $paths)
        $checks += @{ name='verify-runner'; result=$(if ($errors.Count) { 'FAIL' } else { 'PASS' }); details=@($errors | ForEach-Object { "$($_.path):$($_.line) $($_.errorId)" }) }
    } catch { $checks += @{ name='verify-runner'; result='FAIL'; details=@((Protect-CcxText $_.Exception.Message)) } }
    try {
        $state = Get-CcxState
        $until = $state.agents.codex.unavailableUntil
        $unavailable = $until -and [DateTime]::Parse($until).ToUniversalTime() -gt [DateTime]::UtcNow
        $checks += @{ name='codex-availability'; result=$(if ($unavailable) { 'WARN' } else { 'PASS' }); details=@($(if ($unavailable) { "unavailable until $until" } else { 'available' })) }
        $queue = Get-CcxQueueCounts $state
        $expired = @($state.eventQueue | Where-Object { $_.status -eq 'processing' -and $_.leaseUntil -and [DateTime]::Parse($_.leaseUntil).ToUniversalTime() -lt [DateTime]::UtcNow }).Count
        $checks += @{ name='runtime'; result=$(if ($expired) { 'WARN' } else { 'PASS' }); details=@("enabled=$($state.runtime.enabled) pending=$($queue.pending) dead=$($queue.dead) expired leases=$expired") }
    } catch { $checks += @{ name='runtime'; result='FAIL'; details=@((Protect-CcxText $_.Exception.Message)) } }
    if ($Full -and -not $Quick) {
        foreach ($stage in $policy.verify.stages) {
            if ($stage.builtin) { continue }
            try { $checks += Invoke-CcxCommandStage -Stage $stage -Root $Root }
            catch { $checks += @{ name=$stage.name; result='FAIL'; details=@((Protect-CcxText $_.Exception.Message)) } }
        }
    }
    return @{ pass=(@($checks | Where-Object { $_.result -eq 'FAIL' }).Count -eq 0); stages=$checks }
}

function Invoke-CcxCmdHealth($P) {
    $result = Invoke-CcxHealth -Full:([bool]$P.Full)
    if ($P.Json) { Write-CcxOutput @($result.stages) $P } else { Write-CcxChecks $result $P }
    return [int](-not $result.pass)
}

function Invoke-CcxCmdStatus($P) {
    $warning = $null
    if ((Get-CcxState).runtime.enabled) {
        try { $null = Invoke-CcxTick }
        catch { $warning = Protect-CcxText $_.Exception.Message }
    }
    $policy = Get-CcxPolicy; $state = Get-CcxState; $root = Get-CcxRepoRoot
    $tasks = @()
    foreach ($task in @($state.tasks.Values | Where-Object { $_.status -notin @('done','abandoned') } | Sort-Object { $_.id })) {
        $budget = Get-CcxBudget $policy (Get-CcxClass $policy $task.class $task.risk) $task
        $tasks += @{ id=$task.id; status=$task.status; owner=$task.owner; model=$task.lastDispatch.model; effort=$task.lastDispatch.effort; dispatches=$task.dispatches; maxDispatches=$budget.maxDispatches; effectiveTokens=([long]$task.tokens.input - [long]$task.tokens.cached + [long]$task.tokens.output); tokenTarget=$budget.tokenTarget; verification=$task.verification.status; reviews=$task.reviews }
    }
    $worktrees = @(Get-CcxWorktrees -Root $root -State $state)
    $value = [ordered]@{
        repo=$root; branch=(Invoke-CcxGit -Root $root -Arguments @('rev-parse','--abbrev-ref','HEAD')).Trim(); head=(Invoke-CcxGit -Root $root -Arguments @('rev-parse','HEAD')).Trim()
        runtime=@{ enabled=$state.runtime.enabled; lastTick=$state.runtime.lastTick; queue=(Get-CcxQueueCounts $state) }
        agents=@{ codex=$policy.models.codex.default; unavailableUntil=$state.agents.codex.unavailableUntil; claude=$policy.models.claude.lead; mythosAvailable=$policy.models.mythos.available }
        tasks=$tasks; worktrees=@{ total=$worktrees.Count; ccx=@($worktrees | Where-Object { $_.createdBy -eq 'ccx' }).Count; stale=@($worktrees | Where-Object { $_.stale }).Count }
        approvals=@($state.approvals.Values | Where-Object { $_.status -eq 'pending' } | Sort-Object { $_.id } | ForEach-Object { @{ id=$_.id; level=$_.level; action=$_.action; target=$_.target; taskId=$_.taskId } })
        notifications=@($state.notifications | Where-Object { -not $_.ack } | Sort-Object { $_.at }, { $_.id } -Descending | Select-Object -First 10)
        routing=@($state.routingLog | Select-Object -Last 5); warning=$warning
    }
    if ($P.Json) { Write-CcxOutput $value $P; return 0 }
    if ($P.Brief) {
        Write-CcxOutput "tasks=$($tasks.Count) worktrees=$($value.worktrees.ccx) stale=$($value.worktrees.stale) pending events=$($value.runtime.queue.pending) dead=$($value.runtime.queue.dead)" $P
        Write-CcxOutput ("pending approvals=$($value.approvals.Count): " + (($value.approvals | ForEach-Object { "$($_.id) $($_.action)" }) -join ', ')) $P
        $actions = @($value.notifications | Where-Object { $_.level -eq 'action' } | Select-Object -First 2)
        foreach ($action in $actions) { Write-CcxOutput "action $($action.id): $($action.text)" $P }
        if ($warning) { Write-CcxOutput "WARN tick: $warning" $P }
        return 0
    }
    if ($warning) { Write-CcxOutput "WARN tick: $warning" $P }
    Write-CcxOutput "repo $root branch=$($value.branch) HEAD=$($value.head)" $P
    Write-CcxOutput ("runtime enabled=$($state.runtime.enabled) lastTick=$($state.runtime.lastTick) queue=" + $script:CcxJson.Serialize($value.runtime.queue)) $P
    Write-CcxOutput "agents Codex=$($value.agents.codex) unavailableUntil=$($value.agents.unavailableUntil) Claude=$($value.agents.claude) mythos=$($value.agents.mythosAvailable)" $P
    Write-CcxOutput "tasks ($($tasks.Count))" $P
    foreach ($task in $tasks) { Write-CcxOutput ("$($task.id) $($task.status) $($task.owner) $($task.model) $($task.effort) dispatches=$($task.dispatches)/$($task.maxDispatches) tokens=$($task.effectiveTokens)/$($task.tokenTarget) verification=$($task.verification) reviews=" + $script:CcxJson.Serialize($task.reviews)) $P }
    Write-CcxOutput "worktrees ccx=$($value.worktrees.ccx) stale=$($value.worktrees.stale) total=$($value.worktrees.total)" $P
    Write-CcxOutput "approvals ($($value.approvals.Count))" $P
    foreach ($approval in $value.approvals) { Write-CcxOutput "$($approval.id) $($approval.level) $($approval.action) $($approval.target) task=$($approval.taskId)" $P }
    Write-CcxOutput "notifications ($($value.notifications.Count))" $P
    foreach ($notification in $value.notifications) { Write-CcxOutput "$($notification.id) $($notification.level) $($notification.text)" $P }
    Write-CcxOutput "routing ($($value.routing.Count))" $P
    foreach ($route in $value.routing) { Write-CcxOutput "$($route.at) $($route.taskId) $($route.route) $($route.agent) $($route.model) $($route.effort)" $P }
    return 0
}
