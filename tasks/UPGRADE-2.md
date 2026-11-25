# UPGRADE-2: board declutter and review pack (B + C)

Do this now: implement B and C below in `scripts/crucible.ps1` with tests in `scripts/test-crucible.ps1`, run the suite, report. Follow HANDOFF.md, Implementer instruction.

Plan: Codex's UPGRADE-2 plan (2026-11-26), critiqued by Claude; source `handoffs/UPGRADE-ux-review.md` items 1-2, `tasks/UPGRADE-2-plan.md`. Item A (new brief modal) is a separate Claude task after this one closes.

## Write allowlist
`scripts/crucible.ps1`, `scripts/test-crucible.ps1`. Nothing else (`Status/` is generated output; never commit it).

## B. Board declutter (`Invoke-Board`, ~scripts/crucible.ps1:396)
- `Status/Board.md`: brief rows (Needs you, Running, Ready to review, Blocked, In progress, Done this week) and pending approvals, then one footer line `[[Status/Terminal|Terminal tasks and notices]]`.
- New generated `Status/Terminal.md`: open non-brief ccx tasks (whatever bucket they classify into, with their existing status text) and unacknowledged action notices. Drop notices whose task is `done` or `abandoned` **before** taking the latest five; keep notices with no matching task.
- `Terminal` is reserved: a task named `TERMINAL` (case-insensitive) must not overwrite the generated note.

## C. Review pack: `crucible.ps1 review-pack -TaskId <id> -Base <ref>`
- Validates the task id (exists in ccx state, safe for a file name) and `-Base` (resolves to a commit: `git rev-parse --verify --end-of-options <ref>^{commit}`) before writing anything; on any failure, exit nonzero and leave `handoffs/<id>-review.md` untouched. Run from the task's checkout (its worktree if it has one, else the repo root); a wrong checkout fails.
- Writes `handoffs/<id>-review.md`: task id, title, task file path; exact range `<base sha>..<head sha>`; changed paths (`git diff --name-only`); the HANDOFF.md "Plan critique (Claude)" section text extracted from HANDOFF.md; the `Untested:` lines from the newest readable report (reuse `Get-Report`; none → say so); the contents of `Reference/Review checklist.md` when present, or a line saying it is missing.
- Never calls `agy`, Codex, Claude or any model.
- Decision: `-Base` is required (ccx records no task start commit; adding one is out of scope).

## Done When
- [Codex] Cases `board separates briefs from terminal work` and `review pack uses explicit commit range and recorded evidence` (checklist present and absent; missing/invalid base leaves destination untouched) in `scripts/test-crucible.ps1`; `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-crucible.ps1` exits 0 with all pre-existing cases passing.
- [Claude] review, `ccx verify -TaskId UPGRADE-2`, Codex-independent review recorded, `task done`.

## Stop conditions
Anything needing a ccx state schema change, `ccx/policy.json`, or files outside the allowlist: stop that part and report. If `%TEMP%` is denied in the sandbox, report BLOCKED for the suite with the exact error.
