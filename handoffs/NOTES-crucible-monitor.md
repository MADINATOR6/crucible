# Notes: crucible-monitor

## Baseline (2026-11-09)
- Checkout `C:/Users/Madison/code/claude-codex-collab`, remote `MADINATOR6/crucible`, `main` @ 0fee953.
- 67 pre-existing modified/untracked paths (finance-shorts, lifting-tracker, tasks, prompts and others). Saved outside the repo for the final comparison; none are touched by this task.

## Source evidence
- ccx state dir: `<git common dir>/ccx` (`scripts/ccx-core.ps1:63-70`), override `CCX_STATE_DIR`. Here: `.git/ccx/` with `state.json` (schema 1), `telemetry.jsonl` (444 lines), `history.jsonl`, `logs/`.
- Telemetry kinds seen: `route`, `dispatch`, `verify`, `task-done`. Rotation to `*.1.jsonl` at 1 MiB (`ccx-core.ps1:265-282`).
- Dispatch telemetry fields: `scripts/codex-dispatch.ps1:462-467`. Token budget formula: `codex-dispatch.ps1:190-192`. Dispatch cap: `ccx-core.ps1:616`, `:653`. Class and budget: `ccx-core.ps1:494-518`.
- Task files are prose; conventions seen in `tasks/*.md`: `Task ID`, `Mode Dispatch`, headings `Write allowlist`, `Done When`, `Stop conditions`, `Verify`.
- Handoff notes follow `handoffs/TEMPLATE.md` bold fields; reports use HANDOFF.md `Status:` lines.

## Final verification (Claude, 2026-11-09, Windows 11, Node v24.21.0)
- `cd tools/crucible-monitor && node --test`: 20 pass, 0 fail (real junction fixtures included).
- `node tools/crucible-monitor/bin/crucible-monitor.js --once` on the real checkout: exit 0, 8 panels.
- Permission-model snapshot (`--permission --allow-fs-read=* --allow-child-process`): exit 0; a write probe under the same flags fails `ERR_ACCESS_DENIED`.
- Real terminal: fixture live view refreshed, survived telemetry deletion, `Ctrl+C` restored the screen; real-checkout live view left `.git/ccx/*`, `.git/index`, policy, TASK.md and `handoffs/*.md` byte- and mtime-identical.
- Not done: run with networking disabled (would need a system setting change); narrow layout in a real terminal (fake-terminal tests only); macOS/Linux.

## Handoff context
- Implementation: Claude. Review: Codex, two cycles, signed off with caveats (COLLAB.md R1, R2). No commit, push or sync. Next owner: the user decides whether to commit.
