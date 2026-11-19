# LT-POL-CV: review batch C of the design polish (read-only)

## Mode and owner
LT-POL-CV · verify role · read-only. Codex implemented LT-POL-C (`tasks/LT-POL-C.md`); this run tries to break it. Do not edit, create or delete repository files. Temporary files only under `%TEMP%`. Synthetic data only.

## Change under test
`git diff -- lifting-tracker/` against HEAD (`5446fa0`). Ignore dirty paths outside `lifting-tracker/`.

## Verify commands
- `cd lifting-tracker && node --test` (expect 388 pass, 1 skip).
- `node --check` on each changed `.js`.

## Attack
- Meaning carried by faintness: Progress says "Faded dots are light days, left out of the trend". After C4, are faint dots still clearly distinguishable from normal dots by something other than a small opacity step (size, hollow, stroke)? If the only remaining difference is opacity 0.95 vs 1, that's a regression: report it.
- `±0`: does it break any test, `aria`/`title`, column alignment rule, or the share-heatmap image renderer that may reuse the same markup or text?
- Axis unit and ★ PR legend: correct unit in kg and lb modes; legend only when stars are drawn; escaping; nothing added to charts that have no PRs (body weight, energy).
- 3D groove colour: light theme only; dark unchanged; theme switch at runtime updates it on next `update`.
- Share-progress dots: only the light background changed; transparent and dark exports unchanged.
- Data, band edges and geometry unchanged (task hard limits).

## Report
HANDOFF.md Verifier instruction and Report format. Each problem: reproduction, file:line, severity.
