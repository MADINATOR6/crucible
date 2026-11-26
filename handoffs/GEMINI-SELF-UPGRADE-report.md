# Gemini Self-Upgrade Research Report

## Summary

Auditing Google's four reference repositories (`gemini-skills`, `gemini-cli`, `gemini-api-cli`, and `cookbook`) alongside Crucible's current Antigravity (`agy`) integration reveals that Gemini already runs on Google's current strategic CLI for Google AI Pro (`agy`, which replaced `gemini-cli` for individual/AI Pro accounts on 2026-06-18), but Crucible currently leaves major built-in Antigravity and Gemini API capabilities unused and suffers from concrete parity gaps against Claude and Codex. Most urgently, `AGENTS.md` (47.4 KB) exceeds Antigravity's 24 KB per-file rule cap and is truncated mid-file during headless runs—dropping the Roles, Gemini-as-primary-worker, Routing, Control Plane, Ponytail, Git, and Security sections unless manually re-read—while Antigravity's workspace discovery (`.agents/skills/`, `.agents/skills.json`, `.agents/plugins/<name>/mcp_config.json`) is unconfigured in this repository, leaving Gemini without Crucible's shared skills or Higgsfield/Rea MCP servers. In addition, Antigravity's read-only Windows terminal sandbox returned `Access is denied..` on every shell call during this run (blocking even `git status --short` and `node scripts/check-sources.mjs`), `scripts/codex-dispatch.ps1` still requires `codex.cmd` on `PATH` and blocks intentional Gemini `-Role verify`/`-Role research` dispatches, and `gemini-api-cli` offers a clean stateless free-tier CLI route (`gemini-4-hydrogen`) for non-confidential multimodal/video/PDF analysis, transcription, structured output, and Search grounding if wrapped with Crucible's privacy and spend guards.

---

## 1. `gemini-skills`: Skills, Format, Antigravity Discovery, and Crucible Fit

### Skills Present
The repository ships four skills under `skills/` (version `2.8.0`); a fifth (`vertex-ai-api-dev`) moved out:

> "The `vertex-ai-api-dev` skill has moved to" — [gemini-skills/README.md](../ext/gemini-refs/gemini-skills/README.md)

1. **`gemini-api-dev`** (`skills/gemini-api-dev/SKILL.md` + `references/migration.md`): Python (`google-genai >= 3.2.0`) and JS/TS (`@google/genai >= 3.2.0`) guidance for Interactions API (`v1` GA), Managed Agents and Decisions API (`v1beta`), current model roster (`gemini-4-carbon/neon/hydrogen`, `gemini-3.5-flash-lite`, `gemini-decision-1`, `gemini-omni-1.2-flash`, `gemini-3.8-flash-tts`, `gemini-nano-banana-2.1`), and deprecated-model guardrails.

> "description: Use this skill when writing code that calls the Gemini API for text generation, multi-turn chat, multimodal understanding, image generation, video generation, speech generation (TTS), voice design, voice replication, streaming responses, background research tasks, function calling, structured output, calibrated decisions (yes/no, choice, rubric scoring), or migrating from the old generateContent API." — [gemini-api-dev/SKILL.md](../ext/gemini-refs/gemini-skills/skills/gemini-api-dev/SKILL.md)

2. **`gemini-api-cli`** (`skills/gemini-api-cli/SKILL.md`): Shell usage for the stateless `gemini-api` binary (`generate`, `image`, `tts`, `music`, `video`, `analyze`, `transcribe`, `agent`, `files`, `models`, `environments`, `--dry-run`, `--jq`, `--body`, `--agent-mode`).

> "description: Call the Gemini API from the shell with gemini-api. Use for media generation (images, TTS, music, video), file and YouTube analysis, audio/video transcription, Deep Research, and sandboxed agents." — [gemini-api-cli/SKILL.md](../ext/gemini-refs/gemini-skills/skills/gemini-api-cli/SKILL.md)

3. **`gemini-live-api-dev`** (`skills/gemini-live-api-dev/SKILL.md` + `references/migration.md`): Real-time bidirectional WebSocket streaming (`gemini-3.8-live`, Extended Thinking, VAD, async tools, ephemeral tokens, MCP-first doc lookup).

> "When MCP tools are present, **never** fetch URLs manually. MCP provides up-to-date, indexed documentation that is more accurate and token-efficient than URL fetching." — [gemini-live-api-dev/SKILL.md](../ext/gemini-refs/gemini-skills/skills/gemini-live-api-dev/SKILL.md)

4. **`gemini-omni-flash-api`** (`skills/gemini-omni-flash-api/SKILL.md` + `scripts/upload_file.py`, `scripts/video/{generate_video,inspect_video,prep_video}.py`): Generative video editing/transitions/extensions on `gemini-omni-1.2-flash`, plus reusable `ffprobe`/`ffmpeg` inspection and normalization helpers.

### File Format & Packaging
Every skill follows the open Agent Skills specification:

> "[Skills](https://agentskills.io/) are a lightweight technique for adding relevant context to your agents." — [gemini-skills/README.md](../ext/gemini-refs/gemini-skills/README.md)

- Directory layout: `skills/<name>/SKILL.md`, with optional `references/` (deep-dive docs linked by relative path) and `scripts/` (helper scripts).
- YAML frontmatter in all four `SKILL.md` files uses strictly two keys: `name` and `description`.
- Multi-harness plugin manifests sit at repo root (`plugin.json`), `.claude-plugin/{plugin,marketplace}.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`, and `.agents/plugins/marketplace.json`.

### Can Antigravity (`agy`) Load Them, and Where Does It Look?
Yes—both bundled/plugin-installed and from workspace/global skill folders:

> "The Gemini skills come bundled with Antigravity, find them under ⚙️ → Customizations → Build with Google Plugins." — [gemini-skills/README.md](../ext/gemini-refs/gemini-skills/README.md)

> "agy plugin install https://github.com/google-gemini/gemini-skills" — [gemini-skills/README.md](../ext/gemini-refs/gemini-skills/README.md)

The exact on-disk discovery paths are confirmed in `gemini-api-cli`'s installer table (and corroborated by Antigravity's built-in `agy-customizations` docs, which document `.agents/skills/*/SKILL.md`, `.agents/skills.json`, `.agents/plugins/<name>/plugin.json`, and `~/.gemini/config/`):

> "{ID: "antigravity", Name: "Antigravity", Project: ".agents/skills", Global: ".gemini/config/skills", Default: true}," — [install_skill.go](../ext/gemini-refs/gemini-api-cli/internal/cli/custom/install_skill.go)

> "{ID: "codex", Name: "Codex", Project: ".agents/skills", Global: ".agents/skills", Default: true}," — [install_skill.go](../ext/gemini-refs/gemini-api-cli/internal/cli/custom/install_skill.go)

Crucially, **Antigravity and Codex share `.agents/skills/` as their project-level skill directory** (and Antigravity's `skills.json` can point directly to existing project folders). In this run's Antigravity session, the global `gemini-api` plugin (`gemini-api-cli`, `gemini-api-dev`, `gemini-live-api-dev`, `gemini-omni-flash-api`, `genie-4-live-world`) is already mounted under `~/.gemini/config/plugins/gemini-api/skills/`, alongside `gemini-api-docs` MCP. Live CLI confirmation (`agy plugin list` / `agy --help`) was blocked by the sandbox; run `agy plugin list` in a user terminal to verify installed plugins.

### Fit with Crucible's Lanes
- **Research (`source-research`) & UX/Video Review (`ux-review`):** `gemini-api-cli` (`analyze`, `transcribe --format srt`, Deep Research) and `gemini-omni-flash-api`'s `inspect_video.py` (`ffprobe` wrapper) fit directly for non-confidential media/PDF/YouTube inspection.
- **Creative:** `gemini-omni-flash-api` conflicts with Crucible's rule that video generation goes through Higgsfield (`AGENTS.md`), so do not route video generation to Omni unless explicitly requested; its `prep_video.py` / `inspect_video.py` ffmpeg patterns remain reusable.
- **Implementation & Docs:** `gemini-api-dev` and `gemini-live-api-dev` fit whenever Crucible builds Gemini API integrations, and their **MCP-first doc lookup** + `SKILL.md` + `references/` progressive-disclosure pattern is a direct template for Crucible's own shared skills in `.agents/skills/`.
- **Review:** `gemini-api-dev`'s **Decisions API** (`gemini-decision-1`) offers zero-output-token calibrated rubric scoring as review evidence (never replacing `ccx` acceptance).

> "Evaluates 1 to 1,000 independent questions (`noul` yes/no, `choice` single-select, `score` ordered rubric) over shared input (text, image, audio, video, PDF) in one pass with `gemini-decision-1`, returning calibrated probabilities, `confidence`, and 0 output tokens." — [gemini-api-dev/SKILL.md](../ext/gemini-refs/gemini-skills/skills/gemini-api-dev/SKILL.md)

---

## 2. `gemini-cli`: Feature Audit Against `agy` and Crucible Conventions

First, `gemini-cli` itself confirms that Crucible is right to run `agy` rather than `gemini`:

> "Free individual access and **Google AI Pro / Ultra** (Google One) moved to [Antigravity CLI](https://antigravity.google/product/antigravity-cli) on June 18, 2026" — [gemini-cli/README.md](../ext/gemini-refs/gemini-cli/README.md)

> "Not tuned for the **Gemini 4** series" — [gemini-cli/README.md](../ext/gemini-refs/gemini-cli/README.md)

Feature-by-feature comparison:

| Feature in `gemini-cli` | Status in `agy` / Crucible Today | Recommendation |
| :--- | :--- | :--- |
| **Context files (`GEMINI.md`, `@file` imports, `context.fileName`, `.geminiignore`)** | `agy` reads `GEMINI.md` and `AGENTS.md` hierarchically, and `.geminiignore` already exists at repo root. However, Antigravity's built-in `agy-customizations/docs/rules.md` documents a **24,000-byte per-file rule cap**: `AGENTS.md` (47,351 bytes) was truncated by 22,947 bytes in this run's prompt, cutting off Roles, Gemini-as-primary-worker, Routing, Control Plane, Ponytail, Git, and Security. | **Adopt now:** Add a compact root `GEMINI.md` (<12 KB) containing Gemini's core Crucible rules, Ponytail, privacy boundaries, quoting rules, and pointers to `AGENTS.md` / `HANDOFF.md` sections so critical rules are never truncated. |
| **Agent Skills (`.agents/skills/` over `.gemini/skills/`)** | `agy` already discovers `.agents/skills/*/SKILL.md` and `.agents/skills.json`, but this repo has no `.agents/` directory yet—Crucible's skills live only in `.claude/skills/`. | **Adopt now:** Add `.agents/skills.json` (or `.agents/skills/` mirrors/wrappers) exposing Crucible's shared runbooks (`fable-judge`, `higgsfield`, `blender`, `source-research`, `ux-review`, `ponytail`) to both `agy` and Codex. |
| **Extensions (`gemini-extension.json`)** | `agy` has native `.agents/plugins/<name>/plugin.json` (bundling `mcp_config.json`, `hooks.json`, `rules/`, `skills/`) and `agy plugin install` stages `gemini-extension.json` / `.claude-plugin/plugin.json` extensions. | **Adopt selectively:** Package Crucible's Gemini/shared MCP & skill bundle as a local `.agents/plugins/crucible-tools/` plugin (only after user approval of MCP scopes). |
| **MCP servers (Stdio, Streamable HTTP, `includeTools`/`excludeTools`, OAuth)** | `agy` supports Stdio and Streamable HTTP in `~/.gemini/config/mcp_config.json` and `plugins/<name>/mcp_config.json` (legacy SSE is unsupported). Crucible's `.mcp.json` (`higgsfield`, `rea`) is **not** read by `agy`. Note `gemini-cli` warns MCP OAuth needs a browser and cannot run headless; interactive sign-in is required once. | **Adopt selectively:** Add `rea` (Stdio) and `higgsfield` (Streamable HTTP, after user OAuth + `ccx` gate rules) to an Antigravity plugin or global `mcp_config.json`, plus add `geminiAllowedServers` to `ccx/policy.json` and `ccx health`. |
| **Headless / JSON & `stream-json` output, exit codes** | `scripts/codex-dispatch.ps1` already invokes `agy -p --output-format json --mode accept-edits\|plan --sandbox --disable-slash-commands --settings ... --print-timeout` and parses `status`, `response`, and `usage`. Whether `agy` supports `stream-json` or `gemini-cli`'s typed exit codes (`41`/`42`/`44`/`52`/`53`) is **UNKNOWN** (`run_command` denied `agy --help`). | **Keep current JSON path**; probe `agy --help` in a terminal to see if `stream-json` or distinct exit codes improve timeout/failure diagnostics. |
| **Checkpointing, `/rewind`, `--resume`** | `gemini-cli` uses a shadow Git repo (`~/.gemini/history/<hash>`) and `--resume`. `agy` resume/checkpoint flags for headless runs are **UNKNOWN** (repro: `agy --help`). Crucible already relies on Git + `ccx` baselines + `HANDOFF.md` step 8 (inspect owned outputs first). | **Borrow convention only:** Keep Git/ccx as source of truth; do not enable shadow Git checkpointing inside automated headless runs. |
| **Sandboxing (Docker/Podman/Seatbelt/Windows Native)** | `gemini-cli`'s `windows-native` sandbox sets **persistent** NTFS Low Mandatory Integrity levels via `icacls` and is not auto-detected on Windows. `agy --sandbox` uses Antigravity's terminal sandbox (`enableTerminalSandbox: true`), which **failed every `run_command` with `Access is denied..`** in this run. | **Do not borrow `icacls` persistence.** Instead, diagnose why `agy --sandbox` returns `Access is denied..` on Windows (repro: `agy -p "run git status --short" --sandbox --output-format json`) and keep turbo (`--dangerously-skip-permissions`) behind `codex-full-access`. |
| **Hooks & Policy Engine (`.toml`)** | `agy` supports `.agents/hooks.json` (`SessionStart`, `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, `Stop` with JSON stdin/stdout); `gemini-cli`'s workspace `.gemini/policies/` tier is currently disabled anyway, and `codex-dispatch.ps1` already generates per-run `agy` `--settings` JSON with absolute `write_file(...)` denies + post-run hash checks. | **Borrow security convention:** Follow `gemini-cli`'s rule of fingerprinting/reviewing project hooks before trusting them; keep Crucible's per-run `--settings` + post-run `Get-CcxProtectedHashes` as primary enforcement (never rely on workspace hooks alone). |
| **Custom Slash Commands & Subagents** | `codex-dispatch.ps1` intentionally passes `--disable-slash-commands` for headless runs. `agy` already exposes built-in `research` / `self` subagents (used in this audit!). | **Keep `--disable-slash-commands`** in headless dispatches; document `.agents/skills/` instead of `.gemini/commands/*.toml`. |

Supporting passages from `gemini-cli`:

> "You can break down large `GEMINI.md` files into smaller, more manageable components by importing content from other files using the `@file.md` syntax." — [gemini-md.md](../ext/gemini-refs/gemini-cli/docs/cli/gemini-md.md)

> "To specify a different name or a list of names, use the `context.fileName` property." — [gemini-md.md](../ext/gemini-refs/gemini-cli/docs/cli/gemini-md.md)

> "Create a file named `.geminiignore` in the root of your project directory." — [gemini-ignore.md](../ext/gemini-refs/gemini-cli/docs/cli/gemini-ignore.md)

> "**Workspace skills**: Located in `.gemini/skills/` or the `.agents/skills/` alias. Workspace skills are shared with your team via version control." — [skills.md](../ext/gemini-refs/gemini-cli/docs/cli/skills.md)

> "`.agents/skills/` alias takes precedence over the `.gemini/skills/` directory." — [skills.md](../ext/gemini-refs/gemini-cli/docs/cli/skills.md)

> "Headless mode is triggered when the CLI is run in a non-TTY environment or when providing a query with the `-p` (or `--prompt`) flag." — [headless.md](../ext/gemini-refs/gemini-cli/docs/cli/headless.md)

> "These integrity level changes are persistent on the filesystem." — [sandbox.md](../ext/gemini-refs/gemini-cli/docs/cli/sandbox.md)

> "Hooks run synchronously as part of the agent loop—when a hook event fires, Gemini CLI waits for all matching hooks to complete before continuing." — [hooks/index.md](../ext/gemini-refs/gemini-cli/docs/hooks/index.md)

> "Gemini CLI **fingerprints** project hooks. If a hook's name or command changes" — [hooks/index.md](../ext/gemini-refs/gemini-cli/docs/hooks/index.md)

> "The user is prompted to approve or deny the tool call. (In non-interactive mode, this is treated as `deny`.)" — [policy-engine.md](../ext/gemini-refs/gemini-cli/docs/reference/policy-engine.md)

> "**(Currently disabled)** Policies defined in the current workspace's configuration directory." — [policy-engine.md](../ext/gemini-refs/gemini-cli/docs/reference/policy-engine.md)

> "**Project-level:** `.gemini/agents/*.md` (Shared with your team)" — [subagents.md](../ext/gemini-refs/gemini-cli/docs/core/subagents.md)

---

## 3. `gemini-api-cli`: Capabilities, Free-Tier Route, Cost, and Privacy Limits

### What It Does
`gemini-api` is a single stateless Go binary (`v0.5.0`, Apache 2.0) wrapping Google AI Studio's Gemini Interactions API (`https://generativelanguage.googleapis.com`) for coding agents, shell scripts, and CI:

> "Give Codex, Claude Code, Antigravity, OpenClaw, Hermes, or any other agent with shell access the ability to use the Gemini API." — [gemini-api-cli/README.md](../ext/gemini-refs/gemini-api-cli/README.md)

> "**CLI for shell work, SDK for application code.** Use `gemini-api` from terminals, scripts, and CI jobs to generate media files, analyze local PDFs or recordings, run Deep Research, and manage agent sandboxes" — [gemini-api-cli/SKILL.md](../ext/gemini-refs/gemini-skills/skills/gemini-api-cli/SKILL.md)

Core subcommands:
- **Understand:** `analyze` (PDFs, images, audio, video, CSV/text, or YouTube URLs on `gemini-4-hydrogen`), `transcribe` (`md`, `text`, `json`, `srt` captions on `gemini-3.5-transcribe` / `gemini-4-hydrogen`).

> "Ask questions about PDFs, images, audio, video, CSV/text files, or YouTube URLs (`gemini-4-hydrogen`)" — [gemini-api-cli/README.md](../ext/gemini-refs/gemini-api-cli/README.md)

- **Create:** `generate` (text/multimodal), `image` (`gemini-nano-banana-2.1`), `tts` (`gemini-3.8-flash-tts`), `music` (`lyria-3.5`), `video` (`gemini-omni-1.2-flash`).
- **Manage & Advanced:** `agent` (`run`/`status`/`cancel` for `deep-research-preview-04-2026`, `antigravity-preview-09-2026`, custom agents), `files` (Files API upload/list/delete), `models`, `voices`, `environments` (remote/self-hosted sandboxes), `credentials`, `webhooks`, `triggers`, `install-skill`.
- **Agent ergonomics:** offline `--dry-run` (redacts credentials, skips keychain), in-process `--jq`, `--output-format json|toon|pretty`, `--agent-mode`, and `--body` for raw Interactions JSON:

> "validates inputs and prints the resolved HTTP request with credentials redacted—without making a network call or reading the OS keychain." — [gemini-api-cli/README.md](../ext/gemini-refs/gemini-api-cli/README.md)

> "Use it for `response_format` schemas, `tools` (`google_search`, `code_execution`, `url_context`, function declarations), `generation_config`, `environment`, or `store`." — [internal/cli/custom/skill/SKILL.md](../ext/gemini-refs/gemini-api-cli/internal/cli/custom/skill/SKILL.md)

- **Gap—no `batch` command:** `gemini-api-cli` has **no `batch` subcommand** (batch appears only as webhook event names). Batch API jobs require Python/JS SDK or REST.

### Does It Give Crucible a Useful Free-Tier Route?
**Yes, for a narrow, high-value, non-confidential lane—if wrapped.** Because the machine already has a free-tier `GEMINI_API_KEY` (used by `claude-video-vision`), `gemini-api` can give **all three agents** (via a shared PowerShell wrapper, following Crucible's `scripts/mpt.ps1` / `scripts/generate.ps1` pattern) a single CLI for:
1. **File, PDF, audio, video, and YouTube analysis (`analyze`)** and **SRT transcription (`transcribe`)** on `gemini-4-hydrogen`, removing the Claude-only bottleneck of `claude-video-vision` for non-confidential media and UX reviews.
2. **Structured JSON extraction** via `--body '{"response_format": ...}'` and **Google Search / URL Context grounding** via `--body '{"tools": [...]}'`.

However, headless `agy`'s default terminal sandbox is **offline** (and denied shell calls in this run), so `gemini-api` network calls cannot run inside a standard sandboxed `agy` dispatch; they require either Claude, a non-sandboxed terminal/turbo run, or a Crucible host-side check/wrapper.

### Cost Limits
- **Free vs. paid models:** `gemini-4-hydrogen` and `gemini-3.5-flash-lite` support both free and paid tiers; `gemini-4-neon`, `gemini-4-carbon`, `gemini-4-argon`, Veo, and Genie 4 are paid-only:

> "available on **both the free and paid tiers** (`$1.50` / 1M input, `$7.50` / 1M output)" — [Get_started.ipynb](../ext/gemini-refs/cookbook/quickstarts/Get_started.ipynb)

> "Sits between Hydrogen and Carbon on the **paid tier** (`$3.00` / 1M input, `$15.00` / 1M output)" — [Get_started.ipynb](../ext/gemini-refs/cookbook/quickstarts/Get_started.ipynb)

- **No built-in cost quote & auth-billing trap:** `gemini-api` has no pricing table or pre-flight spend cap (`--dry-run` shows the HTTP request, not dollars). An exported `GEMINI_API_KEY` overrides keychain/config and bills whichever project owns that key. Free-tier availability also varies by region and rate limits:

> "Billing is disabled for the project that owns this key (this is not a credential problem). Enable billing on the project or use a key from a project with billing enabled; the free tier may not be available in your region" — [errortable.go](../ext/gemini-refs/gemini-api-cli/internal/output/errortable.go)

- **Crucible spend rule:** Restrict any free-tier Crucible wrapper (`scripts/gemini-api.ps1`) to an allowlist of `analyze` / `transcribe` / `generate` on `gemini-4-hydrogen` / `gemini-3.5-flash-lite` (matching `scripts/mpt.ps1`'s allowlist-only pattern); require L4 `paid-action` approval for paid models, Deep Research, managed sandboxes, or media generation (and keep video generation on Higgsfield).

### Privacy Limits
- **Data leaves the machine:** Inline `-i` inputs (up to ~14 MB raw / 20 MB base64) go directly in the HTTPS POST body to `generativelanguage.googleapis.com`; larger uploads via `files upload` stay on Google's Files API for 48 hours:

> "Upload, list, inspect, register, and delete files via the Files API (48-hour retention)" — [gemini-api-cli/README.md](../ext/gemini-refs/gemini-api-cli/README.md)

- **Server-side interaction storage (`store`):** `analyze`, `transcribe`, and `tts` hardcode `store: false`, whereas `generate`, `image`, `music`, `video`, and `agent run` default to `store: true` (1 day on free tier, 55 days on paid tier):

> "Calls store state server-side by default (`store` is true), so multi-turn chains only need `--previous-interaction-id`" — [internal/cli/custom/skill/SKILL.md](../ext/gemini-refs/gemini-api-cli/internal/cli/custom/skill/SKILL.md)

> "Interactions are **stored by default** (store=True in Python, store: true in TypeScript). Paid tier retains for 55 days, free tier for 1 day." — [gemini-api-dev/SKILL.md](../ext/gemini-refs/gemini-skills/skills/gemini-api-dev/SKILL.md)

- **Training/logging terms:** Neither `gemini-api-cli` nor `cookbook` embeds Google AI Studio's free-tier vs. paid-tier data-training legal terms (see `UNKNOWN / CHECKED / NEEDED`). Under Crucible's existing privacy rule (`AGENTS.md`, `.geminiignore`, `ccx/policy.json`), **never** pass `nursing-a2/`, `*.xlsx`, `.env*`, credentials, personal files, or confidential recordings to `gemini-api`. A wrapper must hard-refuse paths matching `privacy.excludePaths` and `.geminiignore` and force `"store": false` on `generate`.

---

## 4. `cookbook`: Mapping Gemini API Patterns to Crucible Lanes

The cookbook has migrated its quickstarts to the Interactions API (`gemini-4-hydrogen` default). Below is how each requested pattern (plus three high-leverage extras found in the repo) maps to Crucible:

### 4.1 Multimodal & Video Understanding (`ux-review`, media review, `source-research`)
Native video, audio, PDF (URL or Files API up to 2 GB / 48h), and direct YouTube URLs. Crucially, Gemini 4 / 3.8 support **agentic video understanding** (dynamically seeking frames and transcripts instead of flat 1 FPS sampling) with sub-second cut/timestamp accuracy:

> "Gemini 4 Hydrogen, 4 Neon, 4 Argon, 4 Carbon, 3.8 Flash, 3.7 Flash, 3.6 Flash, and 3.5 Flash Lite models also support **agentic video understanding**, where the model dynamically explores the video timeline, selectively inspecting transcripts and adaptively adjusting frame rates and resolution on the fly based on your prompt." — [Video_understanding.ipynb](../ext/gemini-refs/cookbook/quickstarts/Video_understanding.ipynb)

> "Drastically reduces tokens (up to 88% fewer) and costs (up to 66% lower) by loading only relevant moments instead of decoding the entire timeline upfront." — [Video_understanding.ipynb](../ext/gemini-refs/cookbook/quickstarts/Video_understanding.ipynb)

> "The File API accepts files under 2GB in size and can store up to 20GB of files per project. Files last for 2 days and cannot be downloaded from the API." — [File_API.ipynb](../ext/gemini-refs/cookbook/quickstarts/File_API.ipynb)

*Crucible mapping:* Use for `ux-review` screen recordings, Blender playblast/render checks, and non-confidential Higgsfield draft beat reviews—producing timestamped findings (`HANDOFF.md`) without overloading Claude's context or relying solely on Claude-only `claude-video-vision`.

### 4.2 Long Context & Context Caching (`source-research`, `docs`, cross-file `review`)
Unified 1M-token context across Gemini 4 with automatic **implicit caching** (95% discount for repeated prefixes ≥4,096 tokens) and `background=True` long-decode continuation; explicit `client.caches.create` applies only to Gemini 3 / 2.5:

> "All four Gemini 4 models share a unified 1M-token context window, built-in tools, [long decode](#long_decode) continuation up to 1M output tokens (`1,048,576` minus input tokens), and automatic [implicit caching](#caching) (95% discount for prefixes of 4,096+ tokens)." — [Get_started.ipynb](../ext/gemini-refs/cookbook/quickstarts/Get_started.ipynb)

> "Explicit caching (`client.caches.create`) is supported on Gemini 3 and Gemini 2.5 models. Gemini 4 models (`gemini-4-hydrogen`, `gemini-4-neon`, `gemini-4-carbon`, and `gemini-4-argon`) use automatic **implicit caching** (delivering a 95% discount on repeated input prefixes of 4,096 tokens or more) and do not support explicit cache creation." — [Caching.ipynb](../ext/gemini-refs/cookbook/quickstarts/Caching.ipynb)

*Crucible mapping:* Place stable shared reference docs/specs first in prompts/skills to trigger implicit caching across multi-turn `source-research` and large-codebase reviews; skip building explicit-cache tooling for Gemini 4.

### 4.3 Grounding with Google Search & URL Context (`source-research`, `docs`, `creative`)
`google_search` and `url_context` (up to 20 URLs, combinable) ground external research, though `Grounding.ipynb` explicitly warns that `grounding_metadata` and `url_context_metadata` citations are not yet exposed in the Interactions API (still require `generateContent` if structured citation metadata is needed):

> "Google Search grounding is particularly useful for queries that require current information or external knowledge. Using Google Search, Gemini can access nearly real-time information and better responses." — [Grounding.ipynb](../ext/gemini-refs/cookbook/quickstarts/Grounding.ipynb)

*Crucible mapping:* Use for external technology/docs verification in `source-research` (non-private queries only), saving fetched/verified primary snippets locally when `check-sources.mjs` must verify them.

### 4.4 Structured Output (`source-research`, `ux-review`, `review`, `implement`)
Interactions API `response_format` accepts JSON Schema (via Pydantic `.model_json_schema()` + `model_validate_json()`, or `Enum`). Note: **Zod is not covered** anywhere in `cookbook`.

> "Another option is to pass a schema directly via the `response_format` parameter. The model output will then follow that schema exactly." — [JSON_mode.ipynb](../ext/gemini-refs/cookbook/quickstarts/JSON_mode.ipynb)

*Crucible mapping:* Emit machine-checkable JSON findings (e.g., beat-by-beat video QA tables, Judge fixture evaluations, UX defect lists with timestamps) before rendering Markdown reports.

### 4.5 Code Execution (`source-research`, `creative`, `implement`)
Built-in Python sandbox supports iterative calculation, CSV/TXT File I/O, and matplotlib plots (`inline_data`), and Managed Agents add persistent Linux VMs:

> "The Gemini API [code execution](https://ai.google.dev/gemini-api/docs/code-execution) feature enables the model to generate and run Python code based on plain-text instructions that you give it, and even output graphs." — [Code_Execution.ipynb](../ext/gemini-refs/cookbook/quickstarts/Code_Execution.ipynb)

*Crucible mapping:* Useful for synthetic data analysis or chart generation in research/creative tasks (never real workbook/private data, and never as a substitute for local `ccx verify` tests).

### 4.6 Function Calling & MCP (`implement`, `architecture`, tool governance)
Interactions API uses explicit manual tool dispatch (no silent auto-execution) and Deep Research supports remote `mcp_server` with `allowed_tools` allowlists; `examples/Governed_Function_Calling_With_PII_And_Cost_Guardrails.ipynb` demonstrates PII and cost guardrails:

> "To use function calling, pass a list of functions to the `tools` parameter when creating an interaction. With the Interactions API, tools are declared as dictionaries. The SDK can also auto-generate tool schemas from Python functions." — [Function_calling.ipynb](../ext/gemini-refs/cookbook/quickstarts/Function_calling.ipynb)

*Crucible mapping:* Directly mirrors Crucible's `ccx` least-privilege MCP scoping (`allowed_tools` + PII/cost gates) when adding MCP servers for Gemini.

### 4.7 Live API (`ux-review` interactive prototyping only)
`gemini-3.8-live` (GA) and Extended Thinking support bidirectional camera/screen + audio streaming with `NON_BLOCKING` async tools (`TEXT` output modality removed; use `AUDIO` + output transcription):

> "The [Gemini 3.8 Live](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live) model works with the Live API to enable low-latency bidirectional voice and video interactions with Gemini." — [Get_started_LiveAPI.ipynb](../ext/gemini-refs/cookbook/quickstarts/Get_started_LiveAPI.ipynb)

*Crucible mapping:* Not a fit for headless `agy` briefs; fits optional interactive live screen/UI walkthroughs (e.g., reviewing `lifting-tracker` in a live user session, synthetic data only).

### 4.8 High-Value Bonus Patterns (`Decisions API`, `Batch API`, `Deep Research`, `Spatial Understanding`)
- **Decisions API (`gemini-decision-1`):** Zero output tokens for multi-rubric yes/no/choice/score screening over text, images, video, or PDFs (`ux-review`, Judge-fixture regression checks):

> "Because nothing is generated, there is **no output text to parse and no output tokens to pay for** (`total_output_tokens = 0`)." — [Get_started_decisions.ipynb](../ext/gemini-refs/cookbook/quickstarts/Get_started_decisions.ipynb)

- **Batch API:** 50% cost discount, 24-hour SLO (via SDK/REST, not `gemini-api-cli`), useful for bulk offline Judge-fixture or benchmark evaluations:

> "Batches are priced at a 50% discount compared to the standard API." — [Batch_mode.ipynb](../ext/gemini-refs/cookbook/quickstarts/Batch_mode.ipynb)

- **Deep Research (`deep-research-preview-04-2026`):** Asynchronous 100+ source synthesis via Interactions API only (L4 if on paid billing):

> "Deep Research is exclusively available through the [Interactions API](https://ai.google.dev/gemini-api/docs/interactions) and cannot be accessed via `generate_content`." — [Get_started_Deep_Research.ipynb](../ext/gemini-refs/cookbook/quickstarts/Get_started_Deep_Research.ipynb)

- *(Also notable: `Spatial_understanding.ipynb` / `Spatial_understanding_3d.ipynb` for 2D UI clipping detection and 3D Blender scene critique.)*

---

## 5. Parity Gaps: Where Gemini Lags Claude and Codex Today

| Gap Area | Current State (Observed & Cited) | Proposal That Closes It |
| :--- | :--- | :--- |
| **1. Truncated repo rules (`AGENTS.md` > 24 KB)** | `AGENTS.md` is 47,351 bytes. Antigravity caps each rule file at 24,000 bytes (`agy-customizations/docs/rules.md`), so 22,947 bytes were truncated in this session's prompt—cutting off Roles, Gemini-as-primary-worker, Routing, Control Plane, Ponytail, Git, and Security. Claude (`CLAUDE.md`) and Codex read the full contract. | **Proposal #1:** Add concise root `GEMINI.md` (<12 KB). |
| **2. Zero Crucible skills wired to `.agents/skills/`** | Claude auto-loads `.claude/skills/*` (`higgsfield`, `blender`, `generate`, `scroll-site`, `nursing-notes`, `fable-judge`); Codex has `~/.agents/skills/higgsfield-*` and shell wrappers. Repo has no `.agents/skills/` or `.agents/skills.json`, so Gemini misses Crucible's procedures unless manually pointed at `.claude/skills/`. | **Proposal #2:** Add `.agents/skills/` (or `.agents/skills.json`) shared skill bridge for Gemini and Codex. |
| **3. Broken/unavailable sandbox shell & restricted post-run checks** | In this run, `run_command` failed with `Access is denied..` even on read-only `git status --short` and `Test-Path` under `agy --sandbox` (`codex-dispatch.ps1` sets `enableTerminalSandbox = -not $turbo`). Additionally, `scripts/crucible.ps1` restricts non-`agentSafe` post-run checks to OpenAI/Codex only, and `ccx/policy.json` still carries stale text claiming Antigravity runs without shell access. | **Proposal #3:** Diagnose/fix Windows `agy --sandbox` shell failure; align `crucible.ps1` check policy & `policy.json` notes. |
| **4. Launcher coupling to `codex.cmd` & missing Gemini `-Role verify`/`-Role research`** | `codex-dispatch.ps1` throws if `codex.cmd` is absent even on Gemini runs, and restricts Gemini to `-Role implement` when `task.owner -eq 'gemini'`. Meanwhile, Codex fallback accidentally sent a review of Gemini's own access change (`UPGRADE-3R`) to Gemini (`FRICTION.md`). | **Proposal #4:** Decouple Gemini dispatches from `codex.cmd`, enable intentional Gemini `-Role verify`/`-Role research` on non-Gemini-routing tasks, and hard-block Gemini fallback on Gemini routing/launcher files. |
| **5. Missing shared MCP servers (`rea`, `higgsfield`) & health tracking** | Claude (`.mcp.json`) and Codex (`.codex/config.toml`) both expose `rea` and `higgsfield`; `agy` reads `~/.gemini/config/mcp_config.json` or `.agents/plugins/<name>/mcp_config.json` and currently has neither. `ccx/policy.json` `mcp` tracks only `codexAllowedServers` and `projectAllowedServers`. | **Proposal #5:** Add an opt-in `.agents/plugins/crucible-tools/mcp_config.json` (starting with read-only `rea`, plus `higgsfield` behind L4 gates) and `geminiAllowedServers` in `ccx/policy.json` / `ccx health`. |
| **6. No shared video/multimodal analysis CLI outside Claude** | `claude-video-vision` is Claude-only (`AGENTS.md`). Codex and offline-sandboxed Gemini cannot analyze recordings or YouTube URLs on their own. | **Proposal #6:** Add an allowlist-only `scripts/gemini-api.ps1` wrapper (free-tier `analyze`/`transcribe` on `gemini-4-hydrogen`, hard privacy exclusions, `store: false`) shared by all agents. |
| **7. External tool scripts (`blender`, `higgsfield`, `mpt`, `generate`)** | Offline/access-denied `agy` shell cannot run local PowerShell wrappers (`blender.ps1`, `higgsfield.ps1`, `mpt.ps1`, `generate.ps1`) unless running in approved turbo (`-Sandbox danger-full-access`). | **Proposals #2 & #3:** Fixing read-only `agy --sandbox` restores read-only probes (`show`, `version`, `list`, `--dry-run`, `audit`, `summary`); writes/network stay under existing turbo/L4 gates + `.agents/skills/` guides. |
| **8. Missing `gemini/` worktree prefix in `ccx/policy.json`** | `ccx/policy.json` `worktrees.branchPrefix` lists only `claude` and `codex`, omitting `gemini`. | **Proposal #8:** Add `"gemini": "gemini/"` to `worktrees.branchPrefix` and update `Start Here.md` / `ccx/ARCHITECTURE.md` stale text. |

Supporting passages from Crucible:

> "$settings = @{ useG1Credits = $false; enableTerminalSandbox = -not $turbo; toolPermission = 'request-review'; allowNonWorkspaceAccess = $false" — [codex-dispatch.ps1](../scripts/codex-dispatch.ps1)

> "($decision.agent -in @('gemini','claude') -and $decision.route -eq 'worker' -and $Role -eq 'implement' -and $task.owner -eq $decision.agent)" — [codex-dispatch.ps1](../scripts/codex-dispatch.ps1)

> "$docOnly = $docOnly -and $task.lastDispatch -and $task.lastDispatch.provider -eq 'openai'" — [crucible.ps1](../scripts/crucible.ps1)

> "A review of Claude-authored work still routes to Codex in ccx, `verify` and `research` (Codex's planning route) still default to Codex, and the launcher still needs `codex.cmd` on PATH even for Gemini runs." — [AGENTS.md](../AGENTS.md)

> "Changes to Gemini's entries in `ccx/policy.json`, to this section, or to the launcher code that decides Gemini's access are made by Claude or Codex and approved by the user." — [AGENTS.md](../AGENTS.md)

> "Claude-only, user-level: the `claude-video-vision` plugin (MCP tools `video_watch`, `video_analyze`, `video_detail`, `video_info`; slash command `/watch-video <path|YouTube URL> [question]`)." — [AGENTS.md](../AGENTS.md)

> "Headless Claude may run agentSafe commands in its allowlist, and Antigravity runs without shell access." — [ccx/policy.json](../ccx/policy.json)

> ""branchPrefix": { "claude": "claude/", "codex": "codex/" }," — [ccx/policy.json](../ccx/policy.json)

> "A Codex `-Role verify` of UPGRADE-3R (changes to Gemini's own access) silently fell back to Gemini when Codex hit its 5-hour limit mid-session (UPGRADE-1's fallback), so Gemini reviewed its own permissions, which the GEMINI-PRIMARY rule forbids." — [FRICTION.md](../FRICTION.md)

---

## Ranked Proposals (Top 5 First)

| Rank & What | Source Quote (Supporting Evidence) | Benefit | Effort | Risk | Implementer | Verify Command or NEEDED |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Add concise root `GEMINI.md` (<12 KB)** summarizing Gemini's Crucible rules (Roles, Ponytail, privacy/exclusions, `check-sources.mjs` format, Report format, links to `AGENTS.md` / `HANDOFF.md`) so Antigravity's 24 KB rule cap never truncates core rules. | "You can break down large `GEMINI.md` files into smaller, more manageable components by importing content from other files using the `@file.md` syntax." ([gemini-md.md](../ext/gemini-refs/gemini-cli/docs/cli/gemini-md.md)) + Antigravity 24 KB rule limit (`agy-customizations/docs/rules.md`). | Eliminates silent truncation of half of `AGENTS.md` on every `agy` run; improves rule adherence and cuts redundant file reads. | Low (1–2h) | Low (doc-only; keep in sync with `AGENTS.md`; note `GEMINI.md` is in `agentProtectedPaths`, so register as terminal `ccx task`, not an Obsidian brief). | `gemini` (context file for Gemini, via terminal `ccx task add -Owner gemini -Owns GEMINI.md`, reviewed by Claude/Codex) | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 verify -TaskId <ID>` + `NEEDED`: Claude/user checks `GEMINI.md` byte size <24,000 and runs one `agy -p` smoke confirming no truncation. |
| **2. Create shared `.agents/skills/` (or `.agents/skills.json`) for Crucible lanes** (`source-research`, `ux-review`, `fable-judge`, `blender`, `higgsfield`, `ponytail`) using `SKILL.md` + `references/` progressive disclosure. | "`{ID: "antigravity", Name: "Antigravity", Project: ".agents/skills", ...}`" & "`{ID: "codex", Name: "Codex", Project: ".agents/skills", ...}`" ([install_skill.go](../ext/gemini-refs/gemini-api-cli/internal/cli/custom/install_skill.go)); "`.agents/skills/` alias takes precedence" ([skills.md](../ext/gemini-refs/gemini-cli/docs/cli/skills.md)). | Closes the skills gap for **both** Gemini (`agy`) and Codex in one place without duplicating `.claude/skills/` text into always-on prompts. | Low–Med (2–4h) | Low (progressive disclosure; note `.agents/` is in `agentProtectedPaths`, so register as terminal `ccx task`). | `gemini` (skills only, no routing/access changes, via terminal `ccx task add -Owner gemini -Owns .agents/skills/`, reviewed by Claude/Codex) | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 verify -TaskId <ID>` + `NEEDED`: user/Claude launches `agy` in repo root and checks skills load without policy errors. |
| **3. Diagnose & fix `agy --sandbox` `Access is denied..` on Windows, and align `crucible.ps1` / `policy.json` check handling.** Probe why `agy --sandbox` denied `git status --short` and `node scripts/check-sources.mjs`; keep read-only `agentSafe` checks runnable or document exact host-side Crucible rerun behavior and update stale `policy.json` line 141. | "`$settings = @{ ... enableTerminalSandbox = -not $turbo ...`" ([codex-dispatch.ps1](../scripts/codex-dispatch.ps1)); "`$docOnly = $docOnly -and $task.lastDispatch -and $task.lastDispatch.provider -eq 'openai'`" ([crucible.ps1](../scripts/crucible.ps1)); "Antigravity runs without shell access." ([ccx/policy.json](../ccx/policy.json)). | Restores read-only Git, search, `check-sources.mjs`, and read-only tool probes (`blender.ps1 version`, `higgsfield.ps1 summary`) inside standard Gemini runs instead of blind `NOT RUN`s. | Med (2–4h) | Med (touches launcher/sandbox behavior and `crucible.ps1`). | `claude/codex + user` (changes Gemini's access/launcher/policy) | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-codex-dispatch.ps1` and `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-crucible.ps1` + `NEEDED`: live `agy -p` probe running `git status --short` under `--sandbox`. |
| **4. Enable intentional Gemini `-Role verify` / `-Role research`, decouple from `codex.cmd`, and hard-block Gemini self-review fallback.** Allow `codex-dispatch.ps1` to launch Gemini without `codex.cmd` on `PATH`, permit explicit `-Role verify`/`-Role research` for Gemini on non-Gemini-routing tasks (giving Claude/Codex a live cross-model verifier when Codex is out), and refuse Gemini fallback whenever owned files touch Gemini's policy/launcher code. | "A review of Claude-authored work still routes to Codex in ccx, `verify` and `research` ... still default to Codex, and the launcher still needs `codex.cmd` on PATH even for Gemini runs." ([AGENTS.md](../AGENTS.md)); "A Codex `-Role verify` of UPGRADE-3R ... silently fell back to Gemini" ([FRICTION.md](../FRICTION.md)). | Unblocks cross-model verification and research when Codex is at its limit while technically enforcing the GEMINI-PRIMARY non-self-review rule. | Med (3–5h) | High (security/routing boundary: touches `codex-dispatch.ps1`, `ccx-core.ps1`, `ccx/policy.json`, `AGENTS.md`/`CLAUDE.md`). | `claude/codex + user` (routing and access change) | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx.ps1`, `scripts\test-ccx-ops.ps1`, and `scripts\test-codex-dispatch.ps1` (with new regression cases for no-`codex.cmd` Gemini launch and self-review fallback refusal). |
| **5. Add shared MCP parity for Gemini (`rea`, optional `higgsfield`) via `.agents/plugins/crucible-tools/mcp_config.json` + `ccx health` auditing.** Mirror `.mcp.json`'s pinned `rea` Stdio server (and `higgsfield` Streamable HTTP after interactive OAuth and L4 gate rules) into Antigravity's plugin MCP config, and add `geminiAllowedServers` to `ccx/policy.json` + `ccx health`. | Antigravity supports Stdio and Streamable HTTP in `plugins/<name>/mcp_config.json` (`agy-customizations/docs/mcp_servers.md`); `ccx/policy.json` currently audits only `codexAllowedServers` and `projectAllowedServers`. | Gives Gemini parity on authorized reverse-engineering (`rea`) and read-only Higgsfield inspection/quotes, under the same `ccx health` scope checks as Claude and Codex. | Med (2–4h) | Med–High (expands tool/MCP surface; Higgsfield write tools are L4 paid actions and require OAuth + explicit deny/prompt policy). | `claude/codex + user` (changes Gemini's access and `ccx/policy.json`) | `node scripts/test-rea.mjs`, `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx-ops.ps1`, and `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 health` + `NEEDED`: user verifies `rea` tool discovery inside `agy` and denies unapproved Higgsfield writes. |
| **6. Add an allowlist-only `scripts/gemini-api.ps1` wrapper for free-tier non-private multimodal/video analysis & transcription.** Pin a released `gemini-api` binary (outside repo under `$tools`), allow only `analyze` and `transcribe` (and `generate` with forced `store: false`) on `gemini-4-hydrogen` / `gemini-3.5-flash-lite`, enforce `--dry-run`, and hard-refuse paths matching `privacy.excludePaths` / `.geminiignore`. | "Ask questions about PDFs, images, audio, video, CSV/text files, or YouTube URLs (`gemini-4-hydrogen`)" ([gemini-api-cli/README.md](../ext/gemini-refs/gemini-api-cli/README.md)); "available on **both the free and paid tiers**" ([Get_started.ipynb](../ext/gemini-refs/cookbook/quickstarts/Get_started.ipynb)); "Claude-only, user-level: the `claude-video-vision` plugin" ([AGENTS.md](../AGENTS.md)). | Closes the Claude-only video-analysis gap using the existing `GEMINI_API_KEY` (plus agentic video understanding and SRT captions), while preventing accidental paid-model spend or private-file leaks. | Med (4–6h) | Med (external API call with free-tier key; requires binary install outside repo, privacy path filter, and verification of Google AI Studio free-tier terms). | `claude/codex + user` (external tool install, `scripts/`, `AGENTS.md`/`CLAUDE.md`, `EXTERNAL-TOOLS.md`) | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-external-tools.ps1` (with synthetic offline refusal tests matching `mpt.ps1` pattern) + `NEEDED`: one live `--dry-run` and one synthetic non-private file check by user/Claude. |
| **7. Pilot Gemini 4 agentic video understanding + Decisions API (`gemini-decision-1`) rubric scripts for `ux-review` and Judge fixtures.** Build a small opt-in Python helper (using `google-genai >= 3.2.0` / Interactions + Decisions `v1beta`) to run timestamped UX/video checks and zero-output-token Judge-fixture screening on synthetic fixtures. | "**agentic video understanding** ... Drastically reduces tokens (up to 88% fewer)" ([Video_understanding.ipynb](../ext/gemini-refs/cookbook/quickstarts/Video_understanding.ipynb)); "no output tokens to pay for (`total_output_tokens = 0`)" ([Get_started_decisions.ipynb](../ext/gemini-refs/cookbook/quickstarts/Get_started_decisions.ipynb)). | Cuts token cost on long screen recordings/playblasts and adds fast calibrated rubric screening as supplementary review evidence. | Med–High (4–8h) | Med (uses `v1beta` Decisions API; verify free-tier eligibility of `gemini-decision-1` before running; external API privacy rules apply). | `claude/codex + user` (new dependency/API helper; non-private synthetic trial only) | `NEEDED`: offline unit tests with mocked SDK responses + one synthetic run against `scripts/fixtures/judge-cases.json` (checked by Claude). |
| **8. `ccx` worktree & documentation hygiene for Gemini.** Add `"gemini": "gemini/"` to `ccx/policy.json` `worktrees.branchPrefix` and update `Start Here.md` / `ccx/ARCHITECTURE.md` where Gemini's `implement`/`refactor`/`docs` primary-worker lanes or shell status are out of date. | `""branchPrefix": { "claude": "claude/", "codex": "codex/" },"` ([ccx/policy.json](../ccx/policy.json)). | Enables isolated `ccx worktree add -TaskId <ID> -Agent gemini` branches matching Claude/Codex and removes contradictory docs. | Low (1h) | Low (`ccx` config + docs). | `claude/codex + user` (`ccx/policy.json` + docs) | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx.ps1` and `scripts\test-ccx-ops.ps1`. |

---

## Corrections after verification (Claude, 2026-11-27, from Codex's independent verify)

Gemini's retry cap was reached (its first run's exit 9 was a Claude edit, not Gemini's), so Claude applied Codex's verifier findings here instead of in the rows above. Where a row above disagrees with this section, this section wins.

- **Proposals 1 and 2 are done** (task GEMINI-CONTEXT, commit 3222a49): `GEMINI.md` points Antigravity past the 24,000-byte cut, and `.agents/skills.json` loads `.claude/skills` without `nursing-notes` and the two `offensive-*` modules (exact names: agy's exclude patterns behave like globs, so `offensive-.*` did not match).
- **Proposal 2, verification:** the launcher passes `--disable-slash-commands`. Claude tested it on 2026-11-27: with that flag agy still lists the shared skills, but `/skill` command expansion is off. Verify with a print-mode probe that passes `--disable-slash-commands`, not an interactive session. With that flag agy also warns that `--mode plan` has no effect; writes were still auto-denied in Claude's probe (headless agy refuses `write_file` without an allow rule), so read-only runs stay read-only, but plan mode is not one of the layers.
- **Proposal 3, diagnosis:** the `Access is denied.` shell failure comes from the launch method, not the settings. The same agy command with the same saved settings file runs `git status --short` from an ordinary PowerShell and fails when started through WMI, which `crucible.ps1 launch` uses (FRICTION.md, 2026-11-27).
- **Proposal 5, source cell:** the row paraphrases its source. The passage that supports it is in `~/.gemini/antigravity-cli/builtin/skills/agy-customizations/docs/mcp_servers.md` lines 28-29 (Stdio for local tools, Streamable HTTP for remote services). The checker skips this prose reference. A reviewer verified the transport descriptions directly against lines 28-29 (Codex, 2026-11-27).
- **Proposal 8 is incomplete:** besides the `branchPrefix` entry, `ccx worktree add` itself refuses every agent but `claude` and `codex` (`scripts/ccx-ops.ps1:443`, `Unknown worktree agent.`). The fix changes both.
- **Parity table, row 7:** `blender.ps1 audit` is not read-only (it writes its `-Out` report). The read-only probe is `blender.ps1 version`.

## UNKNOWN / CHECKED / NEEDED

- **Antigravity (`agy`) CLI flags (`stream-json`, typed exit codes, `--resume`, `agy plugin list`, sandbox root cause):**
  - *UNKNOWN:* Exact `agy 1.5.17` CLI flags beyond those in `scripts/codex-dispatch.ps1`, and why Antigravity's terminal sandbox returned `Access is denied..` on every `run_command` call (`Test-Path ...`, `git status --short`) during this headless run.
  - *CHECKED:* `scripts/codex-dispatch.ps1` (lines 433–468, 544–556), built-in `agy-customizations` docs (`SKILL.md`, `rules.md`, `skills.md`, `mcp_servers.md`, `hooks.md`, `plugins.md`, `json_configs.md`), and `antigravity_guide/references/cli.md`. Attempted two read-only `run_command` calls (`Test-Path ...` and `git status --short`), both failed with `Access is denied..`.
  - *NEEDED:* User or Claude runs `agy --help`, `agy plugin list`, and `agy -p "run git status --short" --sandbox --output-format json` in a Windows terminal to capture CLI capabilities and diagnose the sandbox `Access is denied..` error.
- **Google AI Studio free-tier data-training policy & `gemini-decision-1` / `gemini-3.5-transcribe` free-tier billing eligibility:**
  - *UNKNOWN:* Whether Google AI Studio's current free-tier Terms of Service allow Google to log/train on prompts/files sent via the machine's free-tier `GEMINI_API_KEY`, and whether `gemini-decision-1` and `gemini-3.5-transcribe` run on the free tier in this user's region without billing enabled.
  - *CHECKED:* All four cloned repositories under `ext/gemini-refs/` (including `cookbook/quickstarts/Get_started.ipynb`, `Get_started_decisions.ipynb`, `Authentication.ipynb`, and `gemini-api-cli/internal/output/errortable.go`). None embed Google AI Studio's legal data-use terms.
  - *NEEDED:* User/Claude reviews Google AI Studio's current Gemini API Terms of Service and pricing/rate-limit page before enabling any `gemini-api` wrapper or Decisions API trial, and confirms whether the local `GEMINI_API_KEY` belongs to a free-tier-only project with billing disabled.
- **Verification of `check-sources.mjs` in this run:**
  - *UNKNOWN:* Live exit code of `node scripts/check-sources.mjs handoffs/GEMINI-SELF-UPGRADE-report.md` (blocked by read-only/access-denied `run_command` in this sandbox; every cited passage was manually verified against raw file contents via `read_file`).
  - *CHECKED:* `scripts/check-sources.mjs` regex/normalization logic and raw lines of every cited file.
  - *NEEDED:* Crucible launcher (or Claude/user) runs `node scripts/check-sources.mjs handoffs/GEMINI-SELF-UPGRADE-report.md`.

---

Untested: `node scripts/check-sources.mjs handoffs/GEMINI-SELF-UPGRADE-report.md` (NOT RUN — `run_command` returned `Access is denied..` in Antigravity's terminal sandbox; Crucible launcher/Claude runs after return), live `agy --help` / `agy plugin list` / `agy --sandbox` shell repro (user/Claude), and live `gemini-api` free-tier probe (user/Claude).
