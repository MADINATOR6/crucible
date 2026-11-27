# Three-agent team

> **Note:** [[AGENTS|AGENTS.md]] is the authority for Crucible's rules. This page is a plain-language overview for you and does not replace or soften it.

Crucible lets Claude, Codex, and Gemini work on the same repository without stepping on each other. Each agent has a default lane, and you stay in charge of what starts, what ships, and what spends money.

## Who does what

- **Claude** implements code tasks, runs checks, commits changes, and pushes to GitHub after you say yes. In media tasks, Claude writes the brief and reviews the result.
- **Codex** plans code work before edits begin, independently reviews and verifies changes, and generates or edits video in media tasks.
- **Gemini** handles research, creative work, UX and visual/video review, documentation, and any brief you assign to it. It runs through Google's Antigravity CLI on your Google AI Pro plan, and is also the default worker for new implementation, refactor, and docs briefs when no other owner is set.
- **The owner you pick wins.** Naming an owner on a brief overrides the defaults above. Pick **Automatic** if you want Crucible to choose by task type.

## How you start work

1. Open [[Start Here|Start Here.md]] in Obsidian.
2. Press **Ctrl+P → Crucible: New brief**. Describe the outcome and pick an owner (Automatic, Gemini, Claude, or Codex).
3. Fill in the brief's **Outcome**, **Inputs**, and **Done When**, plus which files the task may change (`owns:`) and any checks to run (`checks:`).
4. Click the rocket icon in the left ribbon, or run **Ctrl+P → Crucible: Launch this brief**. Only Launch starts work. Saving or clicking twice never starts a duplicate run, and closing Obsidian does not stop a running task.

**Where results show up:** Every brief ends with a live **Status** section showing its owner, links to real output files, check results, and the latest report. The home page (`Start Here.md`) shows the live project board (`Status/Board.md`), while other terminal tasks and notices appear in `Status/Terminal.md`. If an agent gets blocked, write your reply under `## Answers` in the brief and launch again. To hand work to another agent, change `owner:` and launch again.

## What keeps it safe

- **Only ccx accepts work.** `ccx` (Crucible's control plane, which tracks ownership, checks, and approvals) is the only authority that can mark a task done. An agent claiming "done" is never enough by itself.
- **Another agent checks the work.** Before `ccx` accepts a task, a different agent reviews it. Because Gemini's sandboxed shell is read-only, every Gemini-led implementation, refactor, or docs task gets an independent review on every class, including routine work.
- **You approve outward and paid actions.** Pushing to GitHub, publishing, spending money or Higgsfield credits, and full machine access require your explicit yes—in chat to Claude (who records it with `ccx approve -Chat`) or in a terminal (the board shows the command). Obsidian never approves.
- **Clear boundaries and privacy.** Gemini never authors or approves changes to its own routing or access rules. Private files (`nursing-a2/` and your workbook) are excluded and never sent to any AI provider.

## New this week (2026-11-26 to 11-28)

**Live now:**
- **Shared skills for Gemini:** Antigravity now loads Crucible's shared skills (Blender, Fable Judge, Generate, Higgsfield, and Scroll Site—excluding nursing notes and security modules) and uses `GEMINI.md` so it reads the full `AGENTS.md` rulebook.
- **Ponytail work style:** All three agents now follow the Ponytail rule—read the existing code first, reuse what already works, and write the smallest safe change without cutting validation or security.

**Coming (not merged yet):**
- **Gemini API tool for video and PDF analysis:** Approved 2026-11-27, built, and tested (task GEMINI-TOOLS); coming once merged. `scripts/gemini-api.ps1` runs `analyze` and `transcribe` only and refuses private files; Google's free-tier servers returned "high demand" on live calls so far.
- **Rea and Higgsfield in Antigravity:** Approved; coming once merged. Rea (local app/binary inspection) is built and loads as `crucible-tools_rea`. Higgsfield (video/media) comes with a rule blocking its spending tools in every Gemini run; Higgsfield spending stays behind your approval.
- **Commit authors:** Approved 2026-11-28; coming once merged. Commits will credit Codex as `codex` and Gemini as Google's `gemini-code-assist[bot]` app.
