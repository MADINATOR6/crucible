# LT-POL-BV: review batch B of the design polish (read-only)

## Mode and owner
LT-POL-BV · verify role · read-only. Codex implemented LT-POL-B (`tasks/LT-POL-B.md`); this run tries to break it. Do not edit, create or delete repository files. Temporary files only under `%TEMP%`. Synthetic data only.

## Change under test
`git diff -- lifting-tracker/` against HEAD (`bddcfd6`). Ignore dirty paths outside `lifting-tracker/`.

## Verify commands
- `cd lifting-tracker && node --test` (expect 388 pass, 1 skip).
- `node --check` on each changed `.js`.
- Ink helper: for every colour in `data/plates.json`, and for edge inputs (`#000000`, `#ffffff`, a mid grey like `#777777`, a 3-digit `#fff`, an empty or invalid string), print the chosen ink and its ratio.

## Attack
- Hard limits in the task file: did anything change plate maths, loading order, `SIZES`, `BAR`, `TILT`, the fixed frame, or the 3D bar's geometry/camera? (Diff the constants.)
- Side view: is a plate's print ever shown when it would be under ~9 px at a 375 px stage, or hidden on the outermost large plate? Render `renderBarbell` for 1 × 25; 25,25,20,10,2.5,1.25; 5,2.5,1.25,0.5,0.25; lb plates; collars on and off; check the SVG parses and the print rule holds.
- Non-breaking spaces in the plate text: the visible string and any `aria-label`/screen-reader text still read "2 × 25" correctly; `perSideText` itself unchanged; train.js `#bb-text` still filled the same way.
- Disabled plate buttons: still `disabled`, still can't be tapped, the dashed cue present.
- Stage height: Side, End and 3D the same height; anything (collar knob, floor shadow, 3D canvas) at risk of clipping.

## Report
HANDOFF.md Verifier instruction and Report format. Each problem: reproduction, file:line, severity.
