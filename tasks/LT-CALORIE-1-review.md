# LT-CALORIE-1 review: part-logged food day no longer overrides the typed day total

Role: review only. Read-only. Do not edit, stage or commit anything.

## The bug you reproduced

A partial food-log day overrode a typed daily calorie total: 15 synthetic days, 2,800 kcal typed with each
weigh-in, breakfast-only food-log entries, gave a measured maintenance of 500 kcal — a number the athlete
would then eat to.

## The change

`lifting-tracker/src/ui/state.js`, `app.eatingTarget` (around line 325). Before: a food-log total for a date
replaced the calories typed with that date's weigh-in. Now: for a date that has both, the day's intake is
`Math.max(typed, foodLogTotal)`. Finished days only for the food log, as before.

`lifting-tracker/test/ui/state.test.js`: one new test, "a part-logged food day never pulls measured
maintenance below the calories typed with the weigh-in". 15 days, flat weight, 2,800 typed, 500 logged;
asserts 15 intake days and a measured maintenance of 2,800.

Nothing else changed. No app runtime file outside `src/ui/state.js`, so `sw.js` VERSION and `APP_VERSION`
stay at lt-v22.

## Evidence

- `cd lifting-tracker && node --test`: 412 tests, 411 pass, 1 opt-in skip.
- `cd lifting-tracker && npx playwright test`: 14 passed, 1 skipped (offline test skips on WebKit).
- Teeth check: reverting only the `Math.max` to the old "food log wins" line fails the new test with
  actual 500 vs expected 2,800.

## What I want from you

1. Is `Math.max` the right rule? The case it gets wrong: someone types 3,000 kcal with the weigh-in by
   mistake, then logs the day accurately at 2,400 — the mistake wins. The old rule got that case right and
   the reported one catastrophically wrong. Is there a better rule that is not a new completeness flag in
   the data model?
2. Does the rewrite change behaviour for a date with duplicate weigh-ins? Old code emitted every typed
   point and let `maintenance()` dedupe by date (latest wins); new code dedupes in a Map first.
3. Today's own typed calories still count towards measured maintenance while only finished food-log days
   do. Pre-existing, unchanged by this diff — is it a real second bug?
4. Anything the new test would pass through: a way the fix could be wrong that 2,800 vs 500 does not catch.
5. The saved-meal integrity bug you also found (`src/ui/views/body.js:240`, `src/core/foods.js:58-64`) is
   deliberately NOT in this diff. Confirm this change does not touch or mask it.

Report: findings by severity, with file:line. Verdict per question. No code edits.
