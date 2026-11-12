# Task CRU-UP-1: better default planner, critique, implementer, verifier and report instructions

Mode: Dispatch, role-swap (Codex planned, Claude implements). Owner: claude. Start HEAD: 8cfae9b. Worktree `.ccx-worktrees/claude-CRU-UP-1`, branch `claude/cru-up-1`.
Plan: Codex's FABLE-UP plan, increment 1 (capture `codex-d3ad15e5ebb84d54ad5704b5e0a45281`, brief `tasks/FABLE-UP-plan.md` in the base checkout). No second plan dispatch: that plan already gives this increment's allowlist, approach and Done When, and a repeat would spend a Codex run on the same question.

## Goal and write allowlist

Make HANDOFF.md the one source for how plans are made, critiqued, implemented, verified and reported, so any Claude or Codex model applies the same scrutiny by default. Claude's wrappers link to it; they do not copy it.

Writes: `HANDOFF.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/agents/ccx-reviewer.md`, `.claude/agents/ccx-scout.md`, `.claude/skills/fable-judge/SKILL.md`, `tasks/CRU-UP-1.md`, `MEMORY.md` (checkpoint only).

## Claude's critique of the plan (decisions)

- Checked: `HANDOFF.md:9` omitted `-TaskId` on the plan dispatch; FRICTION.md 2026-11-02 (LT-UNITS-1) is that failure. The launcher starts a planned task on any role (`ccx-core.ps1:914-918`, shared start logic) and counts an attempt only for `implement` (`codex-dispatch.ps1:250-252`; test `research run does not consume implementation cap`, `test-codex-dispatch.ps1:753`). Confirmed live: FABLE-UP went active after its `-Role research -TaskId` run.
- Checked: with a worktree the launcher must run from it (`codex-dispatch.ps1:163-164`), so the sequence says where the brief lives.
- Checked: `ccx status` ticks the runtime when enabled (`ccx-ops.ps1:760-765`), so the Researcher text tells Codex not to run it. Dropped a mention of `ccx route` as a safe alternative: not verified read-only.
- Checked: the launcher finds the report's Status with a regex (`codex-dispatch.ps1:418`) and names only the instruction headings (`:296-297`), so adding an `Untested:` line and numbered items inside the instruction blocks breaks nothing. Headings are unchanged.
- Added beyond the plan: a paragraph in the Judge checklist separating missing evidence (caveat) from a demonstrated defect (refutation), because fixture cases 5 and 6 of CRU-UP-3 test exactly that.
- Not done, as the plan said: `.codex/config.toml` (no defect shown), user-level memory.

## Out of scope

Scripts, policy, lifting-tracker, new files other than this one, renaming the judge skill.

## Verify / Done When

- [x] The planning sequence starts the registered task before planning (HANDOFF steps 2-3; AGENTS.md Roles). (Claude inspection; Codex verify PASS)
- [x] Claude and Codex reach the same critique and judge text through their normal entry points: `CLAUDE.md`, `fable-judge`, `ccx-reviewer`, `ccx-scout` point at HANDOFF.md sections that exist. (Codex verify PASS: all referenced sections exist)
- [x] Planner, Implementer, Verifier and Researcher instructions keep their headings and boundaries. (Codex verify PASS by diff inspection; launcher prompt tests still pass)
- [x] Walkthrough: each of the three bad examples is rejected by a named Plan critique or Judge line, and each good version passes. Recorded below. (Claude; Codex verify PASS)
- [x] `scripts\test-external-tools.ps1` after the edits: 23 passed, 0 failed, including "Agent documentation symmetry". (Claude)
- [x] `scripts\test-codex-dispatch.ps1` with the edits in place: 51/51 passed in 436 s. Also `test-ccx.ps1` 34/34 and `test-ccx-ops.ps1` 16/16. (Claude)
- [x] Codex `-Role verify` run: VERIFIED WITH CAVEATS, no defects; both suites BLOCKED in its read-only sandbox (scratch-directory creation denied), so Claude ran them (capture `codex-5ddbcab1f9a341538919fa47cd432aa6`). Then `ccx verify -TaskId CRU-UP-1`, `ccx task review -By codex`, `ccx task done`. (Codex, then Claude)

Walkthrough:
- Late ownership discovery. Bad is rejected by sequence step 3 (no `-TaskId` on the plan dispatch) and Plan critique 4 (allowlist path owned by a live task). Good passes both.
- Invented Verify command. Bad is rejected by Planner item 5 (no source cited) and Plan critique 6 (command not found in AGENTS.md Commands). Good cites its source and marks lint NEEDED.
- Partial run reported as full. Bad is rejected by Judge checklist 3 and 4 (false completion: partial pass reported as full) and Verifier item 4. Good lists NOT RUN and BLOCKED separately and fills the Untested line.

Stop conditions: a test depends on HANDOFF.md text this change alters; another task takes ownership of a listed file; scope must grow.
