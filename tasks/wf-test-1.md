# Task

## Mode and Owner
`wf-test-1`: normal, low risk, Dispatch. Codex implements; Claude reviews the diff, runs the Claude-owned checks, commits. This task is also a trial of the Claude+Codex workflow itself.

## Goal
Add `scripts/check-external-tools.ps1`: a read-only health check for the external tools recorded in `EXTERNAL-TOOLS.md`. One PASS or FAIL line per check; exit 0 only if every check passes, otherwise exit 1.

## Relevant Files
Read-only context: `EXTERNAL-TOOLS.md` (pins, locations), `.claude/skills/*/SKILL.md`. Existing script style: `scripts/sync-mirror.ps1`.

## Write Allowlist
Create only `scripts/check-external-tools.ps1`. No other repo path, no temp files in the repo (scratch only under `$env:TEMP\wf-test-1`).

## Constraints
- Windows PowerShell 5.1 compatible. ASCII only, no BOM requirement, no `Get-Content`/`Set-Content` round-trips of other files. No `&&`/`||`, no `?:`.
- Strictly read-only: no writes outside `$env:TEMP`, no network, no provider or model call, no login, never open `auth.json`, `agent.db`, `models.db`, `*.secret`, `credential*`, `broker.json`, or anything else that can hold credentials. Do not print account ids or emails.
- Parameters: `-ToolsDir` default `Join-Path $env:USERPROFILE '.local\share\claude-codex-tools'`; `-GjcExe` default `Join-Path $env:LOCALAPPDATA 'gjc\gjc.exe'`; `-RepoRoot` default the parent of the script's folder. Do not hard-code `C:\Users\Madison`.
- Checks (name each in the output):
  1. `gjc-sha256`: `-GjcExe` exists and its SHA256 is `d574517f49c8dbbbbe79ad5f082dadae5bee52bb17bb138b1af5720852794402`.
  2. `gjc-version`: running `-GjcExe --version` exits 0 and prints `gjc/0.15.3`.
  3. `claw-version`: `<ToolsDir>\claw.cmd --version` exits 0 and the output contains `0.1.3` and `08106b0c3771`.
  4. `lazycodex-version`: `<ToolsDir>\lazycodex-codex.cmd --version` exits 0 and the output contains `codex-cli`.
  5. `primary-codex-unchanged`: SHA256 of each file named in `<ToolsDir>\primary-config-before.json` (property name = path relative to `$env:USERPROFILE\.codex`, value = expected hash; the JSON is a flat object) equals its value. Hash only; never read content.
  6. `skills`: for each of `offensive-reporting` and `offensive-bug-identification`, `<RepoRoot>\.claude\skills\<name>\SKILL.md` exists, starts with a `---` frontmatter block, and its `name:` value equals the folder name.
- A missing file, a nonzero exit or a thrown error in one check is a FAIL line for that check, never an unhandled exception; the remaining checks still run. Run child commands with a 60 second timeout and closed stdin; no console prompts.
- Final line: `RESULT: PASS` or `RESULT: FAIL (n of 6)`.

## Out of Scope
Any edit to `EXTERNAL-TOOLS.md`, `AGENTS.md`, other scripts, `ccx/`, `.codex/`; adding tests, a README entry or CI; changing any pin; calling `ccx`.

## Done When
- [ ] (Codex) `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-external-tools.ps1 -ToolsDir "$env:TEMP\wf-test-1\missing" -GjcExe "$env:TEMP\wf-test-1\missing\gjc.exe"` prints six FAIL lines and `RESULT: FAIL (6 of 6)` (the skills check may PASS because it uses the repo), exits 1, no stack trace. Report the actual output; if the sandbox blocks running it, name the denied command.
- [ ] (Codex) Parse check: `[System.Management.Automation.Language.Parser]::ParseFile(...)` reports no errors.
- [ ] (Codex) `git diff --check` clean and `git status --short` shows only the one new file.
- [ ] (Claude) Positive run with defaults prints PASS for all six checks and exits 0; negative run reproduced; code reviewed for read-only behaviour and credential-file avoidance; `ccx verify -TaskId wf-test-1` passes; cross-model review recorded.
- [ ] (Claude) Committed by Claude only.

## Verify
The commands above, plus `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 verify -TaskId wf-test-1`.

## Stop Conditions
Stop and report UNKNOWN / CHECKED / NEEDED if: a check would need to read a credential file; the sandbox blocks executing a tool or hashing the primary Codex files (report the exact denied command and continue the other checks); scope would need another file.
