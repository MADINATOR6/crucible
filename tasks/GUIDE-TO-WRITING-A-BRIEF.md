---
crucible: brief
id: GUIDE-TO-WRITING-A-BRIEF
owner: gemini          # gemini | claude | codex | auto (ccx picks by type)
type: source-research      # implement, debug, docs, source-research, creative, ux-review, ...
class: normal       # routine (one agent, deterministic checks) | normal | complex
risk: low
owns: [Reference/Writing a brief.md]
checks: [sources]
---
# Guide to writing a brief

## Outcome
A one-page reference, `Reference/Writing a brief.md`, that tells the user how to write a brief in this vault so the chosen agent (Gemini, Codex or Claude) can finish it in one run without coming back with questions. Written for the user, in plain words.

## Inputs
Read only these (all shareable, all in this repository):
- `Start Here.md`
- `HANDOFF.md`, sections "Implementer instruction", "Report format" and "Briefs from Obsidian (any owner)"
- `AGENTS.md`, sections "Scope", "Definition of Done" and "Uncertainty"
- `ccx/policy.json`, the `taskTypes` and `checks` sections

## Done When
- The guide covers: choosing the owner and type, writing Outcome and Done When so they can be checked, what to put in `owns:` and `checks:`, what is safe to put in Inputs, and how to answer a blocked agent.
- Each piece of advice that comes from a project rule is backed by a quoted passage in the exact citation form `> "exact passage" — [file](../relative/path)` (paths relative to `Reference/`). At least six quoted passages.
- `node scripts/check-sources.mjs "Reference/Writing a brief.md"` passes.
- Under 600 words, no invented rules: anything the sources do not say is marked as a suggestion.

## Answers
Replies to an agent's question go here; launching again sends them.

Use the existing draft as your starting point. Check that it explains how to choose a permitted `checks:` ID and that Obsidian can open cited paths containing spaces. Crucible will verify the quotations after the run. Include the handoff report and name Codex as the next reviewer.

## Status
![[Status/GUIDE-TO-WRITING-A-BRIEF]]
