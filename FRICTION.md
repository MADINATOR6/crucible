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
| 2026-09-25 | Claude's own review of the mirror script missed two high-severity cases (staging inside the destination; export-ignore dropping committed files) that the Codex verifier found. | One fix cycle | Always run the adversarial Codex verifier on destructive scripts, even after a thorough Claude review. | 1 |
| 2026-09-25 | On this host `mklink /J` gets "Access is denied" under `powershell -File` but works under `-Command`. | About 15 min of diagnosis | Tests that need junctions report SKIP when the host refuses them. | 1 |
| 2026-10-01 | Codex `workspace-write` sandbox denied `taskkill`, so it could not verify the launcher's timeout path (2026-09-25 verifier, CCX-4, CCX-5b: 2-3 cases reported FAIL each run). | Misleading FAILs in every Codex report | Fixed (CCX-5b follow-up): a probe detects a denied taskkill and the kill-path cases report SKIP; outside the sandbox they run fully. | 3 |
| 2026-09-30 | Codex hit its usage limit mid-dispatch (CCX-1, after ~35 min at high effort): exit 4, no report, edits complete in the tree. Also seen 2026-09-24. | Codex work blocked ~4 h | ccx records the reset and routes Codex work to `defer`; Claude reviews the diff and does non-Codex work. | 2 |
| 2026-09-30 | A bare `powershell -NoProfile` start takes ~4.3 s on this host, so child-process test suites take 10-12 min (test-ccx 28 cases: ~700 s). | Slow verification loops | Observe. If it recurs, test more cases in-process and keep child processes for CLI behaviour. | 1 |
