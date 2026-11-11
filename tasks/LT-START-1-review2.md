# LT-START-1 review 2: the fixes for your four findings (last review cycle)

Role: verifier. Read-only. Do not edit, stage or commit anything. Working tree on HEAD 1f8e80d.
Scope is `git diff -- lifting-tracker`. Your review 1 and what I did about it: `tasks/LT-START-1.md`, Status.

## Fixes

1. **P1 history leak in the template learner.** `src/ui/views/plan.js` `learnTemplateFor` now passes
   `app.analysisProgramme()` to both `pickTemplateBlock` and `learnTemplate`.
   Test: `test/ui/plan-flow.test.js`, "with workbook history off, the Coach builds from the plan…": your
   reproduction (accessory planned ~75 kg, actual 333 kg, comment `EXCLUDED`) driven through `planView`;
   it asserts 333 appears with history on, so the test can see the leak, and neither 333 nor `EXCLUDED`
   appears with it off.
   TWINS: `src/ui/views/muscles.js` `musclesView` picked its default week from the stored programme (now
   the analysis programme). Left on the stored programme on purpose: Train and `app.nextSession` (position
   in the plan), `app.blockStarts`, block revision (`plan.js`, generated blocks only), Data's counts.
2. **P2 starting estimate resurfacing.** `src/core/athlete.js`: the estimate is used only when the lift has
   never had qualifying evidence at any date up to `asOf` (`collectSources` over an open window).
   Test: `test/core/athlete.test.js`, "a starting estimate is retired for good…" (your reproduction).
3. **P2 stale dates after a failed settings write.** I withdrew my deviation and did what you planned:
   `src/store/db.js` `replaceProgramme` takes `settings` (stored settings → new settings), written in the
   same transaction in the IndexedDB store, and computed before any write in the memory store.
   `app.startProgramme` uses it; the second write is gone.
   Test: `test/ui/state.test.js`, "the starter and its dates are saved together…" (leftover
   `blockStarts[1] = 2025-02-03` and Tuesday day 1; failed write changes nothing; successful one gives
   2026-11-09 and clears the override; survives reload).
4. **P2 eligibility mismatch.** `app.startProgramme` refuses only when a block has weeks, the same test
   `planView` uses. Test: `test/ui/state.test.js`, "a programme with only an empty block can be started…".

## Evidence

`node --test`: 439 tests, 438 pass, 1 opt-in skip. `npx.cmd playwright test`: 17 passed, 1 skipped (run by
Claude; your sandbox cannot run it).

## Attack these

- Fix 3: in the IndexedDB `replaceProgramme`, is awaiting `object.get('settings')` after the `check` await
  safe for the transaction's lifetime, and does a throw from `settings()` abort everything? Does
  `checkCurrent` or anything else now see settings change under it? Any other `replaceProgramme` caller
  affected by the new return value?
- Fix 2: can a lift now be left with no estimate in a case where the athlete would reasonably expect one,
  and is that worse than the bug it fixes?
- Fix 1: any remaining reader, in Coach or elsewhere, that prefers a workbook actual over the plan when
  history is off. Re-run your 333 kg probe.
- Anything the fixes broke that review 1 had passed.

Report: findings by severity with file:line, a verdict per fix. No code edits.
