# CCX-5b · Dispatch test: per-run scratch folder

## Mode and Owner
CCX-5b · routine · risk low · Dispatch in worktree `.ccx-worktrees/codex-CCX-5b` (branch `codex/ccx-5b`), registered in ccx and routed by OMNIROUTE. Part of the end-to-end trial, and it runs in parallel with CCX-5a. Codex implements, Claude reviews and merges.

## Goal
`scripts/test-codex-dispatch.ps1` always uses `%TEMP%\ccx-t2` and refuses to start when that folder exists, so two worktrees cannot run the suite at the same time. Give every run its own scratch folder, `%TEMP%\ccx-t2-<8 random hex>`, and keep every existing safety property.

## Relevant Files
- `scripts/test-codex-dispatch.ps1`: the scratch variable, `Remove-Scratch`, the setup refusal, and every other reference to `ccx-t2`.

## Write Allowlist
- `scripts/test-codex-dispatch.ps1` only.

## Constraints
- Keep every existing safety check:
  - `Remove-Scratch` deletes only the folder this run generated, after checking that the path is exactly that folder;
  - the refusal when the generated folder already exists;
  - the fake-codex PATH guards.
- Update any comment or message that names `ccx-t2`.
- No other behaviour changes. All existing cases keep their names and results.

## Out of Scope
- `scripts/codex-dispatch.ps1`, the ccx scripts, the other tests, docs, and `nursing-a2/`.

## Done When
1. (Codex) The suite passes, with every case passing.
2. (Codex) Two copies started at the same time both pass, and no `ccx-t2-*` folder remains afterwards.
3. (Claude) `ccx verify -TaskId CCX-5b` passes; a cross-model review; merge.

## Verify
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-codex-dispatch.ps1
$a = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','scripts\test-codex-dispatch.ps1' -PassThru -NoNewWindow -RedirectStandardOutput "$env:TEMP\ccx5b-1.txt"; $b = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','scripts\test-codex-dispatch.ps1' -PassThru -NoNewWindow -RedirectStandardOutput "$env:TEMP\ccx5b-2.txt"; $a.WaitForExit(); $b.WaitForExit(); $a.ExitCode; $b.ExitCode
```

## Stop Conditions
- A check still fails after one focused repair: stop and report.
- Report by 30 minutes after start.
