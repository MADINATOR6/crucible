# Task: useful external tools and one-time Claw login

ID `external-tools-ready`; Dispatch; Codex implements, Claude reviews and owns Git. Baseline `ed30a58`. Class complex, risk high because encrypted credential storage is added. Supersedes the uncommitted `external-tools-workflow` task after direct user request: log in to Claw once for future sessions. `tool: none`.

## Write allowlist

`AGENTS.md`, `CLAUDE.md`, `EXTERNAL-TOOLS.md`, `HANDOFF.md`, `tasks/external-tools-workflow.md`, this file, `scripts/check-external-tools.ps1`, `scripts/test-external-tools.ps1`, `scripts/claw.ps1`, `scripts/connect-claw.ps1`, `scripts/claw-credential-store.ps1`, `scripts/test-claw-credentials.ps1`. Synthetic fixtures and review captures may use unique TEMP or user-local tooling directories. Real key entry/storage is performed only by the user at the interactive console. Preserve all pre-existing untracked files. No ccx policy/routing changes, external-source edits, library execution, product changes, global settings or Codex commit/push/sync.

## Done When

- [ ] Identical agent guidance describes tool selection, optional fallback and scoped evidence collection.
- [ ] Optional provider-free inventory supplements the existing strict checker without breaking its default checks or timeouts.
- [ ] One-time hidden user input saves only Windows-user-encrypted ciphertext outside Git; shared Claw launcher loads it only when no explicit credentials exist, restores its environment and never decrypts it for version/help.
- [ ] Synthetic tests cover encrypted round trip, private storage ACL, no plaintext, session precedence, corrupt storage, metadata probes, environment restoration and missing optional tools.
- [ ] Live inventory, offline regression, credential tests and diff checks pass. Actual independent Claude review and Codex verifier pass; ccx alone approves done.

## Verify

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-external-tools.ps1`

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-claw-credentials.ps1`

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-external-tools.ps1 -Json`

`git diff --check`

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ccx.ps1 verify -TaskId external-tools-ready`

## Evidence

Verified 2026-10-09 after Codex hit its usage limit: test-external-tools 22/22, test-claw-credentials 8/8, check-external-tools -Json exit 0 (gjc, claw, omo cli-pass; claude-red files-present), git diff --check clean, ccx verify external-tools-ready all PASS (parse, json, secrets, scope, memory). Claude reviewed claw.ps1, claw-credential-store.ps1, connect-claw.ps1: explicit session credentials win, metadata probes never decrypt, environment restored in finally, DPAPI ciphertext only under a private-ACL directory outside Git. Persistent login still needs one private user-console run of scripts/connect-claw.ps1. User's earlier Claw no-tools provider test passed; no real credential was read, captured or migrated. OmO interactive trust and a repository-writing harness trial remain separate checks.
