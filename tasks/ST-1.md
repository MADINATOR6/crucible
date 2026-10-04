# ST-1 · Shift tracker: add, list and fortnight summary

## Mode and Owner
ST-1 · normal · risk low · Dispatch. Codex implements (ccx should route a normal implement task to gpt-6.1-sol at medium effort; confirm with `ccx route -TaskId ST-1`). Claude reviews the diff, re-runs the checks and commits. Cross-model review is required for a normal task: Claude reviews, because Codex is the author.

Run this in a separate project repo made from this template (see `BOOTSTRAP.md`), not in `claude-codex-collab` itself. Fill `AGENTS.md` Project, Stack and Commands for that repo first, from what actually runs.

## Goal
A small PowerShell command-line tool that logs work shifts and totals hours per fortnight, so the user can see how close they are to a self-set hours limit.

This task is also the first real trial of the ccx path (spec, register, route, dispatch, post-checks, verify, review, done, commit). Note where the process costs time or gets in the way and put it in `FRICTION.md`.

## Resolved Rules
These are decided, so Codex must not ask or guess.
1. **Stack.** Windows PowerShell 5.1, one script, no modules, no network, no dependencies. Reason: it is the runtime every script in this workflow already uses. ASSUMPTION: the user's PC has PowerShell 5.1, which the existing scripts imply but this spec has not checked.
2. **Storage.** One CSV file, UTF-8 without a BOM, header `date,start,end,break_minutes,note`. Default path `data\shifts.csv`; every command accepts `-DataFile <path>` to use another file (the tests use this). Write with .NET (`[System.IO.File]::WriteAllText` and `UTF8Encoding($false)`), not `Export-Csv -Encoding UTF8`, which adds a BOM in PowerShell 5.1.
3. **Formats.** Date `yyyy-MM-dd`. Time `HH:mm`, 24 hour. Anything else is rejected with a message that shows the expected format.
4. **Shift length.** `end` earlier than or equal to `start` means the shift ends the next day (overnight). Paid minutes = (end − start, wrapped past midnight) − `break_minutes`. Integer minutes throughout; hours shown as minutes ÷ 60 rounded to 2 decimal places.
5. **Fortnight.** A block of 14 consecutive days. The user supplies an anchor date (`-Anchor yyyy-MM-dd`) that is the first day of one block. Blocks repeat every 14 days before and after it. A shift belongs to the block containing its start date, even if it ends after midnight. There is no default anchor; if `summary` is run without one it stops with an error.
6. **Limit.** `-Limit <hours>` is optional and user-supplied. It is not hard-coded. The tool must never state or imply what the legal limit is. A block is marked `NEAR` at 90% or more of the limit and `OVER` above 100%.
7. **Validation.** Reject: break not a whole number of minutes, break ≥ shift length, a shift that overlaps an existing one, and an exact duplicate (same date and start). A rejected `add` must leave the file byte-for-byte unchanged.
8. **Privacy.** `data\shifts.csv` is real personal data. It must be gitignored and must never be committed or copied into the mirror. Tests and samples use synthetic data only.

## Relevant Files
Read-only context: `AGENTS.md`, `HANDOFF.md`, and one existing test script such as `scripts/test-sync-mirror.ps1` for the scratch-folder pattern.

## Write Allowlist
- `scripts/shifts.ps1` (create)
- `scripts/test-shifts.ps1` (create)
- `sample/shifts.sample.csv` (create, synthetic rows only)
- `.gitignore` (append `data/` only)

## Commands to build
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\shifts.ps1 add -Date 2026-10-05 -Start 07:00 -End 15:30 -BreakMinutes 30 [-Note "text"] [-DataFile path]
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\shifts.ps1 list [-From yyyy-MM-dd] [-To yyyy-MM-dd] [-DataFile path]
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\shifts.ps1 summary -Anchor 2026-09-28 [-Limit 48] [-DataFile path]
```
Exit code 0 on success, 1 on any validation or argument error. Errors go to stderr as one line.

## Worked examples (use as test cases)
- `07:00` to `15:30`, 30 min break: 510 − 30 = **480 min = 8.00 h**.
- `22:00` to `06:30` overnight, 30 min break: (120 + 390) = 510 − 30 = **480 min = 8.00 h**, counted in the block containing the start date.
- Anchor Mon 28 Sep 2026: block 1 is 28 Sep to 11 Oct; block 2 starts Mon 12 Oct. A shift starting Sun 11 Oct 22:00 and ending Mon 12 Oct 06:00 belongs to **block 1**.
- Two blocks of 8.00 h × 5 shifts = 40.00 h each with `-Limit 48`: 40 ÷ 48 = 83.3%, no flag. At 44.00 h: 91.7%, `NEAR`. At 49.00 h: `OVER`.

## Constraints
- Smallest correct change. No refactors, no extra commands (no edit or delete in this task).
- Do not touch `ccx/`, `scripts/ccx*.ps1`, `scripts/codex-dispatch.ps1`, `scripts/sync-mirror.ps1`, `.codex/`, `.claude/`, `AGENTS.md`, `HANDOFF.md`, `TASK.md` or `MEMORY.md`.
- Edit files with the file-editing tools, not `Get-Content`/`Set-Content` round-trips.
- Tests create their own scratch folder under `%TEMP%` with a random suffix, never touch `data\shifts.csv`, and delete only the folder they created.
- No real shift data, employer names or visa information anywhere in the repo.

## Out of Scope
Editing or deleting shifts, pay rates and earnings, a GUI, any network call, any statement of visa or award rules, importing from payslips or rosters.

## Done When
1. (Codex) `scripts\test-shifts.ps1` exists and passes. It must cover each worked example, an overnight shift, every rejection in rule 7 (checking the file is unchanged after each), `list` filtering, `summary` with and without `-Limit`, the missing-anchor error, and a file with no BOM.
2. (Codex) `git diff --check` exits 0 and `git status --short` shows only allowlisted paths.
3. (Codex) `data/` is in `.gitignore`, and `git check-ignore data/shifts.csv` prints the path.
4. (Claude) Re-runs the test script and confirms the pass count matches Codex's report.
5. (Claude) Reads the diff against the Resolved Rules, with attention to rules 4, 5 and 7, and tries two inputs the tests do not cover (for example `-End 24:00`, and a leap-year date).
6. (Claude) `ccx verify -TaskId ST-1`, `ccx task review -Id ST-1 -Result pass -By claude`, `ccx task done -Id ST-1`, then commit.

## Verify
These commands do not exist yet. They become the acceptance checks once Codex creates the scripts; none has been run.
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-shifts.ps1
git diff --check
git status --short
git check-ignore data/shifts.csv
```
Expected: the test script prints a pass count with no FAIL, and exits 0.

## Register and run (Claude)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 task add -Id ST-1 -Title "Shift tracker" -Type implement -Class normal -Risk low -Owner codex -Owns scripts/shifts.ps1 -TaskFile tasks/ST-1.md
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 route -TaskId ST-1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\codex-dispatch.ps1 -TaskId ST-1
```
UNKNOWN: how `-Owns` takes several paths (comma list or repeated). Check `ccx task add` help and register all four allowlist paths, or the scope post-check will flag the extra files with exit 9.

## Stop Conditions
- A check still fails after one focused repair: stop and report UNKNOWN / CHECKED / NEEDED.
- PowerShell 5.1 is not available, or the CSV cannot be written without a BOM: stop and report.
- Anything in the Resolved Rules turns out to conflict with another rule: stop and ask. Do not choose.
- Codex exits 4 (usage limit): do not retry. Note the reset time and let ccx defer.
