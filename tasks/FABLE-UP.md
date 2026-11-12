# Task FABLE-UP: plan and write the strong-model upgrade prompt

Mode: Dispatch, role-swap (Codex planned, Claude implemented). Owner: claude. Start HEAD: 8cfae9b.
Plan brief: `tasks/FABLE-UP-plan.md`. Codex plan: READY_FOR_CLAUDE_REVIEW, capture `codex-d3ad15e5ebb84d54ad5704b5e0a45281`.

## Goal and write allowlist

Produce `prompts/fable-upgrade.md`: a session prompt that makes the repo, Claude and Codex better in ways that survive without the strong model.

Writes: `prompts/fable-upgrade.md`, `tasks/FABLE-UP.md`, `tasks/FABLE-UP-plan.md`.

## Claude's critique of the plan (decisions)

- Accepted: three increments in order (instructions, BUSY fix, fixtures), each a task, Codex verifier on all, risk-high on the launcher change.
- Checked against the code: BUSY bug is real (`codex-dispatch.ps1:252` counts the attempt, writer lock only at `:267`); the late-ownership friction row exists (`FRICTION.md:29`); `HANDOFF.md:9` omits `-TaskId`.
- Added: explicit "what each of repo / Claude / Codex gains" table, because the user asked that agents benefit too; the choice of lock-first versus rollback is left to the session with a requirement to record why; a stop rule for ownership conflicts instead of hand-editing ccx state; behavioural fixture run may be NOT RUN if time is short.
- Dropped as Codex proposed: Higgsfield playbook, LT-NEXT and video-pipeline plans, heuristic weakened-test detector, model-id refresh (user decision).

## Out of scope

Running the prompt. Any change to policy, lifting-tracker or the user's uncommitted work.

## Verify / Done When

- [x] Prompt file exists and every `path:line` it cites was checked against HEAD 8cfae9b (BUSY lines, FRICTION rows, HANDOFF line 9). (Claude)
- [x] Codex plan critiqued; decisions recorded above. (Claude)
- [x] The prompt was then run in the same session at the user's word: CRU-UP-1 `c2049aa`, CRU-UP-2 `eecf02b`, CRU-UP-3 `e73d82d`, pushed to origin/main under approval A-0106. Departures from the prompt as written: CRU-UP-1 and CRU-UP-3 reused this task's Codex plan instead of a second plan dispatch each; the run's MEMORY.md section is named "CRU-UP run"; HANDOFF-REPORT.md was not written (attended session, state is in MEMORY.md). (Claude)
- Closing steps (`ccx verify -TaskId FABLE-UP`, Codex review, `ccx task done`) are recorded in ccx state (`ccx task show -Id FABLE-UP`), not in this file. Committed at the user's request of 2026-11-12.
