# Task

<!-- Task spec for Dispatch-mode work (Parallel tasks use their handoff note instead). May be overwritten per task after checking it holds no uncommitted manual edits. Reference paths; do not paste files. -->

## Mode and Owner
Dispatch. Task T3 (mirror safety). Codex implements and runs the regression test; Claude reviews (risky: destructive copy), re-runs checks, updates AGENTS.md/BOOTSTRAP.md, commits and pushes.

## Goal
Replace the robocopy one-liner in AGENTS.md "Mobile Sync" with `scripts/sync-mirror.ps1`, which mirrors only the committed tree of the current checkout into OneDrive. Audit finding F1 (confirmed): the one-liner copies the whole working tree, so gitignored secrets (for example `secrets/*.json`, `id_rsa`, `*.pfx`, `.claude/settings.local.json`) and uncommitted edits reach OneDrive, and `git status` does not show them. Also F6 (no retry limit, exit code lost), F9 (it silently creates mirrors for repos that never had one), F10 (files deleted from the repo stay in the mirror forever).

Required behaviour:
1. Outside a Git repository: print `Not inside a Git repository.` and exit 1. In a linked worktree (`git rev-parse --git-dir` differs from `--git-common-dir`): print `Run from the base-branch checkout, not a worktree.` and exit 1.
2. `$env:OneDrive` empty or unset: print `SKIPPED: OneDrive not set.` and exit 0.
3. Destination is exactly `$env:OneDrive\AgentWorkspace\<leaf name of the repo root>`. Refuse (exit 1) if the leaf is empty. If the destination folder does not exist: without `-Create` print `SKIPPED: no mirror at <dest>. Pass -Create to start one.` and exit 0, creating nothing; with `-Create` create it.
4. Source is `HEAD` only: `git archive --format=tar` into a new, uniquely named staging folder under `$env:TEMP` (short name, for example `ccx-mirror-<8 hex>`), extracted with the Windows `tar.exe`. If `git archive` or `tar` fails, or the staging folder has no files, print why and exit 1 without touching the destination.
5. Copy with `robocopy <staging> <dest> /MIR /XD .git node_modules /XF .git .env* *.pem *.key /R:1 /W:1 /NFL /NDL /NJH /NJS /NP`. robocopy exit 0-7: print `MIRROR OK (robocopy <n>): <dest>` and exit 0. 8 or more: print `MIRROR FAILED (robocopy <n>): <dest>` and exit 1.
6. `-DryRun`: same checks, adds `/L`, changes nothing, prints robocopy's list of what would change (drop `/NFL /NDL` in this mode).
7. Always remove the staging folder and tar file, and nothing else, on every exit path.
8. Never write, delete or create anything outside the destination folder (besides staging), and never delete the destination folder itself or its parent.
9. UTF-8 safe: repo root or file names with non-ASCII characters (for example `é`) work. Decode git output as UTF-8 and restore the console encoding on exit.
10. Comment header: usage, parameters (`-Create`, `-DryRun`), exit codes (0 OK or skipped, 1 refused or failed).

## Relevant Files
- `AGENTS.md` lines 23-29 (current Mobile Sync rules and one-liner; read only)
- `scripts/codex-dispatch.ps1` and `scripts/test-codex-dispatch.ps1` (style reference for PowerShell 5.1 and the test harness pattern; read only)

## Write Allowlist
- `scripts/sync-mirror.ps1` (new)
- `scripts/test-sync-mirror.ps1` (new)
- Temporary files only under `$env:TEMP\ccx-t3\` and the staging folders the script itself creates.

## Constraints
- Windows PowerShell 5.1 syntax only. ASCII-only source (build non-ASCII test names with `[char]` codes).
- The test never touches the real OneDrive: every case runs in a child `powershell -NoProfile` process whose `$env:OneDrive` points at a folder under `$env:TEMP\ccx-t3\`. The test must abort before running any case if that variable would resolve to the real OneDrive path.
- Test run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-sync-mirror.ps1` from the repo root. One `PASS <case>` / `FAIL <case>: <why>` line per case, final `<passed>/<total> passed`, exit 0 only if all pass, clean up `$env:TEMP\ccx-t3\` and any `ccx-mirror-*` staging it caused, under 2 minutes.
- Required cases: OneDrive unset gives SKIPPED/0; missing destination without `-Create` gives SKIPPED/0 and creates nothing; `-Create` copies committed files; a gitignored secret, an untracked file and an uncommitted edit are NOT in the mirror (the mirror has the committed content); a committed file later deleted and committed disappears from the mirror on the next sync; a sibling folder `AgentWorkspace\other` and its files are untouched; committed `.env`, `x.pem`, `y.key` are still excluded; a linked worktree is refused; outside a repo is refused; `-DryRun` changes nothing; a non-ASCII file name is mirrored intact; no staging folder is left behind; robocopy failure is reported with exit 1 (for example make the destination unwritable or replace it with a file, whichever is reliable).
- Do not stage, commit, or edit any other file. Propose AGENTS.md/BOOTSTRAP.md wording in the report.

## Out of Scope
- Running the script against the real OneDrive or any existing mirror.
- AGENTS.md, BOOTSTRAP.md, README.md edits (Claude).

## Done When
- (Codex) Items 1-10 implemented in `scripts/sync-mirror.ps1`.
- (Codex) `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-sync-mirror.ps1` prints all PASS and exits 0; paste only the summary line and any FAIL lines.
- (Codex) `git diff --check` clean; `git status --short` shows only the two new scripts plus Claude's pre-existing edits.
- (Claude) Re-run the test; review the diff line by line (destructive copy); AGENTS.md Mobile Sync points to the script.

## Verify
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-sync-mirror.ps1`
- `git diff --check`

## Claude review decisions (2026-09-25)
- `-Create` also creates a missing `AgentWorkspace` (explicit opt-in; the old one-liner created it implicitly).
- Only symbolic links and junctions count as links. Every OneDrive item is a cloud-placeholder reparse point (tag 0x9000701A); the first version refused all real syncs.
- Worktree check compares absolute Git paths (`--path-format=absolute`).
- Test: 60 s per-child hang guard, duration printed instead of asserted, junction case added and reported as SKIP where the host forbids creating junctions.

## Stop conditions
- A required check fails twice after one focused repair: stop and report PARTIAL with both attempts.
- The sandbox blocks the temp folder, child processes, git archive, tar or robocopy: stop that part, report BLOCKED with the exact denied command.
- Any doubt that a code path could delete outside the destination folder: stop and report UNKNOWN / CHECKED / NEEDED.
