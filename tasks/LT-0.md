# Task

## Mode and Owner
LT-0 · complex · risk high (data integrity of imported training history) · Dispatch in worktree `.ccx-worktrees/codex-LT-0`, branch `codex/lt-0`, running in parallel with LT-1 and LT-7a. Codex implements. Claude reviews the diff and commits. A separate Codex verifier run attacks the result afterwards.

## Goal
Turn the coach's Excel workbook into the Programme JSON defined in `lifting-tracker/ARCHITECTURE.md` ("Programme model"), with an import report. Read `lifting-tracker/ARCHITECTURE.md` first (including "Verified facts about the real workbook"), then `lifting-tracker/src/import/xlsx.js` (committed, already works; you may fix defects in it) and `lifting-tracker/data/exercises.json`.

## Relevant Files
- `lifting-tracker/src/import/xlsx.js`: `openWorkbook(bytes)` returns `{ sheetNames, getSheet(name) }`; a sheet is `{ rows, maxRow, maxCol, merges }`, `rows[r][c]` is `{ r, c, t: 's'|'n'|'d'|'b'|'e', v, date? }` (0-based r and c; `date` is `{ y, m, d }` for date-formatted numbers). Also exports `cellRef(r, c)` (A1 style), `serialToYmd`.
- `lifting-tracker/data/exercises.json`: aliases, cues, `cuePatterns`.
- `lifting-tracker/src/core/units.js`: unit helpers (do not edit).

## Write Allowlist
- `lifting-tracker/src/import/programme.js` (new)
- `lifting-tracker/src/import/report.js` (new, optional; keep report building in one place)
- `lifting-tracker/src/import/xlsx.js` (defect fixes only)
- `lifting-tracker/test/import/*.test.js` (new)
- `lifting-tracker/test/helpers/make-xlsx.js` (new: builds synthetic .xlsx bytes in memory)
- Temporary files: none on disk; fixtures are built in memory. Never write or read a real workbook path in committed code or tests, except the opt-in smoke test below.

## Constraints
- Plain JavaScript ES modules, no dependencies, no build step. Node 24 here; must also work on Node 18+ and in a browser (no `fs`, no `Buffer` in `src/`).
- Pure and re-runnable: same bytes in, same Programme out. Never mutate inputs. Never throw on a bad cell; record a warning. Throw only when the file is not a readable workbook.
- Never silently fix a value. Anything you clean, convert or drop produces a warning with the original text (`raw`).
- Do not import the athlete's name, phone number or any text from the Athlete/Madison cells. Block goal and additional-instruction text are imported; any digit run of 7 or more digits (or a `+` phone shape) inside imported free text is replaced with `[redacted]` and counted as warning `redacted_number`.
- Synthetic fixtures only. Fixtures copy the layout and traps, with invented names/values. No real names, comments or numbers from the athlete's file in tests.
- Find structure by searching, never by fixed cell addresses: `Day N` header cells define week-group start columns (the first column of a group); a week group extends from its start column up to (not including) the next group's start column, and its 7 columns are at offsets 0..6 from the start: 0 exercise/label, 1 Reps, 2 Target RPE, 3 Load, 4 Actual RPE, 5 Coach Comments, 6 Athlete Comments. Group starts need not be 7 apart. Confirm each group's header text (`Reps`, `Target RPE`, ...) when present; if the header texts are shifted by one column, use the header positions found.

## Resolved Rules

### Sheets
- Sheet name `Block <n> - <name>` (hyphen or en dash, any spacing) -> block number and name. Output blocks sorted by number. `TRAINING OVERVIEW` (case-insensitive) -> overview. Any other sheet -> warning `sheet_ignored`.
- Block goal = first non-empty text cell below the cell labelled `Block Goal` (same column, within 6 rows). Instructions = same for `Additional Instructions`. Missing -> empty string.
- Overview: find the header row containing DATE, SQUAT, BENCH, DEADLIFT, TOTAL, COMMENTS (case-insensitive, any column offset). Each following row until a fully empty row becomes `{ date, squat, bench, deadlift, totalText, comment }`: `date` from a date cell as `YYYY-MM-DD` (else null + warning `overview_date`), lifts as numbers (else null), `totalText` the raw total as a string (`480kg`). Do not read anything else on the overview sheet.

### Week groups
- Week label = a cell whose text starts with `Week <n>` found in the rows above the group's first `Day` header, inside the group's column span. `number` = n. Missing label -> `number` = previous group's number + 1 (or 1) and warning `week_label_missing`.
- Planned target from the label: `Week 1 - 165/115/190 [470kg]` -> `target: { squat: 165, bench: 115, deadlift: 190, total: 470 }` (kg). No match -> `target: null`.
- `Average Daily Calories` and `Average Morning BW` labels sit near the week label (within 3 rows below it, inside the span). The value is the first numeric cell to the right of the label within the span; otherwise null. Not found -> null, no warning.
- A group with no sets after parsing is dropped with warning `empty_week_group`. If every week of a block is dropped, keep the block with `weeks: []`.

### Days and rows
- A `Day <n>` cell in a group's first column starts day n. Rows run until the next `Day` header in that column. Header rows repeat the column names and are consumed, not sets.
- A **set row** has at least one non-empty, non-placeholder value in columns 1..4 (Reps, Target RPE, Load, Actual RPE). A row with nothing in columns 1..4 but text in 5/6 is a comment-only row: append the text (joined with `\n`) to the previous set's coach/athlete comment. A fully empty row ends the current entry (the next set row with an empty label is then an orphan: attach to the previous entry of the day with warning `orphan_set`; no previous entry -> drop with that warning).
- **Placeholders** are exactly `-`, `.`, empty after trimming (including a lone space). They mean "no value", never produce a warning, and are counted in `report.placeholders`.

### First-column label classification (`classifyLabel`, exported)
Input text, catalogue; output `{ kind, exerciseId, name, supersetGroup }`.
1. Empty -> `empty`.
2. Strip a leading `A<n>:` / `B<n>:` style prefix (regex `^[A-Z]\d+\s*:\s*`) and record it as `supersetGroup` (`A1`, `A2`).
3. Tempo: matches `^[0-9X]{3,4}$` -> `tempo`.
4. Cue: case-insensitive exact match of a `cues` entry, or any `cuePatterns` regex -> `cue`.
5. Alias match (case-insensitive, whitespace collapsed; treat `dumbell` and `dumbbell` as equal) -> `exercise` with the catalogue `id` and display `name`.
6. Otherwise -> `exercise` with `exerciseId: null`, `name` = trimmed text, and warning `unknown_exercise`.
- `exercise` starts a new entry. `rawName` is the original trimmed text (with the superset prefix removed). `tempo` attaches to the current entry's `tempo`. `cue` text is appended to the current entry's `cues` (original text). A tempo or cue label sits on a normal set row: that row's sets still count.
- `Average Daily Calories` / `Average Morning BW` rows are consumed by the week-average rule, never classified.

### Cell parsers (all exported, all pure; each returns the value plus `warnings: [{ code, raw }]`)
- `parseReps(cell)`: date cell -> `repsMin = day`, `repsMax = month`, year ignored, counted in `report.dateRepsConverted`; if `day > month` -> nulls + `reps_date_reversed`. Number: integer 1..100 -> min = max; otherwise nulls + `reps_invalid`. Text: placeholder -> nulls; `^\d+$` -> single; `^(\d+)\s*[-–]\s*(\d+)$` -> range (min > max -> nulls + `reps_range_reversed`); anything else -> nulls, `repsRaw` kept, `reps_text`. `repsRaw` always holds the original (date cells as `d/m`).
- `parseRpe(cell)`: number in 1..10 -> value (a non-multiple of 0.5 also warns `rpe_not_half_step`, value kept); number in (10, 11] -> value kept + `rpe_above_10` (the athlete's sheets use 11 as a to-failure style marker; never convert it); number outside 1..11 -> null + `rpe_out_of_range` (these are usually bodyweights typed in the wrong column); text: placeholder -> null; leading number with trailing junk (`6.5.`, `11$`, `9 (140)`) -> that number validated as above + `rpe_text_cleaned`; no leading number -> null + `rpe_text`.
- `parseLoad(cell)`: positive number -> `{ value, unit: 'kg', raw }` (bare numbers are kg; count in `report.assumedKgLoads`); zero/negative -> null + `load_invalid`; text: placeholder -> null; `^(\d+(?:\.\d+)?)\s*(kg|kgs|kilos?)$` -> kg; `(lb|lbs|pounds?)` -> lb; number followed by any other 1..6 letters (`30 lg`) -> kg assumed + `load_unit_unknown` (raw kept); range `a-b` (optional unit) -> `load: null`, `loadRange: { min, max, unit }` + `load_range`; anything else -> null + `load_text`. Excel-formatted dates in the Load column -> null + `load_invalid`.
- `parseWeekLabel(text)` -> `{ number, target }`.
- `parseAthleteComment(text)` -> `{ bodyLog: [{ weekday, bodyweightKg, calories, raw }], actualReps, actualLoad, actualRpe }`:
  - Bodyweight line: contains a number followed by `kg`/`KG` (`84.1 KG`) and/or a number followed by `calor` (`2000 Calories`); weekday = leading `Monday`..`Sunday` (case-insensitive, optional colon/space) else null. A bare weekday (`MONDAY`) is no entry.
  - `actualReps`: `(\d+)\s*reps?` (`8 reps`, `Felt good 1 rep`); `actualLoad`: `did\s+(\d+(?:\.\d+)?)` in kg (`did 140`); `actualRpe`: `rpe\s*(\d+(?:\.\d+)?)`.
  - A cell that is a plain integer 1..30 while the set's reps are a range is `actualReps` (ASSUMPTION, counted in `report.numericCommentsAsReps`); otherwise a numeric comment stays `athleteComment` text.
  - Bodyweight lines go to the week's `bodyLog` and are not kept as the set's `athleteComment`; performance notes are kept as text in `athleteComment` as well.
- `completed` = `actualRpe != null` (from the cell or from a comment) or `actualReps != null` or `actualLoad != null`.
- A set's `warnings` holds the codes raised while parsing that set; the report holds the details.

### Report
`programme.report` = `{ blocks, weeks, days, entries, sets, completedSets, placeholders, dateRepsConverted, assumedKgLoads, numericCommentsAsReps, warningsByType: { code: count }, warnings: [{ code, sheet, ref, raw }], unparsedCells: [{ sheet, ref, raw, reason }] }` where `ref` is A1 style (`cellRef`). `unparsedCells` lists every non-empty cell on a block sheet that no rule consumed (excluding the standard header labels and the `Athlete`/name cell block at the top), with a reason. No raw value longer than 200 chars (truncate with `…`).

### Programme
Exactly the shape in ARCHITECTURE.md plus `bodyLog` and `actualLoad`; `source` per set is `{ sheet, row, col }` with `row` 1-based and `col` 0-based of the Reps cell. `source.fileName` in the Programme comes from the `fileName` option; never include a full path (strip to the base name).

## API
```js
export async function importProgramme(bytes, { catalogue, fileName, now = () => new Date() }) // Programme
export function parseProgramme(workbook, { catalogue, fileName, now })                            // same, from an openWorkbook() result
export { parseReps, parseRpe, parseLoad, parseWeekLabel, parseAthleteComment, classifyLabel }
```
`catalogue` is the parsed `exercises.json`. `importedAt` is `now().toISOString()`.

## Out of Scope
UI, storage, merging into logged data, block dates, e1RM, PRs, muscle maths, writing xlsx files other than the in-memory test fixture builder.

## Worked examples the tests must assert
- Date cell for 4 Aug 2025 in Reps -> `repsMin 4, repsMax 8`, `repsRaw '4/8'`; for 8 Dec -> 8..12; 6 Oct -> 6..10. Build the serial in the fixture helper from `Date.UTC` arithmetic, not a literal.
- `parseReps` text `10-15` -> 10..15; `-` -> nulls, no warning; `How many reps?` -> nulls + `reps_text`.
- RPE: `7.5` ok; `11` -> 11 + `rpe_above_10`; `84.1` -> null + `rpe_out_of_range`; `6.5.` -> 6.5 + `rpe_text_cleaned`; `9 (140)` -> 9 + `rpe_text_cleaned`.
- Load: `140` -> 140 kg; `235 pounds` -> `{235, lb}`; `30 kg` -> 30 kg; `30 lg` -> 30 kg + `load_unit_unknown`; `132.5-135` -> range.
- Week label `Week 3 - 175/122.5/202.5 [500kg]` -> number 3, target squat 175, bench 122.5, deadlift 202.5, total 500.
- Athlete comment `Monday : 2000 Calories, 84.6 KG` -> bodyLog `[{ weekday 'Monday', bodyweightKg 84.6, calories 2000 }]`; `did 140` -> `actualLoad 140 kg`; `8 reps` -> `actualReps 8`; `MONDAY` -> nothing.
- A fixture with groups at columns 0, 7, 14, 22, 29 (irregular) parses 5 weeks; a fixture with 4 groups and 3 `Week` labels produces `week_label_missing` and numbers 1..4; a 3-day and a 4-day block; a week with loads but no Actual RPE has `completed: false` for all sets; labels `CHEST UP`, `030`, `SUPERSET`, `A1: Cable Tricep Pushdown`/`A2: Cable Bicep Curl` classify as cue/tempo/cue/superset exercises; `Paused on Chest` directly under `Competition Bench Press` is its own entry `paused_bench`.
- Idempotence: importing the same bytes twice gives deep-equal Programmes (ignoring `importedAt`).
- Corrupt input (random bytes, a zip with no workbook part) throws a clear Error; a workbook with a block sheet containing only garbage returns a Programme with warnings, not an exception.
- Opt-in smoke test: `test/import/real-workbook.smoke.test.js` runs only when env `LT_REAL_WORKBOOK` points to a file (otherwise `t.skip`). It asserts structure only (`dateRepsConverted > 0`, every block has `weeks.length >= 1`, no thrown error) and prints only counts, never cell text.

## Done When
- [ ] All unit and fixture tests above pass (Codex: run, report command and output).
- [ ] No test or fixture contains text copied from the athlete's real workbook (Claude verifies by reading the fixtures).
- [ ] `cd lifting-tracker && node --test` passes (Codex runs; Claude re-runs).
- [ ] Smoke test against the real workbook prints counts and no cell text (Claude runs with `LT_REAL_WORKBOOK`; real data stays out of the repo).
- [ ] Redaction rule and `unparsedCells` behaviour covered by tests (Codex).
- [ ] Diff review of rules vs this spec (Claude); Codex verifier attack run afterwards.

## Verify
```
cd lifting-tracker && node --test   # verified 2026-10-04 on the importer branch. (`node --test <directory>` fails MODULE_NOT_FOUND on Node 24.)
```

## Stop Conditions
Stop and report UNKNOWN / CHECKED / NEEDED instead of guessing if: a rule here conflicts with the committed `xlsx.js` behaviour in a way you cannot fix inside the allowlist; a requirement would need a dependency; or two fixes in a row fail the same test. Never read, copy or reference any real workbook other than through the opt-in smoke test's env variable.
