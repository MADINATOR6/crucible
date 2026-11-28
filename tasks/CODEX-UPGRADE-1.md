# CODEX-UPGRADE-1: fixes from Codex's study of its own source

Owner: claude (implements). Source: `handoffs/CODEX-SELF-UPGRADE-report.md` (Codex, gpt-6.2-astra, its own source at 18c09f2). Approved under the user's chat instruction "push what needs to be pushed and merge what needs to be merged". Reviewer: Codex.

## Changes
- `scripts/codex-dispatch.ps1`: a quota message counts as a usage limit only when the run did not finish. A run that exited 0 with a completed turn recovered, and no longer marks Codex unavailable.
- `scripts/ccx-ops.ps1`: `ccx health` gains `codex-instructions`. It runs `codex.cmd debug prompt-input probe` and checks that AGENTS.md's last heading reaches the prompt Codex sends (PASS or WARN; only the result is kept, never the prompt). Codex silently cut AGENTS.md at 32 KiB before `project_doc_max_bytes` was raised.
- `AGENTS.md`, `CLAUDE.md`: the 6.2 models need Codex CLI 0.171.0 or later (they entered the catalog there); Crucible runs and verified 0.172.0.

## Write allowlist
`scripts/codex-dispatch.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/ccx-ops.ps1`, `AGENTS.md`, `CLAUDE.md`, `tasks/CODEX-UPGRADE-1.md`.

## Done When
- test-codex-dispatch: a run that prints a quota message, then completes and exits 0, records no usage limit; a run that ends on a quota message still does.
- `ccx health` reports `codex-instructions` PASS on this machine.
- `ccx verify -TaskId CODEX-UPGRADE-1` passes; Codex reviews the diff.
