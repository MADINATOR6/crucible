# LT-UI-3V: verify the phase 3 3D map work (read-only)

## Mode and owner
LT-UI-3V · verify role · read-only. Claude wrote the code under test; Codex tries to break it. Do not edit, create or delete repository files. Temporary files only under `%TEMP%`. Synthetic data only.

## Change under test
`git diff 4d4382d 70b88d1 -- lifting-tracker/`: Claude's follow-up to LT-UI-3. `styles/app.css` (the 3D section and the `.hm-view-toggle` rule at 720 px), `src/ui/views/muscles.js` (the Front/2D label spans), `src/ui/heatmap3d.js` (zoom limits, framing, back light, neutral colour, hint text) and `assets/build_body.py` (the Blender script that made `assets/body.glb`). The rest of LT-UI-3 (`git diff c018de7 4d4382d`) is context.

## What it should do
- Phones (under 720 px): the body view switch is Front / Back / 3D. Wide screens: both 2D figures show at once and the switch reads 2D / 3D (Back hidden, the first button's label swaps). With no WebGL there is no 3D button, and on wide screens the switch is hidden as before.
- 3D: the body fills the box with the feet clear of the hint pill; zoom goes from about 0.4 to 1.6 times the starting distance; the back is lit as well as the front; the skin uses `--line-strong` in both themes.
- `build_body.py` builds 35 meshes: 17 muscles × L/R plus `body_skin`, Y-up, facing +Z, feet on 0. Every mesh name passes `meshMuscleId`.

## Verify commands
- `cd lifting-tracker && node --test` (expect 271 pass, 1 skip).
- `node --check lifting-tracker/src/ui/heatmap3d.js` and the same for `lifting-tracker/src/ui/views/muscles.js`.
- Read `assets/body.glb`'s JSON chunk in a temp Node script: list mesh names, check each muscle id in `data/exercises.json` has `_L` and `_R`, and report the node bounding box from the accessors' min/max (expect about 1.8 m tall, minimum y near 0).

## Attack
- The 720 px switch: `aria-pressed` when the view is `back` on a phone and the window then widens; the `:has()` rules in browsers without `:has()` (does anything break, or does it only look plainer?); the switch hidden on wide screens when 3D is unsupported.
- `heatmap3d.js`: framing when the model is wider than it is tall (a future model, or a rotated one); a zero-size container (Muscles rendered while hidden); `--line-strong` missing or empty; the selected muscle's tip text when `data` lacks that muscle.
- `build_body.py`: anything that depends on Blender's default scene or version (it was run on Blender 5.2 with `--factory-startup`); names that the glTF exporter could suffix (`.001`) and whether `meshMuscleId` still matches them.
- CSS: classes used in `muscles.js` or `heatmap3d.js` that aren't defined in `app.css` or listed in `UI-CLASSES.md`.

## Report
HANDOFF.md Verifier instruction and Report format. Each problem gets a reproduction, file:line and severity.
