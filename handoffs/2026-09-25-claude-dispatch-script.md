# 2026-09-25 · Claude · dispatch-script

- **Branch / commit:** `main` (pushed: yes)
- **Task:** replace the ~600-character launcher one-liner with a script; record token usage per handoff.
- **Scope:** `scripts/codex-dispatch.ps1` (new), HANDOFF.md launcher section, handoffs/TEMPLATE.md, AGENTS.md folder map, BOOTSTRAP.md, README.md.
- **Acceptance:** path guard refuses a 269-char capture path and creates nothing - Claude - PASS; real dispatch in a throwaway repo returned READY_FOR_CLAUDE_REVIEW with token usage printed - Claude - PASS.
- **Changes:** script checks repo root and TASK.md, guards MAX_PATH before creating folders, passes a one-line prompt (prompt files for longer instructions), captures events/stderr/report/exit, sums `turn.completed` usage, prints the report, exits 3 when no report exists. Handoff template gains a Tokens line.
- **Tokens:** trivial `add(a, b)` task: Codex input 184,849 (166,912 cached, 90%) / output 780. Most of Codex's cost is its fixed startup context, not this template.
- **Known issues:** none.
- **Next action / owner:** user: use on real tasks; compare the Tokens line across tasks before optimising further.
