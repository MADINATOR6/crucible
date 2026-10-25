# LT-UI-6: recovery heat map (decay by time)

## Mode and owner
LT-UI-6 · normal · risk low · Dispatch in its own worktree. Codex implements; Claude styles, reviews and owns all Git. Synthetic data only.

## Goal
Muscles gets a third mode, Recovery, beside Programme and Calendar. It colours each muscle by its hard sets over the last 7 days with recent sets counting more (the user's reference: "Muscle usage heat map, decay by time, factor 0.25, last 7 days"), so it shows which muscles are fresh and which are still worked today. It works on the 2D map, the 3D map and the All muscles list.

## Relevant files
- `lifting-tracker/src/core/muscles.js` (`weeklyHardSets`, the shape to mirror), `src/core/weeks.js` (`addDays`), `src/core/sets.js` (`workingSets`).
- `lifting-tracker/src/ui/heatmap.js` (`BANDS`, `bandFor`, `renderHeatmap`, `renderLegend`, `renderMuscleList`), `src/ui/heatmap3d.js` (`colourFor`, `update`), `src/ui/views/muscles.js` (modes, filters row, detail panel).
- `lifting-tracker/UI-CLASSES.md` (contract; use only its classes), `test/ui/heatmap.test.js`, `test/ui/heatmap3d.test.js`, `test/core/calculations.test.js` (where `weeklyHardSets` is tested).

## Write allowlist
`lifting-tracker/src/core/muscles.js`, `src/ui/heatmap.js`, `src/ui/heatmap3d.js`, `src/ui/views/muscles.js`, `test/core/recovery.test.js` (new), `test/ui/heatmap.test.js`, `test/ui/heatmap3d.test.js`. Nothing else: no CSS, no `sw.js`, no new modules.

## Resolved rules
1. `recoveryLoad(events, catalogue, asOf, { days = 7, factor = 0.25 } = {})` in `core/muscles.js`: working sets dated from `addDays(asOf, -(days - 1))` to `asOf` inclusive count `weight × exp(-factor × daysAgo)`, where `weight` is the catalogue's primary/secondary weight and `daysAgo` is whole days before `asOf` (0 for that day). Sets after `asOf` are ignored. Returns `{ asOf, days, factor, muscles: { id: { sets, contributors } }, unknownExerciseIds }`, the same shape as `weeklyHardSets` (contributors carry `sets` = raw count and `contribution` = weighted sum, sorted the same way). Round nothing in core.
2. `heatmap.js`: export `RECOVERY_BANDS` (same ids and colours as `BANDS`): 0 "Fresh" (no recent work), 1 "Light" (under 2), 2 "Some" (2 to 4), 3 "Worked" (4 to 7), 4 "Heavy" (7 to 10), 5 "Very heavy" (10 and up); hints say "weighted sets". `bandFor(sets, bands = BANDS)`; `renderHeatmap(data, { …, bands })`, `renderLegend(bands)` and `renderMuscleList(data, selected, prev, { bands, zone })` take the band set (default `BANDS`, so every existing caller and test is unchanged). `zone: false` hides the 10–20 target zone, which means nothing for recovery. Pills and the list show one decimal for recovery values (`fmtSets` already does).
3. `heatmap3d.js`: `colourFor(sets, palette, bands = BANDS)`; `mount3d`/`update` accept `bands` and use it for colours and the tip ("Chest · 4.7 · Worked").
4. `muscles.js`: the mode switch becomes Programme / Calendar / Recovery. In Recovery the filters row shows ‹ › day buttons around "To ${short date}" (default today) and a "Today" button when not on today; Done/Planned and the block/week selects are hidden. The card header reads "Recovery · last 7 days" with the date range; under the map a `p.small.muted`: "Recent sets count more: yesterday 78%, 3 days ago 47%, 6 days ago 22%." (compute the numbers from `factor`, don't hard-code them). Legend, pills, list and 3D all use `RECOVERY_BANDS`; no previous-week deltas in this mode. The detail panel lists contributors with their raw sets and weighted value.
5. Empty state: if nothing was logged in the 7 days, the map still draws (all Fresh) and a `.banner` says "No sets logged in the 7 days to ${date}." with a `.btn.small` "Show the week of my last session" that sets the as-of date to the latest logged set's date (hide the button when there are no logged sets at all).
6. Mode, as-of date and view live in `ui.muscles` like the other filters; switching modes keeps the selected muscle if it exists.

## Out of scope
CSS (name anything missing in the report), the generator, `sw.js`, docs.

## Verify
- `cd lifting-tracker && node --test` (baseline: 281 pass, 1 skip; may only go up).
- New `test/core/recovery.test.js`: decay weights at 0, 1, 3 and 6 days with factor 0.25; sets on day 7 and after `asOf` excluded; primary/secondary weights; contributors; unknown exercises reported.
- `heatmap.test.js`: `bandFor` with `RECOVERY_BANDS` edges (0, 1.9, 2, 6.9, 7, 10); `renderLegend(RECOVERY_BANDS)` labels; `renderMuscleList(..., { zone: false })` has no zone.
- `heatmap3d.test.js`: `colourFor` with recovery bands.
- `git diff --check`.

## Done When
1. (Codex) Rules 1–3 with tests. 2. (Codex) Rules 4–6. 3. (Codex) Report: classes wanted, browser check or why not. 4. (Claude) Styling, browser check, review, commit.

## Stop conditions
Stop and report (UNKNOWN / CHECKED / NEEDED) if a rule needs a file outside the allowlist or changes an existing caller's output.
