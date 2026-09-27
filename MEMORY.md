# MEMORY.md

Operating state for autonomous sessions on this repo. Read first every session. Cap 400 lines; archive old entries to MEMORY-ARCHIVE.md.

## Current state
- Project: claude-codex-collab. Active work (2026-09-27, branch claude/uts-nursing-assessment-reviewer-013cf5): `nursing-a2/`, the UTS 93225 Assessment 2 reviewer (user away ~10 h; assessment is Week 4 lab, from Mon 28 Sep).
- Last task commit: 35b3032 (flashcards + search). Earlier: 0f4a88c MVP, 686bd5d phone fixes.
- Queue: [x] Phase 1 docs [x] Phase 2 MVP [~] Phase 3 Codex review NA2-REVIEW-1 (dispatched from 16117f9) [ ] apply REVIEW.md fixes [ ] Codex 20% spot-check [x] Phase 4 flashcards/search/dark mode.
- Blocker: the 93225 Canvas Modules are not on this PC and Canvas needs the user's UTS login. Phone push sent 11:5x asking for "use Chrome" permission or files in nursing-a2/modules/. Content currently comes from 93224 FNP2B slides found in Downloads/New folder (marked Supplementary in the app).
- Published phone page: https://claude.ai/artifact/BpVm69cYcRUd1VLBkPwTRJ (republish from nursing-a2/build/reviewer.artifact.html after each build).
- Previous template-queue state: idle; see HANDOFF-REPORT.md and the open questions below.

## Task queue
Derived 2026-09-25 from the repo's open items and the gaps between this template and the user's autonomous operating prompt. There was no queue before.
- [x] T0 [normal] Create MEMORY.md with this queue. (f44e0c9)
- [x] T1 [complex] Audit. 35 findings (F1-F35), 4 fully verified before the Claude session limit hit; rest triaged by Claude. Evidence: `%TEMP%\ccx-audit\journal.jsonl`, harness `%TEMP%\ccx-audit\launcher`.
- [x] T2 [complex] Harden scripts/codex-dispatch.ps1 via Codex Dispatch: F2 stdin, F3 timeout/lock, F4 usage-limit exit, F5 roles, F7 empty report, F8 missing codex, F11/F12 UTF-8, F13/F14 relative paths, F15 empty task, F16 task-file prompt, F24/F27 path chars, F33 outside repo. Plus a fake-codex regression test. Then Codex verifier pass.
- [x] T3 [complex] Mirror safety: F1 (confirmed high: gitignored secrets reach OneDrive), F6, F9, F10. Committed-tree-only sync script with guards; AGENTS.md points to it. (59629a1, verifier fixes 3389199)
- [x] T4 [frontier] Workflow docs for long unattended sessions (fb5222d): F5 (HANDOFF.md verifier/researcher instructions), F16-F23, F26, F28-F32, F34, F35. Claude edits; Codex read-only critique.
- [x] T5 [normal] Pilot: replaced by this session's real dispatches through the new launcher (implement T3, verify T2 and T4, one read-only run concurrent with a writer). Separate throwaway pilot skipped to save Codex quota.
- [x] T6 Stop: HANDOFF-REPORT.md, final checkpoint, self-critique. TASK.md reset to the blank template (now with task ID/depth and Stop Conditions).

## Security pass (2026-09-26, branch claude/security-2026-09-26)
- History scan (20 commits): no credentials, keys or real personal data; only synthetic @example.test emails. Codex read-only audit (576k input / 516k cached / 3.9k output) plus Claude review.
- Fixed: mirror destination overlapping the checkout (high; repo kept inside OneDrive\AgentWorkspace would be /MIR-ed over itself); inherited GIT_DIR/GIT_WORK_TREE overrides cleared for child git and Codex; cmd.exe/taskkill.exe/robocopy.exe resolved from the OS instead of %ComSpec%/%SystemRoot%; launcher test no longer deletes an existing %TEMP%\ccx-t2; .gitignore for secrets and logs; laptop prompt logs moved outside the repo; personal path removed from BOOTSTRAP.md (still in history; repo is private, not a secret, no rewrite).
- Not tested at runtime: the GIT_* override fix (static review only).
- Tests: dispatch 23/23; mirror 21/21 + 1 host SKIP.

## Self-critique (2026-09-25 session)
- Went well: fake-Codex and fake-OneDrive harnesses made every script claim testable; the Codex verifier caught 2 high bugs Claude missed; a real-target dry run caught the OneDrive placeholder bug.
- Cost: the 87-agent audit (2.7M Claude tokens, 4.5 h blocked); Codex T2 at high effort (3.6M input); about 15 min on the junction/-File host quirk.
- Stronger version: triage audit findings before any verifier fan-out; dry-run against the real target before the first commit of a file-system script; stamp every checkpoint from Get-Date.
- Rules added: AGENTS.md risky routing (Codex verifier + real-target dry run); friction cost threshold; no trailers.

## Decisions log
- 2026-09-25 | HANDOFF.md is this repo's handoff contract; no separate HANDOFF-CONTRACT.md | HANDOFF.md already holds the launcher, implementer instruction, report format and sandbox limits; a second file would duplicate it | -
- 2026-09-25 | No OneDrive mirror sync for this repo | `%OneDrive%\AgentWorkspace` has only claude-codex-template; creating a new mirror is outside the task | -
- 2026-09-25 | Commits carry no trailer | User's operating prompt: no trailer, no Co-Authored-By | -
- 2026-09-25 | Codex may edit scripts/ under a TASK.md allowlist; Claude edits workflow docs | HANDOFF.md forbids Codex from editing AGENTS.md, CLAUDE.md, HANDOFF.md, .codex/ | -
- 2026-09-25 | Stop re-running the audit's 75 failed verifiers; Claude triages instead, Codex (separate quota) implements and verifies | The 87-agent workflow used 2.7M tokens and hit the Claude session limit (blocked 13:30-18:00) | -
- 2026-09-25 | Session clock restarted at 18:02 when the user said "continue"; 240-min stop at 22:00 | User instruction after the limit reset | -
- 2026-09-25 | Claude workflows capped at about 4 agents for the rest of this session | Claude session limit is the binding constraint for a 10-12 h unattended run | -
- 2026-09-25 | Dispatch lock is held-handle only: a lock file nobody holds open is stale whatever PID it records | Windows reuses PIDs; a crashed launcher's PID check gave false BUSY. Deviates from the original T2 brief; brief amended | T2
- 2026-09-25 | `-TimeoutMinutes` is a number (fractions allowed) | Lets the timeout test run in 3 s instead of 60 s | T2
- 2026-09-25 | Launcher test prints its duration instead of failing over 180 s | Timing asserts flake under load (verifier sandbox hit 180 s) | T2
- 2026-09-25 | Mirror source built with a private GIT_INDEX_FILE + `git checkout-index --all`, not `git archive` | archive honours export-ignore (even uncommitted .git/info/attributes), so /MIR deleted committed files from the mirror (Codex verifier) | T3 fix
- 2026-09-25 | Mirror refuses when staging and destination contain each other | /MIR deleted its own staging source (Codex verifier) | T3 fix
- 2026-09-25 | TASK.md is used for this repo's Dispatch tasks and reset to the blank template at session end | It is both the shipped template and live state (F18); BOOTSTRAP fix is part of T4 | -
- 2026-09-26 | Ponytail's "write less code" ladder added to the implementer instruction as text; plugin not installed | JetBrains A/B (Jul 2026): -10.3% cost, -7.5% tokens (noise), no quality change vs -20%/-22% advertised; three lines give the same discipline with no dependency | -
- 2026-09-26 | OmniRoute rejected | Proxies prompts, code and provider credentials through a third-party gateway to bypass usage limits; conflicts with AGENTS.md Security and likely provider terms. Launcher exit 4 already handles Codex limits | -
- 2026-09-26 | Graphify parked until the template is applied to a large codebase | This repo is a small set of Markdown files plus two scripts; `graphify claude install` would edit Claude-owned config. Re-test then with a before/after token count | -
- 2026-09-27 | Ladder reworded: "use the first that fully meets the task, then finish", "existing project dependency", "one clear line" | Codex verifier: "stop" means halt-and-report elsewhere in the implementer block; bare existence ignored suitability; "installed" could mean machine-only; "one line" rewarded dense code | -

- 2026-09-27 | nursing-a2 uses 93224 FNP2B slides as a labelled "Supplementary" source set | 93225 Modules unavailable and the user is away; Subject Information p.1 says 93225 aligns with 93224; items are badged and can be switched off. Excluded: personal .docx notes of unknown origin | NA2
- 2026-09-27 | Did not use Claude in Chrome or download from Canvas | Harness default is the built-in browser unless the user asks; downloads need explicit per-file permission. Asked by push instead | NA2

## Open questions
- Delete merged remote branch `origin/claude/codex-mythos-upgrade-analysis-nv6hg1` (PR #2, merged)? (`laptop-efficiency-tasks-6598uz` is already gone) | User decision (remote deletion) | no
- Should `prompts/laptop-efficiency.md` live in this template repo? Its Phase 2 writes logs of personal file names into the repo (F25) | User decision | no
- Mythos vs AGENTS.md (2026-09-27 check): Codex verifier after every task (Mythos 2) or only risky work (AGENTS Routing)? After a failed Codex retry, stop the session (Mythos 12) or Claude reviews and finishes (HANDOFF.md)? Adopt Mythos 12 stop conditions (240 min etc.) and 11 pre-dispatch diagnostics into AGENTS.md? MEMORY.md every session (Mythos 5) or unattended only (AGENTS)? | User decision | no
- `C:\Users\Madison\code\claude-codex-template` (retired powerlifting repo) could not be recycled on 2026-09-27: "being used by another process". Intact, 186 files | User closes whatever holds it, then recycles it | no

## Research findings
- codex-cli 0.156.1 installed at `%LOCALAPPDATA%\Programs\nodejs\codex.cmd` | `codex.cmd --version` | 2026-09-25
- The local folder `claude-codex-template` is the powerlifting-tracker repo, not this template | `git remote -v` | 2026-09-25
- GitHub repo is private (anonymous browser gets 404); live verification = `git ls-remote origin refs/heads/main` equals local HEAD | built-in browser | 2026-09-25
- Codex auth: `cmd /c "codex.cmd login status < NUL"` → "Logged in using ChatGPT", exit 0; costs no quota | 2026-09-25
- Codex usage-limit text: "You've hit your usage limit" (U+2019 apostrophe) ... "try again at 12:31 PM." or "... at Sep 25th, 2026 12:30 AM." or "try again later."; also "Quota exceeded." Exec JSON carries message text only (type error / turn.failed), exit 1 | rollouts + codex-rs source (audit) | 2026-09-25
- codex exec stdin: with a prompt argument and non-TTY stdin it reads stdin to EOF with no timeout ("Reading additional input from stdin..."); Claude Code's shell gives NUL so it returns at once; an open pipe hangs forever. `@() | & codex.cmd ...` closes it | codex-rs/exec lib.rs (audit) | 2026-09-25
- codex exec exit codes: 0 turn completed (even if report says BLOCKED); 1 failed/interrupted/usage limit/git check; 2 CLI usage error. --output-last-message written only on completed turns, possibly empty | codex-rs source (audit) | 2026-09-25
- `-c model_reasoning_effort=medium` is honored (rollout shows effort medium, model gpt-6-astra, approval never, workspace-write network off) | rollout (audit) | 2026-09-25
- codex.cmd shim: args with spaces incl. & ( ) ! survive; newline truncates; `"` stripped; %VAR% expands; unquoted & | > split/redirect | stand-in tests (audit) | 2026-09-25
- PS 5.1 `>` redirection of native output writes UTF-16LE captures under -NoProfile; console code page varies 437/65001 | audit | 2026-09-25
- Pre-existing processes at session start (not ours; never stop): chrome, msedge, 2× codex (interactive, started 9/24 23:42 and 9/25 00:24), many node (MCP servers) | Get-Process | 2026-09-25

## Known failure modes
- Codex usage limit mid-task: edits land, no report | Rate limit | Review the diff and run checks yourself; pivot to non-Codex work until reset (powerlifting HANDOFF-REPORT.md, 2026-09-24)
- Claude session limit from wide workflows | 87 agents / 2.7M tokens in one workflow | Keep workflows small; triage before fan-out
- Workflow journal/output paths exceed 260 chars; PS 5.1 Get-Item fails | Long session paths | Read with `[IO.File]::ReadAllLines('\\?\<path>')` and copy to `%TEMP%\ccx-audit`
- Subagent test argument `a>b` run through cmd.exe created stray `b` in the repo | cmd.exe redirection | Run shim experiments with cwd outside the repo
- Built-in browser pane cannot register service workers | Environment | Use headless Chrome for SW checks
- Codex workspace-write sandbox denies `taskkill` ("Access denied") | Sandbox | Claude runs process-kill checks outside the sandbox
- Every OneDrive item is a reparse point (cloud tag 0x9000701A) | Files On-Demand | Treat only LinkType SymbolicLink/Junction as links
- `mklink /J` "Access is denied" under `powershell -File` from Claude Code's shell, fine under `-Command` | Host sandbox | Junction tests SKIP when refused

## Checkpoint (auto-updated)
- 2026-09-25 13:12 +10:00: session start; HEAD 3bfe4f5; T0 in progress. Session stop deadline 17:10 (240 min).
- 2026-09-25 18:10 +10:00: resumed after Claude session limit (13:30-18:00). T0, T1 done. Removed stray 0-byte `b`. Writing T2 brief. New stop deadline 22:00.
- 2026-09-25 18:55 +10:00: T2 implemented by Codex (high effort; 3.58M input / 3.49M cached / 22.8k output; BLOCKED only on sandbox-denied taskkill). Claude fixed lock PID-reuse false BUSY, fractional timeout, RESETS trailing dot; 24/24 tests pass outside sandbox. HANDOFF.md launcher docs + Verifier/Researcher instructions written (uncommitted). Codex verifier dispatch running (-Role verify -Sandbox workspace-write).
- 2026-09-25 18:51 +10:00 (corrected: an earlier entry said 19:20 without checking the clock): Verifier (medium; 410k input / 371k cached / 3.5k output) flagged 2 intended deviations + sandbox-blocked taskkill; Claude found and fixed VoidTaskResult output leak (launcher + test). 23/23 pass in 156 s. Captures now UTF-8. T2 committed 33e78df.
- 2026-09-25 18:58 +10:00: T4 docs committed fb5222d after a read-only Codex verifier (164k input / 125k cached / 2k output; 6 findings applied).
- 2026-09-25 19:29 +10:00: T3 Codex PARTIAL (high; 789k input / 751k cached / 13.6k output). Claude fixed worktree check, OneDrive cloud-placeholder false refusal (found by a real-OneDrive dry run), -Create parent, test harness races. Mirror suite 18/18 + 1 SKIP via -File, 19/19 via -Command. Real OneDrive -Create -DryRun: exit 0, 20 committed files listed, nothing created. T3 committed 59629a1.
- 2026-09-25 19:38 +10:00: T3 Codex verifier (medium; 687k input / 645k cached / 5.2k output) found 2 high bugs: staging/destination overlap, export-ignore dropping committed files. Claude fixed both (checkout-index with private index; containment refusal); mirror suite 20/20 + 1 SKIP via -File, 21/21 via -Command; real dry run lists 22 = git ls-files. Removed verifier leftovers %TEMP%\ccx-t3v (no links inside).
- 2026-09-25 19:53 +10:00: fresh clone of pushed 3389199 passes both suites (23/23; 20/20 + 1 SKIP). Clone removed. Writing HANDOFF-REPORT.md; session stopping (queue complete).
- 2026-09-27 12:14 +10:00: nursing-a2 MVP built and committed; Codex NA2-REVIEW-1 running; phone page published.
- 2026-09-27 10:56 +10:00: merged claude/ladder-wording-fix (ff to 038824a, both suites pass, branch deleted local+remote); Mythos fixes 000b1a6, c5df6b5 pushed; claude-codex-smoke recycled; claude-codex-template locked (left); OneDrive copy was already gone. Log: %USERPROFILE%\powerlifting-delete.log.
