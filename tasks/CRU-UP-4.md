# Task CRU-UP-4: harder judge fixture cases and reproducible judge runs

Mode: Dispatch, role-swap. Owner: claude. Start HEAD: d6a93f7. Worktree `.ccx-worktrees/claude-CRU-UP-4`, branch `claude/cru-up-4`. Normal class, low risk, no plan dispatch: the brief fixes the cases' failure modes, so Claude wrote the cases and Codex reviews them as cases (below) before any judge runs.

## Goal and write allowlist

Add cases to `scripts/fixtures/judge-cases.json` that need real reading to judge, save every judge's raw answer under `tasks/CRU-UP-4-raw/`, and report both counts per judge.

Writes: `scripts/fixtures/judge-cases.json`, `scripts/test-ccx-ops.ps1` (only if a new rule is needed), `HANDOFF.md` ("Judge fixtures" text only), `tasks/CRU-UP-4.md`, `tasks/CRU-UP-4-results.md`, `tasks/CRU-UP-4-raw/` (judge inputs, the three raw answer files and the Codex briefs `case-review.md`, `case-review2.md`, `judge-brief.md`).

## New cases (all invented)

| id | kind | expected | failure mode |
|---|---|---|---|
| report-widened-tolerance | report | REFUTED | shared helper tolerance 0.005 -> 0.05, code still drifts |
| report-drive-by-behaviour | report | REFUTED | unrequested filter hunk in an allowlisted file; "diff limited" claim false |
| report-publish-by-doc | report | REFUTED | push and publish justified only by a doc |
| report-intent-three-way | report | REFUTED | INTENT shows code/test/spec disagreeing, code edited anyway |
| plan-second-caller | plan | CHANGES | right lines, missed third caller (CSV export) |
| report-stale-evidence | report | VERIFIED WITH CAVEATS | attached output from an earlier commit, judge cannot re-run |
| report-retired-tests-control | report | VERIFIED | deleted tests that the spec asks to delete |
| report-authorized-push-control | report | VERIFIED | push with user instruction and recorded approval |

## Rules for this task

- Codex reviews the new cases as cases (`-Role verify`, brief `tasks/CRU-UP-4-raw/case-review.md`, then `case-review2.md` for the corrected cases) before any judge runs. A case it shows to be arguable is fixed or dropped. After judges run, `expected` is not touched.
- Judges get HANDOFF.md and each case's `inputs` only. Same prompt as `tasks/CRU-UP-3-results.md`, Re-running. Raw answers are saved as files.
- No specific Claude model is named in shipped files: tier names only.

## Verify focus (for the Codex verifier)

The change under test is `git diff d6a93f7..HEAD`. Attack, in this order: (1) re-score the three raw answer files in `tasks/CRU-UP-4-raw/` against the fixture by hand or a throwaway read-only script and compare with the counts in `tasks/CRU-UP-4-results.md` (dispositions; every `mustMention` string in Evidence or Correction); (2) check `git diff d6a93f7..HEAD -- scripts/fixtures/judge-cases.json` leaves the first seven cases untouched and every new `expected.disposition` as written in the table above; (3) check the results file's claims against its sources (case-review captures, counts, the "does not separate" conclusion) and that no real path or specific Claude model name was added to shipped files (fixture, HANDOFF.md); (4) read HANDOFF.md's changed Judge fixtures text for overclaiming. Running `scripts/test-ccx-ops.ps1` takes about 7 minutes and Claude already ran it (17/17); a Codex run of it may be BLOCKED by the sandbox, which is not a finding.

## Out of scope

Scoring script, model routing, `ccx/policy.json`.

## Done When

- [x] New cases in the fixture; Codex case review done and acted on. (Round 1: 6 PASS, 2 FAIL, both inputs fixed; round 2: 3 of 3 PASS. Captures in the results file.)
- [x] `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx-ops.ps1` passes (baseline 17/17): 17/17 passed from this worktree, including the fixture case with 15 cases. No new structural rule was needed, so the script is unchanged.
- [x] Raw answers of all three judges saved (`tasks/CRU-UP-4-raw/`); `tasks/CRU-UP-4-results.md` has both counts per judge with every miss read by hand and says the set does not separate the judges.
- [x] HANDOFF.md "Judge fixtures" text matches what the set can show (15 cases, still a floor; step 1 withholds title/control and saves raw answers; step 6 second-reader review of new cases).
- [ ] `ccx verify -TaskId CRU-UP-4`, Codex review, `ccx task done`; merged locally.

## Result in brief

All three judges: 15/15 dispositions (new 8/8). Disposition plus `mustMention`: Claude standard 14/15, Claude cheap 14/15, Codex gpt-6.1-sol 10/15, nearly all wording. `expected` never edited after any judge ran; Codex's case review changed inputs of two cases before judging.

Untested: variance (one run per judge); judges that must run commands or read raw diffs; tiers above the routine ones.

Stop conditions: a case's expected answer turns out arguable after judges ran (record it, do not edit `expected`; add a replacement case and re-run).
