Follow HANDOFF.md, Planner instruction (it replaces the Researcher instruction for this task).

# FABLE-UP plan brief

Plan only; do not edit files.

## Goal

The user has time-limited access to a stronger Claude model (Fable 5.2) and will run ONE session with it on this repo. Plan the prompt for that session: what the Fable session should build so that the repo is measurably better afterwards WITHOUT Fable. The improvements must be durable repo artifacts that Opus, Sonnet and Codex (gpt-6.x) can use with no access to Fable.

## User requirements

- Everything Fable produces must keep working after Fable access ends. Nothing may depend on a Fable model id. `ccx/policy.json` must not name Fable.
- The user wants to use the repo soon after the session, so the work must land as small, reviewable, verified increments, not one big branch. The session may be cut off at any point, so the order must put the highest-value, lowest-risk items first and every step must be interruptible.
- Codex plans this prompt (you); Claude critiques it before it is written to `prompts/fable-upgrade.md`.
- The Fable session uses the repo's normal rules: ccx tasks, Dispatch mode, Codex as planner and verifier, ccx owns "done".

- ADDED REQUIREMENT (user, after dispatch): the session must also make Claude and Codex themselves better at working here, not only the repo's scripts and docs. Plan workstreams that raise what each agent does by default after Fable is gone: for Claude, `.claude/skills/`, `.claude/agents/*.md` prompts, project memory under the Claude memory folder, the judge and critique skills; for Codex, the Planner, Implementer, Verifier and Researcher instruction text in HANDOFF.md, `.codex/` config and rules, and the report format it must follow. Each such workstream needs an evidence-based reason (a recurring failure in FRICTION.md, a Codex report that was refused, a plan Claude had to rewrite) and a way to test that it works for the weaker model (a fixture, a dry-run dispatch, a checklist run). Keep the symmetry rule: anything given to one agent is available to the other, or has a documented workaround. User-level files (`~/.claude`, `~/.codex`) stay out of scope unless the prompt marks them as a separate step that needs the user's approval.

## Known constraints

- AGENTS.md is binding. Symmetry rule: AGENTS.md and CLAUDE.md change together in the same commit. Windows PowerShell 5.1, ASCII-only `.ps1`, no push or PR without `ccx gate`, commit messages carry no trailers, only commands that have run successfully go in AGENTS.md Commands.
- The main checkout has about 40 uncommitted or untracked paths that belong to the user (finance-shorts, tools/crucible-cockpit, roblox-videos, video_ops, wallpaper, playbook, several tasks/ and prompts/ files). The prompt must tell the Fable session to isolate its work (worktree) and never touch, stage or delete them.
- `prompts/crucible-overall-upgrade.md` (dated 2026-10-07) is an older long-run brief for hooks, MCP, CI and observability. Decide, with evidence, what to reuse, what is stale and what to leave out. Do not simply copy it.
- Private paths (`ccx/policy.json` `privacy.excludePaths`, `*.xlsx`) are never read.
- `ccx/policy.json` currently names `claude-opus-5-5`, `claude-sonnet-5` and `claude-haiku-4-5-20251001`. Whether to refresh those ids is a separate small decision; flag it, do not assume it.

## Questions to answer (ground each in path:line or ccx/telemetry evidence)

1. Where does Crucible lose time or quality today? Use FRICTION.md (counts), `ccx status`, task history in `tasks/` and `ccx` telemetry. Which of those a stronger model could fix once by writing something durable (a rubric, a deterministic check, a template, a fixture set, a playbook) rather than by being smart at run time?
2. Which of these workstreams are worth including, which should be dropped, and what is missing? Claude's candidates, to be challenged and not taken as given:
   a. Plan/spec critique rubric with worked good-vs-bad examples in HANDOFF.md, so weaker models apply the same scrutiny.
   b. More deterministic `ccx verify` stages and `scripts/test-*.ps1` cases for failure modes models miss (weakened tests, scope creep, unrun "done" claims).
   c. A fixture set of past diffs and reports with expected judge verdicts, to test `/fable-judge` and the Codex verifier on weaker models.
   d. Written playbooks: routing and escalation reasoning, Higgsfield shot planning.
   e. Finishing open plans already in the repo (`tasks/LT-NEXT-plan.md`, `prompts/higgsfield-video-pipeline.md`).
   f. Refreshing stale model ids in policy and ARCHITECTURE.
3. For each included workstream: the write allowlist, Done When items that are checkable by a command, the Verify commands (existing ones only), and the risk class. Mark which need a Codex verifier run.
4. Order and sizing for a session of unknown length: what ships first, the commit and checkpoint cadence, and how a fresh session resumes (use MEMORY.md and the existing task machinery, not a new mechanism).
5. How the prompt should make Fable's judgment survive: what to record, where, and in what form (rules and checks, not prose summaries).
6. What the prompt must forbid or guard against (scope creep, touching the user's uncommitted work, new dependencies, Fable-specific wording in shipped files, publishing the live app by accident since a push under `lifting-tracker/` republishes it).

## Relevant paths

- `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`, `FRICTION.md`, `MEMORY.md`, `ccx/policy.json`, `ccx/ARCHITECTURE.md`
- `scripts/ccx*.ps1`, `scripts/test-*.ps1`, `scripts/codex-dispatch.ps1`
- `.claude/skills/fable-judge/`, `.claude/agents/*.md`
- `prompts/crucible-overall-upgrade.md`, `prompts/higgsfield-video-pipeline.md`, `tasks/LT-NEXT-plan.md`

## Output wanted

The standard plan report, where "Approach" is the outline of the Fable prompt (sections and the content of each), with the workstream list in priority order.
