# CODEX-MODELS-62: review the switch of Codex routing to gpt-6.2-sol and gpt-6.2-astra

Do this now: independently review the uncommitted change below and report problems. Read-only.

Change under review (working-tree diff vs HEAD, these files only): `ccx/policy.json`, `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`, `scripts/test-codex-dispatch.ps1`. Other dirty files in the tree (agency/, tasks/AGENCY-*, FRICTION.md, .claude/skills/higgsfield/playbook.md) belong to other work: ignore them.

Intent: the user said "there is gpt 6.2 sol and gpt 6.2 astra now, use it and save it to playbook/repo for future uses". `%USERPROFILE%\.codex\models_cache.json` (fetched 2026-11-24) lists gpt-6.2-sol and gpt-6.2-astra. Routing now: routine and normal classes `codexModel` gpt-6.2-sol; `codex.default` (complex and higher) gpt-6.2-astra; fallbacks gpt-6.2-sol, gpt-6-astra, gpt-6.1-sol, gpt-6-sol; mythos fallback gpt-6.2-astra. The test fixture catalog and assertions moved from gpt-6-astra to gpt-6.2-astra.

Check:
1. Every place in the repo that names a Codex model for routing or instructions (grep `gpt-6`, `astra`, `sol`, `codexModel`, `fallbacks`) is consistent with the intent; list any missed reference with file:line. Historical notes, telemetry and dated logs are fine to leave.
2. The fallback logic in `scripts/ccx*.ps1` that reads `codex.default`, `fallbacks` and `catalogFile`: with the new values, what model does each class route to when the catalog has (a) both 6.2 models, (b) neither 6.2 model? Cite the code path.
3. The `ccx health` codex-updates check: does it still behave sensibly with the new default? Cite file:line.
4. Whether the test edit still tests what it tested before (route of a normal-class task when its codexModel is missing from the catalog). Do not run the PowerShell suites (Claude is running them).
5. AGENTS.md / CLAUDE.md symmetry rule: both changed in the same change set; is the CLAUDE.md line accurate against AGENTS.md and policy?

Reply with the Researcher reply format: Status, one answer per check with sources, UNKNOWN / CHECKED / NEEDED, Untested.
