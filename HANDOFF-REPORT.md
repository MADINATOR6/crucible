# External tools installation checkpoint

Status: PARTIAL (LazyCodex agent-mediated tool use, which needs a human approval, remains unverified; Claw now runs)

Current state (2026-10-04, later): checkpoint commit `7af4696` is pushed to `origin/main` (commit-bound approval A-0017) and the OneDrive mirror was refreshed from it. Claw was rebuilt and runs. The sections below are dated history; where they say "no commit was made", "Claw BLOCKED" or "generation not passed", this block and the "Resume 2026-10-04" section win.

Task / start HEAD: `external-tools-install` / `e8f79b1dc1cd5c36951926de031481add4eccc8b`

Repository: https://github.com/MADINATOR6/claude-codex-collab

Local path: `C:\Users\Madison\code\claude-codex-collab`. Do not use the powerlifting `claude-codex-template` checkout.

## Changes

- `EXTERNAL-TOOLS.md`: pins, user-local locations, verified commands, isolation, adaptations, logs and the Claw runtime blocker.
- `.claude/skills/offensive-reporting/` and `.claude/skills/offensive-bug-identification/`: concise authorized-review adaptations, matching YAML names, pinned provenance and unchanged upstream MIT LICENSE files.
- `AGENTS.md`: one pointer to the separately authorized installation; existing reference sections and external-harness boundary retained.
- `TASK.md` / `MEMORY.md`: Claude-assisted plan, bounded Claw diagnoses, progress and honest pending work.

No control-plane or app code changed. Installations and logs are outside the repo at `C:\Users\Madison\.local\share\claude-codex-tools`, with GJC in `%LOCALAPPDATA%/gjc` and Rust in the standard user directories. No binaries or provider state will be committed or mirrored.

## Checks

- GJC v0.15.3 release SHA256: PASS; `--version` and `--smoke-test`: exit 0. The official PowerShell installer failed to find `Get-FileHash`; the same pinned binary was verified using Python SHA256 and checked before installation.
- Portable Bash version and local command: PASS. Effective GJC shell setting is in its migrated `~/.gjc/agent/config.yml`.
- Isolated LazyCodex/OmO 5.1.13: installer exit 0, doctor 3/3 PASS, 0 failures/warnings after ast-grep bootstrap. Isolated Codex launcher `--version`: exit 0 (`0.160.0`). Bundled comment-checker `--help`: exit 0.
- Primary Codex config/AGENTS/agents/hooks (5 existing files): before/after hashes identical. Authentication material not read or copied. Child launchers preserve parent environment, disable telemetry/auto-update, and default to an empty external trial directory.
- Claude skill-catalog discovery: PASS for both actual installed names/descriptions. Name/frontmatter and unchanged MIT-license checks: PASS. Optional skill-creator Python validator: NOT RUN successfully (PyYAML missing); no success claimed for it.
- Claw locked release build: exit 0 after Claude's diagnoses and child-only compiler/dlltool setup. Runtime `--version`: FAIL, exit `3221225477` / `0xC0000005` with no output. Help/doctor/inference unverified. The artifact is retained for diagnosis and not advertised as ready.
- `git diff --check`: PASS. ccx quick verification: PASS json/secrets/scope/memory; parse N/A (no changed PowerShell).

Full ccx verification passed its applicable json/secrets/scope/memory stages; unchanged control-plane test stages were N/A. Independent read-only Codex verifier `external_tools_verify` reran GJC smoke/version, isolated Codex version/help and OmO doctor, compared all five primary config hashes, checked skill frontmatter/licenses/scope and reproduced the Claw crash. PASS for the honest partial checkpoint; not acceptance of all four.

Claude independently reviewed the tracked diff and every new skill file against receipts (session `6fc21ecd-ce28-4657-8a48-7f8109261533`): PASS for the partial checkpoint. Nonblocking requests were addressed by capturing `claw-runtime-check.json`, naming both hash receipts, and clarifying the three LazyCodex version layers. Claude's final checkpoint/commit step remains pending; do not mark the full task done.

Final review session (2026-10-04): Claude re-checked the three fixes against `claw-runtime-check.json` and `primary-config-before/after.json` (all five hashes identical) and the version-layer note: PASS. `git diff --check` clean. **No commit was made.** In that session, the permission mode denied every `scripts\ccx.ps1` call, so Claude could not rerun full `ccx verify`, record `task review -Id external-tools-install -By claude -Result pass`, or log `ccx gate -Action local-commit`. This report requires full ccx verification before the local commit, and the commit was conditional on logging that gate. WIP is preserved uncommitted. Next session with ccx permitted: run full verify, record the review, log the gate, stage exactly `AGENTS.md TASK.md MEMORY.md HANDOFF-REPORT.md EXTERNAL-TOOLS.md .claude/skills/offensive-reporting/ .claude/skills/offensive-bug-identification/`, then commit. Keep the task blocked and do not run `task done`.

## Resume 2026-10-04 (after the Claude quota reset)

- GJC: `gjc.exe` was missing from `%LOCALAPPDATA%\gjc` and was restored from the retained pinned binary (SHA256 re-checked, L3 gate logged); `--version` and `--smoke-test` exit 0. Codex model selection fixed (source-grounded: discovered models resolve only after a foreground refresh; `--mpreset` forces one) with a user-level `codex-sol` profile in `~/.gjc/agent/models.yml` for the same `openai-codex/gpt-6.1-sol`. Reply-only generation PASS on both subscriptions: ChatGPT (`--mpreset codex-sol`, JSON shows provider/model) and Claude (`anthropic/claude-sonnet-5`, retried once after the reset). No API key, no model substitution.
- LazyCodex: tool use still UNVERIFIED. It needs a person to approve at the interactive prompt; the `never`-policy refusal was not bypassed. Read-only trial command is in EXTERNAL-TOOLS.md.
- Claw: at that point BLOCKED and not executed; a bounded plan was written (an early `.idata` reading of the fault offset was discarded: WER names the module `unknown`). **Later the same day, with the user's chat approval, the plan's one `gnullvm` attempt ran: build exit 0, and `claw --version` / `--help` exit 0 via `claw.cmd`** (first run hit a missing `libunwind.dll`, fixed by a child-only PATH entry). No provider call was made. Details and receipts: EXTERNAL-TOOLS.md.
- Isolation: primary Codex five-file hashes identical (`primary-config-20261004-resume-check.json`).
- Status of the four tools: GJC works on both subscriptions; Claw starts (version/help); LazyCodex generates and doctor passes; two Claude-Red skills work. Still unverified: LazyCodex agent-mediated tool use (needs a human approval at its prompt), any Claw provider call, and any coding-workflow trial of the harnesses.

## Acceptance and next owner

Resume check (2026-10-04): Codex reran full ccx verification successfully (exit 0; json/secrets/scope/memory PASS; unchanged code stages N/A; format/lint SKIP) and confirmed `git diff --check` passed. The current ccx task has a full PASS verification record and remains blocked. Claude was then asked for a bounded read-only Claw startup diagnosis plan, using existing source/tools only. It returned HTTP 429 before any work: "You've hit your session limit", reporting a reset at 5am Australia/Sydney. Receipt: `C:/Users/Madison/.local/share/claude-codex-tools/claude-runtime-plan.json`, session `a93a3c9e-2bbc-40c5-a6f9-09a10a3a401f`. No new plan, review, commit, login, installation or toolchain change occurred. The earlier permission refusals are preserved above; this attempt did not change or bypass those permissions. Claude must still record its own review, log the local-commit gate and make the exact-path checkpoint commit in a permitted session. Reverify after any further edits.

Phases A/B/C/E/F/G: implemented with evidence. Phase D: complete (gnullvm rebuild; `--version`/`--help` exit 0). The task is still not complete and must not be marked done (LazyCodex agent-mediated tool use awaits a human approval; the follow-up docs commit awaits its own push approval).

Claude may review and commit the working three-tool setup and this blocked checkpoint after verification. No new commit-specific push approval exists. The earlier `de368af` approval cannot authorize this commit. A mistyped action `dependency` created unused A-0015; the policy's real `install-dependency` action was then logged as L3 and passed. A-0015 was never approved or used and is not needed for installation.

UNKNOWN: whether Claw's failure comes from this GNU/LLVM runtime combination or the upstream Windows implementation; full coding-workflow compatibility for both harnesses. LazyCodex reply-only generation is confirmed below.

Later user session (2026-10-04): GJC's screenshot shows Anthropic and both Codex login modes connected; the isolated LazyCodex launcher independently reports ChatGPT login. LazyCodex's reply-only generation check passed, exit 0. GJC's Anthropic generation check reached the provider but was quota-rejected (reset reported as 05:00 Australia/Sydney). Its Codex check failed locally at model selection, including one source-guided flag-format retry; the model list nevertheless advertises the selector. (Superseded by the 2026-10-04 resume section above: both GJC providers now pass reply-only generation.) LazyCodex's initial Git Bash handshake warning did not reproduce in direct initialization; its agent-mediated diagnostic was discovered but refused by the restrictive test's approval policy. Do not bypass that refusal. Commands and all receipt filenames are in EXTERNAL-TOOLS.md. Added a tools-dir-only `gjc.cmd` launcher defaulting to the empty trial folder; no upstream source or security setting changed.

At that time, the user had requested safe, efficient unattended continuation and explicitly granted permission to push this task before sleeping (a commit-bound approval, A-0017, was later recorded for `7af4696` from the user's chat approval). This was recorded as user intent, not a fabricated ccx approval; no approval was self-recorded, and no final commit exists yet. Claude retains Git ownership. Next: Claude's permitted review/gate/checkpoint commit, a bounded Claw diagnosis plan, and an interactive isolated coding trial after provider quota and tool approvals permit it. Login is no longer the pending step.

Post-login isolation recheck: the same five primary configuration hashes remain unchanged (`primary-config-post-login-check.json`). Read-only Claw evidence now also includes its latest Windows error event and LLVM PE headers/imports, without re-executing or rebuilding it (`claw-windows-error-event.json`, `claw-pe-inspection.txt`). No root cause is claimed. The tools-dir GJC launcher returned `gjc/0.15.3`, exit 0; no staged changes or new commit exist. Full ccx verification and diff whitespace checks passed after the resumed documentation updates.

CHECKED: exact pinned source/binary artifacts, source build logs, offline checks, profile hashes, selected skill content, licenses and actual Claude discovery.

NEEDED: a commit-bound push approval for the follow-up docs commit; interactive LazyCodex tool approval and an isolated worktree plus task allowlist for any repository-writing harness session; Claude's own ccx review/gate/commit and a satisfied final-commit push gate.
