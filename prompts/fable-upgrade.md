# Crucible upgrade for the time-limited strong-model session

> **Launch** (fresh session in `C:\Users\Madison\code\claude-codex-collab`, strongest available model, effort high):
> `Execute prompts/fable-upgrade.md. If a "Fable-up run" section exists in .ccx-worktrees/*/MEMORY.md or repo MEMORY.md, resume from it.`

**Executed 2026-11-12.** All three increments shipped: CRU-UP-1 `c2049aa`, CRU-UP-2 `eecf02b`, CRU-UP-3 `e73d82d`. Evidence is in `tasks/CRU-UP-1.md`, `tasks/CRU-UP-2.md`, `tasks/CRU-UP-3.md` and `tasks/CRU-UP-3-results.md`; the run's state is the "CRU-UP run" section of `MEMORY.md` (not "Fable-up run" as the launch line below says). Kept as the record of what was asked; do not re-run it.

Planned by Codex (capture `codex-d3ad15e5ebb84d54ad5704b5e0a45281`), critiqued by Claude, brief at `tasks/FABLE-UP-plan.md`. The evidence below was checked against HEAD `8cfae9b`; re-check any `path:line` before relying on it, the files may have moved.

## 0. Mission

You are the strongest model this repo will get for a short, unknown time. Do not spend it being clever at run time. Spend it writing things that make the **repo, Claude (any model) and Codex (any model)** better afterwards, then prove they work without you.

Three increments, in this order, each shipped and verified before the next starts. The session can end at any moment, so each one must leave the repo usable.

| # | Increment | Repo gains | Claude gains | Codex gains |
|---|---|---|---|---|
| 1 | Better default instructions | one canonical rubric in `HANDOFF.md` with worked examples | critique and judge steps via its normal entry points (`CLAUDE.md`, `.claude/agents/ccx-*.md`, `fable-judge`) | sharper Planner / Implementer / Verifier / Researcher text and a report that names untested criteria |
| 2 | BUSY dispatch no longer burns an attempt | tested launcher fix | no lost approved runs | no lost approved runs |
| 3 | Judge fixtures | six synthetic cases plus integrity checks | measured, before/after | measured, before/after |

Never write the strong model's name or version into a shipped file other than this prompt. `ccx/policy.json` does not change in this run (model-id refresh is a separate user decision).

## 1. Rules

- `AGENTS.md` is binding. Symmetry rule: `AGENTS.md` and `CLAUDE.md` change together, same commit. Windows PowerShell 5.1, ASCII-only `.ps1`, edit text with the file tools (no `Get-Content`/`Set-Content` round-trips), `codex.cmd`/`npm.cmd`/`npx.cmd`. Commit messages carry no trailers. Add to AGENTS.md Commands only commands that have run successfully.
- **Isolation.** The main checkout has ~37 uncommitted or untracked paths that are the user's (finance-shorts, tools/crucible-cockpit, roblox-videos, video_ops, wallpaper, playbook, several tasks/ and prompts/ files). Never touch, stage, stash or delete them. Work per increment in its own worktree: `ccx worktree add -TaskId <id>`; branch `claude/<id>`. The worktree only holds committed files, so copy in nothing that is not already committed except this prompt and the task's own brief. ccx state is shared across worktrees (`ccx-core.ps1:63`): a worktree isolates files, not ownership.
- **Permissions.** Local branch, worktree and commit are L3 (log them). Merging a finished task branch into the base branch locally is L3 after `ccx merge-check -Branch <b>` is clean. **No push, PR, publish, force, history rewrite, `--no-verify`.** `ccx gate -Action <a>` before anything L4/L5; default is no. A push under `lifting-tracker/` republishes the live app, so touch nothing there. There is already a pending push approval (A-0085) that is not yours; leave it.
- **Privacy.** `ccx/policy.json` `privacy.excludePaths` and `*.xlsx` are never read. Synthetic fixtures only.
- **Scope.** Each task edits only its allowlist. No new dependency, provider install, paid generation, global settings, `~/.claude` or `~/.codex` change, unrelated cleanup or bulk staging. User-level Claude memory is yours to write only for lessons, via the normal memory mechanism, and never as a task deliverable.
- **Roles (AGENTS.md).** For each increment: Claude plans via Codex (`codex-dispatch.ps1 -Role research -TaskId <id> -TaskFile tasks/<id>-plan.md`, first line "Follow HANDOFF.md, Planner instruction..."), critique the plan against the code (max two rounds), you implement, `-Role verify` Codex run, `ccx verify -TaskId`, `ccx task review -By codex`, `ccx task done`, commit. Increment 2 is risky: the Codex verifier run must try to break it. Codex is a partner: no arguing, record disagreements in the task file and decide on evidence. If Codex is at its usage limit (exit 4) or its sandbox cannot start processes, say so, plan it yourself, and continue.
- **Caps.** Two review cycles and two challenge rounds per task. A failed verification gets one focused repair, then stop that increment and report; never weaken a test or gate.
- **Stop an increment** on: ownership conflict you cannot resolve without editing ccx state or abandoning someone else's task (report it, do not hand-edit state), scope growth, a missing permission, an exhausted cap. Then move to the next increment only if it does not depend on this one.

## 2. Preflight (once)

1. `git status --short` and `git log -5 --oneline`; record the dirty paths so you can prove you left them alone at the end.
2. `ccx status -Brief`. Register the three tasks (`ccx task add -Id CRU-UP-1 ... -Owner claude`; types: docs for 1 and 3 test fixtures, implement for 2; classes: 1 normal/low, 2 complex/high, 3 normal/low) with exact `-Owns` from section 3. If registration or the first dispatch is refused for an ownership conflict (open claims on workflow files exist, e.g. FRICTION.md rows for LT-QUALITY-1), stop that task and report which task owns the path.
3. Baseline: run once and record counts: `scripts/test-ccx.ps1`, `scripts/test-ccx-ops.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/test-external-tools.ps1`. Run suites sequentially.
4. Append a "Fable-up run" section to the end of repo `MEMORY.md` (inside the task worktree): queue, decisions, checkpoints, accurate last task commit. Update at every task boundary and every 30 minutes. A fresh session resumes from this section, `ccx task show -Id <id>` and the actual git state, continuing at the first incomplete acceptance item.

## 3. Increments

### CRU-UP-1: better default instructions (do first)

Evidence, from `FRICTION.md` and the code:
- Ownership conflicts surface after implementation: the documented planner sequence starts the task only at the verify step (`HANDOFF.md:9` omits `-TaskId` on the research dispatch; FRICTION 2026-11-02 row 1). The launcher already starts planned tasks on every role (CCX-10; `test-codex-dispatch.ps1:753`), so the fix is sequencing text, not code.
- Unrelated dirty files break `ccx verify` scope and `task done` (FRICTION 2026-11-10, 2026-11-06).
- Provider/environment failures and real defects get mixed up in reports (FRICTION 2026-10-30, 2026-11-05 rows).

Allowlist: `HANDOFF.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/agents/ccx-reviewer.md`, `.claude/agents/ccx-scout.md`, `.claude/skills/fable-judge/SKILL.md`, `tasks/CRU-UP-1.md`, `MEMORY.md` (checkpoint only).

Make `HANDOFF.md` the canonical source and have the Claude wrappers link to it, not copy it:
- **Planner:** register and start the task before planning (pass `-TaskId`), record baseline and ownership, give runnable existing Verify commands only, state exclusions.
- **Claude critique:** test the plan against current code, callers, failure paths and checkable acceptance before implementing.
- **Implementer:** separate a failed check from a blocked environment; inspect existing artifacts before retrying an interrupted run.
- **Verifier:** tie every verdict to observed behaviour; separate partial verification, genuine defects and environmental blocks.
- **Researcher:** mark historical versus current evidence; avoid state-writing commands (`ccx status` ticks state, `ccx-ops.ps1:760`) when strictly read-only.
- **Report:** add which acceptance items are untested and their next owner, inside the existing report format.
- Three compact good/bad examples: late ownership discovery, an invented Verify command, a partial run reported as full success.

Do not touch `.codex/config.toml` (no defect shown).

Done When (each checkable): the planner sequence starts the task before planning; Claude and Codex both reach the same critique and judge text through their normal entry points; all four Codex role instructions keep their boundaries; a walkthrough of the three bad examples rejects each and accepts the corrected version; `scripts/test-external-tools.ps1` (it covers AGENTS.md/CLAUDE.md) and `ccx verify -TaskId CRU-UP-1` pass. Codex verifier required.

### CRU-UP-2: BUSY must not consume an attempt (risky)

Evidence: FRICTION 2026-10-30 row 2: exit 6 BUSY was recorded as dispatch 1, so an approved run never happened. `codex-dispatch.ps1:250-252` increments `dispatches` and checks ownership inside `Invoke-CcxLocked`, while the writer lock is only taken later at `:267`, and required approvals are consumed just before (`:241-245`).

Allowlist: `scripts/codex-dispatch.ps1`, `scripts/test-codex-dispatch.ps1`, `ccx/ARCHITECTURE.md`, `FRICTION.md` (mark the row Fixed), `tasks/CRU-UP-2.md`, `MEMORY.md` (checkpoint only).

Choose the smallest of: take the writer lock before consuming approvals/recording the attempt, or roll the count back on exit 6. Whichever you choose, write why. Keep: atomic open-for-write lock, stale-lock recovery, release on every exit path, read-only role behaviour (no lock, no attempt), exit codes unchanged. Extend the existing lock tests (`test-codex-dispatch.ps1:372`) with registered-task assertions; do not add a new runner. Synthetic state only; never run a real provider in the tests.

Done When: held lock returns exit 6 without launching the provider; BUSY consumes neither an attempt nor an approval; a later successful dispatch counts exactly once; a stale lock recovers; failure paths release the lock; research and verify still consume no implementation attempts; existing approval and ownership refusals still pass; full `test-codex-dispatch.ps1`, `test-ccx.ps1`, `test-ccx-ops.ps1` pass. Independent Codex verifier required; give it the task of breaking the ordering.

### CRU-UP-3: judge fixtures, then prove it without the strong model

Allowlist: `scripts/fixtures/judge-cases.json` (new, synthetic), `scripts/test-ccx-ops.ps1`, `HANDOFF.md` (fixture-use text only), `tasks/CRU-UP-3.md`, `tasks/CRU-UP-3-results.md`, `MEMORY.md` (checkpoint only).

Six small cases from observed failures, each with inputs, expected disposition, decisive evidence and smallest valid correction: (1) ownership conflict found too late, (2) invented Verify command, (3) weakened assertion contradicting the task, (4) false full-pass after partial verification, (5) missing evidence that needs a caveated verdict, (6) correct work that must be accepted. Include the positive control so blanket rejection cannot pass.

Fixture integrity checks go in the existing ops suite; they prove structure and coverage, **not** judgment. For behaviour: run ordinary Claude and Codex judging sessions on identical inputs, expected answers withheld, before and after the CRU-UP-1 change. Record model, instructions supplied, verdict, missed findings, false positives and corrections in `tasks/CRU-UP-3-results.md`. Report "no improvement" if that is what happens. Never loosen an expected outcome after a failed evaluation. If time is short, ship the fixtures and integrity checks and record the behavioural run as NOT RUN.

Done When: integrity checks pass; both agents flag every seeded serious defect and accept the control; both separate missing evidence from a demonstrated defect; results recorded with observed differences; nothing depends on the strong model being available.

## 4. Not in scope (decided)

Higgsfield playbook rewrite (an extensive one exists), LT-NEXT and video-pipeline plans (separate product/media tasks; the video brief carries superseded instructions), hooks/MCP/CI/observability from the 2026-10-07 brief, a "weakened-test detector" script (heuristic; semantic correctness needs review), model-id refresh in policy (user decision), narrowing LT-QUALITY-1's ownership (user decision), provider-error-not-an-attempt and baseline-at-task-add (FRICTION count 1, log only). Record anything new in `FRICTION.md` with its count; fix only at count 3 or after a costly failure.

## 5. Finish

Final report (also write `HANDOFF-REPORT.md` state): accepted commits per increment, commands and results versus baseline, fixture verdicts, what changed for each of the repo, Claude and Codex, anything NOT RUN, proof the user's dirty paths were untouched (compare against the preflight list), and the decisions left for the user (local merge to main, push approval, model-id refresh). Claude adds lessons to its own memory only after the report is written.
