---
crucible: brief
owner: gemini
owns: handoffs/UPGRADE-ux-review.md
---
# UPGRADE-2-UX: rank the user's five biggest friction points in the Obsidian flow

Do this now: read the files below with your file tools and write `handoffs/UPGRADE-ux-review.md`. Follow HANDOFF.md, Implementer instruction; that file is your only write location. You have no shell: report anything that needs one as NOT RUN.

Walk the flow from the user's point of view, as someone who is not a programmer and works from Obsidian:
1. Opening the vault on `Start Here.md`.
2. Writing a brief (`scripts/crucible.ps1` `Invoke-New`, the brief frontmatter it writes, `Reference/` guides that Start Here links).
3. Pressing the rocket (launch) button in `.obsidian/plugins/crucible/main.js` and what happens next (`Invoke-Launch`, `Invoke-Run`, `Invoke-Check` in `scripts/crucible.ps1`).
4. Reading the result on the board (`Invoke-Board`, `Get-TaskView`, `Format-StatusNote` in `scripts/crucible.ps1`; `Status/` is generated, do not edit it, but you may read it).
5. Answering a BLOCKED report, switching owner, stopping a run (HANDOFF.md, Briefs from Obsidian; `Invoke-Stop`).

Rank the five biggest friction points, worst first. For each: what the user sees or has to do, why it costs them (time, confusion, a wrong action), the evidence as `path:line` with a short quote, and the smallest change that would fix it, naming the file it would touch. Mark each fix `mechanical` (clear, small, one file) or `judgement` (needs a design decision). Only fixes inside `scripts/crucible.ps1` or `.obsidian/plugins/crucible/` count for the top two; others still go in the list.

Report only: change nothing else. End with `Status`, `Untested:` and `Next owner: codex - plans the top two`.
