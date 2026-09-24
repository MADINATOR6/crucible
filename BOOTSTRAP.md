# Bootstrap a real repository

Not copied into projects. In Claude Code opened in the target repository, say:
"Follow <path to your claude-codex-collab clone>/BOOTSTRAP.md for this repo."
(On this author's PC: `C:\Users\Madison\code\claude-codex-collab`. Clone https://github.com/MADINATOR6/claude-codex-collab elsewhere.)

---

Apply the Claude Code + Codex workflow from the folder containing this BOOTSTRAP.md (the template) to this repository.

1. Run `git status`. Note existing uncommitted work and do not modify, stage or commit it.
2. Bring in AGENTS.md, CLAUDE.md, HANDOFF.md, TASK.md, FRICTION.md, handoffs/TEMPLATE.md, scripts/codex-dispatch.ps1 and .codex/config.toml. If a file already exists, merge it: keep project-specific content, add missing workflow rules, remove only exact duplicates. For an existing CLAUDE.md, put `@AGENTS.md` first and keep its Claude-specific lines. Never overwrite blindly.
3. Inspect read-only, skipping node_modules, vendor, dist, build, coverage and generated output: languages, frameworks, package manager, database, important folders, and the real dev/test/lint/typecheck/build commands from manifests, scripts and CI config.
4. Run those commands where practical and safe. Record only commands that ran successfully; list missing or failing ones separately. Do not add placeholder tests or tooling.
5. Fill Project, Stack, Folder Map and Commands in AGENTS.md concisely. Keep the workflow sections unchanged; merged project-specific rules may stay.
6. Report: files added or merged, verified commands, missing verification, UNKNOWN / CHECKED / NEEDED items, and `git status`. Do not commit unless asked.
7. Remind me to open the repository in Codex once and trust it, so `.codex/config.toml` applies.

Do not add agents, orchestration, extra files or architecture.
