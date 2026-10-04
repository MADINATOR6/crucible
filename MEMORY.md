# MEMORY.md

Operating state for autonomous sessions on this repo. Read first every session. Cap 400 lines; archive old entries to MEMORY-ARCHIVE.md.

## Active task (2026-10-04 evening, unattended; user said "full access, do your best, ill be away")
- `lifting-tracker` (master prompt `prompts/lifting-tracker-master-prompt.md`): offline PWA in `lifting-tracker/` (plain ES modules, no deps; `node --test` from that folder; `node lifting-tracker/dev-server.mjs`). Workbook used for inspection: `~/Downloads/Madison Arnido (2).xlsx` (private; `*.xlsx` gitignored; never give it to Codex or commit derived data). Findings are in `lifting-tracker/ARCHITECTURE.md`.
- Done and merged on main: gitignore rule, `xlsx.js` reader, LT-1 core (e1RM/PRs/weeks/muscles/schedule/lifts/rpe) and LT-7a plates logic via Codex (re-registered as LT-1r/LT-7ar after a bookkeeping error), UI shell (train/muscles/progress/plates/data), store + backup, PWA files.
- LT-0 importer: Codex implemented in worktree `.ccx-worktrees/codex-LT-0` (task LT-0r), real-workbook smoke check passed (13 blocks, 66 weeks, 1465 date-reps converted, 11 unparsed cells). Codex verifier run in progress; then fix, review, commit, merge. Remove hard-coded name regex in `programme.js` (line ~187) when merging.
- Friction logged: ccx task `owns` entries for directories need a trailing `/`; `node --test <dir>` fails on Node 24 (use `node --test` in the folder or a glob); `task start -Worktree` needs an absolute path.
- Not pushed. No user approval for push exists for this work.

## Earlier task (2026-10-04)
- `external-tools-install` [complex, medium risk, Dispatch]: user-authorized, Claude-assisted install of all four external tools (GJC, LazyCodex, Claude-Red 2 defensive skills, Claw-Code) for this repo. Supersedes the AGENTS.md reference-only + Claw exclusions **for install only**; control-plane boundary, Security and L4/L5 gates still bind. User-local dep installs are L3 logged (ARCHITECTURE.md:279).
- Plan is TASK.md at clean baseline `e8f79b1`. Codex implements; Claude reviews/commits. Work runs in the user's existing desktop session: no new full-access write dispatch and no sandbox change. Registered ccx task; exact `install-dependency` L3 gates passed. A mistyped unknown action `dependency` created unused approval A-0015; it is not needed for the correctly logged L3 installs and was never approved or used.
- Installed and checked: GJC v0.15.3 at `%LOCALAPPDATA%/gjc/gjc.exe` (version/smoke exit 0); isolated OmO 5.1.13 under `%USERPROFILE%/.local/share/claude-codex-tools/lazycodex-profile` (doctor 3/3, no warnings); two concise Claude-Red project skill adaptations (matching names, MIT notices, actual Claude skill-catalog discovery PASS). GJC migrated its Bash setting to `~/.gjc/agent/config.yml`; portable Bash check passes.
- Primary Codex config/AGENTS/agents/hooks hash baseline (5 existing files) unchanged; no auth read/copied. Local LazyCodex launchers use child-only profile settings, opt out of telemetry/auto-update, and default to the empty external trial directory. No credentials, notifications, attacks, autonomous permissions or paid provider calls enabled. No WSL, admin or OS feature changes.
- (Superseded: Claw now runs, see the later resume entry) BLOCKED Phase D: pinned Claw 08106b0 compiled with Rust 1.99.0 GNU plus portable LLVM-MinGW 20260922 after Claude's bounded diagnoses. Final build exit 0; `claw.exe --version` exits 3221225477 (0xC0000005) without output. Do not claim it works. Exact environment and logs: EXTERNAL-TOOLS.md; no more toolchain changes after this final runtime failure.
- 2026-10-04: Codex verifier `external_tools_verify` PASS (honest partial); Claude final doc review PASS. Not committed: the session permission mode denied `scripts\ccx.ps1` (verify/review/gate), so the ccx steps and the commit are still pending (HANDOFF-REPORT.md).
- 2026-10-04 resume: Codex full ccx verify exit 0 (applicable stages PASS) and diff check PASS. New read-only Claude runtime-plan request returned HTTP 429/session limit before work, reporting reset at 5am Australia/Sydney; receipt `claude-runtime-plan.json` in tools dir. No new plan, review record, commit or toolchain change.
- Later user session (GJC generation status superseded by the resume entry below): GJC screenshot shows Claude and Codex logins; isolated LazyCodex `login status` confirms ChatGPT and reply-only generation PASS. GJC Anthropic generation is quota-rejected until reported 05:00 Sydney; Codex generation failed at local model selection, including one focused retry. LazyCodex Git Bash initialization passes directly; an agent diagnostic was discovered but approval-refused in the restrictive test. No bypass. Tools-dir `gjc.cmd` added for convenient empty-trial launch. Receipts/details: EXTERNAL-TOOLS.md. User granted unattended push intent; do not impersonate a human ccx approver or transfer Claude's Git ownership.
- 2026-10-04 12:xx resume (Claude, after reset): GJC exe restored from pinned binary (L3 logged); Codex selection fixed via user profile `codex-sol` (`--mpreset`); Claude and ChatGPT reply-only generation PASS; primary hashes identical; Claw plan written, nothing executed; LazyCodex tool approval needs the user. Then verify, review, gate, commit; push needs a commit-specific human approval.
- 2026-10-04 later (user away, approved "anything that needs to be done and fixed"): checkpoint 7af4696 pushed (A-0017, commit-bound) and mirrored. One bounded Claw `gnullvm` rebuild (rust-std 1.99.0 via rustup, L3 logged): build exit 0, `claw.cmd --version/--help` exit 0 after a child-only PATH fix for libunwind.dll; Phase D done. Follow-up commit carries these docs; needs its own commit-bound push approval. Still open: LazyCodex tool approval (human at prompt); task stays blocked, no `task done`.
- 2026-10-04 later still: user said "approve lazy codex ... do it yourself". Terminal tools cannot send TUI keys, so a temporary single-tool `approval_mode="approve"` for `git_bash.diagnose` went into the isolated LazyCodex config; read-only `exec` test completed (status ready, exit 0), config restored (hash matches), primary hashes identical. All four tools pass their stated checks; Claw provider call, LazyCodex TUI prompt and repo-writing trials remain untested. Final docs commit follows the commit-bound gate.
- (Superseded by the entries above) Next: Claude resumes in a permitted session after quota returns: reverify changed files, record its own ccx review, log `gate -Action local-commit`, then make the exact-path local checkpoint commit; keep task PARTIAL/BLOCKED until Claw runtime is repaired. A new bounded Claw runtime plan is still required before toolchain changes. Login is complete; GJC generation, interactive LazyCodex tool approval and isolated coding trials remain pending. Any new full-access dispatch needs its own approval; the final commit's push gate must pass (old de368af approval does not apply). Preserve prior operating history below.

## Current state
- Project: claude-codex-collab (Claude Code + Codex workflow template)
- Last task commit: c5df6b5 (Mythos check fixes); the stop-report commit follows it
- Task: ccx upgrade (user's CLAUDE_CODEX_MASTER_UPGRADE_PROMPT, 2026-09-30) on branch claude/architecture-audit-migration-649829 from c2f515b. Queue below.
- Status: ccx upgrade COMPLETE (2026-10-01 ~15:00). All tasks CCX-2..7 done via ccx; final gate test-ccx 30/30, ops 16/16, dispatch 46/46, mirror 22/22; health exit 0. Nothing pushed; merge into main + push await the user's approval. Baseline tests at c2f515b: dispatch 23/23, mirror 21/21 + 1 skip.
- Next: on approval, merge branch into main (no-ff), run suites on main, `ccx gate -Action push`, push, then sync-mirror if a copy exists.
- Next (exact): 1) CCX-4c: fast-forward .ccx-worktrees/codex-CCX-4 to the tip, dispatch `-TaskId CCX-4 -Role verify -TaskFile tasks\CCX-4c.md -Sandbox workspace-write` (write the spec: re-check F1, F3 incl. residuals, F5, bold status). 2) Record reviews; `task done` CCX-3, CCX-4, CCX-6. 3) CCX-5b: `ccx worktree add -TaskId CCX-5b`, dispatch `-TaskId CCX-5b`, verify, review, done, commit, merge-check, merge. 4) Final suites, health, HANDOFF-REPORT.md, ask for push approval (`ccx gate -Action push`).
- Open: measure Codex code size (ladder effect) on the next real Dispatch task; none existed on 2026-09-27.

## Task queue (2026-09-30 ccx upgrade)
Roles per the user: Claude Opus 5.5 max = architecture, orchestration, decisions, review; Codex gpt-6-astra high (xhigh on failure or ambiguity) = implementation, tests, independent review.
- [x] CCX-0 [trivial, Claude] Launcher `-Model` and low/xhigh/max effort, so dispatches can run Astra. 26/26.
- [x] CCX-1 [complex, Codex] ccx core + CLI: state/lock, tasks/ownership, OMNIROUTE router, gate/approvals, events, telemetry, quick checks. Codex hit the usage limit after finishing; Claude review fixes.
- [x] CCX-2 [complex] ccx-ops. Codex WIP (usage limit), Claude finished; CCX-4 F2/F4 fixed and re-verified by Codex (CCX-4b PASS); ccx task done.
- [ ] CCX-3 [complex] Launcher integration. Codex WIP, Claude finished; CCX-4 F5 fixed (regression test passes); awaiting Codex re-verification (CCX-4c).
- [ ] CCX-4 [complex, Codex verify] Adversarial verifier: 5 findings (F1-F5), all fixed; CCX-4b re-verified F2/F4 PASS, F3 FAIL (residuals, now fixed as CCX-6), F1/F5 not reached (usage limit).
- [x] CCX-5a [routine] End-to-end trial: routed Codex low, post-checks, verify, review, done, merge-check, merge. Found the worktree-add base bug.
- [ ] CCX-5b [routine] Dispatch test per-run scratch; blocked by ownership until CCX-3 is done (correct).
- [ ] CCX-6 [complex, Claude] F3 residuals: per-worktree baselines. Awaiting Codex re-verification (CCX-4c).
- [x] Docs, agents, rollback rehearsal (tree == c2f515b after revert; old suites pass), memory consolidation, real health (exit 0).

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
- 2026-09-30 | OMNIROUTE = local policy router (`ccx/policy.json` + `scripts/ccx.ps1 route`), not the OmniRoute gateway | 2026-09-26 rejection stands (third-party proxy of prompts and credentials); the upgrade prompt forbids bypassing provider controls | CCX-1
- 2026-09-30 | Kairos-style runtime = durable event queue + idempotent `tick`; no daemon or service | Event-driven, bounded, reversible; a scheduled tick stays optional and user-installed | CCX-2
- 2026-09-30 | Shared state in `<git common dir>/ccx/` | Shared by every worktree, never committed or mirrored, unwritable from Codex's sandbox | CCX-1
- 2026-09-30 | Codex model gpt-6-astra for dispatches; user's pasted GPT-5.3-Codex is not in the Codex catalog (models_cache.json); global default stays gpt-6-sol | Upgrade prompt names Astra; catalog lists astra/sol/luna and gpt-5.6-*, efforts low..max(/ultra) | CCX-0
- 2026-09-30 | Effort escalates one ladder step on a failed attempt or ambiguity, capped by class; max needs 2 failed attempts | User: HIGH, failure/ambiguity -> XHIGH; prompt: max only with representative failures | CCX-1
- 2026-09-30 | L5 approvals need a human at an interactive console; L4 also accepts a quoted chat approval | Agents' shells have redirected stdin, so they cannot approve through the CLI; Codex cannot write state at all | CCX-1
- 2026-09-30 | ccx task worktrees under `.ccx-worktrees/` (gitignored) inside the repo | User rule: work only inside claude-codex-collab; `.claude/worktrees/` belongs to the desktop app | CCX-2
- 2026-09-30 | `nursing-a2/` in this worktree is untracked study data left from branch claude/uts-nursing-assessment-reviewer-013cf5; never read, scan or stage it | Unrelated private data | -
- 2026-09-30 | Private paths live in policy `privacy.excludePaths` (nursing-a2/), not in code | Codex hard-coded nursing-a2 into ccx-core; a template must not | CCX-1 review
- 2026-09-30 | Task owner decides the agent for its own type; `task escalate` records a model escalation (attempts restart, max effort still counts earlier failures) | Router returned premium forever: nothing incremented modelEscalations | CCX-1 review
- 2026-09-30 | Codex usage limit at 12:32 after ~35 min of Astra-high (earlier Codex use today); route defers Codex work until 16:21; Claude does review, docs and non-Codex work meanwhile | Policy onUnavailable=defer; user assigned implementation to Codex | CCX-1
- 2026-09-30 | ccx test suites are slow (~700 s) because a bare `powershell -NoProfile` start costs ~4.3 s on this host; policy/root caching did not change suite time | Measured | CCX-1 review
- 2026-10-01 | User chose: Claude finishes CCX-2/CCX-3 from Codex's partial work; Codex's next window (06:06) goes to independent verification (CCX-4) and the E2E trial | Codex limit hit again after 19 min of two parallel Astra-high runs | CCX-2, CCX-3
- 2026-10-01 | Codex WIP committed on codex/ccx-2 and codex/ccx-3, merged into the session branch; Claude finishes there | The desktop app blocks this session from editing files outside its own worktree (.ccx-worktrees is under the main checkout) | CCX-2, CCX-3
- 2026-10-01 | Usage-limit runs do not consume a retry, get a distinct event key, and are ignored by adaptive stats | Found by dogfooding: quota exits would otherwise raise effort and burn quota faster | CCX-3 review
- 2026-10-01 | Codex quota on this account: ~35 min of Astra-high per window; hit 4 times (12:32, 01:25 x2, 07:05). Spend it on independent verification first; one Codex task at a time | Measured | all
- 2026-10-01 | CCX-4 independent verifier (Codex, 149k effective tokens) found 5 real defects none of our tests caught (PEM body leak, committed-code verify gap, baseline laundering, rename scope, explicit-effort cap bypass); all fixed with regression tests | Cross-model verification pays | CCX-4
- 2026-10-01 | Verify-type tasks need deterministic + cross-model review, no verifier of their own | Master prompt: no reviewer-of-reviewer | CCX-4
- 2026-10-01 | All CCX-4 findings confirmed fixed by Codex (4b: F2, F4; 4c: F1, F3 paths, F5; 4d: F3 legacy, status parse); CCX-3 closed at the 2-cycle cap | Cross-model loop closed with evidence | CCX-3, CCX-6
- 2026-10-01 | `.codex/agents/` excluded locally (.git/info/exclude): the Codex app's external-agent sync writes lossy converted copies of .claude/agents into worktrees (no read-only sandbox, text mangled) | Scope check flagged it; machine-local artifact, reported to user | -

## Open questions
- RESOLVED 2026-10-01 by the user: Codex verifier only on risky work; Claude finishes after two Codex failures (maxDispatches 2); 4-hour stop for unattended sessions (Claude's choice); MEMORY.md for unattended or long sessions. Merged branches deleted (mythos-upgrade, architecture-audit). Codex app agent sync turned off (backup ~/.codex/config.toml.bak-ccx-20261001). Powerlifting folder: user does not care; drop it.
- 2026-10-01 providers added to OMNIROUTE (ARCHITECTURE 5.3). Ollama 0.35.0 installed (winget) with qwen2.5-coder:3b and qwen3:4b; both failed a one-file codex exec edit on the 4 GB GPU, so local providers are disabled. Later: provider ollama-cloud (nemotron-3-super:cloud, free plan) passed and is the Codex-limit fallback; routine/normal Codex work moved to gpt-6.1-sol. Gemini CLI (API key, free tier 20 requests/day) added ahead of it; providers at their own limit are skipped (state.providerLimits). Full chain verified live. DeepSeek/Gemini: disabled; Codex CLI rejects `wire_api = "chat"` (verified), so they need a /v1/responses endpoint or proxy first.
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
- (2026-09-25 checkpoints: MEMORY-ARCHIVE.md)
- 2026-09-27 10:56 +10:00: merged claude/ladder-wording-fix (ff to 038824a, both suites pass, branch deleted local+remote); Mythos fixes 000b1a6, c5df6b5 pushed; claude-codex-smoke recycled; claude-codex-template locked (left); OneDrive copy was already gone. Log: %USERPROFILE%\powerlifting-delete.log.
- 2026-09-30 11:55 +10:00: ccx upgrade start (attended; user set Claude max, Codex high). Audit done, baseline recorded, CCX-0 done, policy + CCX-1 spec written; dispatching CCX-1.
- 2026-09-30 13:10 +10:00: CCX-1 Codex exit 4 (usage limit, no report; edits complete, 28/28). Claude review fixes (policy caching, privacy.excludePaths, defaults, owner routing, task escalate, Start-CcxTask); docs, agents, task specs written. Next: commit CCX-1, prepare worktrees, dispatch CCX-2 + CCX-3 at 16:21.
- 2026-10-01 01:05 +10:00: session resumed after an interruption (the 16:24 resume never ran). test-ccx 29/29 (836 s). Committing CCX-1 and docs; dispatching CCX-2 and CCX-3 in parallel worktrees.
- 2026-10-01 01:40 +10:00: CCX-2 and CCX-3 Codex both exit 4 at 01:25 (resets 06:06); WIP committed (e826230, 41db4e0); user chose Claude finishes, Codex verifies. CCX-3 merged (b038223) with retry/event-key fixes; suites running. Removed 5 stale test scratch dirs left by the interrupted Codex runs.
- 2026-10-01 03:10 +10:00: CCX-2/CCX-3 finished and committed; suites test-ccx 29/29, test-ccx-ops 13/13, test-codex-dispatch 45/45; `ccx verify` PASS for both (full). Rollback rehearsed (tree == c2f515b, old suites pass). Real `ccx health` exit 0 (only WARN: Codex unavailable until 06:06). CCX-5a worktree ready (.ccx-worktrees/codex-CCX-5a); CCX-5b refused until CCX-3 is done (ownership). Cron 06:08 queued: dispatch CCX-5a (-TaskId), then CCX-4 verifier (-TaskId CCX-2 -Role verify -TaskFile tasks\CCX-4.md -Sandbox workspace-write). Pending: CCX-4 reviews for CCX-2/3 (owner claude, so review by codex), task done, CCX-5 flow, final report, push approval.
