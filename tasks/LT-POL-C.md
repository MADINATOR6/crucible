# LT-POL-C: design polish batch C, Muscles, Progress, Body & energy

## Mode and owner
LT-POL-C · implement · normal · risk low · Dispatch in the base checkout, after LT-POL-B is committed. Codex implements; Claude reviews, re-measures in headless Chrome and owns all Git. Synthetic data only.

## Hard limits
Polish only: no new features, data, calculations or behaviour changes. Band edges, counts, estimates and what each chart plots stay identical. The 2D map stays the accessible version (numbers on every region). `sw.js`, README and `VERSION` are Claude's.

## Write allowlist
`lifting-tracker/styles/app.css` (heat map, chart, Body & energy rules only), `lifting-tracker/src/ui/heatmap.js`, `lifting-tracker/src/ui/heatmap3d.js`, `lifting-tracker/src/ui/charts.js`, `lifting-tracker/src/ui/share-progress.js`, `lifting-tracker/src/ui/views/muscles.js`, `lifting-tracker/src/ui/views/progress.js`, `lifting-tracker/src/ui/views/body.js`, `lifting-tracker/UI-CLASSES.md` (only if you add a class), and the existing tests for these modules under `lifting-tracker/test/ui/` if an assertion pins text you change.

## Evidence
Before screenshots in `media-out/app-polish/screens/before/`: `muscles-front|back|3d-*`, `progress-strength-*`, `progress-body-*` at 375/412 px, light/dark. Read them first.

## Issues
- **C1 Heat-map key and bars in light theme.** Band fills against the light card: `--b4 #f2924f` 2.22:1, `--b5 #f5c13a` 1.59:1; `--b1`/`--b2` 1.6–3.0 in both themes; bar fills against `--surface-3` 1.3–2.5 (Codex LT-POL-0 table; app.css:31,53,196–204,295–299). Keep the ramp; give legend swatches and the `.hm-bar` fill a 1 px edge (`--line-strong` or the band's `-edge`) so each reaches 3:1 as a shape against its background. The target-zone dashed edge in light is 2.0:1 (296): strengthen to 3:1.
- **C2 "No change" marker.** `heatmap.js:95` shows a bare "·" (meaning only in a `title` tooltip, invisible on phones) on every row with zero change. Show "±0" in the muted tone instead, same column width; keep the `title`.
- **C3 3D muscle outlines in light theme.** The groove/outline colour (`heatmap3d.js:124`) draws near-black dashed outlines over pale muscles in light theme, which looks rough. Use a softer outline in light theme (derive from a token such as `--line-strong` or a darkened band colour) and keep dark theme as is. Colour only; no geometry or camera change.
- **C4 Faint chart marks.** Faint lift dots (app.css:553) are 1.4–1.6:1; inactive weekly-energy bars (`.wk-bar`, 603) are 1.9:1. Raise opacity so they reach 3:1 against the card in both themes while staying visibly lighter than the active/strong marks.
- **C5 Chart legends.** Progress lift charts have no y-axis unit and a ★ PR marker that is `aria-hidden` with no legend (`charts.js`, legend at :73). Add the unit ("kg" or "lb", from the data already passed in) to the chart header or first y label, and a "★ PR" legend entry where stars are drawn. Text only; no new data.
- **C6 Share-image status dots.** `share-progress.js:28,39`: on the light export background, `#e0a020` 2.00:1 and `#2fbf7f` 2.08:1. Darken those two only for the light background to reach 3:1.
- **C7 Muscles header block.** At 375 px the intro paragraph wraps to three lines and pushes the filters down (see `muscles-*-375-*-first.png`); same on Progress (`progress-strength-375-*-first.png`). Tighten copy is out of scope; instead make sure the `.topbar` subtitle uses `--t-sm` with line-height ~1.35 so it takes less height. CSS only, applies to every `.topbar p`.

## Out of scope
Shared tokens and controls (A, done), Plates/barbell (B, done), Train/Coach/Data (D), any change to the 2D body art or 3D model, reduced-motion handling (done in A).

## Verify (Codex)
- `cd lifting-tracker && node --test` (count may not drop); `node --check` each changed `.js`.
- Temp Node contrast script under `%TEMP%` for every pair you changed, both themes.
- `git diff --check`.

## Done When
1. (Codex) C1–C7 fixed or left with a reason; report each with file:line and new ratio.
2. (Codex) Verify passes.
3. (Codex read-only reviewer) Diff reviewed against this file.
4. (Claude) After screenshots at 375/412, light/dark; review; commit.

## Stop conditions
Stop and report (UNKNOWN / CHECKED / NEEDED) if a fix would change data, band edges, or geometry, or needs a file outside the allowlist.
