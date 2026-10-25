# LT-UI-3: 3D muscle map viewer

## Mode and owner
LT-UI-3 · normal · risk medium (first runtime dependency) · Dispatch in its own worktree. Codex implements; Claude builds the real body model in Blender, writes the CSS, reviews and owns all Git. Part of `prompts/lifting-tracker-ui-upgrade.md`, phase 3. Synthetic data only.

## Goal
On Muscles, the body view switch gains a third option, 3D. It shows a rotatable, zoomable 3D body whose muscles take the same hard-set band colours as the 2D map. Tapping a muscle selects it exactly like tapping it on the 2D map (the existing detail panel opens). It works offline, and falls back to the 2D map when WebGL is missing or the model fails to load.

## Relevant files
- `lifting-tracker/src/ui/views/muscles.js` (the Front/Back toggle `.hm-view-toggle`, `pick()`, `ui.muscles` state).
- `lifting-tracker/src/ui/heatmap.js` (read only: `BANDS`, `bandFor`, `fmtSets`, `MUSCLE_LABELS`). Reuse them; don't copy them.
- `lifting-tracker/index.html` (its CSP), `lifting-tracker/sw.js`, `test/ui/sw.test.js`.
- `lifting-tracker/UI-CLASSES.md` (contract) and `styles/app.css` (read only). Band colours are the CSS custom properties `--b0` … `--b5` on `:root`; they change with the theme.
- `lifting-tracker/data/exercises.json`: the muscle ids (`chest`, `front_delts`, … `calves`, the same keys as `MUSCLE_LABELS`).

## Write allowlist
`lifting-tracker/src/ui/heatmap3d.js` (new), `src/ui/views/muscles.js`, `vendor/three/**` (new), `assets/body.glb` (placeholder only, see rule 9), `sw.js`, `index.html`, `test/ui/heatmap3d.test.js` (new), `test/ui/sw.test.js`. Nothing else: no CSS, no docs.

## Resolved rules

### Dependency
1. Vendor three.js **0.170.0** from the npm registry (`npm.cmd pack three@0.170.0` in a scratch folder outside the repo; check the tarball's integrity against `npm.cmd view three@0.170.0 dist.integrity`). Copy only what is needed, keeping three's own folder layout so its relative imports work:
   - `vendor/three/build/three.module.min.js`
   - `vendor/three/examples/jsm/loaders/GLTFLoader.js`
   - `vendor/three/examples/jsm/utils/BufferGeometryUtils.js` (GLTFLoader imports it)
   - `vendor/three/examples/jsm/controls/OrbitControls.js`
   - `vendor/three/LICENSE`
   - `vendor/three/VERSION.txt`: version, source tarball URL, integrity hash, the list of files. Don't edit the vendored files themselves.
   No Draco: the model is small enough uncompressed, so `DRACOLoader` and its decoder are not vendored.
2. The addons import the bare specifier `three`. Map it with an import map in `index.html`: `<script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.min.js"}}</script>`, placed before the app's module script. The CSP forbids inline scripts, so allow exactly this one by adding its `'sha256-…'` hash to `script-src` (no `'unsafe-inline'`). A test recomputes the hash from `index.html` and checks that the CSP contains it, so the two can't drift.
3. Load three.js lazily: `heatmap3d.js` must not import three at the top level. It `import()`s it the first time 3D is shown, so the app's startup and the 2D map don't pay for it.

### Viewer (`heatmap3d.js`)
4. Pure, Node-testable exports (no three, no DOM):
   - `meshMuscleId(name)`: a mesh name is a muscle id, optionally followed by `_L` or `_R` (and Blender's `.001`-style suffix, which the glTF exporter may keep), e.g. `quads_L` → `quads`. Names starting `body_` (skin, head, hands, feet, joints) return `'body'`. Anything else returns `null`.
   - `matchMeshes(names)`: returns `{ byMuscle: {id: [names]}, body: [names], unknown: [names], missing: [ids with no mesh] }`. Unknown names are reported (a single `console.warn` listing them when the model loads), never silently dropped; they are drawn in the neutral body colour.
   - `colourFor(sets, palette)`: the band colour for a set count, using `bandFor` and a palette `{0: '#…', … 5: '#…'}`.
5. `mount3d(container, { data, selected, onPick })` returns a promise of `{ update({ data, selected }), dispose() }`, or rejects (no WebGL, import or load failure). It:
   - reads the palette from `getComputedStyle(document.documentElement)` (`--b0` … `--b5`, plus `--surface-2` or the nearest existing token for the body colour) on mount and on each `update`, so a theme change applies on the next update;
   - loads `assets/body.glb` with `GLTFLoader`, gives each mesh its own `MeshStandardMaterial`, frames the camera on the model's bounding box (front view first), with a hemisphere plus directional light;
   - `OrbitControls`: drag to rotate, pinch or wheel to zoom (clamped so the body never leaves the view or flips upside down), no panning; damping only when `prefers-reduced-motion` is not `reduce`, and no auto-rotate ever;
   - picks with a raycaster on `pointerup` when the pointer moved less than 6 px since `pointerdown` (so a drag isn't a tap), calling `onPick(muscleId)`; a tap on the body or empty space calls nothing;
   - highlights the selected muscle (emissive tint), and shows its name and number in an overlay `<p class="hm3d-tip">` inside the container (for example "Chest · 12 sets · Build"), so the number is never colour alone;
   - renders only on demand (after a control change, a resize via `ResizeObserver`, or an update), not in a constant animation loop;
   - handles `webglcontextlost` by rejecting/disposing so the view can fall back.
6. The views re-render the whole page with `innerHTML` on every state change. The viewer must survive that without reloading the model or making a new WebGL context (browsers cap contexts): keep one module-level viewer, and on the next mount move its canvas into the new container and call `update`. Camera position and zoom survive re-renders. `dispose()` frees the renderer, geometries and materials; call it when the user leaves Muscles or switches back to Front/Back (leaving the canvas idle in memory is fine while 3D stays selected).

### Muscles view
7. The `.hm-view-toggle` becomes Front / Back / 3D. Show the 3D button only when `document.createElement('canvas').getContext('webgl2') || …('webgl')` succeeds (check once, cache the result). Choosing 3D sets `ui.muscles.view = '3d'`; the markup is `<div class="hm3d" role="img" aria-label="3D muscle map. The list below has every muscle's count.">` with a `<p class="hm3d-status muted small">Loading 3D model…</p>` until the model is in.
8. If `mount3d` rejects, set `view` back to `'front'`, re-render, and `toast('3D view unavailable here; showing the 2D map')`. The legend, the not-counted warning, the detail panel and the All muscles list stay exactly as they are in every view. Tapping a muscle in 3D goes through the same `pick()` as the 2D map.

### Offline
9. `sw.js`: bump `VERSION` to `lt-v2`; precache `src/ui/heatmap3d.js`, the five vendored JS files and `assets/body.glb`. Keep the existing test that every imported module is precached passing (it must also see the vendored addons and the dynamic `import()`).
10. `assets/body.glb` placeholder: Claude's real Blender model isn't ready. Generate a small placeholder with a throwaway Node script outside the repo (glTF 2.0 binary, Y-up, metres, body facing +Z, about 1.8 tall, standing on y = 0) holding a few box meshes named `chest_L`, `chest_R`, `quads_L`, `quads_R` and `body_head`. Claude replaces it with the real model, which follows the same naming, axes and scale.

## Out of scope
CSS (name any classes you need in the report; `.hm3d`, `.hm3d-status` and `.hm3d-tip` are already planned), the 2D map, other views, docs, the Blender model.

## Verify
- `cd lifting-tracker && node --test` passes (baseline: 264 pass, 1 skip; the count may only go up).
- New tests in `test/ui/heatmap3d.test.js`:
  - `meshMuscleId` (sides, `.001` suffix, `body_` prefix, unknown);
  - `matchMeshes` reports unknown names and missing muscles;
  - `colourFor` follows the band edges (0, 0.1, 5.9, 6, 21);
  - every mesh name inside `assets/body.glb` (read the GLB's JSON chunk in Node) maps to a muscle or `body`, so Claude's real model is checked by the same test;
  - the import-map hash in the CSP matches `index.html`;
  - `heatmap3d.js` has no top-level import of three.
- `sw.test.js`: the vendored files and `assets/body.glb` are precached, and `VERSION` changed.
- In a real browser (`node lifting-tracker/dev-server.mjs`), if you can run one: no CSP errors in the console, the placeholder boxes show, rotate and pick. If you can't run a browser, say so; Claude checks it.
- `git diff --check`.

## Done When
1. (Codex) Rules 1–3 with tests.
2. (Codex) Rules 4–6 with tests.
3. (Codex) Rules 7–8.
4. (Codex) Rules 9–10 with tests.
5. (Codex) The report gives the vendored size in KB, the classes wanted, and anything the browser check couldn't cover.
6. (Claude) Real model, CSS, browser check at 375 px and on desktop in both themes, review, commit.

## Stop conditions
Stop and report (UNKNOWN / CHECKED / NEEDED) if the tarball's integrity doesn't match, if three 0.170.0's files import anything not listed in rule 1, or if a rule needs files outside the allowlist.
