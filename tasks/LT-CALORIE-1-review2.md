# LT-CALORIE-1 review, round 2

Role: review only. Read-only. Do not edit, stage or commit anything. Your round-1 report is accepted;
this is the revised diff. Working tree, not yet committed (HEAD is still 57cbf1d).

## What changed since round 1

Your P1 version bump: fixed. `sw.js` VERSION and `src/ui/updates.js` APP_VERSION are now `lt-v23`.
I was wrong in round 1 that no runtime file changed — `src/ui/state.js` is in the SHELL list.

Your P1 (food-only partial days) and P2 (today's typed calories), and your answer to question 1, together
replaced the `Math.max` rule. One rule now: **a day counts only if it is finished and clears the intake
floor.** In `app.eatingTarget` (`src/ui/state.js`):

- typed points are filtered to `p.x < today`, matching the food log's existing exclusion of today;
- a date's food-log total is used only when `t.kcal >= floor`; under the floor the date keeps the typed
  figure, or has no intake at all;
- `floor` is `intakeFloor({ restKcal: restingKcal(body), sex })`, a new export in `src/core/targets.js`
  holding the `Math.max(restKcal || 0, female ? 1200 : 1500)` expression that `target()` already used
  inline and now calls.

This answers your question-1 typo case better than either candidate rule: typed 3,000 by mistake with an
accurate 2,400 logged gives 2,400, because 2,400 clears the floor.

Tests in `test/ui/state.test.js`: a shared `eatingDays` helper plus two tests covering the four gaps you
named — fragment with a typed total (2,800), fragment with nothing typed (no measured figure), a full log
above the typed figure winning (2,900), and today excluded from both sources. The over-claiming test name
is gone.

## Evidence

- `node --test`: 413 tests, 412 pass, 1 opt-in skip.
- `npx playwright test`: 14 passed, 1 skipped.
- Teeth checks, each reverted after: dropping the floor makes the fragment case 500 again; letting today's
  typed calories back in makes it 16 intake days (your 2,656 figure).

## What I want from you

1. The floor rule's own failure mode: a genuine sub-floor day of eating is now dropped from the window
   rather than counted. Is dropping it worse than the understatement it prevents? Does it bias measured
   maintenance upward for someone on a deep cut?
2. `intakeFloor` now serves two purposes — the lowest target `target()` will recommend, and the lowest
   total that counts as a logged day. Is sharing one number between them wrong?
3. Does the `p.x < today` filter break anything else that reads typed weigh-in calories?
4. Re-check the duplicate-weigh-in behaviour against the new code.
5. Anything in the diff that the 413 + 14 tests would pass through.

Report: findings by severity with file:line, verdict per question. No code edits.
