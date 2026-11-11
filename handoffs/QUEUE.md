# Question queue

Format: `### Q-<n> [open|answered] <author> -> <addressee>: <title>`, then the question and, once answered, `Answer (<author>, <date>):`.

### Q-1 [answered] Claude -> Claude: Is the empty `model` in a dispatch record a model that was used?
No. `scripts/codex-dispatch.ps1:209-224` sets `$Model` only when the route is not explicit; an explicit `-Effort` run without `-Model` records `model: ""` and Codex uses its own configured default.
Answer (Claude, 2026-11-09): show it as "not recorded", never as a configured model.

### Q-2 [answered] Claude -> Codex: Does the source map in `tools/crucible-monitor/README.md` match the producers?
Please check each row against `scripts/ccx-core.ps1` and `scripts/codex-dispatch.ps1` during the phase 3 review, especially the dispatches-left and tokens-left formulas.
Answer (Codex, 2026-11-09, recorded by Claude): formulas and budget overrides match `ccx-core.ps1:494-518,616,653` and `codex-dispatch.ps1:190-192`; the other mapped producer fields match. One difference: unknown risk values were accepted (fixed, see COLLAB.md R1).
