# External tools for Claude and Codex

User-authorized integration, 2026-10-09. Tools are optional: **ccx alone approves done**. External exit codes and OmO completion checks are evidence, never acceptance. AGENTS.md and CLAUDE.md carry identical External Tools sections and must change together in each commit.

## Operational inventory

| Tool | Available to | Pin | Current verified status / entry point |
| --- | --- | --- | --- |
| [Gajae-Code](https://github.com/Yeachan-Heo/gajae-code) (`gjc`) | Both | v0.15.3, source `103659a2ebf6e698140c021981d47508389a2897` | Existing user-local binary reused; version and smoke PASS. `scripts/gjc.ps1` |
| [Claw-Code](https://github.com/ultraworkers/claw-code) (`claw`) | Both | 0.1.3, source `08106b0c3771ef5b4a5aa176acccd460e88b7325` | Windows gnullvm binary: version/help PASS; live no-tools reply PASS on 2026-10-09 after user configured API billing. `scripts/claw.ps1` |
| [Claude-Red](https://github.com/SnailSploit/Claude-Red) | Both: Claude library, equivalent Codex loader | `739512a8588b28ff3b554e669391c22508602878` | Cloned to `~/.claude/skills/claude-red`; 84 Markdown files; no contents executed. Both skill loaders |
| Generate (`/generate`, in-repo) | Both: Claude skill and shared wrapper | Python 3 stdlib only; no install | Offline self-check and wrapper tests PASS. No provider call made yet: needs a key and user approval. `scripts/generate.ps1`, `.claude/skills/generate/` |
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

Claw: source `$tools\claw-code`, cargo at `~/.cargo/bin`. The old default GNU-target binary `rust/target/release/claw.exe` built but crashed with Windows `0xC0000005`. The coherent LLVM-MinGW build fixed startup: the wrapper selects `rust/target/x86_64-pc-windows-gnullvm/release/claw.exe` with `libunwind.dll` on its child PATH. The integration rebuilt the entire workspace using `cargo build --locked --workspace --release --target x86_64-pc-windows-gnullvm` and the same supported compiler environment; `$tools\integration-claw-workspace-build.ps1` / `.log` record it. Old failing target retained; no Rust install or source patch needed.

Post-install provider checks on 2026-10-09: GJC returned the synthetic `GJC_PROVIDER_OK` response using `--mpreset codex-sol`. Claw returned the synthetic `CLAW_PROVIDER_OK` response with no tool use, then opened its read-only TUI. The user-local `claw-connect-status.json` records `connected`, exit 0; no key or provider response is saved there. Initial failures were a key ID instead of the secret, followed by API billing/credits; the user resolved them. These checks prove bounded provider inference, not a repository-writing task, automatic authentication in another process or future credit availability.

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

## Generate (pay-as-you-go image generation)

In-repo, not an install: `.claude/skills/generate/` holds `generate.py` (stdlib Python 3), `models.json` (model id and per-image cost per provider), `SKILL.md` (Claude's `/generate`) and an offline `test_generate.py`. Both agents run `scripts/generate.ps1 <list|run|gallery>`, which calls `python -I generate.py`; override the interpreter with `CRUCIBLE_PYTHON_EXE`. Codex does not read `.claude/skills`, so it relies on this wrapper and the AGENTS.md section.

- **Providers:** kie.ai (`KIE_API_KEY`), fal.ai (`FAL_KEY`), WaveSpeed (`WAVESPEED_API_KEY`). Routing takes the cheapest provider that has a key and falls back to the next on error. Costs in `models.json` marked estimate (`?` in `list`) are unverified guesses; verify against each provider's pricing page.
- **Keys:** environment or the gitignored repo-root `.env` (also read from the main checkout when run inside a worktree). Never read, print, capture or commit them. The inventory (`check-external-tools.ps1 -Json`) runs only offline `list`.
- **Spend control:** real generation is a paid action (L4). `--dry-run` quotes; `--budget` (default $1.00) refuses an over-budget call before any request. For a ccx task, record approval with `ccx gate -Action paid-action`.
- **Privacy:** prompts go to third-party providers; no workbook-derived or personal data.
- **Output:** `media-out/generations/` (gitignored): images, `log.jsonl`, `index.html` gallery. Inside a worktree this is the worktree's own `media-out/`.
- **Codex limits:** its sandbox may block network; offline commands still work. Claude runs paid calls there.
- **Scope:** text-to-image only (`gpt-image-2`; `nano-banana-pro` on kie). Video and reference-image input are not wired.
- **Checks:** `python -I .claude/skills/generate/test_generate.py` and `scripts/test-external-tools.ps1`.

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

Offline regression: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-external-tools.ps1`. Fake commands in `tests/mocks/` cover arguments/current directory/exits, missing commands, Claude flag/file delivery, UTF-8/order, overwrite rejection, OmO config/hooks, readiness and documentation symmetry. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-claw-credentials.ps1` tests only synthetic encrypted credentials in TEMP, fresh child sessions, metadata probes and environment restoration. Existing core/operations/dispatch/mirror suites still use synthetic fixtures. The original integration is commit `ed30a58`, accepted by ccx and pushed after separate user approval. Its evidence snapshot remains in TASK.md; this follow-up is tracked in `tasks/external-tools-ready.md`. Detailed logs use `$tools\integration-*`; no auth or library contents enter the repo. New delivery actions require their own normal ccx and Git gates.

## Using tools on the next task

Both agents use the same selection rules. Start with `tool: none`; an optional harness should solve a specific gap, not become an extra pass on every task.

| Selection | Useful when | Default fallback |
| --- | --- | --- |
| `none` | Ordinary implementation, review, tests and deterministic work | Normal Claude/Codex dispatch through ccx |
| `gjc` | A task owner wants to evaluate a separately scoped implementation harness | Normal implementation; no recursive harness dispatch |
| `claw` | A focused read-only second opinion on a diff or design is useful and API cost is authorized | Normal cross-model review; a Claw opinion never replaces required reviewers |
| `claude-red` | One reviewed Markdown module directly fits the authorized task | Use the normal task brief; omit unrelated modules |
| `omo` | A longer Codex session benefits from its approved orchestration skills | Ordinary Codex; Claude uses native planning/skills/review |

1. From the repo root, run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-external-tools.ps1 -Json`. It executes only GJC/Claw version and Codex help through the existing wrappers, and checks Markdown storage. It makes no provider request, reads no credential values and installs nothing. `cli-pass` means the CLI check passed; `files-present` means storage exists; `unavailable` means use the fallback. Exit 0 means inventory completed, not universal readiness or acceptance.
2. Claude records the following brief in the task spec or handoff, checks ownership, and prepares the task-owned worktree using HANDOFF.md. Keep the task spec read-only to the external tool. Repository-writing experiments always need the explicit allowlist and isolated worktree; wrapper scripts are not sandboxes.
3. Launch only the selected tool from that worktree, using the absolute path to the repo's wrapper if necessary. Preserve the normal permission controls. Set the time/cost limit before a provider call. Start Claw read-only with `--permission-mode read-only --allowedTools read,glob`. GJC's already-tested Windows provider preset is `--mpreset codex-sol`; tmux remains untested. OmO requires interactive hook approval, not an automatic trust bypass.
4. Capture the final report and exit status in the task's allowed scratch/capture location. Inspect tracked and untracked changes against the baseline and allowlist. Never capture a key, credential prompt, private workbook or unreviewed library contents. A successful tool reply is evidence only.
5. The normal agent reviews the result, runs the task's tests and completes the existing ccx verify/review/done sequence. If the enhancement fails, record the reason, use `tool: none` and continue normal dispatch. Do not add retries, models, automatic routing or permissions to compensate.

```text
tool: none | gjc | claw | claude-red | omo   (select exactly one)
Goal: <one concrete result>
Worktree / baseline: <approved task directory and commit>
May read: <explicit paths; exclude private data>
May write: <exact task allowlist, or none for read-only work>
Limits: <time limit; provider cost ceiling/approval if applicable>
Evidence: <allowed capture path, exit status, diff and tests>
Reviewer: <normal Claude/Codex reviewer; ccx approves done>
Fallback: tool: none; report the enhancement failure
Forbidden: change task/workflow/security controls; commit/push/sync; approve completion
```

### Claw credentials and Windows startup

One-time setup, from the Crucible root in the user's own interactive console:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/connect-claw.ps1
```

Paste the full key at the hidden prompt. The script saves only Windows DPAPI ciphertext to `%LOCALAPPDATA%\Crucible\credentials\claw.dpapi`, with a private Windows-user directory ACL. It does not put the key in Git, a command argument, a global environment variable or a log, and it makes no provider request. DPAPI binds the saved login to the same Windows account/machine; applications running as that user can decrypt it. Do not read, copy, capture, sync or commit that file. A future invalid/revoked/expired key is replaced by re-running setup. To forget the login, the user removes that one ciphertext file privately; provider-side revocation is separate.

For future sessions, both agents use the shared repo wrapper from an approved task worktree:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File '<Crucible-root>\scripts\claw.ps1' --permission-mode read-only --allowedTools read,glob
```

The wrapper automatically decrypts the saved key only when neither `ANTHROPIC_API_KEY` nor `ANTHROPIC_AUTH_TOKEN` was explicitly supplied to the launching process. It sends the saved key using the Bearer transport verified on this installation, restores its parent environment afterward, and never decrypts the store for supported version/help probes. A corrupt or foreign-account store fails with a generic setup instruction rather than falling back to an unexpected credential. An absent store leaves the tool's normal authentication behavior unchanged. A stale explicit environment key overrides saved login; remove it in that launching session if using the saved login.

The older user-local **Claw Connection Setup** shortcut/`claw-connect.cmd` remains a temporary diagnostic in an isolated installation trial. It neither saves credentials nor launches the upcoming task's worktree. Use `connect-claw.ps1` once, then `claw.ps1` for reusable repo login; direct native binary/old `claw.cmd` launches do not load this store. Closing the old setup window after saving no longer affects future repo-wrapper sessions.

Windows Restricted policy blocks direct `.ps1` launchers; the explicit per-process invocation above avoids changing saved policy. `apikey_...` is a key ID, not the secret. Billing errors require the user to check API billing/credits, not another installation or new key. The saved login does not replenish credits or grant additional permissions; external use still spends the user's API credits. Real key entry stays at the interactive console, never in agent prompts or captures.

### Remaining interactive proof

OmO's profile, manifest, hook files, doctor and CLI startup checks pass. A fresh interactive session still needs the user's normal startup hook review and a harmless selected OmO workflow before claiming its hooks executed. Neither help output nor pre-approved files prove that. No external library contents or repository-writing harness trial have been executed as part of installation or this readiness work.
