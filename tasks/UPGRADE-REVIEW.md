---
crucible: brief
owner: gemini
owns: handoffs/UPGRADE-gemini-review.md
---
# UPGRADE-REVIEW: independent adversarial review of UPGRADE-1 and UPGRADE-2A

Do this now: review the two changes below and write `handoffs/UPGRADE-gemini-review.md`. You stand in for Codex's verifier (Codex is at its usage limit): follow HANDOFF.md, Verifier instruction, except that your only write location is that file and you have no shell (report runs as NOT RUN; Claude has run the suites). Treat every claim as unproven until the code shows it.

For each change, read the review pack, the spec, the diff, and the full current text of each changed function in the files named:

1. **UPGRADE-1** (control plane). Pack `handoffs/UPGRADE-1-review.md`, spec `tasks/UPGRADE-1.md`, diff `handoffs/UPGRADE-1.diff`; code in `.ccx-worktrees/codex-UPGRADE-1T/scripts/` (`ccx-core.ps1`, `ccx-ops.ps1`, `codex-dispatch.ps1`) and `.ccx-worktrees/codex-UPGRADE-1T/ccx/policy.json`. Try hardest to break:
   - **Wrong baseline:** can a file dirtied after `task add` end up exempt (laundering), e.g. via restart, a move to a worktree and back, or a legacy task? Can `task add` in one checkout leak its baseline into another?
   - **Real failure misread as transient:** can an ordinary task failure, a test that prints "503" or "overloaded", a report quoting such text, or a provider error that is really the task's fault get exit 4 and a refunded attempt? Look at which text the transient pattern reads (Codex's own error events and the stderr log) and the conditions (`$code -ne 0`, no completed turn).
   - **Fallback loop:** can the Codex-limit fallback to the `gemini` provider route back to Codex or loop between providers? Does a blocked Gemini defer? Does a Gemini-owned task still route as before?
   - **Health:** does `ccx health` ever run `agy` with anything but `--version`?
   - **Symmetry stage:** false pass or false fail (renames, case, files in subfolders named AGENTS.md)?
   - **Tests:** were any pre-existing assertions weakened in the test diff?
2. **UPGRADE-2A** (Obsidian new brief modal). Pack `handoffs/UPGRADE-2A-review.md`, spec `tasks/UPGRADE-2A.md`, diff `handoffs/UPGRADE-2A.diff`. Can the modal create an unlaunchable or unsafe brief? Can `-Owns` input inject YAML or frontmatter lines (newline, `#`, `]`)?

Report per HANDOFF.md, Report format, with one Checks line per attack: PASS (attack failed, cite the line that stops it), FAIL (give a concrete input, the expected and the observed-by-reading result, path:line, severity), or UNKNOWN. End with a verdict per change (VERIFIED / VERIFIED WITH CAVEATS / REFUTED), `Untested:` and `Next owner: claude - fixes FAILs`.
