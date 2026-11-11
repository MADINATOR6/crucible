# LT-CALORIE-2 verify: the implementation of your plan

Role: verifier. Read-only. Do not edit, stage or commit anything. Working tree, HEAD 4219713.

Your plan is `tasks/LT-CALORIE-2-plan.md`; the task file with my critique is `tasks/LT-CALORIE-2.md`.
Read the critique section before judging the diff: three things differ from your plan deliberately.

## What I built

`finishedDays`: a `meta` key holding `[{ date, kcal }]` — the date the athlete confirmed and the day's food
log total at that moment. `app.dayFinished(date)` is true only while the day's log still adds up to that
total (compared rounded to 2 dp). `app.setDayFinished(date, finished)` writes or removes the row.
`app.eatingTarget` now takes a date's food log only when `date < today` and `app.dayFinished(date)`; typed
calories still win over the log, unchanged from 4219713.

Deliberate differences from your plan, with my reasons in `tasks/LT-CALORIE-2.md`:

1. The marker stores the confirmed total, so `addIntake`, `deleteIntake` and Undo are untouched and there is
   no atomic two-key write. An edit stops the day matching, so it is unconfirmed until confirmed again.
2. Restore drops a malformed or duplicate marker instead of refusing the file, and does not check that a
   marker has matching intake entries.
3. No new browser smoke test, and `e2e/` is not in the allowlist.
4. I did not add a count to `validateBackup`'s `counts` or the restore preview. It would mean touching the
   `counts` shape a test asserts whole, to tell the athlete a number that does not help them judge a file.

`BACKUP_VERSION` is 4. `sw.js` and `APP_VERSION` are both lt-v24.

## Evidence

- `node --test`: 418 tests, 417 pass, 1 opt-in skip. `npx.cmd playwright test`: 14 passed, 1 skipped.
- Teeth checks, each reverted: making `dayFinished` ignore the stored total fails the edit test; dropping
  the `dayFinished` filter in `eatingTarget` fails the confirmation test with 2,600 where null is expected;
  dropping `finishedDays` from the restore snapshot fails the round-trip test.
- Driven in a real browser on the dev server: the empty-day button is disabled, confirming shows "Whole day
  confirmed" with Undo, the marker survives a reload from IndexedDB, adding food clears the confirmed state
  and removing that food restores it. No console errors.

## What I want from you

1. Attack the confirmed-total rule. Where can a day's log total change while the stored total still matches,
   so a day counts as confirmed when the athlete would not say it is? Where can the reverse happen and lose
   a confirmation the athlete should keep? Floating-point sums over the same entries in a different order
   are the case I am least sure of — `src/ui/state.js`, `sameKcal`.
2. Is dropping a bad marker on restore instead of refusing the file the right call, given the same file's
   food and training records are refused when malformed? `src/store/backup.js`.
3. `checkCurrent` now compares `finishedDays` too. Is that right, or does it make a stale-restore error fire
   when it should not?
4. The `BACKUP_VERSION` 3 → 4 bump: check the refusal boundary is still exactly "newer than what I know".
5. Anything the 418 + 14 tests would pass through.

Report: findings by severity with file:line, verdict per question. No code edits.
