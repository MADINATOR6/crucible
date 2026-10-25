# LT-UI-2: tidy Muscles and Progress, readable charts and heat map labels

## Mode and owner
LT-UI-2 · normal · risk low · Dispatch in its own worktree. Claude owns `styles/app.css` and is styling these screens at the same time; don't touch CSS. Codex implements the markup and logic; Claude reviews, styles and owns all Git. Part of `prompts/lifting-tracker-ui-upgrade.md`, phase 2. Synthetic data only.

## Goal
On a 375 px phone, Muscles and Progress show their content before their settings, every chart and map label is at least 11 CSS px, and list rows fit on one line. Markup uses only the classes in `lifting-tracker/UI-CLASSES.md` (read it first; it's the contract). If you need a class that isn't listed, don't add CSS or inline styles: name it in your report.

## Relevant files
- `lifting-tracker/src/ui/views/muscles.js`, `src/ui/views/progress.js`, `src/ui/charts.js`, `src/ui/heatmap.js`.
- `lifting-tracker/UI-CLASSES.md` (contract), `styles/app.css` (read only; shows what each class looks like).
- `src/ui/views/train.js` (read only) for the house style of the redesigned views: `.list-row`, `details.options`, `.filters`.
- `test/ui/heatmap.test.js` (tests both the heat map and `lineChart`).

## Write allowlist
`lifting-tracker/src/ui/views/muscles.js`, `src/ui/views/progress.js`, `src/ui/charts.js`, `src/ui/heatmap.js`, `test/ui/heatmap.test.js`, new `test/ui/charts.test.js`. Nothing else.

## Resolved rules

### Charts (`charts.js`)
1. Keep `lineChart({ series, unit, height, title, zeroBased })` and `movingAverage` with the same signatures, the empty case (`No data yet`), the nice-step y-axis, the 5 x ticks, the legend, the `<title>` tooltips on dots and the accessible `role="img"` + `aria-label` + `<title>` on the plot.
2. New markup, exactly as the Charts line of UI-CLASSES.md describes:
   - `<figure class="chart-wrap" style="--chart-h:${height}px">`.
   - `.chart-y` with one `<span style="top:N%">` per grid value, where N is the value's position from the top.
   - `<svg class="chart-plot" viewBox="0 0 100 100" preserveAspectRatio="none">` containing:
     - grid lines,
     - one `<g class="s-${id}">` per series holding the optional `.area`, the `.line` (dashed keeps `stroke-dasharray`) and the dots as `<path class="dot" d="M x y h0">` with `<title>`,
     - `vector-effect="non-scaling-stroke"` on lines, grid lines and dots.
   - `.chart-x` with 5 `<span style="left:N%">` labels; the first gets class `start`, the last `end`.
   - The `.legend` inside the figure.
   - Plot coordinates run 0–100 on both axes. Leave about 4 units of headroom at the top and bottom so dots and lines aren't clipped.
3. All text in the chart is HTML, so it renders at the CSS size (12 px) whatever the chart's width. No `<text>` elements remain.

### Heat map (`heatmap.js`)
4. Crop each figure's `viewBox` to the body's bounds plus at most 6 units of margin (the geometry spans roughly x 44–176 and y 8–472 in the 220×480 box). Keep the mirroring, gradients, regions, accessible names and `data-muscle` hooks.
5. Size the pills so the number is at least 11 CSS px when the figure renders 300 px wide. Write the computation in a one-line comment. Pills mustn't overlap each other: check the `tiny` regions (traps, delts, abs, forearms) and move a `label` point where needed.
6. `renderLegend()`: same bands and text, one `<li>` per band (Claude restyles it as a compact strip).

### Muscles (`muscles.js`)
7. Topbar: `h1` Muscles plus the example pill. A shorter note: "Weekly hard sets per muscle. The number on each muscle is the count; colour is a guide."
8. Replace the two `.row`s and the chip rows with one `div.filters`:
   - a `.seg` with Programme / Calendar,
   - in programme mode, a `.seg` with Done / Planned, a `<select>` for the block (with an `aria-label`) and a `<select>` for the week,
   - in calendar mode, the ‹ › buttons with the week label between them, inside the same row.
   - Selecting changes state exactly as the chips did: changing the block resets the week.
9. The map card: `card-h` with the label and the working-sets count, the Front/Back toggle, the map, then the legend directly under the map, then the not-counted warning (use the `tone-warn` class, not an inline colour).
10. Move the "green zone… ▲ ▼…" explanation into the All muscles section as a `<p class="note">` inside a `.section-h`, and use `.section-h` for the All muscles header instead of the card header. Remove the remaining `style="margin…"` attributes in favour of the `mt-*` classes.

### Progress (`progress.js`)
11. Order:
    - topbar (h1 Progress, example pill, note "Estimated 1RM uses Epley and is an approximation."; the dates-estimate sentence moves under the e1RM chart as `p.small.muted`),
    - the three lift tiles: `.card.stat.s-${lift}` with `<b class="figure series">value<small>unit</small></b>`, no inline styles,
    - `details.options` with summary "Options · ${variants ? 'with variants' : 'competition only'} · up to ${maxReps} reps", holding the two `.seg` controls with `.field`-style labels,
    - coach notes, the e1RM chart, the total, PRs and RPE, by block, bodyweight.
12. PRs: `ol.list` of `li.list-row`: `.lead` = `<span class="pill pr">PR</span>`; `.main` = the exercise name with `<small>${prLabel}</small>`; `.trail` = the short date (`shortDate` from charts.js, with the year only when it isn't the current year).
13. RPE table: replace the inline `style="color:…"` with `tone-good` / `tone-warn` / `tone-muted` (same thresholds). Bodyweight form: `.row.end` with `.field.grow` labels instead of inline styles. By-block table: keep the horizontal scroll wrapper, but move its inline style onto an allowed class (`table.plain` already scrolls inside `.card`? If not, name the class you need in the report).

## Out of scope
CSS, other views, `state.js`, `core/`, the 3D map (phase 3), docs.

## Verify
- `cd lifting-tracker && node --test` passes (baseline: 259 pass, 1 skip; the count may only go up).
- New or updated tests:
  - `lineChart` emits no `<text>`, has 5 x labels with `start`/`end` and a y label per grid line, keeps the empty case, and puts the dots' `<title>` through the escape helper;
  - the heat map `viewBox` is cropped (width ≤ 150) and the pill font maths meet rule 5;
  - `renderLegend` keeps its 6 bands.
- `git diff --check`.

## Done When
1. (Codex) Rules 1–3 with tests.
2. (Codex) Rules 4–6 with tests.
3. (Codex) Rules 7–10 (Muscles).
4. (Codex) Rules 11–13 (Progress).
5. (Codex) The report lists every class it wanted but didn't have, and every inline style still left in the four files, with the reason.
6. (Claude) Styling, browser check at 375 px and on desktop in both themes, review, commit.

## Stop conditions
Stop and report (UNKNOWN / CHECKED / NEEDED) if a rule would remove information the screens show today, or if it needs files outside the allowlist.
