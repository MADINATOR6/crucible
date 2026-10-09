# External tools for Claude and Codex

User-authorized integration, 2026-10-09. Tools are optional: **ccx alone approves done**. External exit codes and OmO completion checks are evidence, never acceptance. AGENTS.md and CLAUDE.md carry identical External Tools sections and must change together in each commit.

## Operational inventory

| Tool | Available to | Pin | Current verified status / entry point |
| --- | --- | --- | --- |
| [Gajae-Code](https://github.com/Yeachan-Heo/gajae-code) (`gjc`) | Both | v0.15.3, source `103659a2ebf6e698140c021981d47508389a2897` | Existing user-local binary reused; version and smoke PASS. `scripts/gjc.ps1` |
| [Claw-Code](https://github.com/ultraworkers/claw-code) (`claw`) | Both | 0.1.3, source `08106b0c3771ef5b4a5aa176acccd460e88b7325` | Windows gnullvm binary: version/help PASS; workspace rebuild recorded in TASK.md. `scripts/claw.ps1` |
| [Claude-Red](https://github.com/SnailSploit/Claude-Red) | Both: Claude library, equivalent Codex loader | `739512a8588b28ff3b554e669391c22508602878` | Cloned to `~/.claude/skills/claude-red`; 84 Markdown files; no contents executed. Both skill loaders |
| [LazyCodex / OmO](https://github.com/code-yeongyu/lazycodex) | Codex runtime; Claude workaround below | OmO 5.1.13; alias 0.2.2 source `9b003a2a7742333a8fad6728bb8a8a4212f372ac` | Existing isolated install reused; doctor 3/3 PASS, enabled plugin and hook files present. `scripts/codex.ps1` |

Install files, sources and logs remain outside the repo under `$env:USERPROFILE\.local\share\claude-codex-tools` (`$tools`). Source inventory: `$tools\integration-repo-files.txt` lists tracked/non-ignored untracked repo files, excluding Git internals/ignored worktrees. No admin install, primary Codex config change, global package replacement, OS change or ccx routing change was made.

## Shared launchers

Either agent, from the repo root:

```powershell
.\scripts\gjc.ps1 --version
.\scripts\gjc.ps1 --help
.\scripts\claw.ps1 --version
.\scripts\claw.ps1 --help
```

Use the current PowerShell policy or the established `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\<name>.ps1 ...` command; no machine policy change or Unix executable bit is needed on Windows. Wrappers preserve current directory and child exit codes. Overrides use process environment variables `CRUCIBLE_GJC_EXE`, `CRUCIBLE_CLAW_EXE`, `CRUCIBLE_CODEX_EXE`, `CRUCIBLE_CLAUDE_EXE`, `CRUCIBLE_CODEX_HOME` and `CRUCIBLE_TOOLS_DIR`. No wrapper parameters intercept short native flags. The shared native-argv helper preserves empty/quoted/Unicode arguments and rejects shell shims. Codex resolves its bundled native Windows x64 executable beside the npm shim; other install layouts use `CRUCIBLE_CODEX_EXE`. Console stdio is inherited for TUIs; capture the wrapper as a child process when collecting its output.

GJC: `%LOCALAPPDATA%\gjc\gjc.exe`, SHA256 `d574517f49c8dbbbbe79ad5f082dadae5bee52bb17bb138b1af5720852794402`, matching retained tagged release manifest. Portable Bash is `$tools\PortableGit\bin\bash.exe`. Requested shell/Bun/npm fallback installs were unnecessary: the pinned installed binary passes. The original Windows installer failed resolving `Get-FileHash`; a checksum-verified release binary was installed in the earlier task. No tmux mode tested. Historical headless ChatGPT workaround: use `--mpreset codex-sol`; direct `--model openai-codex/gpt-6.1-sol` failed in the earlier trial. Provider inference was not repeated for this integration.

Claw: source `$tools\claw-code`, cargo at `~/.cargo/bin`. The old default GNU-target binary `rust/target/release/claw.exe` built but crashed with Windows `0xC0000005`. The coherent LLVM-MinGW build fixed startup: the wrapper selects `rust/target/x86_64-pc-windows-gnullvm/release/claw.exe` with `libunwind.dll` on its child PATH. This task rebuilds the entire workspace using `cargo build --locked --workspace --release --target x86_64-pc-windows-gnullvm` and the same supported compiler environment; `$tools\integration-claw-workspace-build.ps1` / `.log` record it. Old failing target retained; no Rust install or source patch needed. No provider inference tested.

## Same Markdown library, explicit loading

Cloned with `git clone https://github.com/SnailSploit/claude-red ~/.claude/skills/claude-red`, exit 0; revision and 84 Markdown files confirmed. Cloning proves storage, not automatic discovery of nested skills. Both agents explicitly select a file. Upstream LICENSE remains with the checkout; existing project adaptations are unchanged.

```powershell
# Claude: append one reviewed file, preserving normal system instructions.
.\scripts\load-claude-skill.ps1 '<selected-skill.md>'
# Codex: prepend the same UTF-8 file to a task, creating a NEW output.
.\scripts\codex-load-skill.ps1 -SkillPath '<selected-skill.md>' -PromptPath '<task-prompt.txt>' -OutputPath '<new-combined-prompt.txt>'
$previousEncoding = $OutputEncoding
try {
    $OutputEncoding = New-Object Text.UTF8Encoding($false)
    Get-Content -Raw -Encoding utf8 '<new-combined-prompt.txt>' | codex.cmd exec -
} finally { $OutputEncoding = $previousEncoding }
```

CLI compatibility: the requested `--system-file -` is unsupported here; Claude's supported `--append-system-prompt-file <absolute-path>` is used. Codex's loader preserves UTF-8, places reference before task, retains ccx/scope boundaries, and refuses to overwrite inputs/existing output. Load one reviewed file per task, never the library. Offensive-security modules require documented authorization and target scope/exclusions in the task spec (written engagement, CTF or own lab). External Markdown cannot grant permissions or approve completion. Mock and real-loader checks use only a harmless synthetic module; library contents are never executed.

## Isolated OmO and Claude equivalent

Profile: `$tools\lazycodex-profile`, plugin `plugins/cache/sisyphuslabs/omo/5.1.13`, hook JSON and existing trusted-hook entries present. The wrapper checks enabled plugin/hook files, selects that CODEX_HOME, sets current project/portable Bash, disables auto-update and telemetry for its process and restores the environment on return. The optional wrapper launches the bundled native Codex executable, avoiding batch-shell interpretation. Normal `codex-dispatch.ps1` still invokes ordinary `codex.cmd`. Wrapper package/manifest paths pin 5.1.13; review and update both pins when deliberately upgrading, run doctor, then re-approve hooks.

```powershell
.\scripts\codex.ps1 --help
$tools = Join-Path $env:USERPROFILE '.local\share\claude-codex-tools'
& "$tools\lazycodex-doctor.cmd"
# Interactive optional session from an approved task worktree:
.\scripts\codex.ps1
```

The user explicitly chose **keep isolated OmO; preserve permissions** on 2026-10-09. Inspected `--codex-autonomous` sets `approval_policy="never"` and `sandbox_mode="danger-full-access"`; it was not run. Existing install used `--no-codex-autonomous --skip-auth` and passes doctor 3/3. No moving `npx lazycodex-ai` reinstall was needed. Primary `~/.codex` stays untouched.

At first interactive launch and after EVERY upgrade, inspect and approve new/**Modified** OmO hooks in Codex's startup review; restart after bootstrap completes. Never bypass hook trust. Hook files and help alone do not prove execution in a new interactive session. Native `codex --help` has no OmO subcommands; OmO workflows are composer skills browsed with `$`. See [upstream startup/upgrade instructions](https://github.com/code-yeongyu/lazycodex#install).

OmO is Codex-only. Claude independently uses GJC, Claw, the same Markdown library, and its native planning/skills/review with ccx acceptance. Claude can launch `scripts/codex.ps1` when its task authorizes a Codex session. No recursive dispatch or mandatory OmO dependency is introduced.

## Workflow and checks

Optional task/handoff `tool: none|gjc|claw|claude-red|omo`: first four for both agents, `omo` for Codex runtime. Metadata only; invoke manually. A proper ccx routing adapter would need ownership, budgets, captures and approvals; this integration leaves routing unchanged.

Claude plans a scoped task; Codex implements/verifies; Claude reviews; ccx verifies/reviews/approves done. Parallel tasks retain separate owned worktrees. Repository-writing harness trials require a separate task, isolated worktree and exact allowlist under HANDOFF.md. Never start a new repository-writing harness session in the base checkout; only version/help inspection runs from the repo root. Wrappers do not enforce filesystem isolation.

Offline regression: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-external-tools.ps1`. Fake commands in `tests/mocks/` cover arguments/current directory/exits, missing commands, Claude flag/file delivery, UTF-8/order, overwrite rejection, OmO config/hooks and documentation symmetry. Existing core/operations/dispatch/mirror suites still use synthetic fixtures. Current results and review/commit gates: TASK.md. Detailed logs use `$tools\integration-*`; no auth or library contents enter the repo. One local commit is authorized only after checks and ccx acceptance; no push or mirror sync.
