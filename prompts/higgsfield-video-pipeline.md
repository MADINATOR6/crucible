# Higgsfield Video Pipeline Prompt

Paste everything below the line into Claude Code opened in the Crucible repo (`C:\Users\Madison\code\claude-codex-collab`).

---

Make Higgsfield video production a first-class Crucible workflow, so Claude, Codex and Crucible itself (ccx, HANDOFF, inventory, health, tests, docs) each have a defined part. Work in phases and stop where told.

## Target operating model

- **Higgsfield** is the only video generator. All image, video and audio generation goes through the `higgsfield` MCP server that `.mcp.json` and `.codex/config.toml` already declare.
- **Codex** is the video maker. It turns a brief into shots and prompts, makes the Higgsfield calls (uploads, reference frames, elements, video, upscale), edits with ffmpeg (cuts, sound mix, end cards), logs every job and reports the evidence.
- **Claude** is the producer and quality check. It does intake from the user, writes the brief, gets spend approval, passes chat attachments to Codex as files, reviews the output, accepts or rejects it, delivers it and records lessons. Claude does not generate or edit unless the user says so for that job.
- **Crucible** enforces it:
  - a ccx task type and route for media work;
  - the paid-action gate and a credit cap per task;
  - the ledger as the source of truth for credits;
  - HANDOFF instructions for media tasks;
  - an inventory row, a health check and offline tests;
  - mirrored AGENTS.md and CLAUDE.md docs.

## Hard rules

- Spending Higgsfield credits is L4 `paid-action`. No paid call happens without a recorded `ccx gate -Action paid-action` approval that names the model and a credit cap the user approved in chat. Approvals expire per `approvalTtlMinutes`; re-ask after that.
- Before every paid call: get a quote with `get_cost: true`, then run `scripts/higgsfield.ps1 summary -Project <p> -Budget <cap>`. If the next call would exceed the cap, stop and report. Never raise a cap yourself.
- Codex cannot ask the user anything mid-run. A missing approval, an exceeded cap or a failed Higgsfield login is a stop condition with a report, never a reason for Claude to quietly take over. Claude may run a generation itself only when the user says so for that job.
- Privacy: never upload or describe the lifting workbook or anything derived from it, `nursing-a2/`, secrets, personal files, or faces of people who have not agreed. Upload only files the user named. Pets and the user's own photos are fine when the user supplies them.
- Media stays in gitignored `media-out/higgsfield/<project>/`. Never commit media. Publishing or posting needs its own explicit request.
- Follow AGENTS.md: keep AGENTS.md and CLAUDE.md symmetric in the same commit, use the smallest correct change, and have no commit trailers. The working tree has unrelated uncommitted edits (`finance-shorts/`, `.gitignore`, `.claude/skills/nursing-notes/`, ...). Never stage, revert or touch them.
- Label findings FACT (checked), ESTIMATE or UNKNOWN.

## Phase 1: Audit and capability probe (no spend, no repo writes)

1. Read the Higgsfield parts that already exist:
   - the AGENTS.md and CLAUDE.md External Tools rows and the Higgsfield paragraph;
   - `.claude/skills/higgsfield/SKILL.md` and `playbook.md`;
   - `scripts/higgsfield.ps1` and `scripts/test-higgsfield.ps1`;
   - `.codex/config.toml`, `.mcp.json` and `.claude/settings.json` (MCP allowances);
   - the `.claude/agents/video-expert.md` role;
   - the HANDOFF.md Dispatch and external-tool sections;
   - the `ccx/policy.json` `taskTypes`, `permissions` and `mcp` blocks;
   - the `generate` row in `scripts/check-external-tools.ps1`.
2. Probe whether Codex can actually drive Higgsfield. These unknowns decide the design:
   - Is Codex signed in? Run `codex.cmd mcp list` and check whether `higgsfield` is listed and authenticated. If not, tell the user to run `codex.cmd mcp login higgsfield` in their own terminal, then wait.
   - Can a non-interactive `codex.cmd exec` call Higgsfield MCP tools without a human approving each call? Dispatch a read-only Codex probe that calls only `balance` and `models_explore` (`action: get`, `model_id: seedance_2_5`) and reports the raw results. If it blocks on an approval prompt, record the config needed to allow those tools (approval and sandbox settings for that MCP server), not a bypass.
   - Can Codex's sandboxed shell reach Higgsfield's presigned upload URLs (curl PUT) and download result URLs? Test only with a result URL that already exists in `media-out/higgsfield/`, not a new upload.
   - Is ffmpeg/ffprobe on Codex's PATH inside its sandbox?
3. Report a gap table: each piece of the target model against what exists today, marked missing, partial or present. Then give the proposed changes as a file allowlist.

**STOP after Phase 1. Wait for the user to approve the plan and allowlist.**

## Phase 2: Wire it into Crucible (approved files only)

Register this as a ccx task (`task add`, type `implement`, class normal, risk normal; `docs` for doc-only parts). Codex implements well-specified parts in Dispatch mode; Claude reviews the diff and commits. Expected changes, adjusted to the Phase 1 findings:

1. **ccx routing:**
   - add task types `media-generate` (route worker, agent codex, codexRole implement, level L4 because it spends credits) and `media-edit` (agent codex, L2, local ffmpeg only);
   - `ccx route` must return a required `paid-action` gate and a credit cap for `media-generate`;
   - `task done` must refuse a `media-generate` task whose ledger total exceeds its cap or that has no approval on record.
   - Reuse existing gate and budget mechanics; do not invent a parallel system.
2. **Ledger as truth:**
   - `higgsfield.ps1` gets the fields the gate check needs: a cap on the project (`new -Budget`) and an optional ccx task id per log row;
   - `summary -Budget` stays the hard check.
   - Keep it bookkeeping only: it never calls Higgsfield.
3. **HANDOFF.md:** add a "Media task (Higgsfield)" section.
   - **Brief template:** goal, project slug, reference files, settings, beats with timings, sound cues, exclusions, credit cap, gate approval id, Done When.
   - **Codex media-maker instruction:**
     - run `higgsfield.ps1 show` first;
     - quote before each paid call and re-check `summary`;
     - make cheap drafts first (480p `draft: true` where the model offers it), then the final;
     - regenerate only the failed shot;
     - download every result into the project folder;
     - write one `log` line per job.
   - **Report format:** job ids, models, credits per job, total against cap, file paths, ffprobe line, beat-by-beat self-check.
   - **Claude's After return review:** contact sheet with ffmpeg tile, beat check against the brief, likeness check against the reference, ffprobe for resolution, duration and audio, and the `video_watch` tool when audio content matters. Accept, or send specific fix notes for at most 2 review cycles per AGENTS.md caps.
4. **Roles:**
   - AGENTS.md and CLAUDE.md Roles: Codex makes and edits video through Higgsfield and ffmpeg; Claude produces and reviews.
   - `video-expert` becomes Claude's reviewer for media output (analysis only, no generation).
   - Replace the current "Codex's sandbox may block the network or lack the login; Claude then runs the generation" text with the stop-and-report rule above.
   - Mirror every change in both files.
5. **`tool:` metadata:** add `higgsfield` to the allowed values in AGENTS.md, CLAUDE.md and HANDOFF.md (valid for both agents; paid, needs the gate).
6. **Inventory and health:**
   - `check-external-tools.ps1` gets a `higgsfield` row (offline: `higgsfield.ps1 show` runs, and both client configs declare the server; login and credits reported as UNKNOWN, never tested by spending);
   - `ccx health` runs `scripts/test-higgsfield.ps1`.
7. **Tests (offline, synthetic data only):**
   - extend `test-higgsfield.ps1` for the new cap and task-id fields and the over-budget exit;
   - add ccx tests for the new task types, the gate requirement and `task done` refusal;
   - keep `test-external-tools.ps1` docs-symmetry checks passing.
8. **Playbook lessons** (from the 2026-10-24 poodle test; add to `playbook.md`):
   - Character from a pet photo: `gpt_image_2_5` with the photo as `image_references` gives a 3D first frame that keeps the likeness (2.75 credits, high, 2k, 9:16).
   - Video: `seedance_2_5` `mode: omni_reference` with that frame as `start_image` and timed beats in the prompt (`0-2s: ...`) hit every beat; `generate_audio: true` produced a sound track. Quotes for 10s 9:16: 1080p 160, 720p 70; `kling3_0` pro 25.
   - Higgsfield may answer a generate call with a preset suggestion instead of a job. Re-send with `declined_preset_id` when the preset does not fit the brief.
   - Upload: presigned PUT needs headers `Content-Type` and `If-None-Match: *`, then `media_confirm`.
   - Log the test in the ledger as project `poodle-popcorn`: image 2.75, video 160, job ids `4ee7e75d-632e-42c3-bb35-53cb10d0d25d` and `ce08f51c-7908-4fbf-b1a1-e5eceef6a091`. The files are in `C:\Users\Madison\code\poodle-popcorn-short\`; copy them into the project folder.
9. Run the targeted tests, then `ccx verify -TaskId <id>`, a cross-model `task review`, and `task done`. Commit only the allowlisted files. Run `scripts\sync-mirror.ps1` after the commit. Do not push without approval.

**STOP after Phase 2. Report what changed and the test evidence, and wait for approval to run the pilot.**

## Phase 3: Paid pilot (end to end, after explicit approval)

One short job proves the loop: Claude intake, ccx task, gate, Codex makes, Claude reviews.

- **Default pilot:** reuse the poodle character frame (job `4ee7e75d-...`) for a new 5-second 9:16 beat, such as the poodle sniffing a popcorn bowl then sneezing kernels.
- **Order:** a 480p draft first, the final only if the draft passes review.
- **Quote first.** Suggest a cap of at most 60 credits; the user sets the real cap.
- **Claude:** registers the `media-generate` task, records the gate with the user's chat approval, writes the brief from the HANDOFF template and dispatches Codex.
- **Codex:** runs the job end to end and reports.
- **Claude:** reviews against the brief, accepts or sends one round of fix notes, and delivers the file path.
- **Check** that the ledger total matches the Higgsfield `balance` drop, and that `task done` passes only with gate, cap and review all satisfied.
- **Log any friction** in FRICTION.md.

## Final report

Lead with the bottom line: can Codex now make a Higgsfield video unattended inside a ccx task, yes or no, and what blocks it if not. Then give a table of changes, the test evidence, pilot credits spent against the cap, and open items as UNKNOWN / CHECKED / NEEDED. Keep it short.
