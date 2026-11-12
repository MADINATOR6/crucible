# CRU-UP-3 results: judging run on the fixture cases

Date: 2026-11-12. Fixture: `scripts/fixtures/judge-cases.json` (7 synthetic cases: 3 plans, 4 reports; one clean control of each kind).

## What was run

Each judge got two things only: a copy of HANDOFF.md and the cases with `expected` removed (task, submitted plan or report, observed facts). It answered, per case, a disposition, one sentence of decisive evidence and the smallest correction.

- "Before": HANDOFF.md at commit 8cfae9b (no Plan critique section, no worked examples, no caveat-versus-refutation paragraph).
- "After": HANDOFF.md at commit c2049aa (CRU-UP-1).
- Claude judges: subagents on the standard and the cheap Claude tier (`sonnet`, `haiku` aliases), read-only, told to read only the two files.
- Codex judges: `codex-dispatch.ps1 -Role research -Model gpt-6.1-sol -Effort medium`, read-only sandbox. "Before" ran from the base checkout while it was still at 8cfae9b, "after" from the CRU-UP-1 worktree, so each read its own checkout's HANDOFF.md. Captures: `codex-93036c20a93d450eba042ab77fde11a9` (before), `codex-9b6bc89e09244c39821a9da32acefbcb` (after).

Scoring, two counts kept apart (HANDOFF.md, Judge fixtures): the disposition equals `expected.disposition` (pass or fail); and, separately, every `mustMention` string occurs literally in the evidence or correction.

Correction after Codex's review of this task (capture `codex-def52bc507c643c59039681ee5705b04`): the first draft of this file gave the scoring rule as "disposition and `mustMention`" but reported dispositions only, and HANDOFF.md said every model passes. By that combined rule no judge scores 7/7 except one. Both counts are now reported and HANDOFF.md says what each means. The fixture was not changed.

## Dispositions (correct / 7)

| Judge | Before | After |
|---|---|---|
| Claude standard tier | 7 | 7 |
| Claude cheap tier | 7 | 7 |
| Codex gpt-6.1-sol medium | 7 | 7 |

No judge refuted the two clean controls, and none marked the missing-evidence case as a defect, with either version of the instructions.

## Disposition right and every `mustMention` string present (cases / 7)

| Judge | Before | After | Misses |
|---|---|---|---|
| Claude standard tier | 5 | 6 | before: `-TaskId` (ownership case), `spec` (weakened assertion); after: `spec` |
| Claude cheap tier | 7 | 6 | after: `spec` |
| Codex gpt-6.1-sol medium | 5 | 6 | before: `-TaskId`, and `2 fail` + `state.test.js` (partial run); after: `2 fail` + `state.test.js` |

Read by hand, most misses are wording, which is why this count is not the pass mark:
- `spec`: every answer that misses it cites `docs/rounding.md:8`, which is the spec line.
- `2 fail`, `state.test.js`: the Codex answers say "two state-test failures"; the evidence is the same.
- `-TaskId` before: a real miss for the Claude standard tier and for Codex (they fix the overlap, not the sequence). The Claude cheap tier's "before" answer contains the string only in "dispatching the verifier with -TaskId T1", so its hit is hollow: it did not name the fix either.

So the literal count moved 5, 7, 5 to 6, 6, 6, and the only change that reflects judgment is the `-TaskId` one described below.

## What differed

Only the ownership case (`plan-late-ownership`), and only in the correction, not the verdict:

| Judge | Before: names "pass -TaskId on the plan dispatch" | After |
|---|---|---|
| Claude standard tier | no (said: clear the overlap; also asked for missing plan sections) | yes |
| Claude cheap tier | no (said: release T-OLD's ownership, then dispatch the verifier) | yes |
| Codex gpt-6.1-sol | partly ("bind the plan dispatch to T1") | yes |

So with the old text the Claude judges fixed the symptom (the overlap) and would have left the sequence that causes it; with the new text all three name the cause.

## Reading of the result

- The instruction change did not change any verdict on these cases. Every judge already got all seven dispositions right. That is the honest result: these cases do not show the new instructions making a weaker model judge better at the accept/reject level.
- They do show one concrete gain: the sequencing fix is now named by every judge.
- The cases are therefore a floor, not a ceiling: a regression check that a model, a prompt edit or a new agent definition has not lost the basics (no blanket rejection, no false refutation on missing evidence, weakened assertions caught). Harder cases would be needed to separate models; none were added here, and `expected` was not touched after the runs.
- One run per judge per version: no variance estimate.

## Claude judges' answers (the Codex answers are in the two captures)

Dispositions, same for all four Claude runs: plan-late-ownership CHANGES; plan-invented-verify CHANGES; plan-clean-control ACCEPT; report-weakened-assertion REFUTED; report-partial-as-full REFUTED; report-missing-evidence VERIFIED WITH CAVEATS; report-clean-control VERIFIED.

Corrections given for plan-late-ownership:
- Standard tier, before: "clear the overlap by finishing, releasing or re-scoping T-OLD (or narrowing its owns). Register T1 with -Owner claude and the exact allowlist, add the missing Out of scope, Stop conditions and Risks sections, and add a stop condition for ownership conflicts."
- Standard tier, after: "Add -TaskId T1 to the plan dispatch so the conflict appears before any work, then narrow the allowlist or ask the user about T-OLD."
- Cheap tier, before: "Release or narrow T-OLD's app/test/ ownership (or confirm it is abandoned), confirm T1 owns app/test/core/rounding.test.js, then dispatch the verifier."
- Cheap tier, after: "Register T1 with ccx task add, rerun the plan dispatch with -TaskId T1, and narrow or clear the allowlist against T-OLD before implementing."

The full Claude answers were returned in the session that ran them and are not stored as files; only the lines above are quoted. A re-run reproduces them in under a minute per judge.

## Not covered

- Judges worked from written "observed" facts; none ran a command or read a diff. Whether a model actually re-runs checks is not tested by this fixture.
- No Codex run above the routine model, no Claude lead-tier run (the lead tier wrote the cases).

## Re-running

Give the judge HANDOFF.md and each case's `inputs` only. Prompt used:

```text
Judge the synthetic cases in <cases file>. Never edit, create or delete files.
Read HANDOFF.md: the Planner instruction, the Plan critique section, the Judge checklist and the Report format. Use those as your only method. Do not read other files or search for expected answers.
For each case reply with exactly four lines:
Case: <id>
Disposition: <plan cases: ACCEPT or CHANGES; report cases: VERIFIED, VERIFIED WITH CAVEATS or REFUTED>
Evidence: <one sentence naming the decisive evidence>
Correction: <smallest valid correction, or none>
```
