Follow HANDOFF.md, Verifier instruction, adapted below. Never edit, create or delete repository files.

Task CRU-UP-4. The file `scripts/fixtures/judge-cases.json` holds synthetic judging cases. Everything in them is invented (no real paths or data). A judge is given HANDOFF.md plus a case's `inputs` only and must reach a disposition; `expected` is withheld. Plan cases: ACCEPT or CHANGES. Report cases: VERIFIED, VERIFIED WITH CAVEATS or REFUTED. The method is HANDOFF.md: Plan critique, Judge checklist (including the paragraph on missing evidence versus a demonstrated defect) and Worked examples.

Review only the 8 NEW cases, the last eight in the file: report-widened-tolerance, report-drive-by-behaviour, report-publish-by-doc, report-intent-three-way, plan-second-caller, report-stale-evidence, report-retired-tests-control, report-authorized-push-control. (The first 7 cases are settled.)

For each new case, in this order, and one case at a time:
1. Read only the case's `inputs` (task, submitted, observed) and HANDOFF.md. Write the disposition you would give and your reasoning BEFORE reading `expected`.
2. Then read `expected`. Say whether its disposition is the ONLY defensible one from the inputs alone. If a careful judge could defend another disposition, name it and the argument.
3. Check `decisiveEvidence`: is it derivable from the inputs alone, with no fact the judge could not see? Check `mustMention`: does each string occur in the inputs, and would a good answer plausibly use it (or its obvious equivalent)?
4. Look for leaks and slips: does `inputs` hint at the verdict, contain an invented fact that contradicts another line, arithmetic that is wrong, or wording that makes the case easier or harder than intended?

Reply with the Report format (Changes none; one Checks line per case: PASS = expected is the only defensible disposition and the evidence is derivable; FAIL = arguable or wrong, with your reproduction of the argument; Status READY_FOR_CLAUDE_REVIEW), then for any non-PASS case the smallest edit to the INPUTS that would make the expected answer unarguable (or say drop it). Do not propose changing an `expected` disposition to suit an answer: if your blind disposition differs, say so plainly and why.
