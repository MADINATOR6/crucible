# GEMINI-SELF-UPGRADE-RESEARCH, verifier pass 2: check Claude's corrections only

Do this now: follow HANDOFF.md, Verifier instruction. Your first verify of `handoffs/GEMINI-SELF-UPGRADE-report.md` found four errors in the proposals. Gemini hit its retry cap, so Claude wrote them into one new section, `## Corrections after verification`, just above `## UNKNOWN / CHECKED / NEEDED`. Review only that section:

1. Does each of your four findings appear there correctly (proposal 5 source cell, proposal 8 worktree guard at `scripts/ccx-ops.ps1:443`, proposal 2 verification with `--disable-slash-commands`, blender audit not read-only)?
2. Check each factual claim in it against the repo or the agy docs under `~/.gemini/antigravity-cli/builtin/skills/agy-customizations/docs/`: commit 3222a49's contents, the exclude names in `.agents/skills.json`, the WMI diagnosis in FRICTION.md's 2026-11-27 row, and `mcp_servers.md` lines 28-29.
3. `node scripts/check-sources.mjs handoffs/GEMINI-SELF-UPGRADE-report.md` still passes.

You cannot run agy here; say so under `Untested:` rather than guessing about the live probes. Report per HANDOFF.md Report format.
