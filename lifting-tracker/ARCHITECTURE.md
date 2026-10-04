# Lifting Tracker: architecture note

Personal powerlifting tracker. Offline-first PWA, plain JavaScript ES modules, no build step, no runtime dependencies. All data stays on the device. Node 24 is installed here (FACT: `node --version` = v24.21.0); tests use `node:test`, so Node 18+ is required.

## Privacy (hard rules)
- The athlete's real workbook and anything derived from it (parsed programme JSON, logs, bodyweight) is **never committed**. `.gitignore` blocks `*.xlsx`, `lifting-tracker/private/` and `lifting-tracker/data/private/`.
- Tests and examples use synthetic data only. Example data shown in the UI is labelled EXAMPLE.
- No accounts, server, analytics or third-party scripts. Fonts are system fonts.
- The athlete's name and phone number from the workbook are not imported into the data model.

## Folder layout
```
lifting-tracker/
  index.html, manifest.webmanifest, sw.js      app shell (PWA)
  styles/                                      design tokens, components
  src/
    core/      units.js e1rm.js prs.js sets.js weeks.js muscles.js schedule.js   pure logic, no DOM, no storage
    plates/    loading.js                                                         pure plate maths
    import/    xlsx.js programme.js report.js                                     workbook -> programme JSON
    store/     db.js backup.js                                                    IndexedDB + JSON backup/restore
    ui/        app.js views/*.js heatmap.js barbell.js charts.js                  DOM only
  data/        exercises.json                                                     editable exercise + muscle catalogue
  test/        *.test.js, helpers/                                                node --test
  private/     (gitignored) real imported data, never committed
```
Dependency rule: `core` and `plates` import only `units.js` and `data/*.json` (passed in as arguments, not fetched). `import` imports `core/units.js` only. `ui` and `store` import everything else. Nothing in `core`, `plates` or `import` touches the DOM, `localStorage` or IndexedDB.

## Units
Weights are stored exactly as entered: `{ value: number, unit: 'kg' | 'lb' }`. Maths is done in kg with `1 lb = 0.45359237 kg` (`core/units.js`). Display is in the user's chosen unit to 1 decimal place. A bare number with no unit in the coach's workbook is **assumed kg** (ASSUMPTION: the overview total reads "480kg"); a load with a unit word ("235 pounds") keeps that unit.

## Programme model (output of the importer)
```
Programme { schema: 1, importedAt, source: { fileName, sheetCount }, overview: { results: [{ date: 'YYYY-MM-DD'|null, squat, bench, deadlift, totalText, comment }] }, blocks: [Block], report: ImportReport }
Block     { id: 'b13', number: 13, name: 'Priming', goal: string, instructions: string, weeks: [Week] }
Week      { number, label, target: { squat, bench, deadlift, total } | null, avgCalories: number|null, avgBodyweightKg: number|null, bodyLog: [{ weekday: 'Monday'..'Sunday'|null, bodyweightKg: number|null, calories: number|null, raw }], days: [Day] }
Day       { number, entries: [Entry] }
Entry     { exerciseId: string|null, name, rawName, supersetGroup: 'A1'|null, tempo: string|null, cues: [string], sets: [PlannedSet] }
PlannedSet{ index, repsMin: number|null, repsMax: number|null, repsRaw: string|null, targetRpe: number|null,
            load: { value, unit, raw } | null, loadRange: { min, max, unit } | null,
            actualRpe: number|null, actualReps: number|null, actualLoad: { value, unit }|null, coachComment: string|null, athleteComment: string|null,
            completed: boolean, source: { sheet, row, col }, warnings: [warningCode] }
```
- `completed` is true when `actualRpe` is present or the athlete comment carries a performance note ("did 140", "8 reps").
- The workbook's Load column is **prescribed** for future weeks (loads present with no Actual RPE) and is treated as performed when the set is completed. (ASSUMPTION; confirm with the athlete.)
- Rows and columns are 1-based Excel rows / 0-based columns in `source` (documented in the importer spec).

## Logged-workout model (written by the app, stored in IndexedDB)
```
Session   { id, date: 'YYYY-MM-DD', programmeRef: { blockNumber, weekNumber, dayNumber } | null, note, createdAt, updatedAt }
LoggedSet { id, sessionId, exerciseId, order, weight: {value, unit}, reps, rpe: number|null, isWarmup: boolean, plannedRef: { entryIndex, setIndex } | null, note, createdAt, updatedAt }
Bodyweight{ id, date, weight: {value, unit}, calories: number|null, createdAt }
```
Every record has a stable `id` (UUID), `createdAt`, `updatedAt` and the store carries `schemaVersion`.

## Calculation contracts (core)
- e1RM: Epley `w * (1 + reps / 30)`; `reps === 1` returns `w`; `reps` must be an integer 1..12, otherwise `null` ("cannot estimate"). It is an approximation and the UI says so.
- Only working sets (`isWarmup === false`, reps >= 1, weight > 0) count for e1RM, PRs and volume.
- PR rules: per exercise and per PR type, the first working set is the baseline and is never a PR; a later set is a PR only if it strictly beats every earlier working set (by date, then order); ties are not PRs. Types: `e1rm` (best e1RM), `single` (heaviest set of exactly 1 rep), `repsAtWeight` (most reps at an exact weight in kg, compared at a 0.01 kg tolerance).
- Weeks run Monday to Sunday (Australia). Weekly hard sets per muscle = sum over working sets of the exercise's muscle weight (1 primary, 0.5 secondary).
- Estimated session dates: the workbook has no block dates (UNKNOWN). `core/schedule.js` assigns estimated dates from a block start date and a Day-N-to-weekday map; the UI marks them as estimates and lets the athlete edit.

## Import pipeline
`xlsx.js` (zip + XML -> cells, with date-formatted cells flagged) -> `programme.js` (find blocks, `Week N` labels and `Day N` headers by searching, never by fixed addresses; classify first-column text as exercise, cue or tempo; parse reps, RPE, loads) -> `report.js` (counts and warnings). The importer is pure and re-runnable; merging imported programme data into the athlete's logged data is the store's job and never overwrites logged sets without asking.

## Verified facts about the real workbook (inspected 2026-10-04, read-only; no personal values recorded here)
- 14 sheets, stored newest-first: `TRAINING OVERVIEW`, `Block 1 - Introduction` .. `Block 13 - Priming`.
- Week groups are 7 columns wide and start where a `Day N` header sits in the first column of the group; **group offsets are not always 7 apart** (Block 3's last two weeks start at columns 22 and 29, not 21 and 28) and one `Week N` label can be missing (Block 5 has 4 week groups but 3 `Week` labels), so groups must come from the `Day` headers.
- 1,465 reps cells are date values (4-8: 276, 4-6: 45, 5-10: 4, 6-10: 841, 8-12: 299); day < month in every one; rule `repsMin = day`, `repsMax = month`. 778 `-` placeholder cells; `.` and blank-space cells are also placeholders. Text rep ranges (`10-15`) exist.
- Target and Actual RPE use 11 very often (accessories; about 1,341 cells) as a "to failure" style marker, plus half steps. Some Actual RPE cells hold bodyweights (84, 84.1, 85.55, 86.5) or typos (`11$`, `6.5.`, `9 (140)`).
- Loads: plain numbers, ranges (`132.5-135`), and text with units (`235 pounds`, `30 kg`, `30 lg` typo).
- First-column text includes **cue/annotation rows** that are not exercises (`CHEST UP`, tempo `030`/`320`/`313`, `SUPERSET`, `3 seconds to knee...`, `1 set then 1 minute rest`, `Deload`, `Average Daily Calories`), mixed with real exercise names on set rows, so classification needs the catalogue in `data/exercises.json` plus cue patterns.
- `Paused on Chest` is its own exercise row directly under `Competition Bench Press`.
- Athlete Comments hold bodyweight/calorie lines (`Monday: 84.1 KG, 2000 Calories`), performance notes (`did 140`, `8 reps`, `Did 200, RPE 8.5`), and, where reps are a range, bare numbers (assumed reps achieved).
- Week labels sometimes carry the planned squat/bench/deadlift for the week: `Week 1 - 165/115/190 [470kg]`.
- Blocks: 4 days per week except Block 5 (3 days, 4 week groups) and Block 12 (3 days, 6 weeks); Block 13 has 2 weeks (in progress).
