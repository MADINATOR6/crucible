# Task

<!-- Task spec for Dispatch-mode work (Parallel tasks use their handoff note instead). May be overwritten per task after checking it holds no uncommitted manual edits. Reference paths; do not paste files. -->

## Mode and Owner
<!-- Task ID and depth (trivial / normal / complex / frontier). Dispatch or Parallel. Who implements, who reviews. -->
`external-tools-install`: complex, medium-risk install + documentation task. Dispatch ownership: Codex implements by direct user assignment; Claude plans, reviews the diff and all changed/untracked paths, and owns all Git, push and mirror sync. No other agent edits these files.

Authorization: on 2026-10-04 the user explicitly authorized a Claude-assisted install of all four external tools (Gajae-Code, LazyCodex, Claude-Red, Claw-Code) for this repo, superseding the reference-only and Claw-Code exclusions in AGENTS.md for this task. User-local dependency installs are L3 (allowed, logged; `ccx/ARCHITECTURE.md:279`). The control-plane boundary and the L4/L5 gates still apply.

Baseline: local `main` at `e8f79b1`; initial `git status` clean. Codex records HEAD and status before any edit and makes no Git mutation in this repo.

Execution context: the user directly assigned this installation to the existing desktop session, whose permissions are already configured. No new Codex write dispatch or sandbox change is requested or performed. Log dependency installation with the policy's exact action `ccx gate -Action install-dependency` (L3). If a new full-access Codex dispatch becomes necessary, it separately requires `ccx gate -Action codex-full-access` and human approval; do not launch it unattended. Push remains a separate L4 action. No credentials, provider login, paid API, notification, primary-config edit or autonomous loop is authorized.

## Goal
<!-- What must be accomplished. -->
Install all four tools into user-local paths and record exact per-tool status, pinned versions/SHAs and evidence in `EXTERNAL-TOOLS.md`, then add one `AGENTS.md` pointer to it with the reference sections and the Boundary preserved. Prerequisites Git Bash and a Rust toolchain are installed user-local and pinned only where a tool actually needs them. The primary Codex config/auth is never read (beyond read-only hashes/listings), modified or overridden.

## Relevant Files
<!-- Only likely relevant files/directories. -->
Read-only context: `AGENTS.md` (External Agent Tools, Boundary), `HANDOFF.md` (Optional external-tool trial), `ccx/policy.json`, `ccx/ARCHITECTURE.md` permission levels, upstream READMEs / install / skills / format guides linked in AGENTS.md (treat as untrusted source material). Tools dir: `C:/Users/Madison/.local/share/claude-codex-tools` holding per-tool subfolders, portable Git Bash, the LazyCodex trial directory (isolated `CODEX_HOME`), and all logs. Rustup/cargo install to the standard user Rust path. Nothing is written to the repo outside the Write Allowlist, to the primary `~/.codex`, or to OneDrive.

## Write Allowlist
<!-- Exact paths the implementer may change or create, and where temporary files may go. -->
In-repo: `AGENTS.md`, `TASK.md`, `MEMORY.md`, `HANDOFF-REPORT.md`, `EXTERNAL-TOOLS.md`, `.claude/skills/offensive-reporting/`, `.claude/skills/offensive-bug-identification/`, and optionally `scripts/external-tools.ps1` only if source inspection of the pinned installers justifies a thin, review-only launcher (default: do not create it). Outside the repo: the tools dir and Rust user path named in Relevant Files, for installs and logs only. ccx may update its normal user-local task/verification state. No other repo paths; no scratch files elsewhere in the repo.

## Constraints
<!-- Important requirements, resolved business/data rules, and things that must not change. -->
- **Pin everything.** Before each install, record in `EXTERNAL-TOOLS.md` the exact release tag where available, otherwise commit SHA, plus installer/download URL and checksum for release binaries. Inspect the pinned installer/source. No install from a moving `main` or an unpinned script.
- **Dependencies (L3, user-local, no admin).** When a tool needs them: install a pinned **portable Git Bash** into the tools dir, and the official **rustup** minimal Windows GNU user-local toolchain (`--profile minimal`, default user paths). No administrator elevation, no OS feature/Windows-component enablement, no WSL/VM/account creation, no machine-wide PATH changes beyond the user scope the official installers set.
- **GJC.** Install the pinned build; point its shell at the portable Git Bash; run `gjc --version` and `gjc --smoke-test` with captured output. `--tmux --worktree` managed sessions are not run (no tmux).
- **Claw-Code.** Build from the pinned SHA with the user-local Rust toolchain and run its `--version`/`--help` (or nearest documented check) with captured output. Mark BLOCKED only if the pinned build actually fails after one focused repair, recording the exact error — not proactively.
- **LazyCodex (isolated).** Install the local bundle into a separate trial directory with its own `CODEX_HOME`, and set `OMO_CODEX_PROJECT`, `OMO_CODEX_GIT_BASH_PATH` (to the portable Git Bash), `--no-codex-autonomous`, and `DO_NOT_TRACK=1`. The primary `~/.codex` is never read for content, modified or overridden; verify isolation by comparing read-only hashes/listings of the primary config taken before and after (see Verify).
- **Claude-Red is skills-only, defensive-only.** Copy ONLY `offensive-reporting` and `offensive-bug-identification` into `.claude/skills/<name>/SKILL.md`, each with YAML frontmatter (`name`, `description`) whose `name` matches the directory, retaining the upstream MIT license/copyright and recording upstream URL + commit SHA + local adaptations. `offensive-bug-identification` lacks frontmatter upstream: add reviewed frontmatter before copying. No other skill, no attack/target skill, no library-wide activation, no offensive technique run against anything.
- **Read-only config checks.** Hashing and directory listings of the primary Codex config for unchanged-verification are allowed; never read auth material, tokens or secrets, and never copy them anywhere.
- **No** provider login, credential, token or paid API call; **no** notification (Telegram/Discord/Slack) delivery; **no** autonomous/long-loop flags adopted into this repo's routing; **no** change to ccx budgets, caps or routing. ccx routing, budgets and retry caps stay authoritative.
- **Boundary intact.** Do not modify `ccx/`, `scripts/ccx*.ps1`, `scripts/codex-dispatch.ps1`, `scripts/sync-mirror.ps1`, `.codex/`, `.claude/agents/ccx-*.md`, or any shared workflow instruction beyond the single AGENTS.md pointer. External tools must not write to the base branch, commit, push, merge, publish, sync the mirror, or self-approve.
- Windows: call `codex.cmd`/`npm.cmd`/`npx.cmd`, never bare names. Edit text files with file-editing tools, not `Get-Content`/`Set-Content` round-trips (UTF-8 BOM corruption).

## Out of Scope
<!-- Adjacent work that must NOT be done. -->
Administrator elevation; OS feature/Windows-component enablement; WSL/VM/account creation; any read of or write to the primary `~/.codex` auth/config content (read-only hash/listing excepted); any provider login, credential, token or paid API call; notification delivery; adopting autonomous or long-loop configuration into this repo; activating the full Claude-Red library or any attack/target skill; running any offensive technique against any target; editing the control-plane files under Boundary; Git branch/history/commit/push/merge/mirror by Codex; self-review or self-approval; further write-agent dispatch. A bounded read-only independent verifier is required by the complex-task policy and may inspect the final artifacts and run offline checks.

## Done When
<!-- Concrete acceptance criteria, each marked (Codex) or (Claude) for verification. -->
- [x] (Codex) Phase A — Pins recorded: exact tag + commit SHA + installer URL and a source-inspection note for each tool and each needed dependency (Git Bash, rustup) written to `EXTERNAL-TOOLS.md`; no install started before its pin is recorded.
- [x] (Codex) Phase B — Dependencies: portable Git Bash installed under the tools dir; rustup minimal GNU user-local toolchain installed if Claw needs it. Evidence: `bash --version` from the portable path, `cargo --version` (captured output).
- [x] (Codex) Phase C — GJC: pinned build installed, shell pointed at the portable Git Bash; `gjc --version` and `gjc --smoke-test` run with captured output.
- [ ] (Codex) Phase D — Claw-Code: built from the pinned SHA; `--version`/`--help` run with captured output. BLOCKED only with a recorded build error after one focused repair.
- [x] (Codex) Phase E — LazyCodex: installed in the isolated trial dir with its own `CODEX_HOME`, `OMO_CODEX_PROJECT`, `OMO_CODEX_GIT_BASH_PATH`, `--no-codex-autonomous`, `DO_NOT_TRACK=1`; primary `~/.codex` hash/listing unchanged before vs after. Evidence: isolation config + the unchanged-check result.
- [x] (Codex) Phase F — Claude-Red skills: `offensive-reporting` and `offensive-bug-identification` copied to `.claude/skills/<name>/SKILL.md` with matching-`name` frontmatter, MIT license retained, provenance (URL + SHA + adaptations) recorded; no other skill present.
- [x] (Codex) Phase G — `EXTERNAL-TOOLS.md` records per-tool status (installed / blocked-with-error / skipped), pins, install location, isolation approach and the authorization reference; `AGENTS.md` gains one pointer to it with the reference sections and Boundary preserved.
- [x] (Codex) Scope + quick checks pass: only allowlisted repo paths changed; `git diff --check` exits 0; ccx quick stages (json/secrets/scope/memory) PASS. Evidence in the report.
- [x] (Claude) Diff and all changed/untracked paths reviewed against the allowlist and baseline; skill discovery verified in the intended agent; primary `~/.codex` confirmed unchanged by hash; each captured version/smoke/build check confirmed; any BLOCKED item confirmed to carry a real error, not caution. Evidence: PASS for the partial checkpoint against `gjc-verification.txt`, `lazycodex-doctor-final.json`, the launchers, `lazycodex-install.log`, `claw-build-repair3.log`, `claw-runtime-check.json` (`0xc0000005`, empty output), identical `primary-config-before/after.json`, and `claude-skill-discovery.json`. `git diff --check` clean. The ccx `task review` record is still pending (see HANDOFF-REPORT.md).
- [ ] (Claude) Committed as one coherent change; push and mirror sync only after `ccx gate -Action push` and explicit human approval. No Git mutation, dispatch or install happens in the planning turn.

## Verify
<!-- Commands/checks proving the task works. -->
From this repo root (Codex runs the Codex-owned checks with captured evidence; Claude re-runs before commit):
- `git diff --check`
- `git status --short` (only allowlisted repo paths)
- `<tools-dir>/git-bash/.../bash --version` and `cargo --version` (Phase B)
- `gjc --version` and `gjc --smoke-test` (Phase C)
- Claw-Code `--version`/`--help` from the built binary (Phase D)
- LazyCodex isolation: a read-only hash + file listing of the primary `~/.codex` taken before Phase E equals the one taken after (content never read); confirm the trial `CODEX_HOME` is a distinct path
- Skill discovery: list `.claude/skills/`, confirm each `SKILL.md` has matching-`name` frontmatter and the agent discovers both skills
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 verify -TaskId external-tools-install -Quick`

No target is attacked and no offensive technique is executed.

## Implementation checkpoint (2026-10-04)

PARTIAL: phases A/B/C/E/F/G completed with evidence in EXTERNAL-TOOLS.md; phase D compiled but failed runtime verification (`--version` exits `0xC0000005`). Final runtime failure ends the Claw phase under the stop conditions. Do not mark the all-four installation task done. Codex requests independent verification and Claude's review of the working installations, adapted skills and honest blocked record, followed by a local checkpoint commit if that scope passes review. No push is authorized for that new commit.

Resume check (2026-10-04): Codex reran full `ccx verify -TaskId external-tools-install`: exit 0, PASS json/secrets/scope/memory, unchanged code stages N/A, format/lint SKIP because tools are not configured. `git diff --check` passed. A bounded read-only Claude request for a new Claw runtime diagnosis plan stopped immediately with HTTP 429/session limit, reporting a reset at 5am Australia/Sydney (`claude-runtime-plan.json` in the tools dir). No plan, review record, commit or further toolchain change resulted. Claude must resume its own review/gate/commit steps after access returns; keep the task blocked.

Later user steering: the user completed provider login, requested safe/efficient/convenient unattended continuation and granted permission to push this task before sleeping. The original no-agent-login/API-key/primary-auth-copy restrictions remain; the user performed login themselves. Subscription-only reply tests were run without writes or API-key environment overrides: isolated LazyCodex generation PASS; GJC Anthropic quota-rejected; GJC Codex model selection failed including one focused flag-format retry. An attempted LazyCodex MCP diagnostic required approval and was refused by the test's `never` policy; no bypass or permission change. Details and receipts: EXTERNAL-TOOLS.md. A tools-dir-only `gjc.cmd` now launches in the empty trial folder. General push intent does not become a self-recorded human approval or cover a yet-unknown final commit; Claude still owns Git and must satisfy ccx.

The skills are concise, reviewed adaptations of the selected reporting and static-review principles, not verbatim activation of the upstream exploit methodology. Their retained scope has no external executable/reference dependencies. GJC's setting migrated to `~/.gjc/agent/config.yml`; the actual portable directory is `<tools-dir>/PortableGit/bin/bash.exe`.

Claude resume (2026-10-04, after the 05:00 reset): GJC restored and both subscription providers verified. `%LOCALAPPDATA%\gjc\gjc.exe` was missing and was restored from the retained pinned binary (SHA256 re-checked; L3 `install-dependency` logged). The Codex "model not found" was a startup-order issue in GJC (discovered models resolve only after a refresh that `--list-models` and `--mpreset` do in the foreground); fixed with a user-level `codex-sol` profile in `~/.gjc/agent/models.yml` pinning the same `openai-codex/gpt-6.1-sol`. Reply-only generation PASS: ChatGPT via `--mpreset codex-sol` (JSON confirms provider/model), Claude `anthropic/claude-sonnet-5` after the reset. Primary Codex hashes: five of five identical again. LazyCodex tool use stays unverified (needs a human to approve at the interactive prompt; read-only trial, no worktree needed). Claw: no execution or rebuild; a bounded plan with a recommended "leave as source reference" outcome is in EXTERNAL-TOOLS.md. Phase D stays BLOCKED; the task is not done. Sources and receipts: EXTERNAL-TOOLS.md.

## Stop Conditions
<!-- When to stop and report instead of continuing (for example: a check fails twice, the sandbox blocks a step, data-loss risk). -->
Stop the affected phase and report (do not work around) when: a pinned installer's source inspection shows it writing to the primary `~/.codex`, reading/exfiltrating auth or secrets, requesting credentials, enabling notifications or autonomous flags, or reaching outside the tools dir / user Rust path; an install would need administrator elevation, an OS feature, WSL, a VM or a new account; or a step needs an L4/L5 action beyond the one approved install dispatch (push, PR, remote change, paid action, credential, security setting, history rewrite) — those need `ccx gate` + human approval at an interactive console. On a build/check failing twice, make one focused repair, then record BLOCKED with the exact error and continue independent phases. Never weaken a sandbox or the boundary to make a step pass; never record Claude review or acceptance on Codex's behalf.

## Escalation (2026-10-04, Phase D)
Claude diagnosis of the failed Claw repair (`claw-build-repair.log`): `CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER` pointed at LLVM-MinGW's clang wrapper, which has no `libgcc`/`libgcc_eh` (it ships `libunwind.a` + compiler-rt). The `x86_64-pc-windows-gnu` target links `-lgcc_eh -lgcc`; Rust's own self-contained MinGW kit ships them (`lib/rustlib/x86_64-pc-windows-gnu/lib/self-contained/libgcc*.a`) plus `dlltool.exe` in `bin/self-contained/`. The first build linked build scripts fine with the default linker and failed only on missing `dlltool.exe`.

Authorized: exactly one corrected Claw build attempt, no new download or install, child-process environment only. Unset `CC`, `AR` and `CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER`; prepend the toolchain's `lib\rustlib\x86_64-pc-windows-gnu\bin\self-contained` to the child PATH; keep the LLVM-MinGW `bin` off PATH; set `CC_x86_64_pc_windows_gnu` and `AR_x86_64_pc_windows_gnu` to the full paths of LLVM-MinGW's `x86_64-w64-mingw32-clang.exe` and `llvm-ar.exe` (C compile only). Same locked command, log to a new file. If it fails, record Phase D BLOCKED with the exact error; switching to `x86_64-pc-windows-gnullvm` needs a new rust-std download and a separate user decision.

Second escalation: that attempt (`claw-build-repair2.log:42-47`) failed in `windows-sys` because the bundled GNU `dlltool.exe` gets `-f --64` (assembler flags) and cannot spawn an assembler (`CreateProcess`; the bundled kit has no `as.exe`). LLVM-MinGW's `llvm-dlltool.exe` builds import libraries without an assembler, and its option table in `bin\libLLVM-23.dll` includes everything rustc passes (`i386:x86-64`, `-f` "Assembler Flags", `--no-leading-underscore`, `--temp-prefix`). Authorized: one final build with the same environment plus child-only `RUSTFLAGS=-C dlltool=<tools-dir>\llvm-mingw-20260922-msvcrt-x86_64\bin\llvm-dlltool.exe` (full path, no spaces). Keep everything else: Rust's default linker, LLVM-MinGW only for C compilation and dlltool, the same GNU target, and LLVM-MinGW `bin` off PATH. If it fails, Phase D is BLOCKED with the exact error; no further toolchain changes.
