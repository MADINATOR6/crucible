---
name: generate
description: Generate images with pay-as-you-go model providers (kie.ai, fal.ai, WaveSpeed) instead of a Higgsfield-style subscription. Routes to the cheapest provider that has a key, quotes the cost first, enforces a budget, saves files and prompts locally, and builds a gallery. Use for /generate, "make N image ads/variants of ...", or comparing image models.
---

# /generate

Run everything through the shared wrapper, from the repo root (Codex uses the same command; see AGENTS.md External Tools):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate.ps1 list
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate.ps1 run <model> "<prompt>" [--aspect 16:9] [-n 3] [--budget 3] [--provider fal] [--dry-run]
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate.ps1 gallery
```

## Rules

1. **Spending is a paid action (L4 in AGENTS.md): get the user's approval first.** Run `--dry-run`, show the quote, and proceed only after the user approves that amount in chat (a budget the user already stated for this request counts). Never raise `--budget` above what they approved. `ccx gate -Action paid-action -Target "<model> <n> <quote>"` records it when a ccx task is active.
2. **Quote before spending.** `run` prints `quote: ... = $X` and refuses if it exceeds `--budget` (default $1.00).
3. **Prompts are yours to write.** Craft a distinct prompt per variant; the script sends exactly what you pass to a third-party provider. Never put private data in a prompt (the lifting workbook or anything derived from it, secrets, personal files). This version is text-to-image only; describe reference styles in words.
4. **Comparing models:** call `run` once per model, splitting the approved budget. Report which provider served each.
5. **Missing key:** the script names the env var (`KIE_API_KEY`, `FAL_KEY`, `WAVESPEED_API_KEY`). Tell the user to set it in their environment or the repo-root `.env` (gitignored; also read from the main checkout when in a worktree). Never ask for, read, print or paste a key or the `.env` file.
6. **Outputs** land in `media-out/generations/` (gitignored, never commit) with `log.jsonl` recording prompt, model, provider and cost per file. After generating, run `gallery` and give the user the `index.html` path and file paths.
7. Costs marked `?` in `list` are estimates; say so when quoting them.
8. **Codex sandbox:** Codex's default sandbox may block network. `list`, `--dry-run` and `gallery` work offline; if a real `run` fails on network, Claude runs the generation and Codex works from the saved files.

## Add a model

Copy an entry in `models.json`, set the provider's model id from its docs, the per-image USD cost, and any fixed `extra` input fields. Routing picks it up automatically. Video models are not wired yet: they need a longer poll and a different result shape.

## Check

`python -I .claude/skills/generate/test_generate.py` (offline: routing, budget guard, fallback, log, gallery). `scripts/test-external-tools.ps1` also covers the wrapper and docs symmetry.
