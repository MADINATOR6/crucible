# LT-START-1 — Start without a workbook; choose whether workbook history counts

Owner: Claude (implementer). Plan by Codex (dispatch of `tasks/LT-START-1-plan.md`, capture
`codex-d43dd8b7…`), critiqued below. Mode: Dispatch. tool: none. Risk: risky (programme data, core logic).

## Goal

1. An athlete with no coach's workbook enters a recent best set for squat, bench and deadlift, training days
   per week and whether they are back from a break; the app builds a first block as their own programme.
2. The existing Coach review and block builder work for that athlete from the sets they log.
3. A workbook athlete chooses at import whether the workbook's past weeks count in Progress and Coach, and
   can switch it later in Data. Nothing is deleted either way.

## Accepted from Codex's plan

- A small starter template (one day: squat, bench, deadlift, 3 × 5 at RPE 7, no accessories, no copied loads)
  fed to the existing `generateBlock`, which adds the light days. Probed for 1 to 6 days: every count keeps
  all three lifts; `focus: 'return'` starts week 1 at 88% after 12 weeks off and reaches 100% in week 4.
  Learning the template from the example programme was the alternative; probes showed it copies the example
  athlete's accessory weights and drops the squat day at 3 days.
- No synthetic sets, PRs, bodyweights or overview results. The Coach review says there is no history until
  sets are logged, which is true.
- A starting estimate fills a lift's e1RM only while logged training gives none, per lift, at low confidence.
- Example-programme references on existing logs are detached when the starter is saved, so a set logged
  against example block 1 cannot mark starter block 1 done (the `removeBlock` pattern, one transaction).
- The history choice governs every analysis reader, not just `app.events()`: programme-derived events, the
  merged programme behind the athlete model and both Coach review callers, Progress's planned-vs-actual RPE
  and per-block bests, Muscles' done view, and workbook bodyweight lines. Train, the plan itself and stored
  records are untouched. Progress's `All history / Logged only` stays a narrower filter.
- `BACKUP_VERSION` 4 → 5 (an older app would drop the choice and silently count excluded history again).
  No IndexedDB version bump. `sw.js` `VERSION` and `APP_VERSION` lt-v24 → lt-v25.
- The setup form replaces Coach's workbook-only gate; Train's banner and Data's import card point to it.

## Changed from Codex's plan, with reasons

1. **The history choice is a field on the programme (`workbookHistory`), not a setting.** It is a decision
   about this workbook, so it is written in the same `setProgramme` call as the import: atomic with no change
   to `src/store/db.js`'s transaction code, and the switch in Data goes through the programme write path that
   already invalidates caches and Coach drafts. A new workbook asks again, defaulting to the current choice.
2. **No new starter metadata.** The generated block already stores what was entered (`generated.e1rmStart`,
   `daysPerWeek`, `layoffWeeks`, `at`). A starter block is the generated block with `fromBlock: null`
   (blocks built from a programme always carry the block number they learned from).
3. **Start date and weekdays are a settings write after the programme write, not one transaction.** If the
   second write fails the programme is saved with unknown dates, which the app already handles and Data can
   fix. Not worth opening `replaceProgramme` for.
4. **Entry is a best recent set (weight × reps), not a 1RM.** A beginner rarely knows a max. `estimate1RM`
   turns it into the e1RM; reps 1 is a max for those who know it. A blank lift leaves its loads blank.
5. **Offered day counts are 2, 3 and 4.** 5 and 6 work but the added light days pile up deadlifts.
6. **Excluded history still leaves the workbook's planned loads to the template learner.** Planned loads are
   the coach's prescription, not past progress; only what the workbook says was done is taken out.
7. **One new browser flow** (setup, then reload), since first run without a workbook is now a flow that
   must not break. History toggling is covered in Node against the real `createApp`.
8. Twin left alone, reported: importing a workbook after logging on example data keeps those logs'
   example references (`app.setProgramme`). Detaching there would also detach legitimate references when
   the same workbook is re-imported; out of scope.

## Status

- 2026-11-11 Claude: implemented. Node 434 pass, 1 opt-in skip; browser 17 pass, 1 skip. Setup flow driven by
  hand at 375 px.
- 2026-11-11 Codex review 1 (`tasks/LT-START-1-review.md`, plain dispatch, capture `codex-80a3cf29…`): REFUTED
  on four points, all fixed with regression tests:
  1. P1 history leak: the Coach's template learner read the stored programme, so with history off it still
     used actual loads and comments. `learnTemplateFor` and `pickTemplateBlock` now read
     `app.analysisProgramme()`. TWINS: Muscles' default week read the stored programme too (fixed); Train and
     `nextSession` read it by design; block revision only touches generated blocks, which hold no workbook
     actuals.
  2. P2 a starting estimate came back once logged evidence aged out of the window. It is now retired for
     good once the lift has ever had qualifying evidence.
  3. P2 a failed settings write left the starter on an earlier programme's dates. **Critique point 3 was
     wrong and is withdrawn:** `replaceProgramme` takes a `settings` step and writes it in the same
     transaction, as Codex planned (`src/store/db.js`, both stores).
  4. P2 the Coach offered the setup for a programme whose blocks had no weeks, but saving refused it. Both
     now use the same test (no block with weeks).
  Node 439 tests, 438 pass, 1 opt-in skip. `src/store/db.js` and `test/ui/import-review.test.js` joined the
  allowlist.
- 2026-11-11 Codex review 2 (`tasks/LT-START-1-review2.md`, capture `codex-57d27e8d…`): VERIFIED WITH
  CAVEATS, no new findings, all four fixes pass. Its caveat was that the real IndexedDB transaction could not
  be run from its sandbox; the starter browser flow now includes a rollback probe against real IndexedDB
  (a throwing settings step leaves no programme), passing on the desktop, Android and iOS engines. Browser 17
  pass, 1 skip.
- Done When: all items met except "(Claude) normal ccx verification": the task was never registered, because
  `ccx verify` fails its scope stage on other tasks' uncommitted files (FRICTION.md, 2026-11-10) and the
  LT-QUALITY-1 ownership overlap refuses `-TaskId` dispatches. Committed locally on the user's earlier
  instruction for the same gate condition; not pushed, so not published.
- Not verified: a real workbook import in a browser (private data), any physical phone.

## Write allowlist (relative to `lifting-tracker/` unless noted)

`src/store/db.js` (added after review 1, for the atomic settings step).

`src/core/template.js`, `src/core/athlete.js`, `src/store/programme-schema.js`, `src/store/backup.js`,
`src/ui/state.js`, `src/ui/views/plan.js`, `src/ui/views/data.js`, `src/ui/views/train.js`,
`src/ui/views/progress.js`, `src/ui/views/muscles.js`, `src/ui/updates.js`, `sw.js`, `README.md`,
`GENERATOR.md`, `test/core/template.test.js`, `test/core/athlete.test.js`, `test/store/schema.test.js`,
`test/store/backup.test.js`, `test/ui/state.test.js`, `test/ui/plan-flow.test.js`,
`test/ui/import-review.test.js` (added during implementation, for the import checkbox), `e2e/smoke.spec.js`,
repo `tasks/LT-START-1*.md`.

## Out of scope

Another generator, an exercise picker, accessories in the starter, accounts, any network call, workbook
parser changes, calorie formulas, deleting history, publishing.

## Done When

- [ ] Setup on example data saves an owned programme (not example) that survives reload and a backup
      round-trip; 2, 3 and 4 days each contain squat, bench and deadlift.
- [ ] "Back from a break" starts week 1 lighter than the entered strength and reaches it by the last week.
- [ ] Setup creates no events, PRs or bodyweights; logs made on example data are kept and detached.
- [ ] A lift's starting estimate is used until that lift has logged evidence, then the logs win.
- [ ] With history off: no programme-derived events, no workbook bodyweight points, no workbook actuals in
      the merged programme; logged sets still count once. Turning it back on restores everything.
- [ ] Import asks; Cancel writes nothing; the Data switch changes only the choice.
- [ ] Backup 5 round-trips the choice; formats 1 to 4 restore with history on.
- [ ] `sw.js` and `APP_VERSION` both lt-v25. `node --test` and `npx.cmd playwright test` green.
- [ ] Each new behaviour has a test that fails when reverted.
- [ ] (Codex) verifier run attacks data preservation, history leaks, restore.

## Verify (from `lifting-tracker/`)

```
node --test
npx.cmd playwright test
```

## Stop conditions

Stop and ask if excluded workbook evidence still reaches Coach by a path not listed above, if a starter can
inherit example completions, if restore safety must be weakened to pass a check, or if a second repair of
the same failure does not pass.
