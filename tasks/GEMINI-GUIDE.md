---
crucible: brief
id: GEMINI-GUIDE
owner: gemini
type: docs
class: normal
risk: low
owns: [Reference/Three-agent team.md]
checks: []
---
# GEMINI-GUIDE: a one-page team guide for the user

## Outcome
Write `Reference/Three-agent team.md`: a plain-language guide the user reads in Obsidian, at most about 700 words. It explains how Claude, Codex and Gemini work together in Crucible today. You are writing for the user, not for an agent: short sentences, no jargon without a one-line explanation, no restating of rules as if this file were the authority (AGENTS.md wins; say so once at the top).

Cover:
1. **Who does what:** Claude (implements, checks, commits, pushes with the user's yes), Codex (plans code work, reviews and verifies, makes video in media tasks), Gemini (research, creative, UX and video review, docs, and any brief the user gives it). The owner a brief names leads.
2. **How the user starts work:** `Start Here.md`, a new brief with an owner, Launch, and where results and Status show up.
3. **What keeps it safe:** only ccx accepts work as done; another agent reviews each piece; pushes, publishing and anything that spends money or credits need the user's explicit yes; Gemini never approves changes to its own access.
4. **New this week (2026-11-26 to 11-28):** shared skills for Gemini, the Gemini API tool for video/PDF analysis (private files refused), Rea and Higgsfield in Antigravity (Higgsfield spending stays behind approval), the Ponytail work style, and commit authors (each agent is credited for what it writes). Mark anything not merged yet as "coming" rather than done; check the repo, don't guess.

## Inputs (read only these)
`AGENTS.md`, `CLAUDE.md`, `HANDOFF.md` (Briefs from Obsidian), `EXTERNAL-TOOLS.md`, `Start Here.md`, `handoffs/GEMINI-UPGRADE-approvals.md`, `HANDOFF-REPORT.md`. Never read `nursing-a2/`, `*.xlsx`, `.env*` or `Status/.runs/`.

## Review, cycle 1 (Claude, 2026-11-28)
Good guide; keep its shape and length. Your worktree was cut before the user's latest approvals, so three facts are stale. Fix only these:
1. "Gemini API tool": the user approved it on 2026-11-27 ("6. do this") and it is built and tested (task GEMINI-TOOLS, `scripts/gemini-api.ps1`, `analyze` and `transcribe` only, private files refused); say it is coming once merged, not waiting on approval. Google's free-tier servers returned "high demand" on live calls so far.
2. "Rea and Higgsfield in Antigravity": approved ("5. do this"). Rea is built (Antigravity loads it as `crucible-tools_rea`); Higgsfield comes together with a rule that blocks its spending tools in every Gemini run.
3. "What keeps it safe": approvals are given in chat to Claude (who records them with `ccx approve -Chat`) or in a terminal, not only in a terminal. Keep "Obsidian never approves".
Also: commit authors were approved on 2026-11-28; Codex will be credited as `codex` and Gemini as Google's `gemini-code-assist[bot]` app.

## Done When
- The file exists, under about 700 words, with the four parts above and a one-line note at the top that AGENTS.md is the authority.
- Every factual claim matches one of the inputs; nothing invented (no commands, flags or features that are not in them).
- Your report ends with an `Untested:` line.
