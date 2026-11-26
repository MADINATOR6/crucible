# UPGRADE-3R-VERIFY4: confirm one fix (your empty-message finding)

Do this now: follow HANDOFF.md, Verifier instruction, on exactly one commit of branch `claude/upgrade-3r`: `ee12646` (`git show ee12646`). It answers the one finding in your UPGRADE-3R-VERIFY2 report ("an empty error message can refund a failed attempt"). Review nothing else; the user allowed this follow-up.

1. `codex-dispatch.ps1` now records that a `turn.failed` or `error` event was seen (`$sawTerminalError`, `$sawErrorEvent`) apart from its text, so an empty ending message still decides. Re-run your two inputs (`error 503 → error ""` and `turn.failed "" → error 503`, exit 1, empty stderr): both should exit 1 with one attempt charged. Try to break it (empty `turn.failed` then empty `error`; an `error` with no `message` field; a real 503 that ends the run must still exit 4 and refund).
2. `test-codex-dispatch.ps1` gained cases `emptyAfter503` and `emptyTurnFailed503`. Check they would fail on the parent commit (`git show ee12646^:scripts/codex-dispatch.ps1`).

Claude ran `scripts\test-codex-dispatch.ps1`: 82/82 passed. Report per HANDOFF.md Report format with `Untested:`.
