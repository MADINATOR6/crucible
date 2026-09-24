# 2026-09-25 · Claude · template-fixes

- **Branch / commit:** `claude/template-fixes`, merged to `main` (pushed: yes)
- **Changes:** all five findings from `2026-09-25-codex-template-review.md` accepted.
  1. `HANDOFF.md` parallel step 2: preflight for worktree/commit/push; if blocked, keep edits and name the exact Git command for Claude or the user.
  2. `AGENTS.md` Mobile Sync: `.git` added to `/XF` for worktree pointer files; sync only from the base-branch checkout.
  3. `HANDOFF.md` parallel step 4: note → commit → push → `git ls-remote` → notify. `handoffs/TEMPLATE.md`: SHA means last implementation commit; push status as observed.
  4. `AGENTS.md` Modes and `TASK.md`: task recorded once (TASK.md for Dispatch, handoff note for Parallel). `AGENTS.md` Friction: log in report/note when FRICTION.md is not yours.
  5. `AGENTS.md` Modes and Routing: commit/push steps follow the mode's ownership.
- **Checks run:** diff reviewed; `git diff --check` clean.
- **Known issues:** Dispatch mode not yet exercised end to end in Codex's restricted sandbox.
- **Next action / owner:** user: pilot one real task in each mode. Codex's worktree `claude-codex-collab-template-review` can be removed by Codex or the user.
