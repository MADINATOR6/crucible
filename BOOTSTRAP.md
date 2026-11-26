# Bootstrap a real repository

Not copied into projects. In Claude Code opened in the target repository, say:
"Follow <path to your crucible clone>/BOOTSTRAP.md for this repo."
(Clone https://github.com/MADINATOR6/crucible if you have no local copy.)

---

Apply the Claude Code + Codex + Gemini workflow from the folder containing this BOOTSTRAP.md (the template) to this repository.

1. Run `git status`. Note existing uncommitted work and do not modify, stage or commit it.
2. Bring in `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`, `TASK.md`, `FRICTION.md`, `handoffs/TEMPLATE.md`, `scripts/codex-dispatch.ps1`, `scripts/sync-mirror.ps1`, `ccx/policy.json`, `ccx/ARCHITECTURE.md`, `scripts/ccx.ps1`, `scripts/ccx-core.ps1`, `scripts/ccx-ops.ps1`, `.claude/agents/ccx-*.md` and `.claude/skills/fable-judge/` (including its license).
   - Merge the top-level `model_reasoning_effort` setting into `.codex/config.toml` if the target has no setting. Copy Crucible's `.mcp.json`, `[mcp_servers.*]` tables or optional tool files only when the target explicitly needs that integration. Use [EXTERNAL-TOOLS.md](EXTERNAL-TOOLS.md) in this template to identify the files and prerequisites for each tool.
   - In the copied `ccx/policy.json`, use the target's own `privacy.excludePaths` (empty if none). Keep the built-in verification stages. Replace Crucible-specific command stages with verified target commands and their path filters (step 4).
   - Keep Gemini as a primary worker, as in this template: `taskTypes` `implement`, `refactor` and `docs` keep `"agent": "gemini"` and `"addVerification": ["cross-model-review"]`, the `gemini` provider and the per-class `geminiModel` tiers stay, and AGENTS.md keeps its "Gemini as primary worker" section. If the target has no Antigravity CLI (`agy`), set `providers.gemini.enabled` to false and those three types back to `"agent": "codex"`, and say so in the report.
   - Add `.ccx-worktrees/` to `.gitignore`. Copy `TASK.md` and `FRICTION.md` blank (headings, comments and table header only). Leave the template's `MEMORY.md`, `HANDOFF-REPORT.md`, other handoff notes, test scripts and `prompts/` in Crucible.
   - Merge existing files. Keep the target's project-specific rules and settings, add missing workflow rules and remove exact duplicates. In `CLAUDE.md`, put `@AGENTS.md` before the Claude-specific instructions.
   - Remove Crucible-only setup instructions for components you did not copy. In `AGENTS.md` and `CLAUDE.md`, review the external tools sections together. In `HANDOFF.md`, omit the Higgsfield and external-tool sections unless those integrations are installed, and omit Judge fixtures if you did not copy the fixtures. Keep the shared Judge checklist.
3. Inspect read-only, skipping node_modules, vendor, dist, build, coverage and generated output: languages, frameworks, package manager, database, important folders, and the real dev/test/lint/typecheck/build commands from manifests, scripts and CI config.
4. Run those commands where practical and safe. Record only commands that ran successfully; list missing or failing ones separately. Do not add placeholder tests or tooling.
5. Fill Project, Stack, Folder Map and Commands in `AGENTS.md` concisely. Replace template-specific commands and file references across the copied docs, including lifting-tracker examples, while preserving the shared roles, ownership, review and safety rules. Check that the setup instructions and handoff steps point to files and commands available in the target.
6. Report: files added or merged, verified commands, missing verification, UNKNOWN / CHECKED / NEEDED items, and `git status`. Do not commit unless asked.
7. Remind me to open the repository in Codex once and trust it, so `.codex/config.toml` applies.

Do not add agents, orchestration, files or architecture beyond this template's.
