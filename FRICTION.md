# Friction Log

Real friction only, never hypothetical. Count 1: log it, take no action. Count 2: observe. Count 3+: investigate whether a workflow change is justified.

| Problem | Count | Last Seen |
|---|---:|---|
| Paths over 260 chars (long paths disabled): dispatch capture dir captured nothing (fixed by the launcher guard); later a Claude workflow journal was unreadable with PS 5.1 `Get-Item` (read via `\\?\` prefix). | 2 | 2026-09-25 |
| PowerShell `Get-Content`/`Set-Content` edit garbled `→`/`–` in UTF-8 files. Rule added to AGENTS.md Windows. | 1 | 2026-09-25 |
| Unverified test command (`node --test test/` fails on a directory) nearly reached TASK.md; caught by a dry run. Existing "only verified commands" rule worked. | 1 | 2026-09-25 |
| Multi-line prompt to `codex.cmd exec` failed with `unexpected argument`. Workaround (prompt file) added to HANDOFF.md. | 1 | 2026-09-25 |
| Parallel mode in Codex `workspace-write`: `.git` is read-only, worktree creation blocked. Fallback worked (Codex stopped and named the command). Rule added to HANDOFF.md. | 1 | 2026-09-25 |
| PowerShell 5.1 split a `git commit -m` here-string containing double quotes into extra arguments; commit failed. Avoid double quotes in native-command arguments. | 1 | 2026-09-25 |
| Audit workflow fanned out to 87 agents (3 verifiers x 35 findings), used 2.7M tokens and hit the Claude session limit; session blocked about 4.5 h. Triage before fan-out; verify only high-severity findings. | 1 | 2026-09-25 || cmd.exe treated a test argument `a>b` as a redirect and created a stray file in the repo. Run shim experiments outside the repo. | 1 | 2026-09-25 |
