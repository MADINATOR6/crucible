# Task CRU-UP-3: synthetic judge fixtures with integrity checks and a behavioural run

Mode: Dispatch, role-swap (Codex planned, Claude implements). Owner: claude. Start HEAD: eecf02b. Worktree `.ccx-worktrees/claude-CRU-UP-3`, branch `claude/cru-up-3`.
Plan: Codex's FABLE-UP plan, increment 3 (capture `codex-d3ad15e5ebb84d54ad5704b5e0a45281`, `tasks/FABLE-UP-plan.md` in the base checkout). No second plan dispatch: that plan gives this increment's allowlist, cases and Done When.

## Goal and write allowlist

A small set of synthetic judging cases with known answers, a structural check on the file, and one recorded run showing how ordinary Claude and Codex models judge them with the old and the new HANDOFF.md.

Writes: `scripts/fixtures/judge-cases.json` (new), `scripts/test-ccx-ops.ps1`, `HANDOFF.md` (fixture-use text only), `tasks/CRU-UP-3.md`, `tasks/CRU-UP-3-results.md`, `MEMORY.md` (checkpoint only).

## Claude's critique of the plan (decisions)

- Accepted: the six cases the plan lists (late ownership, invented Verify command, weakened assertion, partial run as full pass, missing evidence, clean work).
- Added a seventh: a clean plan control. The plan's one control is a report; without a plan to accept, "send every plan back" would pass the plan cases.
- Made the report control deliberately tempting: its test's expected value changes, because the task itself changes the label. A judge that refutes every changed assertion fails it.
- Integrity check goes into the existing ops suite as one case (plan: no new runner). It reads the file with the suite's own `Read-Json`. It also checks two things the plan did not name: the inputs carry no verdict word, and every `mustMention` string occurs in the inputs, so scoring never asks for something a judge could not see.
- The check was tried on its own before the suite run: passes on the real file; fails on four mutated copies (control flag flipped, verdict word placed in the inputs, no plan control, a `mustMention` not in the inputs).
- Behavioural run: done before this worktree existed, from a draft of the fixture identical to the committed file, with `expected` stripped. Result recorded as observed: no verdict changed. Not re-run after the commit, since neither the cases nor HANDOFF.md's judging text changed since.
- Changed after Codex's verify run (capture `codex-def52bc507c643c59039681ee5705b04`, REFUTED on one claim): I had written the scoring rule as "disposition and `mustMention`" yet reported dispositions only, and HANDOFF.md said every model passes. By the combined rule the scores are 5, 7, 5 before and 6, 6, 6 after. Fix: HANDOFF.md now makes the disposition the pass mark and `mustMention` a literal second count that a person reads; the results file reports both counts with each miss explained. The fixture's expectations were not edited.
- Not done: harder cases that would separate models. Out of scope here; recorded in the results as the limit of this set.

## Out of scope

A fixture runner script, scoring automation, any change to the Judge checklist's own rules, model routing.

## Verify / Done When

- [x] `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx-ops.ps1` passes, including `judge fixtures are complete, synthetic and withhold their answers` (baseline 16/16, so 17/17).
- [x] Ordinary Claude and Codex judges flag every seeded defect and accept both controls. (results: all seven dispositions right for each of three judges, old and new instructions; the literal `mustMention` count is lower and reported beside it)
- [x] Each judge separates missing evidence (caveat) from a demonstrated defect (refutation). (results: all answered VERIFIED WITH CAVEATS on `report-missing-evidence` and REFUTED on the two defect reports)
- [x] Results record the observed difference, including where there is none. (`tasks/CRU-UP-3-results.md`: no verdict changed; only the ownership case's correction improved)
- [x] Nothing depends on a particular model being available: the fixture, the check and the prompt are plain files.
- [x] Codex `-Role verify` run, then `ccx verify -TaskId CRU-UP-3`, `ccx task review -By codex`, `ccx task done`.

Evidence (Claude, 2026-11-12, from this worktree): `scripts\test-ccx-ops.ps1` 17/17 passed (424 s), new case included. Standalone probe of the new case: passes on the real fixture, fails on four mutated copies. Codex verify round 1: REFUTED on the reporting claim only (fixed as above); integrity check, fixture provenance (hashes match the draft the judges saw) and scope PASS; suite BLOCKED in its sandbox. Round 2 after the fix: verdict and capture are in the `ccx task review` note for this task.

Untested: variance (one run per judge per version); judges that must run commands themselves; models above the routine tiers.

Stop conditions: a case's expected answer turns out to be arguable (fix the case and re-run every judge, never the expectation alone); the ops suite needs restructuring to host the check.
