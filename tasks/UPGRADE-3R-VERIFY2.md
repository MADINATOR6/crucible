# UPGRADE-3R-VERIFY2: narrow third check (user-approved) of the cycle-2 fixes only

Do this now: follow HANDOFF.md, Verifier instruction, on exactly two commits of branch `claude/upgrade-3r`: `a4097da` and `237a509` (`git show a4097da 237a509`). They answer your three low findings in the UPGRADE-3R-VERIFY report. The user allowed this third review after the two-cycle cap; review nothing else.

1. `codex-dispatch.ps1`: with no `turn.failed`, the last error event in order decides (`$lastErrorEvent`). Re-run your input error A / 503 / A without turn.failed, and try to break it (503 last; only a 503; turn.failed before later errors; agy and headless Claude paths unaffected?).
2. `ccx-ops.ps1` health: a nonzero `agy --version` exit is a failed probe even with output. Re-run your printing-and-exit-1 input; confirm the healthy fixture still PASSes and nothing but `--version` runs.
3. `crucible.ps1`: BOARD is reserved like TERMINAL (Invoke-New and the board's note writer). Any other generated name under `Status/` a brief id can collide with?

Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-codex-dispatch.ps1` and report counts and SKIPs (Claude ran: ccx-ops 20/20, crucible 23/23, dispatch 80/80). Report per HANDOFF.md Report format with `Untested:`.
