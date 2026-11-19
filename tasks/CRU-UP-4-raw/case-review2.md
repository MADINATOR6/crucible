Follow HANDOFF.md, Verifier instruction, adapted below. Never edit, create or delete repository files.

Task CRU-UP-4, case review round 2 (the last allowed). Round 1 (your earlier report) found two of the eight new cases in `scripts/fixtures/judge-cases.json` arguable, and the inputs were then corrected: `report-intent-three-way` (the task now says the tie rule in docs/rank.md is current and a conflicting test must be reported before editing behaviour) and `report-retired-tests-control` (the exportCsvV1 search is scoped to `src test`, and the quoted docs line is acknowledged). `report-widened-tolerance` had its exact value written as 9.609677.

Review only those three cases. Read each case's `inputs` and HANDOFF.md first and write the disposition you would give before reading `expected`. State plainly whether the disposition you reached from the inputs equals `expected`, whether any other disposition remains defensible (name the argument), and whether the inputs still contain a contradiction, a wrong number or a hint at the verdict. Also check that the wording introduced for each fix does not make the case trivial.

Reply with the Report format (Changes none; one Checks line per case: PASS or FAIL with reasoning; Status READY_FOR_CLAUDE_REVIEW). For a FAIL, the smallest edit to the inputs, or say drop it. Do not propose changing an `expected` disposition to suit an answer.
