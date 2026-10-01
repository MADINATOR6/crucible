# Report for Madison: ccx upgrade (30 Sep - 1 Oct 2026)

Branch `claude/architecture-audit-migration-649829`, based on `c2f515b`. Update 1 Oct 2026: the upgrade is already in `origin/main` (checked against the remote). This branch is no longer on the remote; how it reached `main` is UNKNOWN.

## 1. Status

**Complete.** It is built, tested, independently verified and committed.
- **Tasks:** all 7 ccx tasks are done through ccx's own gate.
- **Codex's findings:** every finding from Codex's verification is fixed and confirmed by Codex (CCX-4b, 4c and 4d).
- **CCX-7:** the last one-line fix was finished by Claude on your instruction, while Codex was at its limit. Your quoted chat approval (A-0001) is recorded in place of its cross-model review.
- **Waiting on you:** nothing for this upgrade. It is already merged and pushed.

## 2. What changed

The template now has a control plane called **ccx**. It is a set of PowerShell scripts plus one policy file, with no services, databases or new dependencies. It is optional: the old way of dispatching Codex still works exactly as before.

| Master prompt layer | What exists now |
|---|---|
| Master Computer | `ccx status`: tasks, approvals, notifications, worktrees, routing history and agent availability. `-Brief` gives 5 lines. |
| OMNIROUTE | `ccx route` plus `ccx/policy.json`. Deterministic rules, no model involved. It is **not** the third-party OmniRoute gateway, which stays rejected. |
| Orchestrator | Claude, recording each task with `ccx task` (owner, files owned, class, risk, budget). |
| Kairos-style runtime | A durable event queue and `ccx tick`: deduplicated, leased, retried with backoff, dead-lettered. No background process. |
| Workers | Codex through `scripts\codex-dispatch.ps1 -TaskId`, Claude, and two scoped Claude subagents. |
| Worktrees | `ccx worktree add / list / prune` and `ccx merge-check`. |
| Verification | `ccx verify`, launcher post-checks, reviews, and a gated `task done`. |
| Approval gate | `ccx gate / approve / deny`, with permission levels L0 to L5. |

## 3. Claude and Codex collaboration

1. Claude registers the task: `ccx task add` with type, class, risk, owner, owned files and spec file.
2. OMNIROUTE picks the route, model, effort, budget and required checks.
3. `ccx worktree add` gives the task its own worktree, after checking nobody else owns those files.
4. `codex-dispatch.ps1 -TaskId <id>` runs Codex with the routed model and effort. Afterwards it records tokens, status and post-checks automatically.
5. `ccx verify` runs the full pipeline.
6. The *other* model reviews: `task review`. The author cannot review their own work.
7. `task done` refuses anything unverified or unreviewed.
8. `merge-check`, then merge (logged). Pushing needs your approval.

Review loops are capped at 2.

What actually happened in this upgrade:
- Codex wrote most of the code, then hit its usage limit four times.
- With your agreement, Claude finished Codex's partial work.
- Codex then verified everything independently (CCX-4).

## 4. OMNIROUTE

**Routing order, cheapest reliable first:** a plain tool (no AI), an existing result, a script, a cheap model (Haiku scout or Codex at low effort), a worker, a premium model, the Mythos tier. Two special routes: `defer` (Codex is at its limit) and `surface` (stop and ask you).

**Models:**
- Codex dispatches use GPT-6 Astra. GPT-5.3-Codex is not in your Codex model list.
- Claude uses Opus 5.5.
- Claude's cheap subagent uses Haiku 4.5.

**Effort by class:** routine low, normal medium, complex high, critical and exceptional xhigh. A failure or ambiguity raises it one step within the class cap; max needs two failed attempts.

**Seen working live:**
- The CCX-5a trial was routed to Astra **low** and used about 56k effective tokens.
- The CCX-4 verifier was routed to Astra **high**.
- After Codex hit its limit, routing switched to `defer` by itself.

**Adaptive routing** learns from telemetry, within fixed bounds. Quota exits never count as model failures.

## 5. Persistent runtime and memory

**Runtime:**
- Events come from dispatches, verification and approvals.
- `ccx status` runs one tick first, so you always see current notifications.
- Handlers are capped at permission level L2 and never launch Codex on their own.
- `ccx runtime off` pauses it.

**Memory:**
- MEMORY.md was consolidated; the old checkpoints are in MEMORY-ARCHIVE.md.
- `ccx memory lint` checks for secrets, size caps, duplicate lines and checkpoint overflow. It also runs as a verification stage.

## 6. Verification (all actually run)

**Test suites (the suites grew during the work):**

| Suite | Tests | Result |
|---|---|---|
| test-ccx | 29 | pass |
| test-ccx-ops | 15 | pass |
| test-codex-dispatch | 46 | pass; it had 23 at baseline |
| test-sync-mirror | 21, plus 1 skip | pass |

**Real checks:**
- `ccx verify` passes on every task.
- `ccx health` exits 0. Its only warning is Codex being at its limit.

**Rollback rehearsal:**
1. Merged the upgrade into a copy of `main`.
2. Reverted it with `git revert -m 1`.
3. The tree was identical to `c2f515b`, and the old suites passed there: 23/23 and 21/21 plus 1 skip.

**Independent verification by Codex (CCX-4):** it attacked 8 areas and found 5 real defects that no test had caught. All five are fixed, each with a new regression test.

| Defect | Found by | Fixed |
|---|---|---|
| A private-key body leaking past redaction | CCX-4 | yes |
| Committed broken code passing verification | CCX-4 | yes |
| A "laundering" hole in task baselines | CCX-4, plus two more paths found by CCX-4b | yes |
| A rename slipping past merge-check | CCX-4 | yes |
| An explicit effort bypassing the retry cap | CCX-4 | yes |
| worktree add starting from the wrong commit | the end-to-end trial | yes |
| A status parse miss | CCX-4's own report | yes |
| A health false warning | the real health run | yes |

Codex's re-checks:
- CCX-4b: F2 and F4 passed.
- CCX-4c: F1, F5 and every current F3 path passed.
- CCX-4d: the F3 legacy path and the status parse passed.

The end-to-end trials also found, and fixed:
- `worktree add` starting from the wrong commit, and a stale-baseline bug (CCX-7);
- test-harness failures that only happen inside Codex's sandbox (`taskkill` denied, CLIXML-wrapped errors). Those cases now SKIP there instead of failing.

Final gate:
- test-ccx 30/30;
- test-ccx-ops 16/16;
- test-codex-dispatch 46/46;
- test-sync-mirror 22/22.

## 7. Security and permissions

| Level | Covers | Rule |
|---|---|---|
| L0 | read | automatic |
| L1 | write in the task | automatic |
| L2 | build, test, dispatch | automatic |
| L3 | branches, worktrees, local commits and merges | allowed and logged |
| L4 | push, pull requests, messages, publishing, Codex full access | needs approval, in chat or in your terminal |
| L5 | production, credentials, force-push, history rewrite | needs you to type the approval in your own terminal |

- **What is enforced technically:**
  - Codex's sandbox cannot touch the state at all.
  - AI shells cannot pass the interactive approval.
  - Codex full access is gated.
  - Tick handlers cannot go above L2.
- **What relies on rules instead:** anything with full shell access could still edit state files directly.
- **Secrets and private data:**
  - Secrets are redacted everywhere ccx writes.
  - `nursing-a2/` is excluded by policy and never read or scanned.
  - No secrets were found in any commit.

## 8. Cost and token controls

- **Per-class budgets** (dispatches 2 to 4, model escalations, review cycles, timeouts, token targets), enforced by the launcher, router and `task review`.
- **Usage-limit runs** do not use up a retry.
- **Measured quota:** about 35 minutes of Astra at high effort per usage window. Parallel Codex runs used it in 19 minutes. The docs now say: one Codex task at a time, and spend Codex first on verification.

## 9. Files

- **New:**
  - `ccx/policy.json`, `ccx/ARCHITECTURE.md`;
  - `scripts/ccx.ps1`, `scripts/ccx-core.ps1`, `scripts/ccx-ops.ps1`, `scripts/test-ccx.ps1`, `scripts/test-ccx-ops.ps1`;
  - `.claude/agents/ccx-scout.md`, `.claude/agents/ccx-reviewer.md`;
  - `tasks/CCX-*.md`, `MEMORY-ARCHIVE.md`.
- **Changed:**
  - `scripts/codex-dispatch.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/test-sync-mirror.ps1`;
  - AGENTS.md, HANDOFF.md, README.md, BOOTSTRAP.md, MEMORY.md, FRICTION.md, TASK.md (reset), `.gitignore`.
- **Local only, never committed:** `.git/ccx/` (the state) and one line in `.git/info/exclude` (`.ccx-worktrees/`).

## 10. Remaining issues

- **Your approval:** none needed for the upgrade; it is already in `origin/main`.
- **Codex desktop app agent sync:** it copied our Claude scout agent into `.codex/agents/` without its read-only restriction. The folder is excluded from git here. Consider turning the sync off in Codex settings.
- **One unexplained flake:** process starts were briefly denied ("Access is denied") during one test run; a re-run passed. Cause UNKNOWN; likely security software.
- **Slow tests:** about 4.3 s per PowerShell start on this machine, so the core suite takes about 15 minutes.
- **Still open from 27 Sept:** the Mythos rule questions, deleting the old merged branch `claude/codex-mythos-upgrade-analysis-nv6hg1`, and recycling `claude-codex-template`.

## 11. How to use it

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 health
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 approve -Id A-0001
```

- `status` shows what's going on.
- `health` checks the setup.
- `approve` approves something. Run it in *your* terminal when asked.

Day to day, just ask Claude for work as usual. Claude runs the ccx steps.

## 12. Rollback

- **Before merging into main:** nothing to undo. Delete the branch if you don't want it.
- **After merging:**
  1. `git revert -m 1 <merge commit>` on a branch.
  2. Run the old test suites.
  3. Merge and push that branch.
  4. Delete `.git\ccx`.

  This was rehearsed; the result is in section 6. Never reset or force-push `main`.
