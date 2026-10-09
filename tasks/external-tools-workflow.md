# Task: practical external-tool workflow

Superseded by `tasks/external-tools-ready.md` after the user requested one-time encrypted Claw login. ccx status is abandoned, not done; the successor owns these uncommitted changes.

Task ID: `external-tools-workflow`. Dispatch; Codex implements, Claude independently reviews and owns Git. Baseline `ed30a58`. Direct user request: make external tools useful for upcoming repo work. `tool: none` for implementation; external tools remain optional.

## Write allowlist

`AGENTS.md`, `CLAUDE.md`, `EXTERNAL-TOOLS.md`, `HANDOFF.md`, this file, `scripts/check-external-tools.ps1`, `scripts/test-external-tools.ps1`. Preserve pre-existing untracked prompt, WP-1 and wallpaper files. Test fixtures and review captures may use unique TEMP or user-local tooling directories. No ccx routing, policy, credentials, external-source, product or global configuration changes. No external library execution. No commit, push or mirror sync by Codex.

## Done When

- [ ] Both agents have identical tool-selection and fallback guidance, linked to a shared task brief and runbook.
- [ ] One optional, provider-free readiness command checks the actual launchers and library storage, distinguishes CLI checks from live inference and hook execution, and continues when tools are missing.
- [ ] The runbook records GJC and Claw provider evidence, temporary Claw credential scope, billing, isolated-worktree use, capture/review procedure and OmO's remaining interactive check.
- [ ] Offline mocks cover complete and missing readiness dependencies, no credential disclosure, no provider prompts and documentation symmetry.
- [ ] Live readiness and focused regression pass; independent Claude review passes; ccx verifies and approves done.

## Verify

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-external-tools.ps1`

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-external-tools.ps1 -Json`

`git diff --check`

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ccx.ps1 verify -TaskId external-tools-workflow`

## Evidence

Pending. Installed binaries are optional. Readiness exit zero means inventory completed, not that every tool is present or ccx accepts the task. A live external-tool repository-writing trial is a separately scoped task, not part of this change.
