# Friction Log

Real friction only, never hypothetical. Count 1: log it, take no action. Count 2: observe. Count 3+, or one costly failure: make the simplest justified fix. Cost "not recorded" marks rows logged before the Cost column existed.

| Last seen | Symptom | Cost | Fix proposal / status | Count |
|---|---|---|---|---:|
| 2026-09-25 | Paths over 260 chars (long paths disabled): dispatch capture dir captured nothing; later a Claude workflow journal was unreadable with PS 5.1 `Get-Item`. | One empty dispatch; one blocked read | Launcher refuses long capture paths. Read long paths via the `\\?\` prefix. | 2 |
| 2026-09-25 | PowerShell `Get-Content`/`Set-Content` edit garbled `→`/`–` in UTF-8 files. | not recorded | Rule in AGENTS.md Windows. | 1 |
| 2026-09-25 | Unverified test command (`node --test test/` fails on a directory) nearly reached TASK.md; caught by a dry run. | not recorded | Existing "only verified commands" rule worked. | 1 |
| 2026-09-25 | Multi-line prompt to `codex.cmd exec` failed with `unexpected argument`. | not recorded | Launcher passes a one-line prompt naming a file. | 1 |
| 2026-09-25 | Parallel mode in Codex `workspace-write`: `.git` is read-only, worktree creation blocked. | not recorded | Rule in HANDOFF.md Parallel step 2. | 1 |
| 2026-09-25 | PowerShell 5.1 split a `git commit -m` here-string containing double quotes into extra arguments; commit failed. | not recorded | Avoid double quotes in native-command arguments. | 1 |
| 2026-09-25 | Audit workflow fanned out to 87 agents (3 verifiers x 35 findings) and hit the Claude session limit. | 2.7M tokens; session blocked about 4.5 h | Triage before fan-out; verify only high-severity findings; keep workflows to a few agents. | 1 |
| 2026-09-25 | cmd.exe treated a test argument `a>b` as a redirect and created a stray file in the repo. | Cleanup check | Run shell-quoting experiments with the cwd outside the repo. | 1 |
| 2026-09-25 | Synthetic tests passed but the mirror script refused every real OneDrive path: all OneDrive items are cloud-placeholder reparse points. Caught only by a dry run against the real OneDrive. | Near-miss; one review cycle | For file-system scripts, add one read-only dry run against the real target before accepting. | 1 |
| 2026-09-25 | On this host `mklink /J` gets "Access is denied" under `powershell -File` but works under `-Command`. | About 15 min of diagnosis | Tests that need junctions report SKIP when the host refuses them. | 1 |
| 2026-09-25 | Codex `workspace-write` sandbox denied `taskkill`, so it could not verify the launcher's timeout path. | One BLOCKED check per run | Claude runs process-kill checks outside the sandbox. | 1 |
