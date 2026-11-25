# UPGRADE-1M: suites fall back from a denied TEMP; regression tests for the UPGRADE-1 review fixes

Owner: Claude. Planned for Codex (UPGRADE-1 plan, item 4); Codex hit its weekly limit (resets 2026-11-26 21:10) and Gemini cannot write `scripts/` (agentProtectedPaths), so Claude implements and Gemini reviews.

Write allowlist: `scripts/test-ccx.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/test-crucible.ps1`, `.gitignore`.

1. **TEMP fallback** (FRICTION 2026-11-12): each suite probes `%TEMP%` by creating its run folder; if that is denied, it uses `.test-scratch/<run>` in the checkout (gitignored). Cleanup guards check the chosen parent, not a hard-coded TEMP, and still refuse anything outside it or with a foreign name.
2. **Regression tests** for Gemini's UPGRADE-1 findings (`handoffs/UPGRADE-gemini-review.md` 1.1, 1.2), added as new cases; no existing assertion changes:
   - test-ccx: a baseline taken in one checkout does not exempt a file in another (cross-checkout laundering).
   - test-codex-dispatch: an early 503 followed by an ordinary terminal error spends the attempt (exit 1, not 4).

Done When:
- [Claude] the three suites exit 0 normally, and each also exits 0 when TEMP points at an unwritable location (run with `TEMP` set to a path under a file), leaving no `.test-scratch/<run>` folder behind.
- [Gemini] review of the diff.
