# UI class contract

Views (`src/ui/**`) build markup only from the classes below. `styles/app.css` is the single stylesheet and Claude owns it: if a view needs a class that is not listed, name it and what it should look like in your report instead of adding CSS or inline styles. Avoid new `style="…"` attributes; the existing ones are being moved onto these classes screen by screen.

Spacing and type come from tokens on `:root`: `--s-1` to `--s-8` (4 px steps: 4, 8, 12, 16, 20, 24, 32) and `--t-xs` to `--t-2xl` (12, 13, 15, 17, 20, 24, 32 px). `--tap` is the 44 px minimum touch target.

## Headings and text
- `h1`: page title, the only all-caps heading. One per view.
- `h2`, `h3`: section and item headings, sentence case.
- `.muted`, `.small`, `.num` (tabular digits), `.nowrap`, `.visually-hidden`.
- `.figure` (big number, with an optional `<small>` unit). `.figure.series` inside an `.s-squat`/`.s-bench`/`.s-deadlift`/`.s-total`/`.s-bw` element takes that series colour.
- `.tone-good`, `.tone-warn`, `.tone-bad`, `.tone-muted`: colour for small signed values (for example RPE deltas) and short warnings.
- `.center` (centred text), `ul.bullets` (short bulleted list with a small indent), `.panel` (bordered box inside a card).

## Page structure
- `.topbar`: page title row (title block on the left, actions on the right).
- `.section-h`: section header. Children: an `h2`, an optional action (`.btn small`), an optional `<p class="note">`.
- `.card`, `.card-h` (card title row), `.empty` (empty state).
- `.stack` (vertical gap 12 px), `.stack.tight` (8 px), `.stack.loose` (20 px).
- `.grid`, `.grid.cols-2`, `.grid.cols-3` (stack on phones), `.grid-3` (three columns on phones too), `.row`, `.row.spread`.
- Margins: `.mt-2`, `.mt-3`, `.mt-4`, `.mt-6`, `.mb-0`, `.mb-2`, `.mb-3`, `.mb-4`.

## Controls
- `.btn`, `.btn.primary`, `.btn.ghost`, `.btn.small`, `.btn.danger` (destructive: delete, wipe). A `label.btn` wrapping a hidden file input needs no extra style.
- `.input-narrow`: a 92 px number input inside a table cell.
- `.actions`: a group of related buttons, a full-width column on phones and one row on wide screens.
- `.banner.block`: a banner whose content stacks (heading plus a list) instead of sitting in one row.
- `.seg` with `<button aria-pressed>` children (segmented control).
- `.chip` with `aria-pressed` inside `.chips` (sideways-scrolling choices).
- `.filters`: one compact row of `.seg` and `<select>` controls; wraps onto a second line when narrow. Inside it, `.stepper` keeps a ‹ label › group together on one line.
- `details.options` > `summary` + `.options-body`: settings folded under the content they change.
- `.field` > `<span>` label + input/select. In a `.row`, add `.grow` to fields that share the width; `.row.end` lines a button up with the inputs.
- `.check-btn` with `aria-pressed` and an `aria-label`: round one-tap action (log as planned).

## Lists and status
- `.list` (ul/ol) > `li.list-row` (add `.is-done` when complete; add `.two-line` when the `<small>` must be read in full, such as a plate breakdown: it wraps onto a second line instead of truncating). Children in order: `.lead` (number or badge), `.main` (text that truncates; a `<small>` inside is a muted suffix; may be a `<button class="main">`), `.trail` (value), then an optional `.btn small` or `.check-btn`.
- `.progress` > `.progress-track` > `<i style="width:N%">` plus a text label. The width is the one allowed inline style.
- `.pill`, `.pill.accent`, `.pill.pr`, `.pill.example`, `.banner`.
- `.scroll-x`: wrapper that lets a wide table scroll sideways.
- `.stat` (inside `.card`), `.stats3`.
- `.feed` (warm-up ladder and similar), `.medal`, `.medal.plain` (neutral number badge).
- `table.plain`, `table.sets`.

## Feature-specific (owned by their modules)
- Heat map: `.hm`, `.hm-figures`, `.hm-fig`, `.hm-svg`, `.hm-region`, `.hm-pill`, `.hm-legend`, `.hm-list`, `.hm-row` (children `.hm-row-name`, `.hm-row-n`, `.hm-row-band`), `.hm-bar`, `.hm-delta`, `.band-0` … `.band-5`. `.hm-view-toggle` is Front / Back / 3D on phones and 2D / 3D on wide screens (`.hm-narrow` and `.hm-wide` spans swap the first label); add `.has-3d` when the 3D button is present, or the switch is hidden on wide screens.
- 3D map: `.hm3d` (sized box for the canvas, made by `heatmap3d.js`), `.hm3d-status` (loading line), `.hm3d-tip` (the hint or the selected muscle's count, over the bottom of the canvas).
- Charts: `figure.chart-wrap` (set its height with `style="--chart-h:Npx"`) > `.chart-y` (y labels: `<span style="top:N%">`), `svg.chart-plot` (`viewBox="0 0 100 100" preserveAspectRatio="none"`; children `.grid-line`, `.line`, `.area`, `.dot` drawn as a zero-length path `M x y h0`, all with `vector-effect="non-scaling-stroke"` except `.area`), `.chart-x` (x labels: `<span style="left:N%">`, first `.start`, last `.end`), then `.legend`. Series groups `.s-squat`, `.s-bench`, `.s-deadlift`, `.s-total`, `.s-bw`. These positional `top`/`left`/`--chart-h` styles are allowed in `charts.js` only. The older `.chart` class stays for any SVG chart not yet moved.
- Barbell and plates: `.bb-*`, `.plate-*`, `.loading-text`. 3D bar: `.bb3d` (canvas box inside `.bb-stage`, made by `barbell3d.js`), `.bb3d-status`, `.bb3d-tip` (same look as the 3D map's).
- Coach review: `.coach-headline`, `.coach-find`, `.sev-high`, `.sev-medium`, `.sev-good`. `details.coach-find` folds a finding to one line: `<summary>` holds the title and its `.pill`; the evidence, "Do this", confidence and action button follow inside the `details`.
- Sheets and toasts: created by `openSheet()` and `toast()` in `src/ui/dom.js`; don't build them by hand.
