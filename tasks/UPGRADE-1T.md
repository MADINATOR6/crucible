# UPGRADE-1T: failing tests first for UPGRADE-1 items 1, 2, 3, 5

Do this now: write the failing test cases below, then stop. Follow HANDOFF.md, Implementer instruction, and HANDOFF.md Tests-first mode step 1. The spec is `tasks/UPGRADE-1.md` (Requirements and decisions); write tests from it, not from any implementation. Do not edit source files.

Write allowlist (only these): `scripts/test-ccx.ps1`, `scripts/test-ccx-ops.ps1`, `scripts/test-codex-dispatch.ps1`.

Cases (follow each suite's existing `Case` helpers and fake CLIs; synthetic data only):
1. `scripts/test-ccx.ps1` — `Registration fixes the scope baseline before first dispatch`: an unrelated file dirtied **before** `task add` passes direct scope verify, before and after `task start`; a file dirtied **after** add fails, naming only that path, also after a restart. Keep the legacy missing-baseline diagnostic covered with a legacy fixture (no baselines map). Adjust existing dispatch fixtures only where they dirty files between add and start in a way the new rule changes, and say which.
2. `scripts/test-codex-dispatch.ps1` — `Terminal capacity and provider 503 preserve output and attempt balance`: fake provider writes an owned partial output, then a terminal capacity error event or a provider HTTP 503 on stderr → exit 4, `dispatches` unchanged, output kept, `agents.codex.unavailableUntil` not set. Paired controls: an ordinary terminal error uses one attempt; a 503 followed by a completed turn and report is not exit 4.
3. `scripts/test-codex-dispatch.ps1` — `Codex limit dispatches the class model through agy`: with Codex recorded at its limit, a complex-class Codex-owned task routes to the gemini provider and the fake `agy` receives `classes.complex.geminiModel`, not `providers.gemini.model`; owner stays codex. With gemini blocked and no other fallback, route defers and agy is not invoked.
4. `scripts/test-ccx-ops.ps1` — `Account-auth agy health reports version and unknown sign-in`: fake account-auth CLI records its arguments; health is PASS with the version text and `sign-in unknown`, not `not set`; the CLI was called only with `--version` (no `-p`, no permission-bypass flag).
5. `scripts/test-ccx-ops.ps1` — `Instruction symmetry stage`: uncommitted change to AGENTS.md alone fails, CLAUDE.md alone fails, both pass, neither passes. Assert the registered stage's own result (by name), so an unknown-stage error cannot pass as the expected failure.

Run each suite you changed and report, per new case, FAIL at the intended assertion (quote the message) and that every pre-existing case still passes. If TEMP is denied in your sandbox, report BLOCKED with the exact error. Report with HANDOFF.md, Report format, including `Untested:`.
