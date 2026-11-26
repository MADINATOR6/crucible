---
crucible: brief
owner: gemini
owns: handoffs/UPGRADE-3-gemini-review.md
---
# UPGRADE-3-REVIEW: adversarial review of Gemini's new access (high risk)

Do this now: review `handoffs/UPGRADE-3.diff` against `tasks/UPGRADE-3.md` and write `handoffs/UPGRADE-3-gemini-review.md`. Follow HANDOFF.md, Verifier instruction; that file is your only write location. Your shell now works (read-only sandbox): use `git diff`, `git show` and search freely. Read the full current `scripts/codex-dispatch.ps1` (the agy and Claude branches, the protected-hash comparison) and `scripts/crucible.ps1` (`Invoke-Run` tamper check, `Test-Brief`).

Try hardest to break:
- Can a normal (non-turbo) Gemini run write outside its owned paths, or change a protected file without exit 9? Consider owned-path overlap (a task owning `scripts/x.ps1` lifts the deny on all of `scripts/`: is every other `scripts/` change still flagged?), case and slash variants, a symlink or junction, a file created and deleted within the run.
- Can turbo run without a fresh `codex-full-access` approval for that task (reuse, another task's approval, a brief launched from Obsidian)?
- Can an Obsidian brief now own the launcher stack, or reach turbo?
- Do Codex and headless Claude runs behave exactly as before (except Claude's owned-path parity)?
- Was any test weakened beyond the documented `INTENT` change (shell deny and relative paths replaced)?

Claude's runs: test-codex-dispatch 75/75, test-crucible 23/23; live run `handoffs/UPGRADE-3-live.md`.

One Checks line per attack (PASS with the line that stops it, FAIL with a concrete input and path:line, UNKNOWN), verdict, `Untested:`, `Next owner: claude`.
