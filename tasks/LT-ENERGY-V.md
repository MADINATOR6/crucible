# LT-ENERGY-V: verify session calories, daily energy and eating targets

Role: Codex verifier (read-only). Base: `bfffe70`. Change under test: `git diff bfffe70 58c08c7 -- lifting-tracker` (commits 7426b00, a228f7b, 58c08c7). Synthetic data only; never read `lifting-tracker/private/` or any `.xlsx`. Temporary files only under `%TEMP%`, never in the repository.

## What changed
- `src/core/calories.js`: session calories (Compendium METs × bodyweight × time from set `createdAt`), ten Haaf resting burn, `dayEnergy` (sleep, lifting, logged activities, everyday movement, digestion), `ACTIVITIES` catalogue.
- `src/core/targets.js`: maintenance (estimated mean, or measured = mean intake − Theil–Sen weight slope × 7,700) and goal target with macros and a floor.
- `src/store/programme-schema.js`: `sanitizeActivities`, new settings (heightCm, birthYear, bodyFatPct, sleepHours, everyday, goal, goalPace, shareBarEnd).
- `src/store/backup.js`: optional `activities` list in export and restore (schema version stays 1).
- `src/ui/state.js`: `sessionCalories`, `dayEnergy`, `eatingTarget`, `addActivity`/`deleteActivity` (stored in IndexedDB meta key `activities`).
- `src/ui/views/body.js` (new Progress → Body & energy tab), `progress.js` (tabs), `train.js` (calorie line).

## Verify
- `cd lifting-tracker && node --test` (expect 377 pass, 1 skip).

## Attack (report each as a Checks line)
1. Backup/restore: old backups without `activities`; malformed, oversized or duplicate-id activities; a restore that must not leave data half-written; whether restoring wipes activities unexpectedly; an older app reading a newer backup.
2. Settings sanitising: every new field with wrong types, out-of-range, NaN/Infinity, strings, prototype keys (`__proto__`, `constructor`) for goal/goalPace/everyday/activity kind.
3. Calorie maths: timestamps across midnight, time zones and daylight saving changes (Australia/Sydney), duplicate timestamps, edited sets, unsorted input, sessions under 5 minutes, pauses over 15 minutes, logged minutes exceeding the waking day, sleepHours extremes, missing bodyweight or details.
4. Targets: the floor (resting burn, 1,500/1,200), body fat % edge values, measured-maintenance thresholds (14 intake days, 8 weigh-ins over 14 days in 28), outlier weigh-ins, negative carbs.
5. Rendering: any user- or file-supplied value reaching `innerHTML` in `body.js`, `progress.js`, `train.js` without `esc()`.
6. Anything else that could lose or corrupt a user's logged data.

## Result (2026-10-26)
Codex verifier (read-only, high effort) reported 8 FAILs; all fixed by Claude with a regression test each:
duplicate activity ids rejected; one 20,000-entry limit enforced on add and restore; intake counted once per date;
non-string enum settings fall back to defaults; sessions past midnight keep their timing (sets up to 6 h after the
first one on the session date); protein and fat trimmed towards their minimums so macros fit the target; backup
format 2 (older apps refuse it instead of dropping activities; format 1 still restores); days over 24 h flagged.
Also from the science check: energy per kg of change from Hall 2008 (body fat %), nursing shifts as whole-shift
averages (Chappel et al. 2023). Suite: 381 pass, 1 skip.

## Stop conditions
Stop and report if a check needs real data, network access, or writing to the repository.
