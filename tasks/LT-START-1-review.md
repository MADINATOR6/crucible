# LT-START-1 verify: the implementation of your plan (risky change: try to break it)

Role: verifier. Read-only. Do not edit, stage or commit anything. Working tree on HEAD 1f8e80d.
Scope is `git diff -- lifting-tracker`. Task file with my critique of your plan: `tasks/LT-START-1.md`.
Read "Changed from Codex's plan" first: eight deliberate differences, each with its reason.

## What I built

- `src/core/template.js` `starterTemplate()`: your one-day S/B/D template. `src/ui/views/plan.js`
  `starterBlock()` runs it through `generateBlock` (4 weeks, block 1, conservative strength or `return`);
  `starterInputs()` reads the form (a best set per lift, weight × reps, in the athlete's unit; blank = unsure);
  `starterView()` replaces the workbook-only gate, and also shows when an own programme has no blocks.
- `src/ui/state.js` `app.startProgramme(block)`: only from the example or an empty programme, only a block
  with `generated.fromBlock == null`; one `replaceProgramme` transaction saves the programme and detaches
  every session/set reference to the old (example) programme; then a settings write for the start Monday and
  weekday spread.
- `src/core/athlete.js` `starting`: the starter block's `generated.e1rmStart` stands in per lift until that
  lift has logged evidence. No events are created.
- History choice: `programme.workbookHistory` (sanitised to `!== false`). `app.analysisProgramme()` strips
  completions, actuals, comments and `bodyLog` when it is off; `programmeForEvents`, `programmeMerged`,
  `bodyweightPoints`, Progress's `rpeDeltas` and per-block bests, and Muscles' done view read it. Train and
  `nextSession` read the stored programme. `app.setWorkbookHistory(on)` writes through `updateMeta`.
  Import review has the checkbox (`#keep-history`), Data has the switch (`#workbook-history`).
- `BACKUP_VERSION` 5; `sw.js` and `APP_VERSION` lt-v25. README and GENERATOR.md updated.

INTENT: `test/store/backup.test.js`'s format test now expects 5 (1 to 5 accepted, 6 refused), and
`e2e/smoke.spec.js`'s Coach marker is `#starter` instead of the removed "Import your workbook first" card.
No other existing assertion changed.

## Evidence

`node --test`: 435 tests, 434 pass, 1 opt-in skip. `npx.cmd playwright test`: 17 passed, 1 skipped,
including a new setup-then-reload flow on desktop, Android and iOS engines. Driven by hand in a browser at
375 px: missing weight shows the error and focuses the field; 80 kg × 5 after 8 weeks off produced a first
squat set of 65 kg × 5 at RPE 6 on "Starter block"; Coach then shows the builder with "no training history
yet". Not done: mutation checks on the new tests; a real workbook import in a browser (private data).

## Attack these

1. History leaks. With `workbookHistory: false`, find any path where what the workbook says was done still
   reaches Progress, Coach, Muscles, Meet, the weekly summary, the athlete model or the calorie/bodyweight
   code. I did not change `src/ui/views/plan.js` `learnTemplateFor`/`pickTemplateBlock`, which read
   `app.programme` directly: is anything they take from it past progress rather than plan?
2. `startProgramme`: can it replace a coach's programme, inherit example completions, lose logged sets, or
   leave storage and memory disagreeing after a failed or stale write? Is detaching every `programmeRef`
   correct when the athlete had a workbook, switched to example data, then built a starter?
3. The non-atomic settings write after the programme write (critique point 3): any state it can leave that
   the app does not already handle?
4. `starting` fallback: can a typed estimate outlive real evidence, or reach a workbook athlete's later
   generated blocks (their `fromBlock` is a number)?
5. `workbookHistory` on the programme instead of settings (critique point 1): restore, cross-tab reload,
   re-import default, `useExample` and back.
6. Backup 4 → 5 boundary and `sanitizeProgramme` of the new field.
7. Anything the 435 + 17 tests would pass through, including weakened or tautological new tests.

Report: findings by severity with file:line, a verdict per question. No code edits.
