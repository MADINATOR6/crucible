# 2026-11-28: Gemini as reviewer, its security fixes, and Codex's own fixes

Status: everything is done in ccx, merged and pushed to `main` (last push 3f6edad). The mirror and board are synced. The overnight report (2026-11-27) is in git history.

## What changed, in plain words
1. **Gemini can review work while Codex is out** (GEMINI-REVIEWER, your "4. do this").
   - `codex-dispatch.ps1 -TaskId <id> -Role verify -Reviewer gemini` runs a read-only Gemini review, recorded with `ccx task review -By gemini`.
   - Gemini never reviews its own work, or anything that touches the files deciding its routing or access.
   - The launcher, `task review` and `task done` all enforce that.
   - The check covers more than the files a task declares. It also looks at everything the task changed since `task add`: on its branch, in its worktree and on main.
   - Codex and a fresh-context Claude reviewer tried to break this over many rounds. Every hole they found is fixed, each with a test.
2. **Two security-review findings fixed** (GEMINI-REVIEWER-4).
   - The protected list now also covers:
     - the ccx entry point, `ccx-ops.ps1` and the rest of `ccx/`;
     - `HANDOFF.md`, the Obsidian launcher and the blind-review checklist;
     - `.claude/skills/`, which Antigravity loads;
     - Gemini's own config folders.
   - `-Reviewer gemini` can no longer override a "stop and ask" route.
3. **Codex's fixes from studying its own source** (CODEX-UPGRADE-1).
   - A quota warning the run recovers from no longer marks Codex unavailable. This counts only for Codex's own completed turn: Antigravity and Claude quota errors still do.
   - `ccx health` now checks that Codex really sees all of AGENTS.md (PASS today).
   - The docs now say the 6.2 models need Codex CLI 0.171.0 or later.

## How the three worked together
- **Codex** planned the Gemini-reviewer change and reviewed every round. It found the agy and Claude quota hole in its own fix and confirmed the final versions.
- **Gemini**:
  - is now a reviewer the system can safely use;
  - studied the Google repos;
  - wrote the three-agent team guide (pushed earlier).
- **Claude**:
  - implemented everything;
  - ran every suite and full verify;
  - used a fresh-context reviewer while Codex was at its limit (reset 4:02 PM);
  - merged and pushed through the ccx gates.

## Evidence
- Full `ccx verify` (all 11 stages) passed on the final commit of each task: 8dfdf56, 801ff90 and 6b59b09. Suites: test-ccx 45/45, test-codex-dispatch 90/90.
- `ccx health`: `codex-instructions` PASS ("Codex sees AGENTS.md through '# Definition of Done'").
- Pushes: 2dbc37e (A-0169), 9f51f8a (A-0171), 3f6edad (A-0172).

## Open items (none blocking)
- **Untested live:** the `gemini-api` wrapper's real call. Google returned 503 "high demand" every time I tried.
- **Yours to do:** sign in to Higgsfield inside Antigravity. `.mcp.json`'s `codex` bridge returns 502 because its Tailscale service isn't running.
- **Known limits, written in the code:** Gemini's review check cannot see:
  - commits made before `task add`;
  - edits hidden with git's `--skip-worktree` or `--assume-unchanged`;
  - ignored files.

  All three need deliberate hiding by the task's own author, and the merge review and push gate still apply.
- **Small hardening follow-ups:**
  - Protect `.agent/`, `_agents/`, `_agent/` and `.antigravityignore`. None exist today, but agy would load them.
  - Run the session-overlap check before the Codex-out `defer` return.
  - Have the health check match AGENTS.md's last non-blank line, not just its last heading.
  - When a run exits nonzero, classify it by its final error.
- **AGENTS.md is 48 KB.** Antigravity reads 24,000 bytes per rule file, so `GEMINI.md` tells it to read the rest (verified on 2026-11-27). Codex reads it all (`project_doc_max_bytes = 65536`).
- **Speed-up idea:** a full `ccx verify` takes about 17 minutes, because its five suites run one after another. Running them in parallel would roughly halve that.
- **Stale approvals** you may want to deny: A-0118 (push), A-0129 (codex-full-access), A-0149 (paid-action).
