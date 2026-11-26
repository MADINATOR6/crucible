# Overnight 2026-11-27: Gemini self-upgrade and UPGRADE-3R

Status: done in ccx and committed on local `main` (c6ac0d1 to df6108b and this report). **Not pushed**: the push needs your yes. The previous report (tri-agent upgrade, 2026-11-26) is in git history.

## What changed, in plain words
1. **Codex now reads all of AGENTS.md.** Codex keeps only the first 32 KiB by default, and AGENTS.md is 46 KB, so Codex never saw Modes, Scope, Git, Security or Definition of Done. `.codex/config.toml` now raises the limit (checked with `codex debug prompt-input`).
2. **Gemini (Antigravity) now sees its whole rulebook and Crucible's skills.** Antigravity cuts each rule file at 24,000 bytes. A new short `GEMINI.md` tells it to read the rest of AGENTS.md, and `.agents/skills.json` gives it the same skills Claude has (blender, fable-judge, generate, higgsfield, scroll-site). Nursing notes and the offensive-security modules are left out. Gemini wrote both files; Codex and Claude checked them, and live probes confirm they load.
3. **Gemini studied the four Google repos you gave it** and wrote `handoffs/GEMINI-SELF-UPGRADE-report.md`: eight upgrade proposals with sources. Claude and Codex corrected five errors in it.
4. **The upgrades that change Gemini's access wait for you:** `handoffs/GEMINI-UPGRADE-approvals.md`. The most useful one: Gemini runs launched from Obsidian have no working shell. Claude traced it to the launch method (WMI), not the settings.
5. **Ponytail rules for all three agents** (AGENTS.md Scope). Caveman, if you install it, shortens only Claude's chat replies.
6. **UPGRADE-3R is finished and merged.** These are the fixes from Codex's and Gemini's reviews of Gemini's access. Tonight's last fix stops an empty provider error message from wrongly refunding a failed attempt.

## How the three worked together
- **Gemini** (neon-high/xhigh): did the research and wrote GEMINI.md and the skills config.
- **Codex** (gpt-6.2-astra/sol): ran five independent checks:
  - found the empty-message refund bug, and four errors in Gemini's proposals;
  - confirmed every fix.
- **Claude:**
  - checked Gemini's claims against the agy docs and live probes;
  - found that Codex has the same truncation problem;
  - caught Gemini's skills-exclude bug;
  - fixed the launcher bug Codex found;
  - merged everything.

## Evidence
- UPGRADE-3R and 3R-T closing verifies: all stages PASS. Suites: tests-ccx, tests-ccx-ops, tests-dispatch (82/82 in Claude's own run) and tests-crucible.
- Codex VERIFY4: 5 replays pass on the fix; both new tests fail on the parent commit.
- Live agy probes from the repo root:
  - The 5 shared skills load and the 3 excluded ones are absent, with and without `--disable-slash-commands`.
  - The shell works from a terminal and fails through WMI.
- `check-sources` on the research report: 57/57.

## Open / next owner
- **Push** `main` (about 25 commits; no `lifting-tracker/` change, so no Pages republish). (you: say yes, then Claude runs the push gate)
- **Your call on the access upgrades** in `handoffs/GEMINI-UPGRADE-approvals.md`:
  - #3, the WMI shell fix: recommended first;
  - #4, Gemini as reviewer;
  - #5, Rea and Higgsfield MCP for Gemini;
  - #6, the free-tier Gemini API wrapper;
  - #8, gemini/ worktrees;
  - the plan-mode layer.
- **Untested:**
  - A fresh `.ccx-worktrees/` worktree may not be trusted by Codex. If not, Codex dispatches there still use the 32 KiB limit. Next check: `codex debug prompt-input` in a new worktree; if Security is missing, pass `-c project_doc_max_bytes=65536` in the launcher. (Claude)
- Still from before: your blind review (`handoffs/UPGRADE-blind-review.md`) and the Obsidian plugin check.
