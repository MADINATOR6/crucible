# Task

<!-- Task spec for Dispatch-mode work (Parallel tasks use their handoff note instead). May be overwritten per task after checking it holds no uncommitted manual edits. Reference paths; do not paste files. -->

## Mode and Owner
Dispatch. Task T2 (launcher hardening). Codex implements and runs the regression test; Claude reviews, re-runs checks, commits and pushes.

## Goal
Make `scripts/codex-dispatch.ps1` safe for long unattended sessions on Windows PowerShell 5.1, and add a self-contained regression test that proves it with a fake Codex (never the real one).

Required behaviour (IDs are the audit findings):
1. F2 stdin: Codex must never wait on the caller's stdin. Give it an empty, closed stdin.
2. F3 timeout: new `-TimeoutMinutes` (int, default 60). On timeout, kill the whole Codex process tree (`taskkill /T /F /PID <pid>`), print `TIMEOUT after <n> min`, exit 5. Capture files must still be written as far as available.
3. F3 single writer: for `workspace-write` and `danger-full-access`, hold a lock file at `<absolute git dir>\codex-dispatch.lock` (use `git rev-parse --absolute-git-dir`; it works in worktrees). If a live lock exists (its recorded PID is a running process), print `BUSY: another write dispatch is running (pid <n>)` and exit 6. Replace a stale lock. Always remove your own lock on exit, including failure and timeout paths. `read-only` runs take no lock.
4. F4 usage limit: after the run, scan the `error` and `turn.failed` event messages and the stderr capture for `hit your usage limit`, `Quota exceeded` or `usage not included` (case-insensitive; the apostrophe in "You've" may be U+2019). If found, print `USAGE LIMIT: <message>` and, when the message contains `try again at <time>`, also `RESETS: <time>`; exit 4 whatever Codex's exit code was. Otherwise print each distinct error/turn.failed message as `Codex error: <message>`.
5. F5/F16 roles and task file: replace `-PromptFile` with `-Role implement|verify|research` (default `implement`) and `-TaskFile <path>` (default `TASK.md`). The prompt passed to Codex is exactly `Read HANDOFF.md and follow its <Implementer|Verifier|Researcher> instruction for <TaskFile as absolute path>.` For `verify` and `research`, the sandbox defaults to `read-only` unless `-Sandbox` is passed explicitly. `research` requires an explicit `-TaskFile`.
6. F15: refuse to dispatch (exit 1 with a clear message) if HANDOFF.md is missing at the repo root, if the task file is missing, or if the task file has no content once HTML comments and heading lines are removed.
7. F7: a report file that is missing OR contains only whitespace counts as no report: print the NO REPORT line; exit 3 if Codex exited 0, else Codex's code (unless rule 2 or 4 applies).
8. F8: if `codex.cmd` is not on PATH, exit 1 with `codex.cmd not found on PATH` before creating any capture file.
9. F33: outside a Git repository print `Not inside a Git repository.` and exit 1 (no NativeCommandError text).
10. F13/F14: resolve `-TaskFile` and `-CaptureDir` relative to the caller's current directory, before changing to the repo root.
11. F11/F12: print Codex's report and all launcher output as UTF-8 regardless of the console code page (for example `→` and `–` survive), and decode git output as UTF-8 so non-ASCII repo paths work. Restore the console encoding on exit. Capture files (`.events.jsonl`, `.stderr.log`) should be UTF-8 (raw bytes from Codex is fine), not UTF-16.
12. F24/F27: paths containing `[` `]` `&` `(` `)` `'` or spaces must work. Refuse (exit 1) a capture path or task-file path containing `%` or `"`, which cmd.exe cannot pass safely.
13. Keep existing behaviour: MAX_PATH guard before creating anything; token usage line summed from all `turn.completed` events (ignore non-JSON lines); `Codex exit=<n>; capture=<base>` line; report printed after `--- report ---`; exit Codex's code when none of the rules above apply; `-Effort medium|high`; `-Sandbox`; `-CaptureDir` default `%USERPROFILE%\codex-captures`. Update the comment header so it lists every parameter and every exit code (0, Codex's own, 3, 4, 5, 6, 1 for refusals).

## Relevant Files
- `scripts/codex-dispatch.ps1` (current launcher)
- `HANDOFF.md` lines 11-19 (how the launcher is documented; read only)
- Reference only, outside the repo: `%TEMP%\ccx-audit\launcher\patched\codex-dispatch.ps1` (an auditor's partial fix covering items 1, 6, 8-12), `%TEMP%\ccx-audit\launcher\fakebin\` (fake codex shim) and `driver.js` (spawns with an open stdin pipe and a timeout). Reuse ideas freely; do not edit them.
- Codex facts: `codex exec` reads stdin to EOF when stdin is not a TTY and a prompt argument is given; exit 1 on usage limit; `--output-last-message` is written only when the turn completes and may be empty; `--json` failure events are `{"type":"error","message":...}` and `{"type":"turn.failed","error":{"message":...}}`.

## Write Allowlist
- `scripts/codex-dispatch.ps1` (explicitly authorized for this task, although AGENTS.md's folder map lists it among workflow files)
- `scripts/test-codex-dispatch.ps1` (new)
- Temporary files only under `$env:TEMP\ccx-t2\` (create and delete freely). If the sandbox blocks writes there, say so and use no other location.

## Constraints
- Windows PowerShell 5.1 syntax only (no `&&`, `??`, ternary). ASCII-only source in both .ps1 files (use `[char]` codes for non-ASCII test strings). Keep the launcher readable: comments only where behaviour is non-obvious.
- Never run the real `codex exec`. The test must put a fake `codex.cmd` first on PATH for its child processes only, and must fail loudly if it ever resolves the real one.
- The test script: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-codex-dispatch.ps1` from the repo root. It creates throwaway git repos and the fake under `$env:TEMP\ccx-t2\`, runs each case in a child `powershell -NoProfile` process, prints one `PASS <case>` or `FAIL <case>: <why>` line per case and a final `<passed>/<total> passed`, exits 0 only if all pass, cleans up its temp folder and leaves no processes running. Whole run under 3 minutes.
- Required test cases: success with report and token sum across 2 turns; nonzero exit without report; exit 0 without report (3); whitespace-only report (3); usage limit with reset time (4, prints USAGE LIMIT and RESETS); timeout with a fake that sleeps (5, and the fake process is gone afterwards); stdin: launcher started with an open, never-closed stdin pipe while the fake reads stdin to EOF must still finish; lock: live lock gives 6, stale lock is replaced, read-only run ignores the lock; `-Role verify` passes `-s read-only` and the Verifier prompt; `-Role research` without `-TaskFile` is refused; relative `-TaskFile` and `-CaptureDir` from a subdirectory; empty/unfilled task file refused; missing HANDOFF.md refused; outside a repo gives the friendly message; codex.cmd missing gives exit 1; UTF-8 report containing `→` and `–` printed intact (check the child's stdout bytes); repo path containing a space, `&`, `(`, `)` and `[1]`.
- Do not stage, commit, or edit any other file. Report proposed HANDOFF.md/AGENTS.md wording changes in the report instead.

## Out of Scope
- HANDOFF.md, AGENTS.md, README.md, BOOTSTRAP.md edits (Claude does them after review).
- The OneDrive mirror command.
- Any change to Codex config, PATH outside child processes, or global settings.

## Done When
- (Codex) Items 1-13 implemented in `scripts/codex-dispatch.ps1`.
- (Codex) `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-codex-dispatch.ps1` prints all PASS and exits 0; paste only the summary line and any FAIL lines.
- (Codex) `git diff --check` clean; `git status --short` shows only the two allowlisted scripts plus Claude's pre-existing edits.
- (Claude) Re-run the test; review the diff; one real read-only Verifier dispatch through the new launcher succeeds (after HANDOFF.md gains the Verifier instruction).

## Verify
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-codex-dispatch.ps1`
- `git diff --check`

## Stop conditions
- A required check fails twice after one focused repair: stop and report PARTIAL with both attempts.
- The sandbox blocks the temp folder, child processes or taskkill: stop that part, report BLOCKED with the exact denied command.
