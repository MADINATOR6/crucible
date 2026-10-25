# LT-UI-1: "today's session" selector and one-tap log-as-planned

## Mode and owner
LT-UI-1 · normal · risk low · Dispatch in its own worktree (Claude is redesigning `src/ui/views/train.js` and `styles/app.css` in the base checkout at the same time; don't touch those). Codex implements; Claude reviews, wires the UI and owns all Git. Part of `prompts/lifting-tracker-ui-upgrade.md`, phase 1. Synthetic data only.

## Goal
The redesigned Train screen opens on the athlete's next unfinished day and lets them log a set exactly as planned with one tap. Build the logic and tests for both; no UI.

## Relevant files
- `lifting-tracker/src/ui/state.js`: `app.logSet`, `app.loggedFor`, `app.dateFor`, `app.prs`, `app.deleteSet`. Programme shape: `programme.blocks[].weeks[].days[].entries[].sets[]`, each with `number` on blocks, weeks and days.
- `lifting-tracker/src/ui/views/train.js` (read only): `pickDefaults` (how "open" days are found today), `openLogSheet` (the default date rule, the `exerciseId || 'custom:' + entry.name` fallback and the PR before/after comparison you should match).
- Set fields: `load {value, unit}`, `loadRange {min, max, unit}`, `repsMin`, `repsMax`, `targetRpe`, `completed`.
- `lifting-tracker/test/ui/state.test.js` shows how state is tested.
- `lifting-tracker/sw.js` and `test/ui/sw.test.js`: every module the app imports must be precached.

## Write allowlist
- New `lifting-tracker/src/core/session.js` (pure functions, no DOM, no storage).
- `lifting-tracker/src/ui/state.js` (add two methods only).
- `lifting-tracker/sw.js` (add the new module to the precache list only).
- New `lifting-tracker/test/core/session.test.js`; `lifting-tracker/test/ui/state.test.js`.
- Nothing else: not `train.js`, not `styles/`, not docs or workflow files.

## Resolved rules
1. **`nextSession(programme, isDone)`** in `session.js`. `isDone(ref)` takes `{blockNumber, weekNumber, dayNumber, entryIndex, setIndex}` and returns a boolean. Walk blocks, weeks and days in ascending `number` order and return `{blockNumber, weekNumber, dayNumber}` for the first day that has at least one set not done. A day with no sets is skipped. If every set is done, return the last day of the last block. If the programme has no days, return `null`.
2. **`sessionProgress(day, ref, isDone)`**: returns `{done, total}` over all sets in that day (`ref` is the day's `{blockNumber, weekNumber, dayNumber}`).
3. **`plannedValues(set)`**: returns `{weight, reps, rpe}` or `null`.
   - Weight is `set.load`. With no `load`, use `loadRange.min` with its unit. With neither, return `null`.
   - Reps are `repsMin` when it is a number (for a range like 8–12 that's the bottom of the range, which stops a one-tap log inflating a PR). With no reps, return `null`.
   - RPE is `targetRpe`, or `null`.
4. **`app.nextSession()`** in `state.js`: `nextSession(app.programme, isDone)`, where a set is done if `s.completed` or `app.loggedFor(ref)` is non-null. Same rule as `train.js` `weekStats`.
5. **`app.logAsPlanned({ programmeRef, plannedRef, date })`** in `state.js`.
   - It finds the entry and set from the refs, gets `plannedValues(set)` and throws `RangeError('This set has no planned weight or reps: open it to log.')` when that's `null`. It also throws a `RangeError` when the refs don't match a set.
   - Default date: `app.dateFor(programmeRef)` if it's known and no later than today, otherwise today (same as `openLogSheet`).
   - It logs through `app.logSet` with `exerciseId: entry.exerciseId || 'custom:' + entry.name`, so validation, sessions and the write queue are unchanged.
   - It returns `{ set: <the logged record>, newPRs: <PRs not present before the log> }`, using the same key as `prKey` in `train.js`.
   - Undo is `app.deleteSet(result.set.id)`: no new undo machinery.
   - A set that's already logged is overwritten exactly as `logSet` does today.

## Out of scope
UI, CSS, `train.js`, rest timer, docs, any change to `logSet`'s validation or to how PRs are computed.

## Verify
- `cd lifting-tracker && node --test` passes (baseline: 250 pass, 1 skip; the count may only go up).
- `node --test test/core/session.test.js` and `node --test test/ui/state.test.js`.

## Done When
1. (Codex) `session.js` implements rules 1–3, with tests for: block, week and day ordering that differs from array order; a partly logged day; all done (returns the last day); empty programme (`null`); a day with no sets skipped; `plannedValues` for fixed reps, a rep range, a load range, a missing load (`null`) and missing reps (`null`).
2. (Codex) `state.js` implements rules 4–5, with tests for: `nextSession` moving on after logging; `logAsPlanned` writing the planned values; an unloggable set throwing `RangeError` and writing nothing; a new PR being reported; `deleteSet` on the returned id restoring the previous state; the date rule.
3. (Codex) `sw.js` precaches `src/core/session.js`; the sw test passes.
4. (Claude) Review the diff, wire `train.js` to these methods, run the full suite, cross-review and commit.

## Stop conditions
Stop and report (UNKNOWN / CHECKED / NEEDED) if the rules conflict with how `logSet` or `loggedFor` actually behave, or if the work needs files outside the allowlist.
