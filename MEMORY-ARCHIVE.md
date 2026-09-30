# MEMORY archive

Older MEMORY.md entries, moved verbatim when MEMORY.md exceeds its caps (see ccx/ARCHITECTURE.md, Memory). Newest archive batch last.

## Checkpoints archived 2026-10-01 (2026-09-25 unattended session)
- 2026-09-25 13:12 +10:00: session start; HEAD 3bfe4f5; T0 in progress. Session stop deadline 17:10 (240 min).
- 2026-09-25 18:10 +10:00: resumed after Claude session limit (13:30-18:00). T0, T1 done. Removed stray 0-byte `b`. Writing T2 brief. New stop deadline 22:00.
- 2026-09-25 18:55 +10:00: T2 implemented by Codex (high effort; 3.58M input / 3.49M cached / 22.8k output; BLOCKED only on sandbox-denied taskkill). Claude fixed lock PID-reuse false BUSY, fractional timeout, RESETS trailing dot; 24/24 tests pass outside sandbox. HANDOFF.md launcher docs + Verifier/Researcher instructions written (uncommitted). Codex verifier dispatch running (-Role verify -Sandbox workspace-write).
- 2026-09-25 18:51 +10:00 (corrected: an earlier entry said 19:20 without checking the clock): Verifier (medium; 410k input / 371k cached / 3.5k output) flagged 2 intended deviations + sandbox-blocked taskkill; Claude found and fixed VoidTaskResult output leak (launcher + test). 23/23 pass in 156 s. Captures now UTF-8. T2 committed 33e78df.
- 2026-09-25 18:58 +10:00: T4 docs committed fb5222d after a read-only Codex verifier (164k input / 125k cached / 2k output; 6 findings applied).
- 2026-09-25 19:29 +10:00: T3 Codex PARTIAL (high; 789k input / 751k cached / 13.6k output). Claude fixed worktree check, OneDrive cloud-placeholder false refusal (found by a real-OneDrive dry run), -Create parent, test harness races. Mirror suite 18/18 + 1 SKIP via -File, 19/19 via -Command. Real OneDrive -Create -DryRun: exit 0, 20 committed files listed, nothing created. T3 committed 59629a1.
- 2026-09-25 19:38 +10:00: T3 Codex verifier (medium; 687k input / 645k cached / 5.2k output) found 2 high bugs: staging/destination overlap, export-ignore dropping committed files. Claude fixed both (checkout-index with private index; containment refusal); mirror suite 20/20 + 1 SKIP via -File, 21/21 via -Command; real dry run lists 22 = git ls-files. Removed verifier leftovers %TEMP%\ccx-t3v (no links inside).
- 2026-09-25 19:53 +10:00: fresh clone of pushed 3389199 passes both suites (23/23; 20/20 + 1 SKIP). Clone removed. Writing HANDOFF-REPORT.md; session stopping (queue complete).
