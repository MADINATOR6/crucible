# UPGRADE-1N: close the low notes from the UPGRADE-1M review

Owner: Claude (Codex at its weekly limit until about 2026-11-26 21:10). Source: `handoffs/UPGRADE-1M-gemini-review.md`, findings 1 and 3.

Write allowlist: `scripts/test-codex-dispatch.ps1`, `scripts/test-crucible.ps1`.

1. Test: a run that logs a 503 and then times out keeps exit 5 and spends its attempt (no `TRANSIENT PROVIDER FAILURE`). SKIPs where taskkill is denied, like the suite's other timeout cases. The protected-file guard sits in the same condition (`codex-dispatch.ps1`, transient block) but needs an agy/Gemini/Claude run to take hashes; not covered by a new test (noted).
2. `test-crucible.ps1` cleanup removes `$scratch` only when its parent is the chosen scratch parent and its name is `crucible-t-<8 hex>`, like the other two suites.

Done When: [Claude] both suites exit 0; [Gemini] review of the diff.
