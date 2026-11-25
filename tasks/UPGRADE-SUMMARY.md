---
crucible: brief
owner: gemini
owns: handoffs/UPGRADE-summary.md
---
# UPGRADE-SUMMARY: FRICTION resolved notes and a 10-line changelog

Do this now: write `handoffs/UPGRADE-summary.md` with your file tools. Follow HANDOFF.md, Implementer instruction; that file is your only write location; no shell.

Sources: `git log` is not available to you, so use these files: `tasks/UPGRADE-1.md`, `tasks/UPGRADE-1M.md`, `tasks/UPGRADE-2.md` (on main after merge; if missing, `tasks/UPGRADE-2-plan.md`), `tasks/UPGRADE-2A.md`, `handoffs/UPGRADE-friction-audit.md`, `handoffs/UPGRADE-gemini-review.md`, `handoffs/UPGRADE-gemini-review-r2.md`, `FRICTION.md`, and the diffs `handoffs/UPGRADE-1.diff`, `handoffs/UPGRADE-1-fix.diff`, `handoffs/UPGRADE-2A.diff`, `handoffs/UPGRADE-2A-fix.diff`.

Write two sections:

1. **FRICTION.md resolved notes.** For each FRICTION.md row this work closes (rows dated 2026-11-05 x2, 2026-11-06, 2026-11-10, 2026-11-12, 2026-11-14; and the `provider-gemini not set` health finding), give the row's date and first words, and the exact replacement text for its "Fix proposal / status" cell, in the table's existing style ("Fixed (UPGRADE-1): ..."), one or two sentences, saying what now happens and what remains. Then draft two new rows (same columns: Last seen, Symptom, Cost, Fix proposal / status, Count) for: (a) `scripts/test-crucible.ps1` ran the real Codex CLI in its owner-switch case because `crucible.ps1 Invoke-Run` put the registry PATH before the process PATH (found 2026-11-26 when Codex was at its limit; fixed in UPGRADE-2A); (b) `ccx verify` scope failing on Claude's own edits made in the base checkout while a helper's dispatch ran (worked around by committing first and writing in worktrees; baseline-at-add narrows but does not remove it).
2. **Changelog, 10 lines max.** Plain words, one line per user-visible change: what changed and why it matters to the user. No file paths except command names.

End with `Status`, `Untested:`, `Next owner: claude - applies the FRICTION edits`.
