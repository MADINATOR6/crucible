# LT-UX-1 plan brief: experience upgrade for the lifting tracker

Follow HANDOFF.md, Planner instruction (it replaces the Researcher instruction for this task).

## What the user asked for

Improve the overall experience of `lifting-tracker/` without adding features or expanding scope.
Explicitly in scope: faster/easier existing workflows during a workout; layout, typography, spacing,
navigation and visual consistency; making existing information and feedback easier to understand;
a distinctive cohesive identity; mobile usability, accessibility and responsiveness.

Explicitly out of scope: new features, new screens, new settings, new dependencies, redesigns for
their own sake, changes to training formulas, data model, storage schema, offline behaviour, or any
change that materially alters existing behaviour without asking the user first.

## Context you must read

- `AGENTS.md` (stack, scope, token rules).
- `lifting-tracker/UI-CLASSES.md` — the binding class contract. Views build markup only from the
  listed classes; `styles/app.css` is the single stylesheet.
- `lifting-tracker/styles/app.css` — note it has grown in append-only "phase" blocks with several
  selectors defined two or three times (`.hm-bar`, `.card-h`, `.bb-stage`, `.hm-fig`, `.hm-legend`,
  `.toast`, `.plate-btn`, `.hm-list .hm-row`). Say whether consolidating duplicates is worth the risk.
- `lifting-tracker/src/ui/views/train.js`, `src/ui/views/progress.js`, `src/ui/dom.js`,
  `src/ui/app.js`, and the other views as needed.
- `lifting-tracker/test/ui/*.test.js` — the tests assert markup; any class or structure change must
  keep them passing or update them deliberately.

## Observations already made in the browser (375x812, example data)

Treat these as inputs to critique, not conclusions. Verify each against the code with path:line.

1. Train: the "Actual session date" `<input type=date>` sits above the current-set card, so on a
   375x812 phone the current set starts around y=430. The date is rarely changed mid-session.
2. Train: set count is stated three times — the progress bar label, "Current set · N remaining",
   and the "Full workout · X of Y sets done" summary.
3. Train: today's exercise list is collapsed inside `details.train-overview`, so the athlete cannot
   see what is coming without opening a fold on every render.
4. Train: `body:has(.train-sticky-action) main.main` reserves 180px bottom padding even when the
   sticky bar is hidden (`.train-sticky-action` is `display:none` until `.is-visible`), leaving a
   large dead area at the end of the page. Confirm at `styles/app.css`.
5. Log sheet: the barbell render takes roughly a third of the sheet while weight/reps/RPE are three
   small inputs. There are no increment controls, so every adjustment needs the on-screen keypad.
6. Progress: three stacked filter rows plus two paragraphs of explanation before the first number.
   "Share image"/"Save image" repeat under each of the three charts.
7. Every view opens with a large all-caps `h1` repeating the name already shown in the bottom tab
   bar (TRAIN, PROGRESS, PLATES, DATA, COACH), costing roughly 90px of the first screen.
8. The `EXAMPLE DATA` pill and the per-view description sit in a different place on each view
   (beside the h1 on Coach, inside the paragraph on Progress, right of the paragraph on Data).

## What the plan must deliver

- Goal.
- Approach: an ordered, prioritised list of concrete changes. Each one names the files and the
  existing classes it uses, says which of the five focus areas it serves, and states the practical
  benefit. Rank by benefit-per-risk; mark anything that changes behaviour enough to need the user's
  approval first.
- Write allowlist (exact paths).
- Out of scope.
- Done When (each item checkable).
- Verify (commands that exist in this repo; `cd lifting-tracker && node --test` is the suite —
  never pass a directory to `node --test`).
- Stop conditions.
- Risks, especially to the markup assertions in `lifting-tracker/test/ui/`.

Prefer the smallest correct change. Do not propose new dependencies, new screens, new settings, or
a visual redesign. Ground every claim about the code in path:line and mark anything unverified
UNKNOWN / CHECKED / NEEDED.
