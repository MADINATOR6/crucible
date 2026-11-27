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

## Done When
- The file exists, under about 700 words, with the four parts above and a one-line note at the top that AGENTS.md is the authority.
- Every factual claim matches one of the inputs; nothing invented (no commands, flags or features that are not in them).
- Your report ends with an `Untested:` line.
