# LT-CALORIE-2 — Finished food-log days feed measured maintenance

Owner: Claude (implementer). Plan by Codex (`tasks/LT-CALORIE-2-plan.md`, dispatch at HEAD 4219713),
critiqued below. Mode: Dispatch. tool: none.

## Goal

A finished day whose only record is the food log must not feed measured maintenance until the athlete says
the log is the whole day. One decision per day, in the Body view, reversible.

## Accepted from Codex's plan

- A separate `meta` key, not a `settings` field and not a field on the intake records. Settings goes through
  `mergeSetting` (`src/ui/state.js:110-138`), which is built for preferences, not for per-date decisions, and
  an older app's `sanitizeSettings` would drop the field on restore. A per-entry field spreads a day-level
  decision across many records.
- `BACKUP_VERSION` 3 → 4, keeping the existing policy (`src/store/backup.js:6-9`): an older app refuses a
  newer file instead of restoring it and silently dropping what it does not know.
- Precedence, unchanged except for the food-log line: a positive typed figure wins; otherwise a **finished**
  log supplies the day; an unfinished log supplies nothing; today and later supply nothing.
- `app.intakeTotals()` stays as it is, so unfinished food still shows in the day's card and its progress bar.
- No IndexedDB migration. Absent means unfinished. Old backups restore as unfinished.
- `sw.js` `VERSION` and `src/ui/updates.js` `APP_VERSION` move together, lt-v23 → lt-v24.

## Changed from Codex's plan, with reasons

1. **The marker records the total it confirms, not just the date.** `finishedDays: [{ date, kcal }]`, and a
   day counts as finished only while its stored `kcal` still equals that day's current log total (compared
   rounded to 2 dp). Codex proposed a bare date list plus clearing the date inside every intake write, made
   atomic with `store.putAll` so a torn write cannot leave an edited day still marked finished.
   `putAll` does give that atomicity (`src/store/db.js:131-134`), so the plan is implementable — but the
   total makes the whole problem disappear: `addIntake`, `deleteIntake` and Undo need no change, there is no
   invariant for a future caller to forget, and every failure direction is safe, because a marker that no
   longer matches is simply ignored. A day edited back to the same total stays finished, which is correct:
   the claim is about the day's total, and that total is unchanged.
2. **No orphan-marker check on restore.** Codex would reject a backup whose marker has no matching intake
   entries. A marker for a date with no entries contributes nothing by construction, so the check would
   defend against nothing while making a harmless file unrestorable. Sanitise the list (strict dates,
   deduplicate, cap, valid kcal) and keep what survives.
3. **No new browser smoke test.** `e2e/smoke.spec.js` is five flows that must never break; a nutrition
   marker is not one of them, and each flow costs three engine runs. The Node suites drive the real
   `createApp` against the in-memory store, which covers this logic. `e2e/` stays out of the allowlist.

## Write allowlist

```
lifting-tracker/src/store/programme-schema.js
lifting-tracker/src/store/backup.js
lifting-tracker/src/ui/state.js
lifting-tracker/src/ui/views/body.js
lifting-tracker/src/ui/views/data.js
lifting-tracker/sw.js
lifting-tracker/src/ui/updates.js
lifting-tracker/test/store/schema.test.js
lifting-tracker/test/store/backup.test.js
lifting-tracker/test/ui/state.test.js
tasks/LT-CALORIE-2.md
```

## Out of scope

The saved-meal integrity bug (`src/ui/views/body.js:240`, `src/core/foods.js:58-64`). Any change to the
maintenance mathematics in `src/core/targets.js`. Any automatic or inferred completeness. `e2e/`.

## Done When

- [ ] An unfinished log-only history cannot produce a measured maintenance.
- [ ] A finished log-only history can; a typed figure still wins over the log for the same date.
- [ ] Today cannot be marked finished and contributes nothing either way.
- [ ] Editing a finished day's food makes it unfinished again, with no change to `addIntake`/`deleteIntake`.
- [ ] Markers survive a reload and a backup round-trip; a format-3 backup restores as all-unfinished; a
      format-4 file is refused by the current `BACKUP_VERSION` check only when it is newer than 4.
- [ ] Malformed, duplicate and oversized marker lists cannot reach the database.
- [ ] The Body food-log card marks a past day finished, shows that it is, and undoes it.
- [ ] `sw.js:5` and `src/ui/updates.js:2` both read lt-v24.
- [ ] `node --test` and `npx.cmd playwright test` both green.
- [ ] Each new behaviour has a test that fails when the behaviour is reverted (teeth check, reverted after).

## Verify (from `lifting-tracker/`)

```
node --test test/ui/state.test.js test/store/backup.test.js test/store/schema.test.js
node --test
npx.cmd playwright test
```

## Status

- 2026-11-02 Claude: implemented; 418 node tests and the browser suite green.
- 2026-11-10 Codex review 1 (plain dispatch; ccx refused `-TaskId` on the LT-QUALITY-1 ownership overlap):
  REFUTED on three points, all fixed with regression tests in `test/ui/state.test.js`: (1) delete then Undo
  lost a confirmation to float rounding, now a 0.005 kcal tolerance; (2) `setDayFinished` accepted today,
  now refuses today and later (the old test permitted it, against Done When; INTENT: the test now asserts
  the refusal); (3) a day total over 20,000 kcal saved but was dropped on reload, now one shared limit
  (`MAX_DAY_KCAL`) checked at write. Node 421 tests (420 pass, 1 opt-in skip); browser 14 pass, 1 skip.
  The fixes have not had their second review yet. Not committed.

## Stop conditions

Stop and ask if the marker cannot be kept out of `addIntake`/`deleteIntake`, if restore safety needs
weakening to make a check pass, or if a second repair of the same failure does not pass verification.
