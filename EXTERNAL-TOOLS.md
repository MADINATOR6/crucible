# External tools installation

User authorization: unattended installation of all four tools with Claude's help, 2026-10-04. Claude plans and reviews; Codex installs and verifies. These optional tools do not replace ccx or its approval gates. The user subsequently completed login and requested unattended continuation, including permission to push this task after review. No agent may impersonate the human approver; the final commit-specific ccx gate still applies.

## Pinned sources and inspection

Installation files, source checkouts and logs are outside the repository at `C:\Users\Madison\.local\share\claude-codex-tools`.

| Tool | Pin | Source inspection | Current status |
| --- | --- | --- | --- |
| Gajae-Code | `v0.15.3`, commit `103659a2ebf6e698140c021981d47508389a2897` | Tagged Windows installer: official binary + SHA256 manifest, version/smoke checks, user PATH and Bash settings. Binary-only installation; no source installer. | Installed; version and smoke PASS; subscription generation PASS for Claude and ChatGPT (2026-10-04 resume) |
| LazyCodex | wrapper `0.2.2`, commit `9b003a2a7742333a8fad6728bb8a8a4212f372ac`; OmO runtime `oh-my-openagent@5.1.13`, npm gitHead `294a165e320314b130526b2a1326368ef14bfb57` | Wrapper fetches a moving OmO package; used the exact pinned package instead. Reviewed installer supports a separate `CODEX_HOME`, bin directory and project directory, explicit autonomous-permissions opt-out, and telemetry opt-out. | Installed in separate profile; doctor 3/3 PASS |
| Claude-Red | snapshot `739512a8588b28ff3b554e669391c22508602878` (no release tag selected) | Full source staged for reference. Installed only two concise adaptations of the reporting and static-review principles, with no external executable or attack-material dependencies. | Two project skills installed; Claude catalog discovery PASS |
| Claw-Code | snapshot `08106b0c3771ef5b4a5aa176acccd460e88b7325`, workspace version `0.1.3` (no upstream releases/tags found) | Real Rust CLI, built from `rust/`; crates.io stub is not used. Source build records provenance. | Built a second time with a coherent LLVM-MinGW `gnullvm` toolchain: `--version` and `--help` PASS via `claw.cmd` (2026-10-04 resume). The first GNU-target build crashed at startup (kept as evidence). No provider inference tested |

Source repositories: [Gajae-Code](https://github.com/Yeachan-Heo/gajae-code), [LazyCodex](https://github.com/code-yeongyu/lazycodex), [Claude-Red](https://github.com/SnailSploit/Claude-Red), [Claw-Code](https://github.com/ultraworkers/claw-code).

Prerequisites are user-local: PortableGit `2.56.0.windows.1` (GitHub SHA256 `eceb5e061aa90df2f69ddd3e90f0030e1b8037a7829934bc40e4be1caa1accc1`) and rustup `1.28.2` Windows GNU installer (official SHA256 `ccbfd951d8024856043b3a0c3903a59f39937bce8d3074768b0d3da55f21e817`), with Rust `1.99.0-x86_64-pc-windows-gnu` (official stable manifest dated 2026-10-01). Downloads: [PortableGit release](https://github.com/git-for-windows/git/releases/tag/v2.56.0.windows.1), [rustup binary](https://static.rust-lang.org/rustup/archive/1.28.2/x86_64-pc-windows-gnu/rustup-init.exe), [pinned OmO tarball](https://registry.npmjs.org/oh-my-openagent/-/oh-my-openagent-5.1.13.tgz), [GJC tagged installer](https://raw.githubusercontent.com/Yeachan-Heo/gajae-code/v0.15.3/scripts/install.ps1). OmO tarball verified against npm SHA512 integrity; receipt retained outside the repo. No WSL, tmux, admin installation or OS feature changes.

## Installed locations and verified commands

These are machine-local installations, not vendored application dependencies. The repository contains the two selected skills and this record. Nothing automatically adds these tools to ccx routing. Commands below were checked on this host on 2026-10-04.

```powershell
$toolsDir = 'C:\Users\Madison\.local\share\claude-codex-tools'
& "$env:LOCALAPPDATA\gjc\gjc.exe" --version
& "$env:LOCALAPPDATA\gjc\gjc.exe" --smoke-test
& "$toolsDir\lazycodex-doctor.cmd"
& "$toolsDir\lazycodex-codex.cmd" --version
```

- GJC returned `gjc/0.15.3` and `smoke-test: ok`, both exit 0. SHA256: `d574517f49c8dbbbbe79ad5f082dadae5bee52bb17bb138b1af5720852794402`, checked against the tagged release manifest. The official installer failed because its PowerShell subprocess could not resolve `Get-FileHash`; Python SHA256 verification and the same version/smoke checks completed the binary installation instead. No user PATH change was needed.
- On the 2026-10-04 resume `%LOCALAPPDATA%\gjc\gjc.exe` was absent (cause UNKNOWN; the earlier receipts show it installed). It was restored by copying the retained pinned `gjc-v0.15.3.exe` after re-checking its SHA256 (same value as above, matching the release manifest), logged as L3 `install-dependency`. `--version` and `--smoke-test` re-ran: exit 0. The existing provider logins were evidently intact, since both providers generated afterwards (inferred from that, not from reading any auth store; none was read). Receipt: `gjc-restore-receipt.json`.
- GJC's Bash path is `PortableGit\bin\bash.exe` under the tools directory. Version `5.3.15(2)` and a local Bash command passed. GJC migrated the initially written `~/.gjc/agent/settings.json` to `~/.gjc/agent/config.yml`, retaining the JSON as `.bak`; the effective YAML contains the shell path. No tmux/WSL mode was installed or tested.
- LazyCodex's actual runtime is pinned OmO `5.1.13`. Installer exit 0; doctor final result: 3 passed, 0 failed, 0 warnings. The local Codex launcher returned `codex-cli 0.160.0`, exit 0. The user subsequently signed in to the isolated profile; `login status` reports ChatGPT and a reply-only provider check passed (see below). No primary authentication material was copied.
- Claude Code's actual skill catalog discovered `offensive-reporting` and `offensive-bug-identification` with their installed descriptions. Both have matching frontmatter names, pinned provenance and identical upstream MIT LICENSE files. The optional skill-creator validator could not run because that Python environment lacks PyYAML; independent frontmatter/name/license checks passed instead. The adaptations are self-contained, and omit upstream exploit steps and uninstalled references.

## LazyCodex isolation and use

The installer used `install --no-tui --no-codex-autonomous --skip-auth` through the pinned package's generated local installer, not the moving `npx` alias. Its profile is `lazycodex-profile`; its empty default project is `lazycodex-trial`, both under the tools directory. The local launchers set the following in their child process only:

- `CODEX_HOME` to that separate profile;
- `OMO_CODEX_PROJECT` to the trial directory and `OMO_CODEX_GIT_BASH_PATH` to portable Bash;
- `OMO_RUNTIME=node` and `OMO_WRAPPER_PACKAGE_ROOT` to the pinned package;
- `DO_NOT_TRACK=1`, `OMO_DISABLE_POSTHOG=1`, `LAZYCODEX_AUTO_UPDATE_DISABLED=1` and `OMO_CODEX_AUTO_UPDATE_DISABLED=1`.

The Codex launcher defaults its working directory to the empty trial directory. For a real repository trial, Claude must first create a task-owned isolated worktree and file allowlist under HANDOFF.md, then explicitly select that directory. Never run a new harness against the base checkout or pass autonomous-permission flags. The separate profile isolates configuration; it is not an OS security sandbox and does not enforce ccx ownership by itself.

Version layers differ: the staged LazyCodex alias source is `0.2.2` and was not executed; installation used OmO distribution `5.1.13` directly, whose generated installer reports `0.1.0` in doctor. The runtime launchers bind to the pinned distribution.

Before/after hashes covered the primary `~/.codex/config.toml`, `AGENTS.md`, and the three files in `agents/` (5 existing files; `hooks/` does not exist): identical. Authentication files were not read or copied. The parent process environment was unchanged. The installer did not create a collab-repo `.codex` change.

The same five primary configuration files were hashed again after the user's logins and the provider checks: all unchanged. Receipt: `primary-config-post-login-check.json`. The check does not inspect authentication files.

The initial doctor warned about missing ast-grep. The reviewed bundled bootstrap's `worker --once --only sg --codex-home <isolated-profile>` provisioned pinned ast-grep `0.43.0` from its SHA256-checked manifest; final doctor has no issues. The `@code-yeongyu/comment-checker@0.8.0` Windows binary is already bundled and its `--help` passes. Doctor's generic PATH tool inventory still says `commentChecker: false`; that does not describe the plugin's bundled binary. No postinstall-script permission was weakened to download it.

## Claw-Code: first build blocked, second build works

**Update (2026-10-04 resume): Claw now runs.** The section below documents the first (GNU-target) build, which crashed; it is kept as history. The `gnullvm` rebuild described in "Claw runtime plan" succeeded and passes `--version` and `--help`. Details:

- Build: `cargo build --locked --release --target x86_64-pc-windows-gnullvm -p rusty-claude-cli --bin claw`, exit 0 in 162 s, child-only environment: LLVM-MinGW clang as linker and for C, `llvm-ar`, `-C dlltool=<llvm-dlltool.exe>`, LLVM bin off PATH, Rust's GNU self-contained `bin` first on PATH (for host build scripts), and `CC`/`AR`/`ANTHROPIC_*`/`OPENAI_API_KEY`/`GEMINI_API_KEY` removed. `--locked` fetched the `windows_x86_64_gnullvm` crates (0.52.6, 0.53.1) from crates.io. The exact script is `claw-gnullvm-build.ps1` in the tools dir. Log: `claw-build-gnullvm.log`. Output: `claw-code\rust\target\x86_64-pc-windows-gnullvm\release\claw.exe` (SHA256 `239b9880664535ba90ba2f3f5870e53533746cf34c4481b3b7fd890b016b940d`). The old GNU-target artifact is untouched.
- First run: exit `0xC0000135` (DLL not found; not the old crash and not a build error; an independent re-run without the PATH entry reproduces it, though that first run left no receipt of its own). The only non-system import is `libunwind.dll`. This was a deviation from the plan's "record BLOCKED and stop on failure", taken under TASK.md's one-focused-repair rule. One focused repair, no rebuild: run with LLVM-MinGW's `x86_64-w64-mingw32\bin` on the child PATH. Then `--version` printed `Claw Code 0.1.3`, Git SHA `08106b0c3771` (matches the pin), target `x86_64-pc-windows-gnullvm`, exit 0 (`claw-gnullvm-runtime-check.json`); `--help` exit 0 (`claw-gnullvm-help-check.txt`).
- Launcher: `& "$toolsDir\claw.cmd" --version` (tools-dir only; sets that PATH for the child, nothing machine-wide).
- The crash of the first build cannot be attributed with certainty to the mixed toolchain; what is observed is that this build has a single set of imports (the first had duplicate descriptors for five DLLs: KERNEL32 and ntdll x3; advapi32, ws2_32 and api-ms-win-core-synch x2) and starts. Not tested: any provider call, `doctor`, the REPL, tool use. Claw remains marked "not recommended for production work" in AGENTS.md; no API key or subscription credential was used or is needed for the checks above.

### First build (GNU target, crashed)

The source checkout is `claw-code` under the tools directory. Cargo and rustc `1.99.0` are in `C:\Users\Madison\.cargo\bin`. The source was not patched; builds used its committed lockfile:

```text
cargo build --locked --release -p rusty-claude-cli --bin claw
```

The first build failed on missing `dlltool.exe`. The pinned portable [LLVM-MinGW 20260922 MSVCRT x64 compiler](https://github.com/mstorsjo/llvm-mingw/releases/download/20260922/llvm-mingw-20260922-msvcrt-x86_64.zip), GitHub SHA256 `1e936a4a694fc27f9625e3311f5ec5d6d99abfeaa514fd41c52a4f8347145d1a`, supplies C compilation for locked `ring`/`onig` dependencies. A repair using its clang wrapper as the Rust linker failed on missing `libgcc` libraries. Claude diagnosed that mismatch and the bundled GNU dlltool's missing assembler.

Claude's final supported environment retained Rust's default GNU linker, used LLVM clang/llvm-ar for C only, kept LLVM bin off PATH, and set child `RUSTFLAGS=-C dlltool=<LLVM llvm-dlltool.exe>`. That release build succeeded in 2m23s, with one upstream unused-import warning. However, `claw.exe --version` then exited `3221225477` (`0xC0000005`, access violation) with no output, using a child environment with provider keys removed. It is **not a working installation**. Help/doctor/provider execution are unverified. No more toolchain changes were made after the final failed runtime check.

Logs retained in the tools directory: `claw-build.log`, `claw-build-repair.log`, `claw-build-repair2.log`, `claw-build-repair3.log`, `claw-runtime-check.json` (exit code, binary hash, stdout/stderr), both Claude diagnosis JSON reports, `gjc-verification.txt`, `lazycodex-doctor-final.json`, and `claude-skill-discovery.json`. The unchanged primary configuration hashes are in `primary-config-before.json` and `primary-config-after.json` under that same directory; the independent verifier compared them with the five current files. The broken artifact remains at `claw-code\rust\target\release\claw.exe` for diagnosis, with no PATH entry or launcher advertising it as ready.

Read-only follow-up used existing tools without executing Claw again: the latest Windows application-error event names `claw.exe`, exception `c0000005`, module `unknown`, fault offset `000000000113a2fc` (`claw-windows-error-event.json`). LLVM PE inspection confirms an AMD64 executable, image base `0x140000000`, entry-point RVA `0x13F0`, and an import of `msvcrt.dll` (`claw-pe-inspection.txt`, exit 0). These are diagnostic inputs, not a proven cause. No rebuild, source patch, debugger installation or further toolchain change followed; Claude's bounded runtime plan follows in the next section (option 2 was later executed; see the update at the head of that section).

### Claw runtime plan (written in the 2026-10-04 resume; option 2 was later executed, see the update above)

When this plan was written, no Claw execution, rebuild or toolchain change had happened in the resume. Read-only re-inspection of the existing artifact (LLVM `objdump`/`readobj` on the file only): the PE imports are split into duplicate descriptors per DLL (`KERNEL32.dll` x3, `ntdll.dll` x3, `advapi32.dll`, `ws2_32.dll` and `api-ms-win-core-synch-l1-2-0.dll` x2 each) plus `msvcrt.dll`, consistent with import objects from more than one producer (MinGW CRT libs and `llvm-dlltool`-generated libs) joined by GNU `ld`. This is a lead, not a cause: the Windows error event names the faulting module `unknown`, so the recorded fault offset `0x113a2fc` must not be read as an offset inside `claw.exe` (an earlier match to `.idata` was discarded for that reason).

Options, cheapest first. All stay inside the tools dir / user Rust path, no admin, no WSL, no OS feature, and none starts without the user's decision:

1. **Leave Claw as a source reference (recommended).** AGENTS.md already marks it "excluded from adoption"; GJC and LazyCodex cover the use case. Keep the source checkout and receipts; remove nothing.
2. **One coherent-toolchain attempt.** `rustup target add x86_64-pc-windows-gnullvm` (user-local rust-std download, size and SHA recorded first), then one locked release build of `rusty-claude-cli --bin claw` with LLVM-MinGW's clang as linker and `llvm-dlltool`, no mixed GNU/LLVM pieces. Check `claw --version` once with provider keys removed. Success: exit 0 and a version string. Failure (same crash or a new build error): record BLOCKED and stop; no further rebuilds.
3. **Upstream report only.** If option 2 also crashes, capture the exact commit, Rust version, toolchain and the receipts above for an upstream issue; do not debug the crash locally.

**Option 2 authorized by the user (chat, 2026-10-04: "I approve of anything that needs to be done and fixed", user away).** Pin recorded before install: rust-std component `rust-std-1.99.0-x86_64-pc-windows-gnullvm`, added to the existing `1.99.0-x86_64-pc-windows-gnu` toolchain with `rustup target add x86_64-pc-windows-gnullvm`; rustup downloads from the official `static.rust-lang.org` stable-1.99.0 manifest and checks the manifest SHA256 itself. User-local under `~/.rustup`, no admin. Build output goes to a separate `--target` directory so the old artifact stays untouched. One attempt, then record the result and stop. **Result: built and runs; see the update at the head of the Claw section.** Options 1 and 3 are no longer needed.

MSVC (Visual Studio Build Tools) is out of scope: it needs a large machine-wide installer.

## Remaining user session

### Launch and login

From PowerShell, each launcher opens in the empty trial directory. Neither should be used on the base repository for coding work. GJC has an interactive `/login` menu for `anthropic` (Claude subscription) or `openai-codex` (ChatGPT subscription). The installed LazyCodex edition uses Codex's ChatGPT login.

```powershell
$toolsDir = 'C:\Users\Madison\.local\share\claude-codex-tools'
& "$toolsDir\gjc.cmd"
# In another terminal:
& "$toolsDir\lazycodex-codex.cmd"
# Check the isolated Codex login:
& "$toolsDir\lazycodex-codex.cmd" login status
```

### Provider checks after user login (2026-10-04)

- The user's GJC login-menu screenshot shows Anthropic, browser Codex and device Codex as logged in. This is login evidence, not a generation test.
- GJC's reply-only Anthropic check selected `anthropic/claude-sonnet-5`, medium effort, with built-in tools, MCP, LSP and session persistence disabled. It reached Anthropic, which returned HTTP 429: the five-hour usage window was exhausted. The returned reset timestamp is 2026-10-04 05:00 Australia/Sydney. Receipt: `gjc-connection-check.log`. No retry loop or API-key fallback was enabled.
- GJC's reply-only Codex check selected `openai-codex/gpt-6.1-sol`; it failed before a provider call with `Model "openai-codex/gpt-6.1-sol" not found`. One source-guided retry using separate `--provider openai-codex --model gpt-6.1-sol` flags failed identically. The local model list advertises that selector. Receipts: `gjc-codex-connection-check.log`, `gjc-codex-connection-repair.log`.
- **GJC Codex resolved (2026-10-04 resume).** Root cause, from the pinned v0.15.3 source: `gpt-6.1-sol` is not in GJC's built-in catalog; it is discovered online with the ChatGPT login. `--list-models` runs a foreground `refresh("online-if-uncached")` first (`main.ts:1479-1480`), so it lists the model. A plain `-p --model` run resolves the selector against the startup registry before any refresh (`main.ts:1159-1176`; deferred pattern fails at `session.ts:3332-3360`), so it fails; the registry refresh only runs in the background afterwards. `--mpreset` / `modelProfile.default` take the other branch and refresh in the foreground before activation (`main.ts:508-511`). Fix: one user-level profile in `~/.gjc/agent/models.yml` (GJC's own documented location, no auth content): `codex-sol` requiring `openai-codex`, default `openai-codex/gpt-6.1-sol:low`. Same model, no substitution, no API key. Verified with `gjc --mpreset codex-sol --no-tools --no-lsp --no-mcp --no-session --no-title --no-rules -p "Reply with exactly: GJC_CODEX_OK"`: exit 0, output `GJC_CODEX_OK`; a `--mode json` repeat shows `"provider":"openai-codex"`, `"model":"gpt-6.1-sol"`, `"api":"openai-codex-responses"` (only those fields retained, since raw JSON can carry account data). Receipts: `gjc-codex-mpreset-check.log`, `gjc-codex-mpreset-json-fields.json`. The foreground refresh applies to headless/print runs; interactive `--mpreset` prefers cached models first (`main.ts:495-506`), and the background refresh after startup is at `main.ts:1852-1853`. Use `--mpreset codex-sol` for any headless Codex run until upstream resolves selectors after refresh. The session path above is `sdk/session.ts`.
- **GJC Claude retried once after the reset (2026-10-04 resume).** `gjc --model anthropic/claude-sonnet-5 --thinking medium` with the same reply-only flags: exit 0, output `GJC_CLAUDE_OK`; no API-key variable was set and the inherited `ANTHROPIC_BASE_URL` was cleared for the child. Receipt: `gjc-claude-retry-check.log`. Both GJC subscription providers now generate. Reply-only generation is not a coding-workflow trial.
- Isolated LazyCodex: `login status` returned `Logged in using ChatGPT`; a read-only, ephemeral reply-only `exec` returned `LAZYCODEX_CONNECTION_OK`, exit 0. Receipt: `lazycodex-connection-check.jsonl`. This verifies provider generation, not a coding workflow.
- The first LazyCodex run logged a Git Bash MCP handshake failure. Direct initialization of the cached server and initialization using the launcher's actual MCP metadata both passed with empty stderr. Receipts: `lazycodex-git-bash-initialize.json`, `lazycodex-git-bash-installed-spec.json`. A subsequent agent test discovered `mcp__git_bash__diagnose`, but its call was refused: `MCP tool call requires approval, but approval policy is never`. Receipt: `lazycodex-mcp-discovery-check.jsonl`. The restrictive test remains intact; an interactive approval is still needed to verify agent-mediated MCP use. No permission setting, tool annotation or cached upstream source was changed.

LazyCodex tool use is still **unverified** (2026-10-04 resume): approval can only come from a person at the interactive prompt, and the restrictive `never` test was not bypassed. To verify it, run `& "$toolsDir\lazycodex-codex.cmd"` in a terminal (it opens in the empty trial folder), ask it to call the Git Bash `diagnose` tool, and approve the prompt yourself. That trial is read-only and needs no worktree. No repository-writing external-harness trial has run. Before one, Claude must prepare an isolated worktree and task allowlist under HANDOFF.md, then the user can approve the tool operations in that interactive trial. No subscription entitlement or unlimited usage is claimed. Claw now starts (see its update above) but has had no provider call; do not use a Claude subscription credential as an Anthropic API key. No phone delivery, remote messaging, attacks or API-key billing were enabled.

Claude owns review and the local commit. A push requires a new approval naming the final commit; the earlier approval for `de368af` does not cover this change. Local binaries and provider state are not committed or copied to OneDrive.
