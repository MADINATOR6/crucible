# LT-POL-0: static design-polish audit of lifting-tracker (research, read-only)

## Mode and owner
LT-POL-0 · research role · read-only. Codex audits the source; Claude's design-expert audits the rendered screens at the same time; Claude merges both into one ranked list for the user. Do not edit, create or delete repository files. Temporary scripts only under `%TEMP%`. Synthetic data only; never read `*.xlsx` or anything under `nursing-a2/`.

## Context
A polish-only pass is coming: spacing, type, colour/contrast, tap targets, consistency, chart/heatmap/3D legibility at 375 px, motion, loading/empty/first-run states. No new features, screens, dependencies or behaviour changes. Earlier UI work (prompts/lifting-tracker-ui-upgrade.md, tasks/LT-UI-3.md) already set the tokens and class contract in `lifting-tracker/UI-CLASSES.md`; don't propose redoing it.

Files: `lifting-tracker/styles/app.css` (single stylesheet, tokens on `:root`, light/dark via `prefers-color-scheme` and `[data-theme]`), `lifting-tracker/src/ui/**` (views build markup with `innerHTML`), `lifting-tracker/index.html`, `lifting-tracker/manifest.webmanifest`, `lifting-tracker/icons/`.

## Questions
1. **Contrast.** For light and dark themes, list every text/background and control-border/background colour pair actually used (tokens and any hard-coded colours in CSS or JS, including chart, heatmap band `--b0`…`--b5` with their labels, pills, banners, tone classes, disabled states, placeholder text, focus ring). Compute WCAG 2.x contrast ratios with a temp Node script. Report every pair below 4.5:1 (normal text), 3:1 (large text ≥ 24 px or ≥ 18.66 px bold, and non-text UI: borders of inputs/buttons, focus ring, chart lines against background). Give selector, file:line, both colours, ratio, threshold.
2. **Tap targets.** Selectors for interactive elements (button, a, summary, input, select, label wrapping inputs, `.chip`, `.seg button`, `.check-btn`, `.icon-btn`, `.tab`, `.btn.small`, stepper arrows, list-row buttons, sheet close buttons) whose CSS min-height/height/padding gives less than 44 px in either dimension (`--tap` is 44 px). file:line and the computed size.
3. **Colour as the only signal.** Places where state or meaning is shown only by colour (band colours, tone classes, PR, done rows, selected chips/segments, chart series without labels/legend). file:line.
4. **Motion.** Every `transition`, `animation`, `@keyframes`, `scroll-behavior: smooth` and JS-driven animation (`requestAnimationFrame`, `animate(`, OrbitControls damping). Which are not disabled or reduced under `prefers-reduced-motion: reduce`? file:line.
5. **Type and spacing consistency.** Hard-coded `font-size`, `margin`, `padding`, `gap`, `border-radius`, `line-height` values in app.css that bypass the tokens (`--s-*`, `--t-*`), and remaining inline `style="…"` attributes in `src/ui/**` other than the ones UI-CLASSES.md allows. Group by how often each odd value appears; flag font sizes under 12 px. Numbers: places where weights/reps/kcal are shown without `.num` (tabular digits) or with inconsistent formatting (decimal places, unit spacing like `147.5kg` vs `147.5 kg`, thousands separators).
6. **Undefined or dead classes.** Classes used in `src/ui/**` markup that have no rule in app.css and are not in UI-CLASSES.md, and app.css selectors no view uses (just list them; don't propose deleting yet).
7. **Empty, loading, error and first-run states.** List each one (the text and file:line): `.empty` uses, "Loading…" strings, `*-status` lines, error cards in app.js/views, the storage warning banner, example-data banners. Note which ones are styled inconsistently (different markup or classes for the same kind of state).
8. **Focus.** Is there a visible `:focus-visible` style for every interactive control type, in both themes? Any `outline: none` without a replacement? file:line.

## Report
Researcher instruction and Report format in HANDOFF.md. Per finding: file:line, evidence (command output or computed value), severity guess (high: fails AA or < 44 px on a primary control; medium: inconsistency a user notices; low: cosmetic), and the smallest CSS-or-markup fix. Keep it to findings; no file dumps.
