# LT-UI-4: 3D barbell on the Plates screen

## Mode and owner
LT-UI-4 · normal · risk low · Dispatch in its own worktree. Codex implements; Claude redraws the 2D barbell (`src/ui/barbell.js`), writes the CSS, reviews and owns all Git. Part of the lifting-tracker UI upgrade (the user asked for a better, 3D barbell and plates). Synthetic data only.

## Goal
The Plates screen's bar view switch becomes Side / End / 3D. 3D shows a realistic power bar loaded with the plates on the bar, which can be turned and zoomed like the 3D muscle map. Tapping a plate removes it, exactly like tapping a plate in the side view. It works offline and falls back to the side view when WebGL is missing.

## Relevant files
- `lifting-tracker/src/ui/heatmap3d.js` (read only): the pattern to copy: lazy `import()` of three, one module-level viewer whose canvas moves between re-renders, render on demand, `ResizeObserver`, `webglcontextlost`, theme recolour on `prefers-color-scheme` change, fallback.
- `lifting-tracker/src/ui/views/plates.js`: the `ui.plates.view` switch (`data-bview`), `side` (one side's plates, innermost first), `justAdded`, `.bb-plate` removal, `keepSide`.
- `lifting-tracker/data/plates.json` (read only): each plate has `value`, `unit`, `colour`, `drawHeightMm` (diameter) and `thicknessMm`; the collar entry.
- `lifting-tracker/vendor/three/` (0.170.0, read `VERSION.txt`), `index.html` (import map), `sw.js`, `test/ui/sw.test.js`.
- `lifting-tracker/UI-CLASSES.md` (contract) and `styles/app.css` (read only).

## Write allowlist
`lifting-tracker/src/ui/barbell3d.js` (new), `src/ui/views/plates.js`, `vendor/three/examples/jsm/environments/RoomEnvironment.js` (new), `vendor/three/VERSION.txt`, `sw.js`, `test/ui/barbell3d.test.js` (new), `test/ui/sw.test.js`. Nothing else: no CSS, no `barbell.js`, no docs.

## Resolved rules

### Geometry (metres, built in code; no model file)
1. Pure, Node-testable exports (no three, no DOM) in `barbell3d.js`:
   - `BAR`: the power bar's dimensions: total length 2.20, shaft diameter 0.029, sleeve diameter 0.050, distance between the inner collars 1.31, inner collar (sleeve stop) 0.030 long × 0.075 across, so each loadable sleeve is about 0.415 long. Knurling: centre knurl ±0.075 from the middle; outer knurl from 0.21 to 0.62 from the middle, interrupted by the IPF ring marks (a 0.005 smooth band) 0.405 from the middle (0.81 apart).
   - `plateSize(plate)`: `{ diameter, thickness }` in metres from `drawHeightMm` and `thicknessMm`, falling back to a built-in table by kg value (25/20/15/10: 450 mm; 5: 230; 2.5: 190; 1.25: 160; 1: 145; 0.5: 130; 0.25: 110; thicknesses 27, 22.5, 21, 21, 21.5, 16, 12, 10, 8, 6 mm) and, for lb plates, by converting to kg and taking the nearest kg plate.
   - `layout(plates, { collar })`: x positions of each plate's inner face from the sleeve stop outwards, heaviest innermost, a 1 mm gap between plates, then the collar if on. Returns `{ plates: [{ index, x, diameter, thickness }], collarX, overflow }`, where `overflow` is true when the stack runs past the sleeve end (the viewer still draws it; the report says how it shows that).
2. Plates are a `LatheGeometry` profile, so each disc looks like a competition plate (see the user's references: Eleiko-style calibrated discs): a raised outer rim (lip) about 0.012 wide standing about 0.003 proud of the face on both sides, a flat painted face, a chrome hub ring about 0.09 across around a 0.0504 hole. Small discs (under 300 mm) keep the same shape, scaled. Faces use the plate's `colour`; the rim and hub are metal.
3. The weight is printed on both faces: a `CanvasTexture` decal ring on the face reading the value and unit (for example "25" large and "KG" small), white on dark colours and near-black on light ones (same luminance rule as `barbell.js`). No brand names or logos.
4. The bar: chrome sleeves and inner collars, a satin steel shaft with a canvas-generated diamond knurl texture (normal or bump map) in the knurled zones only, and the two ring marks visible. Competition collars (when on): a chrome cylinder about 0.08 across × 0.07 long with a short lever, on the sleeve just outside the last plate.
5. Materials: `MeshStandardMaterial`; metals get `metalness` about 1 and an environment map from `PMREMGenerator` + `RoomEnvironment` (vendor `examples/jsm/environments/RoomEnvironment.js` from the same 0.170.0 tarball, integrity-checked as in LT-UI-3, and add it to `VERSION.txt`), so chrome reads as chrome without any image files. Painted faces are matte (roughness about 0.6).

### Viewer
6. `mount3d(container, { plates, collar, justAdded, onRemove, onError })` returns a promise of `{ update(opts), dispose() }`, with the same lifecycle rules as `heatmap3d.js`: lazy three import, one module-level viewer (canvas moved on re-render, camera kept), render on demand, `ResizeObserver`, `webglcontextlost` → reject/dispose, `dispose()` frees everything.
7. Camera: starts at a three-quarter view of the right-hand end (like a photo of a loaded bar end: the near sleeve and its plates large, the bar running away across the frame to the far side). It frames a 450 mm plate's full height with headroom in a portrait phone box (about 0.6 aspect). `OrbitControls`: drag to turn, pinch/wheel to zoom between a close look at one plate and the whole bar, no panning, never upside down; damping only without reduced motion.
8. Tap (pointer moved under 6 px) on a plate calls `onRemove(index)` with the plate's index in `plates` (both sides' copies map to the same index). Tapping anything else does nothing.
9. `justAdded`: that plate slides onto the sleeve from the end over about 250 ms (both sides), unless `prefers-reduced-motion` is `reduce`. Render frames only while it animates.
10. Overlay `<p class="bb3d-tip">` inside the container: "Drag to turn · pinch to zoom · tap a plate to remove it", or "Empty bar" when there are no plates.

### Plates view
11. Add `<button data-bview="3d">` to the bar view switch only when WebGL works (check once, cache it; same check as `muscles.js`). In 3D the stage holds `<div class="bb3d" role="img" aria-label="3D barbell: N plates each side, …">` with `<p class="bb3d-status muted small">Loading 3D bar…</p>` until ready. The caption on the left of the switch reads "Drag to turn; tap a plate to remove it" in 3D.
12. Carry `thicknessMm` (and `drawHeightMm`) onto each plate pushed into `side`. `onRemove(i)` goes through the same removal as tapping `.bb-plate`. If `mount3d` rejects, set the view back to `side`, re-render and `toast('3D view unavailable here; showing the side view')`. Leaving the Plates screen or choosing Side or End disposes the viewer (copy the muscles.js approach).

### Offline
13. `sw.js`: bump `VERSION` to `lt-v3`; precache `src/ui/barbell3d.js` and `RoomEnvironment.js`. The precache tests keep passing.

## Out of scope
CSS (`.bb3d`, `.bb3d-status` and `.bb3d-tip` are planned; name anything else you need in the report), `barbell.js` (Claude is redrawing the 2D bar at the same time), the train view, docs.

## Verify
- `cd lifting-tracker && node --test` (baseline: 271 pass, 1 skip; the count may only go up).
- New `test/ui/barbell3d.test.js`: `BAR` adds up (two sleeves + two inner collars + the shaft between them = 2.20 within 1 mm; sleeve length 0.40–0.43); `plateSize` (data fields, kg fallback table, lb to nearest kg); `layout` (heaviest innermost order kept as given, 1 mm gaps, collar after the last plate, `overflow` when 20 × 25 kg plates are loaded); `barbell3d.js` has no top-level three import.
- `sw.test.js`: the new files are precached and `VERSION` changed.
- In a browser if you can (`node lifting-tracker/dev-server.mjs`): no console errors, plates show with printed weights, tap removes. If you can't run one, say so; Claude checks it.
- `git diff --check`.

## Done When
1. (Codex) Rules 1–5 with tests.
2. (Codex) Rules 6–10.
3. (Codex) Rules 11–13 with tests.
4. (Codex) The report gives the new vendored file's size, the classes wanted, and what the browser check couldn't cover.
5. (Claude) 2D redraw, CSS, browser check at 375 px and desktop in both themes, review, commit.

## Stop conditions
Stop and report (UNKNOWN / CHECKED / NEEDED) if `RoomEnvironment.js` imports anything beyond `three`, if the tarball's integrity doesn't match, or if a rule needs files outside the allowlist.
