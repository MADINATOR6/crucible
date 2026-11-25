---
crucible: brief
owner: gemini
owns: handoffs/UPGRADE-1M-gemini-review.md
---
# UPGRADE-1M-REVIEW: review the TEMP fallback and the two regression tests

Do this now: review `handoffs/UPGRADE-1M.diff` against `tasks/UPGRADE-1M.md` and write `handoffs/UPGRADE-1M-gemini-review.md`. Follow HANDOFF.md, Verifier instruction; that file is your only write location; no shell. Read the current `scripts/test-ccx.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/test-crucible.ps1` around each change.

Attack: can a cleanup guard now delete something outside its scratch folder (the parent is no longer always TEMP)? Is the new SKIP in "outside repository" reachable in a normal run (TEMP writable)? Do the two new cases fail on the pre-fix code (`handoffs/UPGRADE-1-fix.diff` shows what they guard)? Was any existing assertion weakened?

Claude's runs: normal test-ccx 39/39, test-codex-dispatch 71/71, test-crucible 23/23; with TEMP denied test-ccx 39/39 and test-crucible 23/23; dispatch with the fallback forced 70/71 plus 1 SKIP (outside repository).

Verdict (VERIFIED / VERIFIED WITH CAVEATS / REFUTED), findings with path:line, `Untested:`, `Next owner: claude`.
