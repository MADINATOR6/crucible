# Writing a Brief

A brief is your contract with an AI agent. A clear brief lets Gemini, Codex, or Claude finish a task in one run without stopping to ask questions.

## 1. Create and Configure
Start with `Ctrl+P → Crucible: New brief`, which creates a file in `tasks/`.

### Frontmatter
* **owner**: Pick the agent that fits the task, or `auto` so ccx picks by `type:`.
  * `gemini`: research, source synthesis, creative work, visual/video or UX review.
  * `codex`: implementation, debugging, automation, tests, technical verification.
  * `claude`: ambiguous projects, planning, architecture, tradeoffs, consequential reviews.
> "Type the outcome, pick the owner: Automatic, Gemini, Claude or Codex." — [Start Here.md](<../Start Here.md>)
* **type**: Matches the kind of work (for example `source-research`, `creative`, `ux-review`, `implement`, `debug`, `docs`, `plan`).
> "Research or source synthesis that ends in a deliverable file; quotes source passages (check: sources)." — [ccx/policy.json](../ccx/policy.json)
* **owns**: The **write allowlist**—list the exact files the agent may change. Briefs launched from Obsidian cannot own protected paths (such as `AGENTS.md`, `scripts/`, or `ccx/`).
> "Do not modify files outside the task's write allowlist." — [AGENTS.md](../AGENTS.md)
* **checks**: Choose only permitted check IDs from `ccx/policy.json`:
  * `sources`: verifies quoted passages exist verbatim in cited files (use for research/synthesis).
  * `lt-unit`: runs Lifting Tracker unit tests (`node --test`).
  * `lt-browser`: runs the full Lifting Tracker Playwright smoke suite.
  * `lt-persist`: runs the Android reload-persistence smoke test.
> "Fill in **Outcome**, **Inputs** and **Done When**, and the frontmatter `owns:` (the files the task may change) and `checks:` (permitted checks such as `sources`, `lt-unit`, `lt-browser`)." — [Start Here.md](<../Start Here.md>)
> "Every quoted source passage in the deliverable exists verbatim in the cited file." — [ccx/policy.json](../ccx/policy.json)

## 2. Define the Work
### Outcome
Describe the exact finished result in plain words: what file or change should exist when the run ends.

### Inputs
List only the files the agent needs to read. Launching sends the brief and read files to the agent's provider. Keep the athlete workbook and `nursing-a2/` out of the brief.
> "Put only shareable material in a brief's Inputs." — [Start Here.md](<../Start Here.md>)

### Done When
Write a checklist of observable, checkable criteria—avoid vague goals like "works correctly".
> ""Works correctly" is not checkable." — [HANDOFF.md](../HANDOFF.md)
> "Requested behaviour works and appropriate verification passes with evidence." — [AGENTS.md](../AGENTS.md)

## 3. Running and Feedback
### Launching
Click the **rocket icon** in Obsidian or run `Ctrl+P → Crucible: Launch this brief`.

### Answering a Blocked Agent
If the agent reports `BLOCKED`, look for its question under **Status → Latest report**.
> "Write your answer under `## Answers` in the brief and launch again." — [Start Here.md](<../Start Here.md>)
> "If something material is unverified, report UNKNOWN (what is uncertain), CHECKED (what was inspected) and NEEDED (what would resolve it)." — [AGENTS.md](../AGENTS.md)

### Switching Owner
To hand off mid-task, change `owner:` and launch again; the next agent resumes from the brief, latest report, and outputs.

---
*Suggestion: Keep each brief focused on one logical change to limit context and risk.*
