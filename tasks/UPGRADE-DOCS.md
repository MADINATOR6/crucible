---
crucible: brief
owner: gemini
owns: [handoffs/UPGRADE-docs-draft.md, Reference/Review checklist.md]
---
# UPGRADE-DOCS: draft the docs wording and the blind-review checklist

Do this now: write the two files below with your file tools. Follow HANDOFF.md, Implementer instruction; these two files are your only write locations. You have no shell.

## 1. `handoffs/UPGRADE-docs-draft.md`
Draft the wording AGENTS.md and CLAUDE.md need for the changes specified in `tasks/UPGRADE-1.md` (Requirements and decisions, items 1, 2, 3, 5, 6) and `tasks/UPGRADE-2-plan.md` (B board split into `Status/Terminal.md`, C `crucible.ps1 review-pack`). Read the current AGENTS.md and CLAUDE.md first. For each change give: the file, the exact existing sentence to replace (quoted, so it can be found), and the replacement; or "add after <quoted sentence>". Keep the house style: short plain sentences, no new headings unless needed. Both files must change together (symmetry rule, line 1 of each): when a fact lives in both, draft both edits. Item 6: AGENTS.md Roles names `gpt-oss-120b-medium` as selectable; note it retires 2026-11-30 and must not be chosen after that (CLAUDE.md's matching paragraph too, if it names it). Also draft the HANDOFF.md exit-code line for 4 ("usage limit, or a transient provider capacity/5xx failure: no attempt used") as a separate entry. Do not describe anything the specs do not say.

## 2. `Reference/Review checklist.md`
The checklist a blind reviewer (Claude Sonnet 5.5 in the Antigravity IDE, read-only, with no chat history) follows when the user opens a `handoffs/<id>-review.md` pack. 10-15 checkable lines, grounded in HANDOFF.md's Judge checklist and Plan critique: diff vs allowlist, weakened tests, claims without a run, failure paths, scope debris, secrets/private data (`*.xlsx`, `nursing-a2/`), unauthorized outward actions, symmetry rule. Each line is a question answerable from the pack and the repo. End with the verdict format (VERIFIED / VERIFIED WITH CAVEATS / REFUTED, findings with path:line, severity, smallest fix). Plain Markdown, no frontmatter.

End your report with `Status`, `Untested:`, `Next owner: claude - applies the draft`.
