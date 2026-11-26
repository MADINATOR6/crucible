# Gemini upgrades waiting for your yes (2026-11-27)

Gemini proposed eight upgrades in `handoffs/GEMINI-SELF-UPGRADE-report.md`. Claude checked them. Two were safe to do tonight. The rest change what Gemini may do or reach, and Crucible's rule is that you approve those and Claude or Codex builds them (Gemini never authors its own access).

## Done tonight
- **Codex now reads all of AGENTS.md.** Codex keeps only 32 KiB of AGENTS.md by default; `codex debug prompt-input` showed it never saw Modes, Scope, Security or Definition of Done. `.codex/config.toml` now sets `project_doc_max_bytes = 65536` (commit 1ba0441).
- **Gemini sees its whole rulebook and Crucible's skills** (task GEMINI-CONTEXT, written by Gemini, reviewed by Codex and Claude): a short `GEMINI.md` tells Antigravity that its loader cuts AGENTS.md at 24,000 bytes and to read the rest, and `.agents/skills.json` points Antigravity at `.claude/skills` (without nursing-notes and the offensive-security modules).

## Your call
| # | Upgrade | Claude's view | Needs |
|---|---|---|---|
| 3 | Fix Antigravity's shell (`Access is denied` on every command in Obsidian-launched runs) | Diagnosed tonight: the settings are fine; the cause is the launch method. The same agy command works from a normal shell and fails when started through WMI, which `crucible.ps1 launch` uses so runs survive closing Obsidian. Fix: start runs another way that still survives (job breakaway or a scheduled task), with the WMI probe as the regression check. Worth doing first. | Your OK to change how the launcher starts runs |
| 4 | Let Gemini act as a reviewer/verifier for Claude's and Codex's work | Big win while Codex is at its limit; must refuse any task touching Gemini's own routing | Your OK (security boundary) |
| 5 | Give Gemini the Rea and Higgsfield MCP servers | Rea read-only is low risk; Higgsfield spends credits and stays behind the paid-action gate | Your OK per server |
| 6 | `scripts/gemini-api.ps1`: free-tier Gemini API for video/PDF analysis by all three agents | Closes the Claude-only video gap; needs a binary download and a check of Google's free-tier data terms | Your OK to download, and your read of the terms |
| 7 | Decisions API pilot | Skip for now: nothing needs it yet | - |
| 8 | `gemini/` worktrees and stale doc lines | Small, but two places: the `branchPrefix` entry in ccx/policy.json and the guard in `ccx worktree add` (`scripts/ccx-ops.ps1:443`) that refuses every agent but claude and codex (Codex caught this) | Your OK |
| new | Plan mode is ignored in Gemini's read-only runs | agy warns `--mode plan has no effect` when `--disable-slash-commands` is also passed, and the launcher passes both. Writes are still refused (headless agy denies `write_file` without an allow rule, and the shell is sandboxed), so nothing is exposed today; it is one missing safety layer. Fix: drop one of the two flags for read-only runs | Your OK (launcher) |

How the team worked: Gemini wrote the research and the two context files; Claude checked every claim against the agy docs and live probes, and caught one bug; Codex verified independently and caught four errors in the proposals plus one in the launcher. Every finding was fixed, or is listed here for you.
