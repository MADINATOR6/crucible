# 2026-09-25 · Claude · dispatch-pilot

- **Branch / commit:** `claude/pilot-fixes`, merged to `main` (pushed: yes). Pilot repo `collab-pilot` (local only) @ `c9303f9`.
- **Changes:** Dispatch mode run end to end on a small task (`formatDuration` + tests). Codex followed HANDOFF.md from the one-line launcher prompt, stayed in the write allowlist, did not commit, and returned a correct report (READY_FOR_CLAUDE_REVIEW). Template fixes from the run: short capture-dir guidance and "confirm `.report.md` exists" in `HANDOFF.md`; PowerShell encoding rule in `AGENTS.md`; three entries in `FRICTION.md`.
- **Checks run:** Claude reran `node --test` (3/3 pass), probed edge cases (0, -0, MAX_SAFE_INTEGER, bigint, strings, NaN, Infinity), reviewed the diff.
- **Known issues:** none blocking. First launch captured nothing due to the long path; the rerun succeeded.
- **Next action / owner:** user: bootstrap a real project with BOOTSTRAP.md and use Dispatch as the default.
