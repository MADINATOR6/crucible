---
crucible: brief
id: DISPATCH-HEADER
owner: codex        # one agent; routine class means no review round
type: implement
class: routine
risk: low
owns: [scripts/codex-dispatch.ps1]
checks: []
---
# Bring the launcher's header comment up to date

## Outcome
The comment block at the top of `scripts/codex-dispatch.ps1` (lines 1-14) describes only Codex. Since 2026-11-25 the same launcher also runs Gemini-owned tasks (Gemini CLI) and claude-owned tasks (headless `claude -p`) when given `-TaskId`, and `-Role implement` accepts task owners codex, gemini or claude. Update that comment so a reader knows this. Comment only.

## Inputs
- `scripts/codex-dispatch.ps1` (the header, and the code paths `$isGemini` / `$isClaude` for what they do)
- `AGENTS.md`, Roles (the Gemini and "Owner wins" lines)

## Done When
- The header names the three agents the launcher can run with `-TaskId`, in at most four added or changed comment lines, and states that exit 7 now means "owner is not codex, gemini or claude" for `-Role implement`.
- No line outside the `<# ... #>` header changes (`git diff scripts/codex-dispatch.ps1` shows only header lines).
- The file still parses: `powershell -NoProfile -Command "[void][Management.Automation.Language.Parser]::ParseFile((Resolve-Path scripts/codex-dispatch.ps1), [ref]$null, [ref]$null)"`.

## Answers

## Status
![[Status/DISPATCH-HEADER]]
