# LT-POL-A: design polish batch A, shared tokens and controls

## Mode and owner
LT-POL-A · implement · normal · risk low · Dispatch in the base checkout. Codex implements; Claude reviews, re-measures in a real browser, and owns all Git. Part of a polish-only pass (batches A–D, run one after another). Synthetic data only; never read `*.xlsx` or `nursing-a2/`.

## Hard limits
Polish only: no new features, screens, data, dependencies or behaviour changes (what a control does, what is calculated, stored or shown as data stays identical). Smallest correct change per issue. Keep the look ("Chalk & Iron"); fix, don't restyle. `sw.js`, README and `VERSION` are Claude's, not yours.

## Write allowlist
`lifting-tracker/styles/app.css`, `lifting-tracker/src/ui/dom.js`, `lifting-tracker/src/ui/app.js`, `lifting-tracker/src/ui/views/muscles.js` (issue A10 only), `lifting-tracker/src/ui/views/body.js` (issue A9 only, focus markup if needed), `lifting-tracker/UI-CLASSES.md` (only if you add a token or class). Nothing else.

## Background
`app.css` defines dark tokens on `:root` (lines 9–44) and the light tokens TWICE: `:root[data-theme="light"]` (47–56) and inside `@media (prefers-color-scheme: light)` (57–68). Every light token change goes in both blocks. Contrast targets (WCAG 2.x AA): text 4.5:1 (3:1 at ≥ 24 px, or ≥ 18.66 px bold); control boundaries, focus indicators and meaningful graphics 3:1 against what they sit on. Measured values below come from a headless-Chrome audit of the rendered app and a static audit (yours, LT-POL-0).

## Issues (fix each; a line number is a hint, re-find it)
- **A1 Example pill, light** (`.pill.example`, app.css:150): `#1a1300` on `--warn #956000` = 3.47:1 at 10.5 px; also wraps onto two lines in `.topbar` at 375 px on Progress, Muscles, Data. Give it light-theme ink that reaches 4.5:1 on its fill (or a lighter fill with dark ink), `white-space: nowrap`, `flex: none`, and at least `--t-xs` (12 px) if it still fits one line at 375 px beside the title block; otherwise keep its size and only fix ink + nowrap.
- **A2 Toast actions** (app.css:253,400; dom.js:60,64): action text `--accent` on the inverted toast is 2.68:1 dark, 3.15:1 light. Use an ink that reaches 4.5:1 on the toast background in both themes (for example a local custom property on `.toast`).
- **A3 Light-theme green as text**: `.tone-good`, `.hm-delta.up`, `.card-h .rate` (app.css:301,411,564) are 3.62–3.92:1 in light. `.pill.pr`, `.medal` and the pressed `.check-btn` ink on `--good` are 4.46:1 (app.css:151,245,375). Done rest-timer `.rt-label` (282,285) is 3.04:1 (ink at .7 opacity on `--good`). Fix: a separate light-theme text green (for example `--good-text`, about `#0a7a4c`; dark keeps `--good`) used where green is TEXT; keep `--good` for fills. Make the ink on `--good` fills reach 4.5:1 (darker ink or remove the .7 opacity).
- **A4 Control boundaries**: input/select/textarea borders (144), default `.btn` (129), `.chip` and `.check-btn` (163,372) are 1.5–1.7:1 in both themes. Add one control-border token (for example `--line-ctl`) that reaches ≥ 3:1 against both the control's own fill and the card `--surface`, in both themes, and use it for those controls only. `--line` stays for cards and dividers (decorative). Don't make `.btn.ghost` or `.seg` heavier than needed; `.seg` buttons sit in a filled track, which already identifies them.
- **A5 Dimmed small text**: inactive pace button `<small>` (139,611) is 3.09 light / 3.56 dark (`--muted` at .75 opacity); unselected `.chip small` (165) is 3.92 light (`--text-2` at .65); completed-row muted text (344–348) is 4.17 dark / 4.42 light. Remove the extra opacity or use `--text-2` so each reaches 4.5:1.
- **A6 Rest timer and toast close**: `.rest-timer .btn` (284) is 34 px tall (42 with the small-button hit extension); the toast dismiss × (dom.js:64) is about 20 px wide. Both need a ≥ 44 × 44 px hit area (visible size may stay smaller if a transparent extension reaches 44, as `.btn.small::after` does at 481).
- **A7 Chips**: `.chip` min-height 40 px (163). Reach 44 px (`--tap`).
- **A8 Checkbox rows**: `label.row` with a checkbox (448,484; used in data.js:130–132, plates.js:148, train.js:416, plan.js:324): the box is 13 px and the row about 23 px tall. Give these rows `min-height: var(--tap)` and the checkbox about 20 px with `accent-color: var(--accent)`. CSS only.
- **A9 Focus on inverse/floating surfaces**: the focus ring on the toast and rest timer is 1.44 dark / 2.99 light; on the done timer 1.06 / 1.44. Set a local `--focus` on those containers that reaches 3:1. `.wk-bar` (602–604, Body & energy week chart) removes its outline and shows focus only as full opacity, which a selected bar already has: add a visible focus stroke/outline independent of selection.
- **A10 Reduced motion**: the `prefers-reduced-motion` rule (265) selects `*` only, so `::before`/`::after` transitions (summary carets, 362,495) still run: include `*::before, *::after`. `views/muscles.js:148` always scrolls with `behavior: 'smooth'`: use `'auto'` when `matchMedia('(prefers-reduced-motion: reduce)').matches`.
- **A11 Disabled buttons**: `.btn:disabled` (136) at opacity .45 gives 2.85–2.89:1 in light and looks broken (Remove last, Clear bar, Share image, Save image, Check for updates). Raise to about .6 and keep `cursor: not-allowed`; optional dashed border. (Disabled controls are exempt from AA; this is legibility.)
- **A12 Nav selection is colour only** (107–108,116; markup app.js:50): add a non-colour marker to the current tab in both `.tabbar` and `.rail` (for example a 3 px bar or pill behind the icon on `[aria-current="page"]`). CSS only.
- **A13 Text under 12 px**: app.css:98,105,150,181,225,233,272,282,381,443,446,552,556,605,606. Raise to `--t-xs` (12 px) where it fits without wrapping or overflowing at 375 px (nav labels: five tabs must still fit one line each at 375 px). Leave any that can't fit, and list them with the reason.
- **A14 Inline styles in app.js** (33, 69): the recovery card margin, the destructive "Delete all data" button colours and the storage banner margin. Use existing classes (`.btn.danger`, `.mt-*`/`.mb-*`); no visible change beyond that.

## Out of scope
Plates/barbell (batch B), heat map, charts, Body and Progress specifics (batch C), Train/Coach/Data layouts and empty states (batch D), dead-CSS deletion, any spacing sweep beyond lines you touch.

## Verify (Codex)
- `cd lifting-tracker && node --test` (baseline 335 pass, 1 skip; the count may not drop).
- `node --check` on each changed `.js` file.
- A temp Node script under `%TEMP%` that recomputes the contrast of every colour pair you changed, in both themes, from the final token values (print pair, ratio, threshold).
- `git diff --check`.
You can't open a browser here; say so. Claude re-measures in headless Chrome at 375/412 px, both themes.

## Done When
1. (Codex) A1–A14 each fixed, or left with a stated reason; the report lists each with file:line and the new ratio/size.
2. (Codex) Verify commands pass.
3. (Codex read-only reviewer) Diff reviewed against this file.
4. (Claude) Browser re-measure, screenshots, review, commit.

## Stop conditions
Stop and report (UNKNOWN / CHECKED / NEEDED) if a fix needs a file outside the allowlist, would change behaviour, or if two issues conflict.
