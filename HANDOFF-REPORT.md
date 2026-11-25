# Tri-agent workflow upgrade (2026-11-26, overnight)

Status: done in ccx and committed on `main` (36 commits from 25c8ba0 to 024d6e3, plus this report). The earlier report (lifting tracker part 2, 2026-10-05) is in git history.

## What changed, in plain words
1. A task you register (`ccx task add`) now remembers which files were already modified, so checking it later no longer fails on other people's leftovers, even if it never went through a dispatch.
2. A provider that is overloaded or returns a server error (5xx) no longer burns one of a task's two tries; it exits 4 with `TRANSIENT PROVIDER FAILURE`.
3. When Codex is at its limit, Codex work falls back to Gemini (Antigravity) with the right model for the task's size; `ccx health` now shows agy's version instead of "not set".
4. `ccx verify` has a `symmetry` stage that fails if AGENTS.md changes without CLAUDE.md, or the reverse.
5. The test suites work when TEMP is blocked (they use a hidden `.test-scratch/` folder instead).
6. Obsidian: the board shows only your briefs and approvals; other ccx tasks and notices moved to `Status/Terminal.md`.
7. Obsidian: "New brief" now asks for the work type and the output file, and refuses ones that could never launch.
8. `crucible.ps1 review-pack` builds a file you can open in the Antigravity IDE for a blind review.
9. Bug found and fixed: `test-crucible.ps1` had been running the real Codex CLI (and spending real quota) in one case.

## Who did what
- Codex (gpt-6.2-astra/sol): planned UPGRADE-1 and UPGRADE-2, wrote the failing tests (UPGRADE-1T), built the board split and review pack (UPGRADE-2), then hit its weekly limit during a one-line test correction (that fix had landed; resets 21:10 today).
- Gemini (agy, flash-low to neon-high): friction audit, Obsidian UX review, docs draft, reviewer checklist, three adversarial reviews (found 5 real defects, all fixed), FRICTION notes and changelog.
- Claude: plan critiques, core control-plane code, the review fixes, the brief modal, the TEMP fallback (Codex's task, taken over at its limit; Gemini cannot write `scripts/`), docs, merges.

## Evidence
- Suites on the final code: test-ccx 39/39, test-ccx-ops 20/20, test-codex-dispatch 71/71, test-crucible 23/23 (all inside `ccx verify -TaskId UPGRADE-1M`, PASS). With TEMP denied: test-ccx and test-crucible pass; dispatch suite with the fallback forced 70/71 + 1 SKIP ("outside repository", which cannot hold there).
- `ccx health`: `PASS provider-gemini agy.exe 1.5.17; sign-in unknown`.
- Live app unchanged by this work; 25c8ba0 (lt-v31) was pushed first (A-0157) and the Pages deploy passed (live `sw.js` = lt-v31).

## Untested / open (next owner)
- Your blind review: open `handoffs/UPGRADE-blind-review.md` in the Antigravity IDE with Claude Sonnet 5.5 (read-only). Findings go to Claude. (user)
- Obsidian: reload the Crucible plugin, create one brief with a work type and output file, launch it. No agent can drive Obsidian. (user)
- Agy sign-in is shown as "unknown": agy has no status command. (open, no fix known)
- Low notes from Gemini (`handoffs/UPGRADE-1M-gemini-review.md`): no dedicated test for the timeout/protected-file refund guards; `test-crucible` cleanup has no path guard (pre-existing). (Claude or Codex, after the reset)
- Codex never ran a verify of the final diff (limit); Gemini did the adversarial reviews instead. Codex can re-verify after 21:10 if you want a second model on it. (Codex)
- You have spare Codex resets until 2026-12-13; pressing one is your call.
