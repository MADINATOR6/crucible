# CCX-5a · Mirror test: per-run scratch folder

## Mode and Owner
CCX-5a · routine · risk low · Dispatch in worktree `.ccx-worktrees/codex-CCX-5a` (branch `codex/ccx-5a`), registered in ccx and routed by OMNIROUTE. Part of the end-to-end trial, and it runs in parallel with CCX-5b. Codex implements, Claude reviews and merges.

## Goal
`scripts/test-sync-mirror.ps1` always uses `%TEMP%\ccx-t3` and refuses to start when that folder exists, so two worktrees cannot run the suite at the same time. Give every run its own scratch folder, `%TEMP%\ccx-t3-<8 random hex>`, and keep every existing safety property.

## Relevant Files
- `scripts/test-sync-mirror.ps1`: lines 1-18 (header and scratch), 121-133 (setup) and 319-334 (cleanup).

## Write Allowlist
- `scripts/test-sync-mirror.ps1` only.

## Constraints
- Keep every existing safety check:
  - the no-links checks;
  - the fake OneDrive stays inside the scratch folder, which stays outside the real OneDrive;
  - cleanup deletes only the folder this run created, after checking that its path equals the one it generated;
  - the refusal when the generated folder already exists.
- Update the header comment to match.
- No other behaviour changes. All existing cases keep their names and results.

## Out of Scope
- `scripts/sync-mirror.ps1`, the other test scripts, docs, and `nursing-a2/`.

## Done When
1. (Codex) The suite passes: 21/21 with 1 SKIP where junctions are refused.
2. (Codex) Two copies started at the same time both pass, and no `ccx-t3-*` folder remains afterwards.
3. (Claude) `ccx verify -TaskId CCX-5a` passes; a cross-model review; merge.

## Verify
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-sync-mirror.ps1
$a = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','scripts\test-sync-mirror.ps1' -PassThru -NoNewWindow -RedirectStandardOutput "$env:TEMP\ccx5a-1.txt"; $b = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','scripts\test-sync-mirror.ps1' -PassThru -NoNewWindow -RedirectStandardOutput "$env:TEMP\ccx5a-2.txt"; $a.WaitForExit(); $b.WaitForExit(); $a.ExitCode; $b.ExitCode
```

## Stop Conditions
- A check still fails after one focused repair: stop and report.
- Report by 30 minutes after start.
