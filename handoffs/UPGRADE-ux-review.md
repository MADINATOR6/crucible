# UPGRADE-2-UX: Five Biggest Friction Points in the Obsidian Flow

Walkthrough of the Obsidian workflow (`Start Here.md` → writing a brief → launching → reading the board and status → answering/switching/stopping) from the perspective of a non-programmer working in Obsidian.

Per `tasks/UPGRADE-2-UX.md`, the top two items have their smallest fixes inside `scripts/crucible.ps1` or `.obsidian/plugins/crucible/`.

---

## 1. New briefs are created unlaunchable and hide required fields (`owns:`, `type:`) behind raw YAML

- **Fix type:** `judgement` (small design decision on which `type:` options and default output path to expose in the modal)
- **File to touch:** `.obsidian/plugins/crucible/main.js`

**What the user sees / has to do**
1. The user runs `Ctrl+P → Crucible: New brief`. The modal only asks for **Outcome (title)** and **Owner** (defaulting to `Automatic (ccx picks)`).
2. When the brief opens in Obsidian, `owns:` is empty (`[]`) and `type:` is silently set to `implement` for every owner except `gemini`.
3. The hints explaining `owns:`, `type:`, and `checks:` are written as YAML `#` comments inside frontmatter, which Obsidian's default Properties UI hides.
4. If the user fills in the body and presses the rocket button without editing `owns:`, launch fails; if they leave `owner: auto`, `type: implement` silently routes the task to Codex regardless of what kind of work they meant.

**Why it costs them**
Every new brief either fails on the first launch or routes to the wrong agent, forcing a non-programmer to guess YAML syntax, switch to Source Mode to see hidden comments, or read `ccx/policy.json` to discover valid `type:` and `checks:` values.

**Evidence**
> ".addOptions({ auto: 'Automatic (ccx picks)', gemini: 'Gemini', claude: 'Claude', codex: 'Codex' })" — [.obsidian/plugins/crucible/main.js:15](../.obsidian/plugins/crucible/main.js)
> "$briefType = if ($Type) { $Type } elseif ($Owner -eq 'gemini') { 'source-research' } else { 'implement' }" — [scripts/crucible.ps1:128](../scripts/crucible.ps1)
> "owns: []            # files or folders this task may change, e.g. [Reference/My note.md]" — [scripts/crucible.ps1:138](../scripts/crucible.ps1)
> "if (-not $fm.owns.Count) { Fail 'owns: list the files or folders this task may change (the deliverable).' }" — [scripts/crucible.ps1:81](../scripts/crucible.ps1)

**Smallest fix**
In `.obsidian/plugins/crucible/main.js`, add a **Work type** dropdown (passing `-Type`, which `scripts/crucible.ps1:17,128` already accepts) and an **Output file (`owns`)** text field to `NewBriefModal`, then populate `owns` in the newly created brief's frontmatter via Obsidian's `fileManager.processFrontMatter` before opening it.

---

## 2. The home board buries active briefs under raw terminal notices, approvals, and 27 non-brief tasks

- **Fix type:** `mechanical`
- **File to touch:** `scripts/crucible.ps1`

**What the user sees / has to do**
Opening `Start Here.md` immediately embeds `Status/Board.md` at the top. Currently `Status/Board.md` is 75 lines long and dominated by:
- Terminal-only approval commands with 40-character git SHAs (`A-0118`, `A-0129`, `A-0149`).
- Five raw `ccx notices:` lines (`dispatch 2 ended exit 3 status NONE; suggested route: ...`), including notices for tasks that are already `Done`, with no way to dismiss them from Obsidian.
- Fifteen `Done this week` entries (including abandoned terminal/media runs) and 27 `Other open ccx tasks (not briefs)` rows (`CRU-21` through `CRU-45`, etc.) that push the `Start Here.md` guide (`## Start a task`, `## Switch owner, answer, resume`) completely off-screen.

**Why it costs them**
The home screen reads like a developer log instead of a task board. The user has to scroll past 50+ lines of irrelevant terminal tasks and stale error notices just to find their own briefs or the instructions, and risks wasting time investigating notices for tasks that already finished.

**Evidence**
> "![[Status/Board]]" — [Start Here.md:5](<../Start Here.md>)
> "$actions = @($state.notifications | Where-Object { $_.level -eq 'action' -and -not $_.ack } | Select-Object -Last 5)" — [scripts/crucible.ps1:423](../scripts/crucible.ps1)
> "$board += & $section 'Other open ccx tasks (not briefs)' 'other' 'None.'" — [scripts/crucible.ps1:437](../scripts/crucible.ps1)
> "## Other open ccx tasks (not briefs)" — [Status/Board.md:48](../Status/Board.md)

**Smallest fix**
In `scripts/crucible.ps1` (`Invoke-Board`), keep `Status/Board.md` focused on Obsidian briefs: move `Other open ccx tasks (not briefs)` and raw `ccx notices:` into a separate generated `Status/Terminal.md` linked in one short footer line (and skip notices whose task is already `done` or `abandoned`).

---

## 3. Normal Obsidian use during a run triggers a false-positive `SECURITY:` lockdown

- **Fix type:** `mechanical`
- **File to touch:** `ccx/policy.json`

**What the user sees / has to do**
While an agent runs in the background, the user clicks another note or pane in Obsidian. Obsidian automatically updates `.obsidian/workspace.json`. Because all of `.obsidian/` is listed in `agentProtectedPaths`, `Invoke-Run` detects the file change, skips all checks and `ccx verify`, and places a `SECURITY:` warning at the top of **Needs you** telling a non-programmer to `Review and undo them (git diff) before running anything else.`

**Why it costs them**
Ordinary Obsidian navigation breaks verification on a healthy run and confronts the user with an alarming security message and a `git diff` instruction they cannot act on inside Obsidian.

**Evidence**
> "".git/config", ".git/hooks/", ".obsidian/", "scripts/", "ccx/"" — [ccx/policy.json:138](../ccx/policy.json)
> "SECURITY: the last run changed protected launcher files ($($tamperedPaths -join ', ')). Checks and verify were skipped. Review and undo them (git diff) before running anything else." — [scripts/crucible.ps1:366](../scripts/crucible.ps1)
> "SECURITY: the last run changed protected launcher files (.obsidian/workspace.json). Checks and verify were skipped." — [Status/Board.md:5](../Status/Board.md)

**Smallest fix**
In `ccx/policy.json` (`agentProtectedPaths`, line 138), replace `.obsidian/` with the specific executable/config paths that need protection (`.obsidian/plugins/`, `.obsidian/community-plugins.json`, `.obsidian/app.json`, `.obsidian/core-plugins.json`) so Obsidian's ephemeral `workspace.json` layout state does not trigger tamper detection.

---

## 4. Launching gives no running indicator, hides errors in a disappearing toast, and offers no `-Again` re-run command

- **Fix type:** `mechanical`
- **File to touch:** `.obsidian/plugins/crucible/main.js`

**What the user sees / has to do**
1. The rocket ribbon icon is active on every Markdown file; `activeBrief()` only checks `file.extension !== 'md'`, so clicking it while viewing `Start Here.md` or a reference note says `Launching Start Here...`, runs PowerShell, and fails with a toast.
2. Errors only appear in a disappearing 12-second `Notice` toast; successful launches show a 6-second toast and then total silence with no status-bar indicator or completion notice.
3. If the user wants to re-run an unchanged brief (for example after a `PARTIAL` result), `crucible.ps1` refuses with `Edit the brief, or launch with -Again.` — but the Obsidian plugin has no command that passes `-Again`.

**Why it costs them**
Users accidentally launch non-briefs, lose long validation messages when the toast disappears, cannot tell whether a background run is still active without manually opening `Status/`, and hit a dead-end `-Again` instruction that cannot be executed from Obsidian.

**Evidence**
> "if (!file || file.extension !== 'md') { new Notice('Open a brief first.'); return null; }" — [.obsidian/plugins/crucible/main.js:57](../.obsidian/plugins/crucible/main.js)
> "new Notice(r.out || (r.code === 0 ? 'Launched.' : 'Launch failed.'), r.code === 0 ? 6000 : 12000);" — [.obsidian/plugins/crucible/main.js:69](../.obsidian/plugins/crucible/main.js)
> "already ran on this exact brief ($($task.lastDispatch.endedAt)); see its Status. Edit the brief, or launch with -Again." — [scripts/crucible.ps1:197](../scripts/crucible.ps1)

**Smallest fix**
In `.obsidian/plugins/crucible/main.js`, validate that the active file is in `tasks/` with `crucible: brief` frontmatter in `activeBrief()` before invoking PowerShell, add a `Crucible: Re-run this brief` command passing `['launch', '-Note', file.path, '-Again']`, and show an active-run indicator in Obsidian's status bar from `Status/.runs/`.

---

## 5. Finished and `BLOCKED` briefs hit a dead end: raw handoff dumps bury questions, and "Ready to review" has no clear next action

- **Fix type:** `judgement` (design decision on how much of review/close stays in terminal vs Obsidian, and whether to summarize `Latest report`)
- **File to touch:** `scripts/crucible.ps1`

**What the user sees / has to do**
1. When a brief finishes (`exit 0`), the board says `Ready to review: open the outputs below; a second agent reviews before ccx task done.` Unlike approvals, no exact command or Obsidian action is given; switching `owner:` and clicking Launch starts another *implement* run rather than a review or close.
2. When an agent is `BLOCKED`, `Start Here.md` tells the user to find its question in `Status → Latest report` and reply under `## Answers`. In the generated Status note, `Latest report` sits near the bottom after `Outputs`, `Evidence`, and `Runs` (whose UTC timestamps disagree with the local-time header) and dumps the entire raw handoff template (`Task / start HEAD`, `Intent / Twins`, `Final git status --short`), burying the actual question.

**Why it costs them**
The user cannot tell how to close a finished brief (leaving completed briefs stuck in `Ready to review` or triggering redundant implement runs), and has to wade through technical boilerplate to find a simple question when an agent is blocked.

**Evidence**
> "Ready to review: open the outputs below; a second agent reviews before ccx task done." — [scripts/crucible.ps1:383](../scripts/crucible.ps1)
> "if an agent is blocked, its question is in Status → Latest report. Write your answer under `## Answers` in the brief and launch again." — [Start Here.md:18](<../Start Here.md>)
> "$out += @($View.report -split '\r?\n' | ForEach-Object { '> ' + $_ })" — [scripts/crucible.ps1:493](../scripts/crucible.ps1)

**Smallest fix**
In `scripts/crucible.ps1` (`Get-TaskView` and `Format-StatusNote`), extract and hoist `NEEDED:` / agent questions into a top callout whenever a run is `BLOCKED`, format `Runs`/`History` timestamps in local time to match the header, and include explicit next-step guidance (or the exact terminal command) in the `Ready to review` message.

---

Status: READY_FOR_CLAUDE_REVIEW
Untested: `node scripts/check-sources.mjs handoffs/UPGRADE-ux-review.md` (shell disallowed in headless Gemini run; launcher/reviewer to verify quotes) - launcher / codex
Next owner: codex - plans the top two
