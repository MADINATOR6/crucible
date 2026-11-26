# UPGRADE-3R-T: crucible regression tests for UPGRADE-3R, and the stale checks.about

Owner: Claude, in the UPGRADE-3R worktree (needs its `crucible.ps1`). Write allowlist: `scripts/test-crucible.ps1`, `ccx/policy.json`.

- Test: a brief whose `owns` holds U+2028 is refused, and `Reference/cost€.md` is accepted (Windows PowerShell 5.1 reading; characters built with `[char]`, never literal).
- Test: `crucible.ps1 new -Title Terminal` does not get the id TERMINAL.
- `ccx/policy.json` `checks.about`: drop the claim that Antigravity has no shell; say what UPGRADE-3 made true (Codex review, out-of-scope note).

Done When: [Claude] `scripts/test-crucible.ps1` exits 0; [Codex] reviewed with UPGRADE-3R.
