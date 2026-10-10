# Offline regression tests. All agent commands are synthetic mocks; no provider calls.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'invoke-external-tool.ps1')
$temp = Join-Path ([IO.Path]::GetTempPath()) ('crucible-tools-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $temp
$env:CRUCIBLE_MOCK_LOG = Join-Path $temp 'command.json'
$script:passed = 0
$script:failed = 0
function Check([string]$Name, [scriptblock]$Test) {
    try { & $Test; $script:passed++; Write-Output "PASS: $Name" }
    catch { $script:failed++; Write-Output "FAIL: $Name - $($_.Exception.Message)" }
    finally { Remove-Item Env:CRUCIBLE_MOCK_EXIT -ErrorAction SilentlyContinue }
}
function Assert($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Run([string]$Script, [string[]]$Arguments) {
    Remove-Item -LiteralPath $env:CRUCIBLE_MOCK_LOG -ErrorAction SilentlyContinue
    # Fixture controls set environment overrides; launchers forward every CLI argument.
    $forward = New-Object 'Collections.Generic.List[string]'
    for ($i=0; $i -lt $Arguments.Count; $i++) {
        if ($Arguments[$i] -eq '-Executable') {
            $tool = if ($Script -eq 'load-claude-skill.ps1') { 'CLAUDE' } else { [IO.Path]::GetFileNameWithoutExtension($Script).ToUpperInvariant() }
            [Environment]::SetEnvironmentVariable(('CRUCIBLE_' + $tool + '_EXE'), $Arguments[++$i], 'Process')
        } elseif ($Arguments[$i] -eq '-CodexHome') { $env:CRUCIBLE_CODEX_HOME = $Arguments[++$i] }
        elseif ($Script -eq 'load-claude-skill.ps1' -and $Arguments[$i] -eq '-SkillPath') { $forward.Add($Arguments[++$i]) }
        else { $forward.Add($Arguments[$i]) }
    }
    try {
        $forwardArgs = $forward.ToArray()
        if ($Script -eq 'codex-load-skill.ps1') {
            $parameters = @{}
            for ($i=0; $i -lt $forwardArgs.Count; $i+=2) { $parameters[$forwardArgs[$i].TrimStart('-')] = $forwardArgs[$i+1] }
            & (Join-Path $PSScriptRoot $Script) @parameters | Out-Null
        } else { & (Join-Path $PSScriptRoot $Script) @forwardArgs | Out-Null }
        $script:code = if ($Script -eq 'codex-load-skill.ps1') { 0 } else { $LASTEXITCODE }
    } catch { $script:code = 1; $script:runError = $_.Exception.Message }
}
function Record { Get-Content -LiteralPath $env:CRUCIBLE_MOCK_LOG -Raw -Encoding utf8 | ConvertFrom-Json }
$mockRoot = Join-Path $root 'tests\mocks'
$utf8 = New-Object Text.UTF8Encoding($false)
$oldEnv = @{}
foreach ($name in @('CRUCIBLE_GJC_EXE','CRUCIBLE_CLAW_EXE','CRUCIBLE_CODEX_EXE','CRUCIBLE_CLAUDE_EXE','CRUCIBLE_CODEX_HOME')) {
    $oldEnv[$name] = [Environment]::GetEnvironmentVariable($name,'Process')
}
try {
    Push-Location $root
    $skill = Join-Path $temp 'synthetic skill.md'
    $prompt = Join-Path $temp 'task prompt.txt'
    $output = Join-Path $temp 'combined.txt'
    [IO.File]::WriteAllText($skill, "Synthetic reference: cafe $([char]0x00e9).", $utf8)
    [IO.File]::WriteAllText($prompt, 'Reply SYNTHETIC_OK.', $utf8)
    foreach ($tool in @('gjc','claw')) {
        Check "$tool arguments and working directory" {
            Run "$tool.ps1" @('-Executable',(Join-Path $mockRoot "$tool.ps1"),'--version','two words','literal;value')
            $record = Record
            Assert ($script:code -eq 0 -and $record.command -eq $tool) 'Wrong command or exit code.'
            Assert (($record.args -join '|') -ceq '--version|two words|literal;value') 'Arguments changed.'
            Assert ($record.cwd -ieq $root) 'Working directory changed.'
        }
        Check "$tool exit propagation" {
            $env:CRUCIBLE_MOCK_EXIT = '23'
            Run "$tool.ps1" @('-Executable',(Join-Path $mockRoot "$tool.ps1"),'--help')
            Assert ($script:code -eq 23) 'Child failure was hidden.'
            Remove-Item Env:CRUCIBLE_MOCK_EXIT
        }
        Check "$tool missing executable" {
            Run "$tool.ps1" @('-Executable',(Join-Path $temp 'absent.exe'),'--version') 2>$null
            Assert ($script:code -ne 0) 'Missing tool accepted.'
        }
    }
    Check 'Claude loader appends the selected file' {
        Run 'load-claude-skill.ps1' @('-SkillPath',$skill,'-Executable',(Join-Path $mockRoot 'claude.ps1'),'--help')
        $record = Record
        Assert ($script:code -eq 0 -and $record.command -eq 'claude') 'Claude mock failed.'
        Assert ($record.args[0] -eq '--append-system-prompt-file' -and $record.args[1] -eq $skill) 'Wrong Claude flag or file.'
        Assert ($record.skill -ceq [IO.File]::ReadAllText($skill)) 'Skill content changed.'
    }
    Check 'Claude loader propagates failure' {
        $env:CRUCIBLE_MOCK_EXIT = '24'
        Run 'load-claude-skill.ps1' @('-SkillPath',$skill,'-Executable',(Join-Path $mockRoot 'claude.ps1'),'--help')
        Assert ($script:code -eq 24) 'Claude failure was hidden.'
        Remove-Item Env:CRUCIBLE_MOCK_EXIT
    }
    Check 'Claude loader rejects non-Markdown' {
        Run 'load-claude-skill.ps1' @('-SkillPath',$prompt,'-Executable',(Join-Path $mockRoot 'claude.ps1')) 2>$null
        Assert ($script:code -ne 0) 'Non-Markdown accepted.'
    }
    Check 'Codex loader preserves UTF-8 and places reference before task' {
        Run 'codex-load-skill.ps1' @('-SkillPath',$skill,'-PromptPath',$prompt,'-OutputPath',$output)
        Assert (Test-Path -LiteralPath $output) $script:runError
        $text = [IO.File]::ReadAllText($output)
        Assert ($script:code -eq 0 -and $text.Contains([IO.File]::ReadAllText($skill))) 'Skill content missing.'
        Assert ($text.IndexOf('Synthetic reference') -lt $text.IndexOf('Reply SYNTHETIC_OK')) 'Wrong content order.'
        Assert ($text.Contains('ccx gates remain authoritative')) 'Workflow boundary missing.'
    }
    Check 'Codex loader refuses to overwrite an input or output' {
        $before = [IO.File]::ReadAllText($skill)
        Run 'codex-load-skill.ps1' @('-SkillPath',$skill,'-PromptPath',$prompt,'-OutputPath',$skill) 2>$null
        Assert ($script:code -ne 0 -and [IO.File]::ReadAllText($skill) -ceq $before) 'Input overwritten.'
        $before = [IO.File]::ReadAllText($output)
        Run 'codex-load-skill.ps1' @('-SkillPath',$skill,'-PromptPath',$prompt,'-OutputPath',$output) 2>$null
        Assert ($script:code -ne 0 -and [IO.File]::ReadAllText($output) -ceq $before) 'Output overwritten.'
    }
    $profile = Join-Path $temp 'codex profile'
    $plugin = Join-Path $profile 'plugins\cache\sisyphuslabs\omo\5.1.13'
    $null = New-Item -ItemType Directory -Path (Join-Path $plugin '.codex-plugin') -Force
    $null = New-Item -ItemType Directory -Path (Join-Path $plugin 'hooks') -Force
    [IO.File]::WriteAllText((Join-Path $profile 'config.toml'), "[plugins.`"omo@sisyphuslabs`"]`nenabled = true`n", $utf8)
    [IO.File]::WriteAllText((Join-Path $plugin '.codex-plugin\plugin.json'), '{"hooks":["./hooks/test.json"]}', $utf8)
    [IO.File]::WriteAllText((Join-Path $plugin 'hooks\test.json'), '{}', $utf8)
    Check 'OmO wrapper selects isolated profile and preserves arguments' {
        $before = $env:CODEX_HOME
        Run 'codex.ps1' @('-CodexHome',$profile,'-Executable',(Join-Path $mockRoot 'codex.ps1'),'--help')
        $record = Record
        Assert ($script:code -eq 0 -and $record.codexHome -eq $profile) 'Wrong Codex profile.'
        Assert ($record.project -ieq $root -and ($record.args -join '|') -eq '--help') 'Project or arguments changed.'
        Assert ($env:CODEX_HOME -ceq $before) 'Parent environment changed.'
    }
    Check 'OmO wrapper propagates failure' {
        $env:CRUCIBLE_MOCK_EXIT = '25'
        Run 'codex.ps1' @('-CodexHome',$profile,'-Executable',(Join-Path $mockRoot 'codex.ps1'),'--help')
        Assert ($script:code -eq 25) 'Codex failure was hidden.'
        Remove-Item Env:CRUCIBLE_MOCK_EXIT
    }
    Check 'All wrappers preserve short native tool flags' {
        $flags = @('-p','x','-c','k=v','-C','dir','-v','-e')
        foreach ($tool in @('gjc','claw','codex','claude')) {
            $scriptName = if ($tool -eq 'claude') { 'load-claude-skill.ps1' } else { "$tool.ps1" }
            $fixture = @('-Executable',(Join-Path $mockRoot "$tool.ps1"))
            if ($tool -eq 'claude') { $fixture = @('-SkillPath',$skill) + $fixture }
            if ($tool -eq 'codex') { $fixture += @('-CodexHome',$profile) }
            Run $scriptName ($fixture + $flags)
            $record = Record
            $observed = if ($tool -eq 'claude') { @($record.args | Select-Object -Skip 2) } else { @($record.args) }
            Assert ($script:code -eq 0 -and ($observed -join '|') -ceq ($flags -join '|')) "Short flags changed: $tool"
        }
    }
    Check 'Native process preserves empty, quotes, Unicode and shell characters' {
        . (Join-Path $PSScriptRoot 'invoke-external-tool.ps1')
        $native = @('','a"b','space "quote" trail\',"cafe $([char]0x00e9)",'a&b','a|b','<x>','%PATH%','caret^bang!')
        $code = Invoke-ExternalTool (Get-Command node.exe).Source (@((Join-Path $mockRoot 'record-command.cjs'),'native') + $native)
        $record = Record
        Assert ($code -eq 0 -and $record.args.Count -eq $native.Count) 'Native argument count changed.'
        for ($i=0; $i -lt $native.Count; $i++) { Assert ($record.args[$i] -ceq $native[$i]) "Native argument $i changed." }
    }
    Check 'Shell shims are rejected' {
        try { $null = Invoke-ExternalTool (Get-Command codex.cmd).Source @('a&b'); throw 'Accepted shell shim.' }
        catch { Assert ($_.Exception.Message -match 'native executable override') 'Unexpected shim result.' }
    }
    Check 'Environment restored in the same process' {
        $beforePath = $env:PATH
        Run 'claw.ps1' @('-Executable',(Join-Path $mockRoot 'claw.ps1'),'--help')
        Assert ($env:PATH -ceq $beforePath) 'PATH leaked.'
        $previous = @{}
        foreach ($name in @('CODEX_HOME','OMO_CODEX_PROJECT','OMO_CODEX_GIT_BASH_PATH','OMO_WRAPPER_PACKAGE_ROOT','OMO_EDITION','OMO_RUNTIME','DO_NOT_TRACK','OMO_DISABLE_POSTHOG','LAZYCODEX_AUTO_UPDATE_DISABLED','OMO_CODEX_AUTO_UPDATE_DISABLED')) {
            $previous[$name] = [Environment]::GetEnvironmentVariable($name,'Process')
        }
        Run 'codex.ps1' @('-CodexHome',$profile,'-Executable',(Join-Path $mockRoot 'codex.ps1'),'--help')
        foreach ($name in $previous.Keys) { Assert ([Environment]::GetEnvironmentVariable($name,'Process') -ceq $previous[$name]) "Environment leaked: $name" }
    }
    Check 'Readiness probes wrappers without provider prompts or credential disclosure' {
        $env:CRUCIBLE_GJC_EXE = Join-Path $mockRoot 'gjc.ps1'
        $env:CRUCIBLE_CLAW_EXE = Join-Path $mockRoot 'claw.ps1'
        $env:CRUCIBLE_CODEX_EXE = Join-Path $mockRoot 'codex.ps1'
        $env:CRUCIBLE_CODEX_HOME = $profile
        $beforeKey = $env:ANTHROPIC_AUTH_TOKEN
        try {
            $env:ANTHROPIC_AUTH_TOKEN = 'synthetic-private-value'
            $json = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'check-external-tools.ps1') -SkillRoot $temp -Json) -join "`n"
            Assert ($LASTEXITCODE -eq 0) 'Inventory failed.'
            $rows = $json | ConvertFrom-Json
            Assert ($rows.Count -eq 5 -and @($rows | Where-Object Status -eq 'cli-pass').Count -eq 4) ('Installed mock wrappers were not probed: ' + (($rows | ForEach-Object { $_.Tool + '=' + $_.Status }) -join ','))
            Assert ($rows[3].Status -eq 'files-present') 'Synthetic Markdown not detected.'
            Assert (-not $json.Contains('synthetic-private-value')) 'Credential disclosed.'
            $record = Record
            Assert (($record.args -join '|') -ceq '--help') 'OmO probe executed a provider prompt.'
        } finally { $env:ANTHROPIC_AUTH_TOKEN = $beforeKey }
    }
    Check 'Unavailable optional tools never block inventory or normal workflow' {
        foreach ($name in @('CRUCIBLE_GJC_EXE','CRUCIBLE_CLAW_EXE','CRUCIBLE_CODEX_EXE','CRUCIBLE_PYTHON_EXE')) { [Environment]::SetEnvironmentVariable($name,(Join-Path $temp 'missing.exe'),'Process') }
        $json = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'check-external-tools.ps1') -SkillRoot (Join-Path $temp 'missing-library') -Json) -join "`n"
        Assert ($LASTEXITCODE -eq 0) 'Optional absence blocked inventory.'
        $rows = $json | ConvertFrom-Json
        Assert ($rows.Count -eq 5 -and @($rows | Where-Object Status -eq 'unavailable').Count -eq 5) ('Missing tools reported as usable: ' + (($rows | ForEach-Object { $_.Tool + '=' + $_.Status }) -join ','))
    }
    Check 'OmO wrapper rejects missing hooks' {
        Remove-Item -LiteralPath (Join-Path $plugin 'hooks\test.json')
        Run 'codex.ps1' @('-CodexHome',$profile,'-Executable',(Join-Path $mockRoot 'codex.ps1'),'--help') 2>$null
        Assert ($script:code -ne 0) 'Missing hooks accepted.'
    }
    Check 'OmO wrapper rejects disabled plugin' {
        [IO.File]::WriteAllText((Join-Path $profile 'config.toml'), "[plugins.`"omo@sisyphuslabs`"]`nenabled = false`n", $utf8)
        Run 'codex.ps1' @('-CodexHome',$profile,'-Executable',(Join-Path $mockRoot 'codex.ps1'),'--help') 2>$null
        Assert ($script:code -ne 0) 'Disabled plugin accepted.'
    }
    Remove-Item Env:CRUCIBLE_PYTHON_EXE -ErrorAction SilentlyContinue
    Check 'generate wrapper: offline self-check, list, and key-less refusal (no provider calls)' {
        $saved = @{}
        foreach ($name in @('KIE_API_KEY','FAL_KEY','WAVESPEED_API_KEY')) { $saved[$name] = [Environment]::GetEnvironmentVariable($name,'Process'); Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
        $env:GENERATE_NO_DOTENV = '1'
        try {
            $null = & (Join-Path $root 'scripts\generate.ps1') list
            Assert ($LASTEXITCODE -eq 0) 'generate list failed.'
            $null = & (Join-Path $root 'scripts\generate.ps1') run gpt-image-2 x --dry-run 2>$null
            Assert ($LASTEXITCODE -ne 0) 'generate ran with no provider key.'
            $null = & python -I (Join-Path $root '.claude\skills\generate\test_generate.py')
            Assert ($LASTEXITCODE -eq 0) 'generate self-check failed.'
        } finally { Remove-Item Env:GENERATE_NO_DOTENV -ErrorAction SilentlyContinue; foreach ($name in $saved.Keys) { if ($null -ne $saved[$name]) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') } } }
    }
    Check 'Agent documentation symmetry' {
        $agents = [IO.File]::ReadAllText((Join-Path $root 'AGENTS.md'))
        $claude = [IO.File]::ReadAllText((Join-Path $root 'CLAUDE.md'))
        foreach ($document in @($agents,$claude)) {
            Assert ($document.StartsWith('> Symmetry rule:')) 'Symmetry rule is not at the top.'
            foreach ($name in @('Gajae-Code','Claw-Code','Claude-Red','OmO','gjc.ps1','claw.ps1','load-claude-skill.ps1','codex-load-skill.ps1','codex.ps1','check-external-tools.ps1','connect-claw.ps1','generate.ps1','Choosing a tool','tool: none')) {
                Assert ($document.Contains($name)) "Missing tool: $name"
            }
        }
        # Windows is the next real heading; comments inside fenced examples are not headings.
        $sectionPattern = '(?ms)^# External Tools\r?\n.*?(?=^# Windows\r?$|\z)'
        Assert ([regex]::Match($agents.Replace("`r`n","`n"),$sectionPattern).Value.Trim() -ceq [regex]::Match($claude.Replace("`r`n","`n"),$sectionPattern).Value.Trim()) 'External sections differ.'
    }
} finally {
    Pop-Location
    foreach ($name in $oldEnv.Keys) { [Environment]::SetEnvironmentVariable($name,$oldEnv[$name],'Process') }
    Remove-Item Env:CRUCIBLE_MOCK_LOG -ErrorAction SilentlyContinue
    Remove-Item Env:CRUCIBLE_MOCK_EXIT -ErrorAction SilentlyContinue
    # Only this run's freshly created TEMP directory can be removed.
    $resolvedTemp = [IO.Path]::GetFullPath($temp)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolvedTemp.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($resolvedTemp) -notmatch '^crucible-tools-[0-9a-f]{32}$') { throw 'Unsafe temporary cleanup path.' }
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
}
Write-Output "RESULT: $script:passed passed; $script:failed failed"
if ($script:failed) { exit 1 }
exit 0
