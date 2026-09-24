# Friction Log

Real friction only, never hypothetical. Count 1: log it, take no action. Count 2: observe. Count 3+: investigate whether a workflow change is justified.

| Problem | Count | Last Seen |
|---|---:|---|
| Dispatch capture dir path over 260 chars: launcher exited 0 but captured nothing (long paths disabled). Fixed in HANDOFF.md checklist. | 1 | 2026-09-25 |
| PowerShell `Get-Content`/`Set-Content` edit garbled `→`/`–` in UTF-8 files. Rule added to AGENTS.md Windows. | 1 | 2026-09-25 |
| Unverified test command (`node --test test/` fails on a directory) nearly reached TASK.md; caught by a dry run. Existing "only verified commands" rule worked. | 1 | 2026-09-25 |
| Multi-line prompt to `codex.cmd exec` failed with `unexpected argument`. Workaround (prompt file) added to HANDOFF.md. | 1 | 2026-09-25 |
| Parallel mode in Codex `workspace-write`: `.git` is read-only, worktree creation blocked. Fallback worked (Codex stopped and named the command). Rule added to HANDOFF.md. | 1 | 2026-09-25 |
