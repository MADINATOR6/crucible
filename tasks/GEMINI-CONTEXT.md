# GEMINI-CONTEXT: give Antigravity the whole rulebook and the shared skills

Owner: gemini (author). Reviewer: Codex (`ccx task review -By codex`), then Claude. Type docs, class normal, risk low.
Origin: your own report, `handoffs/GEMINI-SELF-UPGRADE-report.md`, proposals 1 and 2, checked by Claude against the agy docs.

## Why
- Your rule loader caps each rule file at 24,000 bytes (`~/.gemini/antigravity-cli/builtin/skills/agy-customizations/docs/rules.md`). `AGENTS.md` is about 46,000 bytes, so you never see anything after `## Choosing a tool`: Windows, Mobile Sync, Roles, Modes, Routing, Control Plane, Effort, Scope (with Ponytail), Git, Failure Handling, Security and Definition of Done.
- Antigravity finds skills through `.agents/skills.json` `entries` (`json_configs.md`, same folder), and Crucible's skills already live in `.claude/skills/`. Pointing at them gives you the same skills as Claude with no copied text to drift.

## Write allowlist
- `GEMINI.md` (new, repo root)
- `.agents/skills.json` (new)
Nothing else. Both paths are protected; this ccx task owns them.

## What to write
1. `GEMINI.md`, at most 3,000 bytes. It must:
   - say `AGENTS.md` is the authority and that your loader cuts it at 24,000 bytes, right after `## Choosing a tool`;
   - tell you to read `AGENTS.md` from `## Choosing a tool` to the end with your file tool before any work, then `HANDOFF.md`'s section for the task's mode;
   - list the section names that are cut, so you can tell if you skipped them;
   - not restate, paraphrase or soften any rule (a copy drifts; AGENTS.md wins on any conflict), and not grant you any permission, role or route.
2. `.agents/skills.json` with one `entries` item for `.claude/skills`, excluding:
   - `nursing-notes` (works on `nursing-a2/`, which you must never read);
   - `offensive-*` (security modules that need documented authorization per task).
   Follow the schema in `json_configs.md` exactly. Read every remaining `.claude/skills/*/SKILL.md` frontmatter and confirm it has `name` and `description`; list any that do not in your report rather than editing them.

## Done When
- Both files exist with the content above; `GEMINI.md` is under 3,000 bytes; `.agents/skills.json` parses as JSON.
- No other file changed.
- Report lists the skills Antigravity should now load, with the `Untested:` line. Claude then runs a live `agy` probe (skills listed, AGENTS.md cut point quoted) and Codex reviews the diff.

## Review, cycle 1 (Claude, 02:55)
`GEMINI.md` passes as written: a live `agy` probe from the repo root quoted the pointer back correctly. One fix in `.agents/skills.json`: the same probe still listed `offensive-bug-identification` and `offensive-reporting`. The only copies are in `.claude/skills/`, so the pattern `offensive-.*` did not match (it behaves like a glob, not a regex), while the exact name `nursing-notes` did. Replace `offensive-.*` with the two exact names. Change nothing else.

## Stop conditions
- If the agy docs contradict anything above, stop and report the passage instead of guessing.
