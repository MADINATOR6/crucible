$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'invoke-external-tool.ps1')
if (-not $args.Count) { throw 'Usage: load-claude-skill.ps1 <skill.md> [Claude arguments]' }
$skill = Get-Item -LiteralPath $args[0]
if ($skill.PSIsContainer -or $skill.Extension -ine '.md') { throw 'SkillPath must be a Markdown file.' }
# Append preserves Claude's built-in instructions; --system-file is not a supported flag.
$Executable = if ($env:CRUCIBLE_CLAUDE_EXE) { $env:CRUCIBLE_CLAUDE_EXE } else { 'claude.exe' }
$toolArguments = @('--append-system-prompt-file', $skill.FullName) + @($args | Select-Object -Skip 1)
exit (Invoke-ExternalTool $Executable $toolArguments)
