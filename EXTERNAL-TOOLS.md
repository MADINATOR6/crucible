# External tools for Claude and Codex

User-authorized integration, 2026-10-09. Tools are optional: **ccx alone approves done**. External exit codes and OmO completion checks are evidence, never acceptance. AGENTS.md and CLAUDE.md carry identical External Tools sections and must change together in each commit.

## Operational inventory

| Tool | Available to | Pin | Current verified status / entry point |
| --- | --- | --- | --- |
| [Gajae-Code](https://github.com/Yeachan-Heo/gajae-code) (`gjc`) | Both | v0.15.3, source `103659a2ebf6e698140c021981d47508389a2897` | Existing user-local binary reused; version and smoke PASS. `scripts/gjc.ps1` |
| [Claw-Code](https://github.com/ultraworkers/claw-code) (`claw`) | Both | 0.1.3, source `08106b0c3771ef5b4a5aa176acccd460e88b7325` | Windows gnullvm binary: version/help PASS; live no-tools reply PASS on 2026-10-09 after user configured API billing. `scripts/claw.ps1` |
| [Claude-Red](https://github.com/SnailSploit/Claude-Red) | Both: Claude library, equivalent Codex loader | `739512a8588b28ff3b554e669391c22508602878` | Cloned to `~/.claude/skills/claude-red`; 84 Markdown files; no contents executed. Both skill loaders |
| Generate (`/generate`, in-repo; images and video) | Both: Claude skill and shared wrapper | Python 3 stdlib only; no install | Offline self-check and wrapper tests PASS. No provider call made yet: needs a key and user approval. `scripts/generate.ps1`, `.claude/skills/generate/` |
| Higgsfield (hosted MCP `https://mcp.higgsfield.ai/mcp`; CLI `@higgsfield/cli`) | Both: Claude `.mcp.json` + skill; Codex `.codex/config.toml` or the CLI (media tasks); the CLI works in either agent's shell | MCP: no install, OAuth sign-in per client. CLI 1.2.2 via npm (user-installed 2026-10-25), `higgsfield auth login` once | Claude MCP signed in; generations 2026-10-24 (keeper smoke test 5 credits, poodle test 162.75). Codex 2026-10-25: the CLI ran in `codex exec` with full access (account status, model get, result download, ffmpeg); Codex's repo MCP server is not signed in; the Codex Apps connector showed the same balance and plan (very likely the same account). `.claude/skills/higgsfield/` (workflow `playbook.md`; shared bookkeeping wrapper `scripts/higgsfield.ps1`, offline, checked by `scripts/test-higgsfield.ps1`); workflow in HANDOFF.md, Media task |
| Nursing notes (`nursing-notes`, in-repo) | Both: Claude skill and shared wrapper | PowerShell 5.1 only; no install, no provider calls | Wrapper `show/new/check` tested by hand under 5.1. `scripts/nursing-notes.ps1`, `.claude/skills/nursing-notes/` |
| Blender (`blender`, in-repo; Blender itself is a separate free install) | Both: Claude skill and shared wrapper | Scripts need Blender 4.4+; wrapper PowerShell 5.1; helpers stdlib Python 3. No install, no network | 2026-11-16, Linux cloud session: `test_blender.py` 11/11 PASS against the `bpy` 5.3.0 wheel (real Cycles CPU renders, resume, settings-mismatch refusal, audit flags an auto-run text block and a scripted driver); wrapper exercised under PowerShell 7.4 with a bpy-backed stand-in for `blender`. 2026-11-16, Windows 10, PowerShell 5.1, Blender 5.3.0 (`Program Files`, not on PATH): `version` PASS; `test_blender.py` under Blender 12/12 OK, scene tests ran; `blender.ps1 test` 9 pass, 3 skipped (no `bpy`). Smoke on a synthetic 64x36 four-frame, two-camera scene: `audit` exit 0; Cycles CPU render 4 frames, re-run 4 skipped, `-Samples 3` refused (exit 2); `check -Cuts 3` PASS; a `use_module` text block audits exit 3; `-Device GPU` warned that Cycles has no active GPU device (Preferences > System: NONE) and rendered on the CPU. Negative frames (`-Frames -2--1`) render, `check` and trip the mismatch guard. Inventory row `blender` (offline `version`) cli-pass. 2026-11-23, Windows 11, Blender 5.2.3: GPU render PASS on an NVIDIA GeForce RTX 3050 Laptop GPU (4 GB, driver 610.60) with the OptiX backend (CUDA also lists it; HIP and oneAPI list nothing). The GPU fallback warning was a setting, not a driver problem: Preferences > System > Cycles Render Devices was NONE; after OptiX was saved with only the GPU ticked, `-Device GPU` ran without a warning and `nvidia-smi` showed 91-97% use. Synthetic 640x360 scene (plane, 20 glossy and glass spheres, sun and area light), frames 1-10 at 64 samples: CPU (Ryzen 7 5800H) 7.08 s/frame, GPU (OptiX) 2.22 s/frame, 3.2x faster; `check` PASS on both; frame 5 SSIM 0.99999 CPU vs GPU. One-frame backend check: OptiX 2.25 s, CUDA 2.69 s. `scripts/blender.ps1`, `.claude/skills/blender/` |
| [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (`mpt`, short-video assembly) | Both: shared wrapper | 1.3.10, source `86e45a2233a72c41d83389ac5cb49bbf5f6a847d` (MIT), uv-locked venv on CPython 3.11.16 | Installed 2026-11-23 under `$tools\MoneyPrinterTurbo`. Wrapper `version` PASS; 16 refusal cases (paid sources, `=` and abbreviated options, music, voices, missing script) exit 2; free trial render PASS, repeated after the allowlist change with an in-repo `MPT_HOME` set (ignored) (synthetic local clips, Edge TTS `en-US-AndrewNeural`, word-by-word captions, no music: 1080x1920 H.264/AAC, 7.6 s). Edge TTS failed intermittently (`NoAudioReceived`) and passed on the second run. `scripts/mpt.ps1` |
| [Gemini API CLI](https://github.com/google-gemini/gemini-api-cli) (`gemini-api`, video/audio/PDF/image understanding) | All three: shared wrapper | v0.5.0 release `gemini-api_Windows_x86_64.zip`, SHA256 `d2bc738fb8c83f663e1fca5e3382876dcbde54880c7375cfcb49351298b264ec` (matches the release `checksums.txt`; the binary is unsigned) | Installed 2026-11-27 to `%LOCALAPPDATA%\Crucible\tools\gemini-api\v0.5.0\bin`. Wrapper tests 9/9 (fake binary); live dry run PASS (the CLI shows the key as `[REDACTED]`). `scripts/gemini-api.ps1` |
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

## Generate (pay-as-you-go image and video generation)

In-repo, not an install: `.claude/skills/generate/` holds `generate.py` (stdlib Python 3), `models.json` (model id and per-image cost per provider), `SKILL.md` (Claude's `/generate`) and an offline `test_generate.py`. Both agents run `scripts/generate.ps1 <list|run|gallery>`, which calls `python -I generate.py`; override the interpreter with `CRUCIBLE_PYTHON_EXE`. Codex does not read `.claude/skills`, so it relies on this wrapper and the AGENTS.md section.

- **Providers:** kie.ai (`KIE_API_KEY`), fal.ai (`FAL_KEY`), WaveSpeed (`WAVESPEED_API_KEY`). Routing takes the cheapest provider that has a key and falls back to the next on error. Costs in `models.json` marked estimate (`?` in `list`) are unverified guesses; verify against each provider's pricing page.
- **Keys:** environment or the gitignored repo-root `.env` (also read from the main checkout when run inside a worktree). Never read, print, capture or commit them. The inventory (`check-external-tools.ps1 -Json`) runs only offline `list`.
- **Spend control:** real generation is a paid action (L4). `--dry-run` quotes; `--budget` (default $1.00) refuses an over-budget call before any request. For a ccx task, record approval with `ccx gate -Action paid-action`.
- **Privacy:** prompts go to third-party providers; no workbook-derived or personal data.
- **Output:** `media-out/generations/` (gitignored): images, `log.jsonl`, `index.html` gallery. Inside a worktree this is the worktree's own `media-out/`.
- **Codex limits:** its sandbox may block network; offline commands still work. Claude runs paid calls there.
- **Models:** images `gpt-image-2` (kie, fal, WaveSpeed) and `nano-banana-pro` (kie); video `seedance-2-fast` (kie, fal, WaveSpeed) and `kling-2.6` (kie), both text-to-video and image-to-video. Video quotes are per second (`cost_s` x `--duration`), validated against each model's allowed durations and aspect ratios before any spend. A local `--image` is sent as a base64 data URI, which only fal is configured to accept (`data_uri`); kie and WaveSpeed need a public URL. The fal Seedance fast cost (about $2.42 per 10 s at 720p) is from fal's model page; the other video costs are estimates. Not wired: end-frame, reference images/video/audio, video edit or extend. Video work goes through Higgsfield (HANDOFF.md, Media task); use these video models only when the user asks for Generate by name.
- **Checks:** `python -I .claude/skills/generate/test_generate.py` and `scripts/test-external-tools.ps1`.

## Blender (3D scenes, realism and batch rendering)

In-repo, not an install: `.claude/skills/blender/` holds `SKILL.md` (the method; Codex prints it with `scripts/blender.ps1 show`), `NOTICE.md` (sources and licences) and `scripts/`: `audit.py` and `render.py` run inside Blender, `check_frames.py` and `crucible_blender.py` run in any Python 3, `test_blender.py` is the offline self-test. Both agents run `scripts/blender.ps1 <show|version|audit|render|check|test>`.

- **Blender:** free from blender.org; the user installs it. Lookup: `CRUCIBLE_BLENDER_EXE`, then `blender` on PATH, then the newest `Program Files\Blender Foundation\Blender *\blender.exe`. Python for `check`/`test`: `CRUCIBLE_PYTHON_EXE`, else the first `python`/`python3` that is not the Microsoft Store stub in `WindowsApps`, else the newest `%LOCALAPPDATA%\Programs\Python\Python3*\python.exe`.
- **Safety:** `audit` runs with `--factory-startup --disable-autoexec` and exits 3 when the file holds text blocks, scripted drivers, OSL script nodes or linked libraries. `render` adds `--disable-autoexec` unless `-TrustedFile`. Add-ons are read before installing; compiled-only add-ons are not installed. No live socket bridge into the user's Blender by default.
- **Renders:** background only, absolute output paths, PNG sequence `f_####.png`, finished frames skipped on re-run, `render-manifest.json` refuses to mix frames after the `.blend` or settings changed (exit 2), `status.json` holds progress and ETA. `check` (ffmpeg when on PATH, else a pure-Python PNG reader) fails on missing, half-written, black or undecodable frames and on brightness jumps outside `-Cuts`.
- **Output:** gitignored `media-out/blender/<project>/`. Never commit `.blend` files, renders or downloaded assets.
- **Codex limits:** its sandbox may not start `blender.exe` (as with the WinGet ffmpeg); then Claude runs Blender and Codex reviews the saved scripts, reports and stills.
- **Checks:** `scripts/blender.ps1 test`; the inventory (`check-external-tools.ps1 -Json`) runs only offline `version`, never a render. Without `bpy` the two scene tests are skipped and reported; under Blender's Python (`blender --background --python-exit-code 1 --python .claude/skills/blender/scripts/test_blender.py`) or a venv with the `bpy` wheel they run.

## MoneyPrinterTurbo (short-video assembly)

Script, voiceover, captions, footage and music into a finished 9:16, 16:9 or 1:1 MP4. It assembles; Higgsfield still generates video. Install: `git clone --depth 1` into `$tools\MoneyPrinterTurbo`, then `uv sync --frozen --no-dev --python <uv CPython 3.11 python.exe>` there (uv's `3.11` link step failed on this machine, so the interpreter path is explicit). Both agents run `scripts/mpt.ps1 <version|help|run -Project <name> <cli.py args...>>`; override the install with `CRUCIBLE_MPT_DIR`.

- **Free path, enforced:** `run` accepts only an allowlist of full option names (argparse abbreviations and unknown options are refused) and requires `--video-script` (no LLM), `--video-source local --video-materials <clips>` (Higgsfield or Blender output), `--bgm-type none`, or `custom` with `--bgm-file <name>` of your own track in `%LOCALAPPDATA%\Crucible\mpt\storage\bgm`, and either an Edge TTS voice (`--voice-name en-US-AndrewNeural-Male`, no key), `no-voice` or `--custom-audio-file`. Captions: `--subtitle-display-mode word_by_word`; size 60 reads small on 1080x1920, use about 90. Edge TTS is Microsoft's unofficial endpoint and failed intermittently in the trial; MPT retries three times, and a second run passed.
- **Paid and off-limits:** not every paid path needs a `--confirm-*-charge` flag (Codex review: `openai_image` footage, Sonilo/ElevenLabs music from `SONILO_API_KEY`/`ELEVENLABS_API_KEY` in the environment, provider-prefixed or `-V2` voices, LLM scripts), so the wrapper allows only the free path above rather than blocking known paid options. Using any of those runs MPT directly as a separate L4 decision with a quote and approval; WaveSpeed stays off.
- **Storage:** the wrapper always sets `MPT_HOME` to `%LOCALAPPDATA%\Crucible\mpt` (config, keys, auth tokens, task folders), ignoring any inherited value so nothing lands in the checkout; it copies `final-*.mp4` to gitignored `media-out/mpt/<project>/`.
- **Rights:** upstream notes its bundled `resource/songs` come from YouTube videos; never use them (`--bgm-type random`) for anything published. Its own TikTok, Instagram and YouTube posting is not used; publishing needs its own explicit request. Its agent "Skill" quick start (fetch a remote SKILL.md and follow it) is not used.
- **Codex limits:** its sandbox may block Edge TTS network and ffmpeg; then Claude renders and Codex reviews the saved script, SRT and output.
- **Checks:** `scripts/mpt.ps1 version`; the inventory (`check-external-tools.ps1 -Json`) runs only that.

## Gemini API (video, audio, PDF and image understanding)

Google's `gemini-api` CLI on the user's `GEMINI_API_KEY`, an AI Studio key with its own tier, separate from the Google AI Pro plan that covers Antigravity. Without billing it is the free tier, where Google may use what is sent to improve its products. All three agents run `scripts/gemini-api.ps1`; override the binary with `CRUCIBLE_GEMINI_API_EXE`.

- **Allowed:** `version`; `analyze -Source <file|YouTube URL> [-Source ...] [-Question <text>] [-DryRun]`; `transcribe -Source <file> -Out <file> [-Format md|text|json|srt] [-DryRun]`. Default models only (`gemini-4-hydrogen`, `gemini-3.5-transcribe`). Requests are not stored server-side (the CLI's default).
- **Refused before anything is sent:** every other command (generate, image, video, music, tts, agents, files, credentials, triggers), any other option, URLs other than YouTube, and private paths: `privacy.excludePaths` (`nursing-a2/`), `.env*`, keys and certificates, workbooks (`*.xlsx`, `*.xls`, `*.xlsm`), `lifting-tracker/private/`, `Status/.runs/` and `.git/`. Transcripts land only under this checkout's gitignored `media-out/`, checked on the resolved folder, so a link cannot redirect them into a tracked file here or in another checkout.
- **Use it for** non-private recordings, screen captures, PDFs and public YouTube links. Claude's `claude-video-vision` stays the Claude-only route for frame-by-frame work. Codex's sandbox may block the network; then Claude or Gemini runs it and Codex works from the saved output.
- **Checks:** `scripts/test-gemini-api.ps1` (offline, fake binary).

## Antigravity MCP plugin (Rea and Higgsfield for Gemini)

`.agents/plugins/crucible-tools/` gives Antigravity the same pinned `rea` stdio server as `.mcp.json` and `.codex/config.toml`; Antigravity names it `crucible-tools_rea` (229 tools in Claude's probe, 2026-11-27). Interactive Antigravity asks the user before each call; headless agy denies every MCP call that has no allow rule, so dispatched Gemini runs do not call it except in an approved turbo run. Higgsfield joins the plugin together with a launcher rule that denies `mcp(crucible-tools_higgsfield/*)` in every Gemini run, turbo included (task GEMINI-REVIEWER; a wildcard `mcp(...)` deny held under `--dangerously-skip-permissions` in Claude's probe), so its spending stays behind the paid-action gate; it also needs its own sign-in inside the Antigravity app.

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

Optional task/handoff `tool: none|gjc|claw|claude-red|rea|omo`: all except `omo` for both agents, `omo` for Codex runtime. Metadata only; invoke manually. A proper ccx routing adapter would need ownership, budgets, captures and approvals; this integration leaves routing unchanged.

Claude plans a scoped task; Codex implements/verifies; Claude reviews; ccx verifies/reviews/approves done. Parallel tasks retain separate owned worktrees. Repository-writing harness trials require a separate task, isolated worktree and exact allowlist under HANDOFF.md. Never start a new repository-writing harness session in the base checkout; only version/help inspection runs from the repo root. Wrappers do not enforce filesystem isolation.

Offline regression: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-external-tools.ps1`. Fake commands in `tests/mocks/` cover arguments/current directory/exits, missing commands, Claude flag/file delivery, UTF-8/order, overwrite rejection, OmO config/hooks, readiness and documentation symmetry. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-claw-credentials.ps1` tests only synthetic encrypted credentials in TEMP, fresh child sessions, metadata probes and environment restoration. Existing core/operations/dispatch/mirror suites still use synthetic fixtures. The original integration is commit `ed30a58`, accepted by ccx and pushed after separate user approval. Its evidence snapshot remains in TASK.md; this follow-up is tracked in `tasks/external-tools-ready.md`. Detailed logs use `$tools\integration-*`; no auth or library contents enter the repo. New delivery actions require their own normal ccx and Git gates.

## Using tools on the next task

Both agents use the same selection rules. Start with `tool: none`; an optional harness should solve a specific gap, not become an extra pass on every task.

| Selection | Useful when | Default fallback |
| --- | --- | --- |
| `none` | Ordinary implementation, review, tests and deterministic work | Normal Claude/Codex dispatch through ccx |
| `gjc` | A task owner wants to evaluate a separately scoped implementation harness | Normal implementation; no recursive harness dispatch |
| `rea` | Evidence about an authorized application or binary without its source | Ordinary source inspection; use `node scripts/test-rea.mjs` for Rea readiness |
| `claw` | A focused read-only second opinion on a diff or design is useful and API cost is authorized | Normal cross-model review; a Claw opinion never replaces required reviewers |
| `claude-red` | One reviewed Markdown module directly fits the authorized task | Use the normal task brief; omit unrelated modules |
| `omo` | A longer Codex session benefits from its approved orchestration skills | Ordinary Codex; Claude uses native planning/skills/review |

1. From the repo root, run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-external-tools.ps1 -Json`. It executes only GJC/Claw version and Codex help through the existing wrappers, and checks Markdown storage. It makes no provider request, reads no credential values and installs nothing. `cli-pass` means the CLI check passed; `files-present` means storage exists; `unavailable` means use the fallback. Exit 0 means inventory completed, not universal readiness or acceptance.
2. Claude records the following brief in the task spec or handoff, checks ownership, and prepares the task-owned worktree using HANDOFF.md. Keep the task spec read-only to the external tool. Repository-writing experiments always need the explicit allowlist and isolated worktree; wrapper scripts are not sandboxes.
3. Launch only the selected tool from that worktree, using the absolute path to the repo's wrapper if necessary. Preserve the normal permission controls. Set the time/cost limit before a provider call. Start Claw read-only with `--permission-mode read-only --allowedTools read,glob`. GJC's already-tested Windows provider preset is `--mpreset codex-sol`; tmux remains untested. OmO requires interactive hook approval, not an automatic trust bypass.
4. Capture the final report and exit status in the task's allowed scratch/capture location. Inspect tracked and untracked changes against the baseline and allowlist. Never capture a key, credential prompt, private workbook or unreviewed library contents. A successful tool reply is evidence only.
5. The normal agent reviews the result, runs the task's tests and completes the existing ccx verify/review/done sequence. If the enhancement fails, record the reason, use `tool: none` and continue normal dispatch. Do not add retries, models, automatic routing or permissions to compensate.

```text
tool: none | gjc | claw | claude-red | rea | omo   (select exactly one)
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

## Rea (reverse engineering)

Source: [morluto/rea](https://github.com/morluto/rea), MIT. Added 2026-10-28. Both project MCP configurations launch the same Windows stdio command:

```powershell
npx.cmd --yes --package=node@24.22.1 --package=rea-agents@6.8.0 -- rea mcp
```

The compatible Node runtime and Rea live in npm's cache, outside Git. Global Node remains unchanged. The first launch needs npm registry access; prewarm/check it with the same command ending in `--version` instead of `mcp`. Restart Claude/Codex in this trusted repo and approve the project MCP normally. Existing sessions do not acquire new tools automatically. Codex has a 120-second startup timeout and a 180-second tool timeout. A cold install can take longer: finish the version check before restarting. Clearing npm's cache requires a fresh download. This is a Windows configuration, matching the existing repo environment.

Do not run Rea's global `setup` here: these project configs intentionally avoid user-level registration or skill installation. Shared investigation instructions live in AGENTS.md and CLAUDE.md. Start with `binary_session {}` to discover actual session capabilities. Static JavaScript analysis works without a native engine. Hopper/Ghidra/IDA and other optional external engines have not been installed or verified. No analysis engine is silently downloaded by these configuration changes.

Analyze only authorized targets. Start static; runtime execution, attachment, capture, extraction and writes need explicit task scope and normal permissions. Do not use private workbook/course data, credentials or unrelated personal files. Analysis is local, but returned findings enter the agent's model context. No new auto-allow rules are installed. Rea never replaces ccx review or acceptance.

Verification: `node scripts/test-rea.mjs` checks both registrations, shared instruction symmetry, server version and MCP tool discovery, then analyzes its own temporary synthetic JavaScript target without running it. It needs the cached packages or registry access; it uses no credentials, model providers or real targets. The older provider-free inventory remains unchanged; run this dedicated check for Rea readiness. Task and current evidence: `tasks/REA-1.md`.

Removal: remove only `mcpServers.rea` from `.mcp.json` and `[mcp_servers.rea]` from `.codex/config.toml`, and update both shared instruction files together. Cached npm packages can remain; no global registration was created. Upgrades must deliberately update both version pins and rerun the check.
