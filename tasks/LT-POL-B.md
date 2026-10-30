# LT-POL-B: design polish batch B, Plates and the barbell

## Mode and owner
LT-POL-B · implement · normal · risk low · Dispatch in the base checkout, after LT-POL-A is committed. Codex implements; Claude reviews, re-measures in headless Chrome and owns all Git. Synthetic data only. The user asked for this batch explicitly: "improve the barbell design too" and "plates too".

## Hard limits
Polish only: no new features, controls, data or behaviour changes. Plate maths, loading order, which plates exist, the bar's to-scale geometry (`SIZES`, `BAR`, `TILT`, the fixed frame `X0..Y1` "so adding plates never zooms") and the 3D bar's dimensions stay exactly as they are. The plate drawings stay realistic; improve legibility and finish, don't cartoonise. `sw.js`, README and `VERSION` are Claude's.

## Write allowlist
`lifting-tracker/src/ui/barbell.js`, `lifting-tracker/src/ui/barbell3d.js`, `lifting-tracker/src/ui/views/plates.js`, `lifting-tracker/src/ui/views/train.js` (B5 only: the same plate-text markup), `lifting-tracker/styles/app.css` (only the `.bb-*`, `.plate-*`, `.loading-text` rules), `lifting-tracker/UI-CLASSES.md` (only if you add a class), `lifting-tracker/test/ui/barbell.test.js` if it exists (else no new test file unless B1's helper needs one: then `lifting-tracker/test/ui/plate-ink.test.js`).

## Evidence
Before screenshots (example data, headless Chrome) in `media-out/app-polish/screens/before/`: `plates-*`, `plates-loaded-side-*`, `plates-loaded-end-*`, `plates-loaded-3d-*` at 375/412 px, light/dark (the loaded bar is 25, 25, 20, 10, 2.5, 1.25 kg each side). Read them before you start.

## Issues
- **B1 Plate print/ink by real contrast.** `views/plates.js:127` (picker disc text, helper `lum` at :287), `barbell.js:66-67` (side-view print) and `:144` (end-view print) choose white vs near-black ink with a `luminance < 0.35` cut-off. On the 10 kg green `#16a34a` that gives white at 3.3:1 (dark ink gives 5.7:1). Replace the cut-off with "whichever ink has the higher WCAG contrast against the plate colour", in one small exported helper in `barbell.js` that `plates.js` reuses (delete `plates.js`'s own `lum` if it becomes unused). Picker discs must reach 4.5:1 for every colour in `data/plates.json`.
- **B2 Small change plates vanish (side view).** In the loaded side view the 2.5 kg (black) merges into the dark hub, collar and outlines, and the 1.25 kg print is about 6 px. Give every plate face a thin light rim highlight whose strength scales with how dark the plate is (black/dark plates get a clearly visible light edge; light plates keep the dark edge), so adjacent dark discs separate. Show a plate's printed weight only when it would render at ≥ 9 px on a 375 px screen (the stage is about 310 px wide for an 780-unit frame); otherwise omit the print rather than show an unreadable smear.
- **B3 End view.** Same rim treatment for dark rings so the 2.5 kg ring separates from the hub; keep "only the nearest plate carries print". Keep the stylised sizing rule exactly.
- **B4 3D bar (`barbell3d.js`).** Dark plates read as holes and small plates hide behind the collar from the default camera. Give dark plate materials a slightly lighter rim/edge (material or edge colour only; no geometry or camera change) so their outline reads against the dark background in dark theme. If this can't be done without geometry/camera changes, skip it and say why.
- **B5 Loaded-plates text.** `.loading-text` (app.css:228) shows "2 × 25, 1 × 20, 1 × 10, 1 × 2.5, 1 × 1.25 each side" at 22 px display font and wraps with an orphan "1 ×". Keep `perSideText` (tested, in `src/plates/`) untouched; in the views (plates.js:122, train.js where `#bb-text` is filled) make each "n × w" unbreakable (non-breaking spaces around ×, display only) and set `.loading-text` to `--t-md` with `text-wrap: balance`. The figure above it ("192.5 KG") stays the hero.
- **B6 Picker sub-labels and disabled plates.** `.plate-btn small` "2 left" is 11 px muted (app.css:225): use `--t-xs`. Disabled plate buttons are opacity .35 (226): raise to about .5 and add a non-colour cue (for example a dashed ring), keeping `disabled` semantics.
- **B7 Stage proportions.** At 375 px the side-view stage is mostly empty (top padding 14 px plus a fixed 780 × 518 frame, the empty bar sitting low-right). Without changing the frame or scale, trim the stage's padding/min-height on phones so the bar and the weight figure sit higher, and make sure nothing is clipped at 375 px (plates, collar knob, floor shadow). Side, End and 3D stages should be the same height so switching views doesn't jump.
- **B8 Plates screen hint text.** The line above the view switch reads "Tap a plate to remove it" (Side), "End view (stylised: …)" (End), "Drag to turn; tap a plate to remove it" (3D), and the 3D view repeats it in a pill. Keep the wording; make the line one consistent style and height so the switch doesn't move between views.

## Out of scope
Shared tokens and controls (batch A, already done), Calibration/Load/Bar & collars/Warm-up/Meet planner cards (unless a B-rule touches them), the share-image renderer, plate data.

## Verify (Codex)
- `cd lifting-tracker && node --test` (count may not drop); `node --check` each changed `.js`.
- A temp Node script under `%TEMP%`: for every colour in `data/plates.json`, the chosen ink and its ratio (all ≥ 4.5).
- Render `renderBarbell` and `renderEndView` for the loaded example (25, 25, 20, 10, 2.5, 1.25 kg, collars on and off) to SVG files under `%TEMP%` and confirm they parse (for example a quick XML well-formedness check); you can't view them, say so.
- `git diff --check`.

## Done When
1. (Codex) B1–B8 fixed or left with a reason; report each with file:line.
2. (Codex) Verify passes.
3. (Codex read-only reviewer) Diff reviewed against this file.
4. (Claude) After screenshots of every Plates state at 375/412, light/dark; visual review; commit.

## Stop conditions
Stop and report (UNKNOWN / CHECKED / NEEDED) if a fix needs geometry, scale or camera changes, a file outside the allowlist, or would change what is loaded or calculated.
