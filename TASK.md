# Task: external tools for both agents

Task ID: `external-tools-operational`. Baseline `7a4a4c7`, `main`, 2026-10-09. Direct user assignment: Codex implements; Claude independently reviews. User authorizes one local commit after all verification and ccx done, superseding default Dispatch commit ownership for this task only. No push or mirror sync.

Optional `tool: none` (default). Allowed for both agents: `none`, `gjc`, `claw`, `claude-red`; `omo` selects a Codex runtime (Claude may launch it within authorized dispatch scope). Descriptive metadata only, manual tool selection; no ccx routing or permission change.

## Goal and write allowlist

Operational tools accessible independently to both agents, documented equivalent for agent-specific functionality, mirrored instructions and offline mocks. ccx alone approves done. Install/verify tooling only; never execute library contents.

Repository writes: `AGENTS.md`, `CLAUDE.md`, `EXTERNAL-TOOLS.md`, `HANDOFF.md`, `TASK.md`, `scripts/gjc.ps1`, `scripts/claw.ps1`, `scripts/load-claude-skill.ps1`, `scripts/codex-load-skill.ps1`, `scripts/codex.ps1`, `scripts/test-external-tools.ps1`, `scripts/invoke-external-tool.ps1`, `tests/mocks/`. External installs/logs/synthetic fixtures: `~/.local/share/claude-codex-tools`, `~/.claude/skills/claude-red`, unique TEMP directories. ccx may update ignored task state. No other writes.

Pre-existing untracked: `prompts/crucible-overall-upgrade.md`, `tasks/WP-1.md`, `wallpaper/`; preserve and exclude from staging. Planned CRU-25/CRU-23 overlap docs/health but are not active. Other active ownership stays separate. The unrelated Powerlifting Tracker checkout `C:/Users/Madison/code/claude-codex-template` is untouched.

Out of scope: ccx/policy and dispatch/sync changes, primary Codex config/auth, provider credentials, external source changes, security testing, library execution, admin/OS/global settings changes, autonomous permissions, real repository-writing harness trials, push and mirror sync.

## Decisions

- Reuse verified pinned GJC rather than reinstall via shell/Bun/npm. Original Windows installer failed resolving `Get-FileHash`; checksum-verified binary installation succeeded previously.
- Claw runs on Windows gnullvm. Rebuild requested full workspace with that known working target; old default target crashes and is retained as evidence.
- User selected **keep isolated OmO; preserve permissions** on 2026-10-09. Doctor passes 3/3; no `--codex-autonomous` or primary config writes. Hooks still require interactive approval/re-approval; composer skills are not native CLI help subcommands.
- Claude supports `--append-system-prompt-file`, not requested `--system-file -`; append the selected Markdown, preserving normal instructions. Codex prepends the same file to a new prompt.
- Full Claude-Red checkout verified by revision/files only; no library content execution. Real loader check uses a synthetic module.
- Optional tool metadata/manual launchers suffice; no ccx routing adapter. `ccx status` may process events; prefer read-only task/state snapshots.

## Acceptance and results

- [x] Correct Crucible checkout, source inventory, all scripts and required docs read; both agents' workflow summarized.
- [x] GJC version/smoke PASS; Claw version/help PASS; repo-root wrappers created.
- [x] Claw full workspace build PASS, exit 0 in 163s; rebuilt version/help PASS.
- [x] Isolated OmO profile, enabled plugin, hook files and wrapper exist; doctor PASS 3/3; wrapper/native help run.
- [x] Claude-Red clone: `739512a8588b28ff3b554e669391c22508602878`, 84 Markdown files; both loaders created.
- [x] Real Claude loader PASS: `SYNTHETIC_CLAUDE_LOADER_OK`, exit 0; synthetic module only.
- [x] Agent files have identical External Tools sections and symmetry rule first; external tools status/equivalents and optional handoff/task `tool:` metadata documented.
- [x] Final expanded mock/symmetry suite PASS 20/20, exit 0 on Windows PowerShell 5.1; includes short flags, native empty/quoted/Unicode/metachar argv, shell-shim refusal and same-process environment restoration.
- [x] Existing regressions PASS: core 31/31 exit 0 (826s), operations 16/16 exit 0, dispatch isolated rerun 49/49 exit 0 (444s), mirror 21/21 exit 0 (165s), one host-refused junction fixture skip. Diff check exit 0; ccx parse/JSON/secrets/scope/memory PASS.
- [x] Independent verifier PASS on repaired state (20/20 and diff check); actual Claude final diff review PASS. ccx verification previously PASS; delivery must refresh the final fingerprint and run task done before committing.
- [x] Local commit prepared with exact requested title, 17 task-owned paths and shared/Codex/Claude availability in its body. Execute only after final ccx acceptance; resulting commit is recorded in Git history and the final report. No push.

## Verify

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-external-tools.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-ccx.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-ccx-ops.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-codex-dispatch.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-sync-mirror.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/gjc.ps1 --version
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/claw.ps1 --version
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/codex.ps1 --help
git diff --check
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ccx.ps1 verify -TaskId external-tools-operational
```

Review reports, synthetic real-loader fixtures and detailed outputs remain under tools dir with `integration-` names. Record Claude review only from a genuine independent report. ccx done must accept current full verification fingerprint before local commit. On install/check failure document exact error, continue independent tools, and never claim all-pass or commit incomplete work. Ask before admin or environment-breaking actions.

Claude initial review requested changes to flag forwarding and UTF-8 piping. Replaced wrapper parameters with environment overrides and one shared native argv helper. Original ccx registration external-tools-symmetry was explicitly abandoned without completion; external-tools-operational registers the expanded exact allowlist. Core regression PASS 31/31 (826s); operations PASS 16/16; mirror PASS 21/21, one host junction skip. Dispatch first run 48/49: stale writer-lock child exceeded 25s during parallel suites/build; isolated rerun PASS 49/49, exit 0 in 444s; no ccx/dispatch code changes needed.

Final native-wrapper runs: GJC version, Claw version/help, Codex help, and real synthetic Claude loader all exit 0. Final Claude loader output: SYNTHETIC_CLAUDE_LOADER_OK. Receipts integration-native-0 through integration-native-4.

Final verification summary: 137 applicable checks passed across five suites, one host junction skip; no unresolved failures. Both actual Claude review and independent Codex verifier PASS. The final delivery sequence is ccx verify -> ccx task done -> L3 local-commit gate -> one scoped local commit. No push or mirror sync. The ccx state and Git history record those delivery actions after this snapshot.
