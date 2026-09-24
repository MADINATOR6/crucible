# 2026-09-25 · Claude · parallel-pilot

- **Branch / commit:** `main` (pushed: yes). Pilot repo `collab-pilot-par` with a local bare origin; both task branches merged at `6e216a8`.
- **Changes:** Parallel mode run end to end: Claude (`claude/clamp`) and Codex (`codex/slugify`) worked at the same time in separate worktrees, each committed, wrote a note, pushed and verified the remote tip. Both merged with no conflicts; 6/6 tests pass on merged main. Template fixes: HANDOFF.md one-line prompt rule and `workspace-write`/`.git` rule; two FRICTION.md entries.
- **Checks run:** `node --test` on each branch and on merged main; Claude reviewed Codex's diff (allowlist respected, logic correct).
- **Known issues:** In `workspace-write`, Codex cannot touch `.git`, so it reported BLOCKED as designed; the full flow needed `danger-full-access` (the user's normal Codex setting). Codex put code and note in one commit; acceptable under the template.
- **Next action / owner:** user: apply the template to a real project with BOOTSTRAP.md. Dispatch is the default; use Parallel only for truly independent tasks with full-access Codex.
