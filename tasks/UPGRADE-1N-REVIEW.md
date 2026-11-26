---
crucible: brief
owner: gemini
owns: handoffs/UPGRADE-1N-gemini-review.md
---
# UPGRADE-1N-REVIEW: check the two low-note fixes

Do this now: review `handoffs/UPGRADE-1N.diff` against `tasks/UPGRADE-1N.md` and your own notes in `handoffs/UPGRADE-1M-gemini-review.md`; write `handoffs/UPGRADE-1N-gemini-review.md`. Follow HANDOFF.md, Verifier instruction; that file is your only write location. Can the new crucible cleanup guard ever delete outside its scratch folder, or skip deleting its own? Does the new timeout case fail on code that refunds a timed-out run? Claude's runs: test-codex-dispatch 72/72, test-crucible 23/23. Verdict, findings with path:line, `Untested:`, `Next owner: claude`.
