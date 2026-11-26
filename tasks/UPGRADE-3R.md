# UPGRADE-3R: fix Codex's findings on UPGRADE-3 (verify of 2026-11-26, 25c8ba0..fbdd30a)

Codex review (gpt-6.2-astra, `-Role verify`): changes requested. Owner: Claude. Write allowlist: `scripts/codex-dispatch.ps1`, `scripts/crucible.ps1`, `scripts/ccx-ops.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/test-ccx-ops.ps1`. (Crucible regression tests follow in UPGRADE-3R-T once GEMINI-PRIMARY-2 releases `scripts/test-crucible.ps1`; the stale `checks.about` in `ccx/policy.json` likewise.)

1. (Medium) A usage-limit refund also happened when the final verdict was exit 9 (protected change): refund only when the final exit is 4; the quota reset is still recorded. `codex-dispatch.ps1` bookkeeping.
2. (Medium) Message de-duplication let an earlier 503 stand in for the terminal error (error A, 503, turn.failed A): track the terminal `turn.failed` message separately and classify that.
3. (Medium) `Test-Brief`'s Unicode line-break check used literal characters that Windows PowerShell 5.1 reads as code page 1252 (accepting U+2028, rejecting `Reference/cost€.md`): use ASCII `\u` regex escapes.
4. (Low) `ccx health` reports PASS when the agy version probe fails: WARN then.
5. (Low) A brief titled "Terminal" gets id TERMINAL, which collides with `Status/Terminal.md`: reserve it in `Invoke-New`.

Done When: [Claude] dispatch and ccx-ops suites exit 0 with a regression case for 1, 2, 4; [Codex] second review cycle.
