# CCX-4 · Independent verification of the ccx control plane

## Mode and Owner
CCX-4 · complex · risk high · Dispatch, `-Role verify`, recorded on task CCX-2 (the launcher verify path). Codex (gpt-6-astra, high) verifies independently. Claude fixes, re-verifies and commits.

## Goal
Try to break the ccx control plane before it merges. Codex wrote most of CCX-1, CCX-2 and CCX-3; Claude reviewed that code and finished it. You are the independent verifier for the whole change.

## Relevant Files
- The change under test: `git diff c2f515b..HEAD -- scripts/ ccx/ .claude/agents/ .gitignore`.
- Contracts: `tasks/CCX-1.md`, `tasks/CCX-2.md`, `tasks/CCX-3.md`, `ccx/policy.json` and `ccx/ARCHITECTURE.md`. The code is authoritative wherever the specs were later changed by review; each spec lists those changes.
- HANDOFF.md: the Verifier instruction and the Report format.

## Write Allowlist
None. Never edit, create or delete repository files. Temporary files go only under `%TEMP%\ccx-v4-<random>`; set `CCX_STATE_DIR`, `CCX_POLICY` and `CODEX_HOME` there for your experiments. Never touch the real state dir (`<git common dir>/ccx`) or `nursing-a2/`.

## Constraints
- Attack in this priority order, and give each problem a reproduction (command or input, expected, observed), file:line and a severity:
  1. **Approval and permission bypass:**
     - approving without an interactive console;
     - chat approval of L5;
     - reusing or forging approvals;
     - unknown actions not failing closed;
     - launcher full access without an approval;
     - tick handlers above L2.
  2. **Secrets and privacy:**
     - any path where secret-like text reaches state, history, telemetry, logs, notifications or output unredacted (build test secrets at runtime by concatenation);
     - `privacy.excludePaths` bypasses: case, slashes, renames, directory owns.
  3. **State consistency:**
     - lost updates under concurrency;
     - a crash mid-write;
     - a corrupt `state.json` (does recovery keep `.bak`?);
     - lease recovery racing a slow handler;
     - dedup windows.
  4. **Ownership and scope:**
     - overlap edge cases;
     - baselineDirty abuse;
     - post-check exit 9;
     - merge-check scope;
     - the fingerprint going stale after a verify.
  5. **Routing correctness against the policy:**
     - escalation caps;
     - max needing failed attempts;
     - owner and escalate semantics;
     - usage-limit exits ignored by adaptive stats and not consuming retries;
     - Codex availability deferral.
  6. **Worktree safety:** `worktree prune -Apply` must never remove a dirty, unmerged or non-ccx worktree, or anything outside `.ccx-worktrees`.
  7. **Backward compatibility:** a launcher run without `-TaskId` gives the same Codex arguments and exit codes as at `04e54e1`.
  8. **Verify pipeline:**
     - command-stage timeouts kill the process tree;
     - SKIP and N/A never mask a FAIL;
     - a failed verification blocks `task done`.
- Static reading cannot prove runtime behaviour; say which checks you ran.
- If the sandbox blocks a check (for example `.git` writes for worktrees, or `taskkill`), name the exact denied command and move on.

## Out of Scope
- Fixing anything.
- Style.
- Performance, beyond timeouts that break correctness.
- Everything outside the change under test.

## Done When
1. (Codex) Every priority area was attacked. Each gets a Checks line: PASS (attack failed to break it) or FAIL (problem found), with evidence, or BLOCKED naming the denied command.
2. (Claude) Every FAIL is fixed or explicitly accepted with a reason. Then the three suites pass and the re-verification of the fixed areas passes.

## Verify
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx-ops.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-codex-dispatch.ps1
```
Each takes 5-15 minutes on this host, because PowerShell startup is about 4 s. Run them only when a result is needed, not repeatedly.

## Stop Conditions
- Report by 25 minutes after start, even with areas open. Codex's usage window is about 35 minutes at high effort, and a usage-limit cutoff loses the final report.
- Attack the priority areas in order. Say each confirmed finding in one line in your progress messages as you find it. The launcher captures those messages, so they survive a cutoff.
- Never edit repository files, even to prove a fix.
