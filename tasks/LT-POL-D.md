# LT-POL-D: design polish batch D, Train, Coach, Data and shared states

## Mode and owner
LT-POL-D · implement · normal · risk low · Dispatch in the base checkout, after LT-POL-C is committed. Codex implements; Claude reviews, re-measures in headless Chrome and owns all Git. Synthetic data only.

## Hard limits
Polish only: no new features, screens, data or behaviour changes; logging, undo, drafts, import and backup work exactly as now. Copy changes only where named below. `sw.js`, README and `VERSION` are Claude's.

## Write allowlist
`lifting-tracker/styles/app.css` (rules for the classes you touch), `lifting-tracker/src/ui/views/train.js`, `lifting-tracker/src/ui/views/plan.js`, `lifting-tracker/src/ui/views/data.js`, `lifting-tracker/src/ui/views/progress.js` (D3 only), `lifting-tracker/src/ui/charts.js` (D3 only), `lifting-tracker/UI-CLASSES.md`, and existing tests under `lifting-tracker/test/ui/` only where an assertion pins markup you change.

## Evidence
Before screenshots in `media-out/app-polish/screens/before/`: `train-*`, `coach-*`, `data-*`, `progress-strength-*` at 375/412 px, light/dark.

## Issues
- **D1 Train fold-outs.** `train.js:179` "Full workout" (`details.train-overview`) is a bare summary row, while the "Week N details" fold-out below it is a bordered card with a chevron (`details.options`, :181). Give "Full workout" the same `details.options` look (summary row, chevron, border) without changing its content or open/closed behaviour.
- **D2 Coach header.** Every other tab's `.topbar` has a one-line `.muted small` subtitle; Coach (`plan.js:236` and its other `.topbar`s) has none, so the empty state floats. Add one subtitle: "Plans your next block from your own training." (same in every Coach state).
- **D3 Empty and loading states.** Equivalent states use three different looks: `.empty.card` (train.js:109,166,178), plain `.muted` paragraphs (charts.js:28 "No data yet", progress.js:201 "No sets yet", :211 "No blocks yet"), and Coach's centred card (plan.js:237,244). Inside a card, an empty state should be one `.empty` block (centred muted text, consistent padding); a whole-screen empty state is `.empty.card` with an optional primary action, like Coach's. Apply that to the listed sites only. Loading lines (`plan.js:239` "Loading…", `*-status`) use `.muted small` consistently.
- **D4 Data screen checkbox hint.** The notification setting's "(Android, installed app)" hint sits in a separate right column at 375 px (`data.js:130–132`). Put it on its own `.muted small` line under the label.
- **D5 Spacing drift on touched lines.** Where you edit a rule, replace literal `px` spacing/size values that equal a token (`--s-*`, `--t-*`) with the token. No sweep beyond touched rules.

## Out of scope
A, B, C (done), dead-CSS deletion, any change to what Train shows or logs, Coach generator logic, import/backup flows.

## Verify (Codex)
- `cd lifting-tracker && node --test` (count may not drop); `node --check` each changed `.js`.
- `git diff --check`.

## Done When
1. (Codex) D1–D5 fixed or left with a reason; report each with file:line.
2. (Codex) Verify passes.
3. (Codex read-only reviewer) Diff reviewed against this file.
4. (Claude) After screenshots at 375/412, light/dark; review; commit.

## Stop conditions
Stop and report (UNKNOWN / CHECKED / NEEDED) if a fix would change behaviour or needs a file outside the allowlist.
