---
name: higgsfield
description: Generate images, video, audio and ads with the Higgsfield MCP (Sora, Veo, Kling, Seedance, Nano Banana, GPT Image and more) using the user's Higgsfield credits. Use for /higgsfield, "make a video/ad/image with Higgsfield", animating a still, character sheets, upscaling, or comparing Higgsfield models. For pay-as-you-go keys without a Higgsfield plan use /generate instead.
---

# /higgsfield

Server `higgsfield` is declared in `.mcp.json` (tools `mcp__higgsfield__*`). First use: approve the project server, then sign in once with `/mcp` -> higgsfield -> Authenticate (browser OAuth; no key is stored in the repo). Codex: `codex.cmd mcp login higgsfield`.

## Rules

1. **Credits are a paid action (L4 in AGENTS.md).** Before any `generate_*`, `ai_influencer_generate`, `upscale_*`, `execute_preset`, `ads_studio_generate`, `shorts_studio_create`, `dubbing` or other call that spends credits: run `balance`, state model, count and expected cost, and get the user's approval in chat (a budget they already stated counts). Pass `max_credits` at the approved amount where the tool takes one. For a ccx task record it with `ccx gate -Action paid-action`.
2. **Pick the model, do not guess.** Call `models_explore` (action `recommend`) when unsure. Multi-step videos: `get_workflow_instructions` first. Recipes/effects: `get_presets` then `get_preset_instructions`. Browsing a preset never authorizes running it.
3. **Batch, then wait.** Independent variants go through `generate_image_batch` / `generate_video_batch`; poll with `jobs_wait` (timeout 15 s or less), then show once with `show_generation_by_ids`. Do not poll in a tight loop.
4. **Privacy.** Prompts and uploaded media go to Higgsfield and its model providers. Never upload or describe private data: the athlete's workbook or anything derived from it, nursing-a2 course material, secrets, personal files or faces of people who have not agreed. Upload only files the user named.
5. **Save locally.** Download finished media into gitignored `media-out/higgsfield/` (create it) with a one-line `log.jsonl` entry per file: prompt, model, credits, job id. Never commit media. Report file paths and job ids.
6. **No publishing.** `publish_project`, `publish_website`, `deploy_website`, `tiktok_*` publish calls, `participate_in_contest` and anything that posts publicly need an explicit user request for that exact action. Never triggered by a generation task.
7. **Failures.** On a credit, auth or rate error, report it and stop; do not retry with other models to burn credits. Auth errors: re-run `/mcp` authenticate.
8. **Codex sandbox.** Codex may lack network or the MCP login; if so Claude runs the generation and Codex works from files in `media-out/higgsfield/`.

## Higgsfield or /generate?

`/generate` (kie.ai, fal.ai, WaveSpeed) is cheapest per image, scriptable and offline-quotable. Use Higgsfield for models or workflows it alone has (Sora, Veo, Kling motion control, presets, ad and short studios, character sheets, 3D) or when the user wants to spend their Higgsfield plan credits.
