# UPGRADE-CODEX-VERIFY: Codex's independent check of the whole workflow upgrade

Do this now: follow HANDOFF.md, Verifier instruction, on the commits `25c8ba0..main` (the 2026-11-26 tri-agent upgrade). Codex was at its weekly limit when the work finished, so Gemini did the adversarial reviews; you are the second model on the final code.

Read first: `handoffs/UPGRADE-blind-review.md` (range, changed paths, checklist), then the specs `tasks/UPGRADE-1.md`, `tasks/UPGRADE-1M.md`, `tasks/UPGRADE-1N.md`, `tasks/UPGRADE-2A.md`, `tasks/UPGRADE-2-plan.md`. Earlier reviews (do not repeat, find what they missed): `handoffs/UPGRADE-gemini-review.md`, `handoffs/UPGRADE-gemini-review-r2.md`, `handoffs/UPGRADE-1M-gemini-review.md`.

Run (this dispatch is `workspace-write` only so the suites can create scratch folders; the launcher fails the run if the tree changes): `scripts\test-ccx.ps1`, `scripts\test-ccx-ops.ps1`, `scripts\test-codex-dispatch.ps1`, `scripts\test-crucible.ps1`, each as `powershell -NoProfile -ExecutionPolicy Bypass -File <suite>`; report exact counts and every SKIP.

Then attack: a stray file exempted by a baseline (`task add` in one checkout, verify in another; restart; legacy task), a real failure read as transient (`codex-dispatch.ps1` transient block), a Codex/Gemini fallback loop, `ccx health` running agy with more than `--version`, the `symmetry` stage, `crucible.ps1 new -Owns/-Type` validation, and the `Invoke-Run` PATH order (could a WMI run from Obsidian now pick a different CLI than before?).

Report per HANDOFF.md Report format: one Checks line per attack with a reproduction for every FAIL, `Untested:`, Status READY_FOR_CLAUDE_REVIEW.
