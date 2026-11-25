---
crucible: brief
owner: gemini
owns: handoffs/UPGRADE-gemini-review-r2.md
---
# UPGRADE-REVIEW-R2: second review round, check the fixes only

Do this now: check whether Claude's fixes close the findings in `handoffs/UPGRADE-gemini-review.md`, and write `handoffs/UPGRADE-gemini-review-r2.md`. Follow HANDOFF.md, Verifier instruction; that file is your only write location; no shell. This is the last review cycle (cap of two): report only findings the fixes leave open or newly introduce, each with a concrete input, path:line and severity.

- UPGRADE-1 fix diff: `handoffs/UPGRADE-1-fix.diff`; current code `.ccx-worktrees/codex-UPGRADE-1T/scripts/ccx-core.ps1` (`Test-CcxScope`) and `.ccx-worktrees/codex-UPGRADE-1T/scripts/codex-dispatch.ps1` (transient block, refund). Your findings 1.1 A/B and 1.2 A/B. Note the `ponytail:` comment: the last-line heuristic is a deliberate, documented limit; judge whether it closes 1.2 B as described.
- UPGRADE-2A fix diff: `handoffs/UPGRADE-2A-fix.diff`; current code `scripts/crucible.ps1` (`Test-BriefType`, `Assert-BriefType`, `Test-Brief`, `Invoke-New`, `types`, `Invoke-Run` PATH order) and `scripts/test-crucible.ps1`. Your findings 2A.1 A/B, 2A.2 A/B/C. Also check the new PATH-order change in `Invoke-Run`: can it make a WMI-started run (Obsidian) lose `agy` or pick a different CLI than before?

Claude's runs after the fixes: test-ccx 38/38, test-ccx-ops 20/20, test-codex-dispatch 70/70 (UPGRADE-1 worktree, before the fix commit's PATH-unrelated changes were re-run: see Untested), test-crucible 23/23.

Verdict per change (VERIFIED / VERIFIED WITH CAVEATS / REFUTED), `Untested:`, `Next owner: claude`.
