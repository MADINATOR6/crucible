---
name: higgsfield
description: Generate images, video, audio and ads with the Higgsfield MCP (Sora, Veo, Kling, Seedance, Nano Banana, GPT Image and more) using the user's Higgsfield credits. Use for /higgsfield, "make a video/ad/image with Higgsfield", animating a still, character sheets, upscaling, or comparing Higgsfield models. For pay-as-you-go keys without a Higgsfield plan use /generate instead.
---

# /higgsfield

Server `higgsfield` is declared in `.mcp.json` (tools `mcp__higgsfield__*`). First use: approve the project server, then sign in once with `/mcp` -> higgsfield -> Authenticate (browser OAuth; no key is stored in the repo). Codex: `codex.cmd mcp login higgsfield`, or the `higgsfield` CLI (`@higgsfield/cli`, same account).

**Roles.** Higgsfield is the video generator. Codex makes and edits media in ccx media tasks (HANDOFF.md, Media task), through the `higgsfield` CLI. Claude is the producer and reviewer: intake, brief, quotes, the user's spend approval, review and delivery, using these MCP tools for quotes and read-only checks. Claude generates only when the user says so for that job.

## Rules

1. **Credits are a paid action (L4 in AGENTS.md).** Before any `generate_*`, `ai_influencer_generate`, `upscale_*`, `execute_preset`, `ads_studio_generate`, `shorts_studio_create`, `dubbing` or other call that spends credits: run `balance`, state model, count and expected cost, and get the user's approval in chat (a budget they already stated counts). Pass `max_credits` at the approved amount where the tool takes one. For a ccx media task, set the cap with `ccx task add -CreditCap <cap>` and record the approval with `ccx gate -Action paid-action -Target <ID>` (HANDOFF.md, Media task).
2. **Pick the model, do not guess.** Call `models_explore` (action `recommend`) when unsure. Multi-step videos: `get_workflow_instructions` first. Recipes/effects: `get_presets` then `get_preset_instructions`. Browsing a preset never authorizes running it.
3. **Batch, then wait.** Independent variants go through `generate_image_batch` / `generate_video_batch`; poll with `jobs_wait` (timeout 15 s or less), then show once with `show_generation_by_ids`. Do not poll in a tight loop.
4. **Privacy.** Prompts and uploaded media go to Higgsfield and its model providers. Never upload or describe private data: the athlete's workbook or anything derived from it, nursing-a2 course material, secrets, personal files or faces of people who have not agreed. Upload only files the user named.
5. **Save locally.** Download finished media into gitignored `media-out/higgsfield/<project>/` with one ledger line per generation: `scripts/higgsfield.ps1 log -Project <p> [-Task <ID>] -Kind image|video|audio|upscale -Model .. -Credits .. -Job .. -File .. -Prompt ..`. `summary -Project <p> -Budget <n> [-Task <ID>] [-Next <quote>]` totals credits and exits 1 over budget, or when the next call would exceed it; run it before each new paid step. Never commit media. Report file paths and job ids.
6. **No publishing.** `publish_project`, `publish_website`, `deploy_website`, `tiktok_*` publish calls, `participate_in_contest` and anything that posts publicly need an explicit user request for that exact action. Never triggered by a generation task.
7. **Failures.** On a credit, auth or rate error, report it and stop; do not retry with other models to burn credits. Auth errors: re-run `/mcp` authenticate.
8. **Codex access.** If Codex lacks the login, the network or an approval, or the next call would exceed the cap, the media task stops with a report. Claude does not take the generation over; it asks the user who should run it.

## Workflow (read [playbook.md](playbook.md) before any multi-shot, ad or character job)

Playbook = `scripts/higgsfield.ps1 show`. In short:

1. **Intake once.** One question for image model, video model, aspect, resolution, duration, quality; then `higgsfield.ps1 new -Project <p> ...` and reuse silently. Plan and write prompts in Claude (free), send only generation calls to Higgsfield.
2. **Reference before video.** Hero image (full body) -> 3-panel character sheet on grey flat light / empty location / clean prop, all on the SAME image model -> `manage_reference_elements` create -> `higgsfield.ps1 element ...`. Reference elements in prompts as `<<<UUID>>>` only; `kling3_0` also needs a `start_image`.
3. **Cheap drafts, one fix at a time.** Draft at the lowest resolution with `count: 1` and `get_cost:true`; regenerate only the failed shot with a plain-English correction; dialogue goes in verbatim; lens as a field of view in degrees; empty start frame for multi-shot text-to-video.
4. **Upscale last**, only on the final cut.

## Higgsfield or /generate?

`/generate` (kie.ai, fal.ai, WaveSpeed) is cheapest per image, scriptable and offline-quotable. Use Higgsfield for models or workflows it alone has (Sora, Veo, Kling motion control, presets, ad and short studios, character sheets, 3D) or when the user wants to spend their Higgsfield plan credits.
