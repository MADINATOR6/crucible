# UPGRADE-SUMMARY: FRICTION Resolved Notes and 10-Line Changelog

## 1. FRICTION.md Resolved Notes

### Resolved Rows

1. **2026-11-05 | SNAP-1 dispatch 1: Codex finished the render, then the model hit "at capacity" before the report...**
   - **Fix proposal / status:** Fixed (UPGRADE-1): terminal capacity errors and 5xx responses without turn completion exit 4 and refund the implement dispatch attempt without recording a fake quota reset. Ordinary terminal failures and recovered errors followed by completion still spend the attempt.

2. **2026-11-05 | SNAP-3 used its two dispatches on a Higgsfield HTTP 500 and on a stop rule in my own brief...**
   - **Fix proposal / status:** Fixed (UPGRADE-1): provider HTTP 5xx errors ending a turn now exit 4 with no attempt used, keeping captures and outputs for review. Pilots should still be isolated in dedicated tasks to avoid hitting dispatch limits on brief stop conditions.

3. **2026-11-06 | SNAP-7 (run by Claude at the user's word, no dispatch): `ccx verify` fails `scope` on 50+ unrelated uncommitted files...**
   - **Fix proposal / status:** Fixed (UPGRADE-1): `task add` captures the registration checkout baseline into `baselines[<key>]` and `baselineDirty`, allowing direct verify on planned or non-dispatched tasks. Verification evaluates checkout-specific baselines to prevent cross-worktree laundering.

4. **2026-11-10 | `ccx verify -TaskId LT-CALORIE-2` fails its scope stage on other tasks' uncommitted files in the base checkout...**
   - **Fix proposal / status:** Fixed (UPGRADE-1): registration baselines taken at `task add` exempt existing unowned checkout files from scope verification. Dirt introduced after task registration must still be committed or isolated in a worktree.

5. **2026-11-12 | CRU-UP-1 and CRU-UP-2 (three verify dispatches): Codex's read-only sandbox cannot create the suites' scratch folders under `%TEMP%`...**
   - **Fix proposal / status:** Fixed (CRU-VERIFY-3 / UPGRADE-1M): suites probe `%TEMP%` and fall back to gitignored `.test-scratch/<run>` when TEMP is denied, while verify dispatches running suites take `-Sandbox workspace-write` with exit 9 guard against tree modifications.

6. **2026-11-14 | Cleanup: 60+ uncommitted files from eight projects sat in the base checkout for up to five weeks...**
   - **Fix proposal / status:** Fixed (CRU-AUDIT-F3b / UPGRADE-1): `task add` captures dirty files into `baselines`, `ccx verify` diagnoses missing baselines, and stale worktree scans ignore completed tasks. Worktrees remain the primary isolation mechanism for concurrent work.

7. **Health finding | `provider-gemini not set`**
   - **Fix proposal / status:** Fixed (UPGRADE-1): `ccx health` detects account-authenticated providers (`auth: account`, e.g. Gemini via `agy`) and checks `agy --version` instead of requiring an environment variable key, reporting PASS with version output and unknown sign-in state.

---

### New Friction Rows

| Last seen | Symptom | Cost | Fix proposal / status | Count |
|---|---|---|---|---:|
| 2026-11-26 | `scripts/test-crucible.ps1` ran the real Codex CLI in its owner-switch test case because `crucible.ps1 Invoke-Run` prepended registry PATH before process PATH, bypassing test PATH stubs. | Real Codex invocation while at usage limit; test failure | Fixed (UPGRADE-2A): `Invoke-Run` preserves inherited process `$env:Path` ahead of Machine and User registry paths so mocked CLI test shims take precedence. | 1 (fixed) |
| 2026-11-26 | `ccx verify` scope stage fails on Claude's own edits made in the base checkout while a helper's background dispatch is running. | Failed verification runs; forced stash/commit cycles | Baseline captured at `task add` narrows pre-existing dirt, but concurrent mid-dispatch edits still fail scope; commit before dispatching or run helper work in dedicated worktrees. | 2 |

---

## 2. Changelog (10 lines max)

1. `task add` captures baseline dirt at registration, preventing false scope verification failures on non-dispatched tasks.
2. Provider capacity errors and HTTP 5xx failures now exit 4 and refund implement retry attempts automatically.
3. Automated fallback to Gemini selects the class-tier Gemini model rather than a fixed global default.
4. `ccx health` recognises account-based CLI authentication for Gemini (`agy`) without needing API keys.
5. New `symmetry` verify stage ensures `AGENTS.md` and `CLAUDE.md` are always committed together.
6. Test suites automatically fall back to `.test-scratch/` when sandbox permissions deny `%TEMP%` access.
7. Obsidian "New brief" modal adds dropdowns for valid work types and output paths with instant validation.
8. `crucible.ps1 types` lists launch-eligible brief types, filtering out gated or incompatible agent routes.
9. `crucible.ps1 board` moves non-brief terminal tasks and notices to a separate `Status/Terminal.md` note.
10. `crucible.ps1 review-pack` compiles diff ranges, critique checklists, and review evidence for blind IDE reviews.

---

Status: READY_FOR_CLAUDE_REVIEW
Untested:
- Manual Obsidian modal interaction with Work type and Output file fields — Claude / User
- Verification test suites (`test-ccx.ps1`, `test-ccx-ops.ps1`, `test-codex-dispatch.ps1`, `test-crucible.ps1`) — Claude
Next owner: claude - applies the FRICTION edits
