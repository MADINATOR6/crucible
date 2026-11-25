# Start Here

Your project home. The live board below is rebuilt from ccx every time a run starts or ends and whenever Obsidian opens (or run **Crucible: Refresh board**).

![[Status/Board]]

---

## Start a task
1. **Ctrl+P → Crucible: New brief.** Type the outcome, pick the owner: Automatic, Gemini, Claude or Codex. A brief opens in `tasks/`.
2. Fill in **Outcome**, **Inputs** and **Done When**, and the frontmatter `owns:` (the files the task may change) and `checks:` (permitted checks such as `sources`, `lt-unit`, `lt-browser`).
3. **Launch:** the rocket icon in the left ribbon, or Ctrl+P → **Crucible: Launch this brief**. Only this starts work. Editing, saving or a second click never starts a second run of the same brief.

Each brief ends with its own live **Status**: owner, input version, outputs (links to the real files), evidence, every run and the latest report. You can close Obsidian; the run keeps going and the Status note is waiting when you come back.

## Switch owner, answer, resume
- **Switch owner:** change `owner:` in the brief and launch again. ccx records the handoff; the new agent reads the same brief, the previous report and the outputs.
- **Answer a question:** if an agent is blocked, its question is in Status → Latest report. Write your answer under `## Answers` in the brief and launch again.
- **Stale results:** when you edit a brief after a run, its Status says STALE and the board lists it under *Needs you* until you launch again.
- **Stop:** Ctrl+P → **Crucible: Stop this brief's run**. Partial output stays in the run's capture.
- **Approvals** (push, paid actions, full access) stay in a terminal. The board prints the exact command; Obsidian never approves.

## Who leads what
| Owner | Leads | How it runs |
| --- | --- | --- |
| Gemini | research and source synthesis, creative development, storyboards, visual or video analysis, UX review (`source-research`, `creative`, `ux-review`) | Gemini CLI with the saved API key (free tier: small daily quota; the board shows when it resets): file edits allowed, shell only for permitted checks |
| Codex | implementation, debugging, automation, tests, technical verification | Codex CLI in its workspace-write sandbox |
| Claude | ambiguous projects, planning, architecture, tradeoffs, consequential reviews | headless `claude -p` from a brief; interactive Claude Code for planning sessions |
| Automatic | ccx picks by the brief's `type:` | |

A brief's `owner:` wins over these defaults. Completion still follows ccx: `ccx verify`, a review by a different agent (normal class and up), then `ccx task done`. A routine-class brief needs no review round.

## What leaves this computer
The vault is local. Launching sends the brief and whatever the agent reads to that agent's provider (Google, OpenAI or Anthropic). `nursing-a2/` and the athlete workbook are never sent: ccx refuses them as task paths and Gemini ignores them (`.geminiignore`). Put only shareable material in a brief's Inputs.

## Reference
- [[Reference/Approved examples]]: work you approved and why, for agents to match.
- [[Reference/Decisions]]: decisions worth revisiting, with the condition that reopens each.
- [[HANDOFF]] (how agents hand work over), [[AGENTS]] (rules), `ccx/policy.json` (routing, checks).
