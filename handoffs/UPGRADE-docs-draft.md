# UPGRADE-DOCS: Draft Wording for AGENTS.md, CLAUDE.md, and HANDOFF.md

Apply the `AGENTS.md` and `CLAUDE.md` edits together in the same commit (symmetry rule, line 1 of each). `UPGRADE-2` command entries (`board` split and `review-pack`) should land once those changes are implemented and verified.

---

## 1. UPGRADE-1 Item 1 — Baseline at `task add`

### `AGENTS.md` (line 152, `# Control Plane`)
- **Replace:**
  > `` 1. Register non-trivial work with `task add` (type, class, risk, owner, owns, task file). ``
- **With:**
  > `` 1. Register non-trivial work with `task add` (type, class, risk, owner, owns, task file). `task add` snapshots unrelated dirty paths for the current checkout while keeping the task `planned`; `task start`, dispatch, and direct `ccx verify` reuse that baseline in the same checkout (first start in another worktree takes its own), so pre-add dirt passes scope and files dirtied after `task add` fail. Legacy tasks without a baselines map keep the old diagnostic. ``

### `CLAUDE.md`
- No separate edit needed for Item 1: `CLAUDE.md` includes `@AGENTS.md` and does not duplicate the Control Plane task lifecycle. (Other items below update `CLAUDE.md` in the same commit.)

---

## 2. UPGRADE-1 Item 2 — Transient provider failure → exit 4, no attempt used

### `AGENTS.md` (line 240, `# Unattended Sessions`)
- **Replace:**
  > `Chain queued tasks, one at a time. Launcher exit 4 (Codex usage limit): note the reset time if given, otherwise UNKNOWN, and do non-Codex work meanwhile.`
- **With:**
  > `Chain queued tasks, one at a time. Launcher exit 4 (usage limit or transient provider capacity/5xx failure): for a usage limit, note the reset time if given, otherwise UNKNOWN, and do non-Codex work meanwhile; a transient capacity/5xx exit refunds the attempt, keeps outputs and captures, and sets no quota reset.`

### `AGENTS.md` (line 246, `# Unattended Sessions`)
- **Replace:**
  > `Usage-limit exits never count as failures.`
- **With:**
  > `Usage-limit and transient provider capacity/5xx exits (exit 4) never count as failures or use an attempt; a recovered 5xx followed by a completed turn still counts.`

### `CLAUDE.md` (line 11)
- **Replace:**
  > `When a run ends at exit 4 (any agent's usage limit), its outputs are kept and the board shows the reset; ask the user before switching owner.`
- **With:**
  > `When a run ends at exit 4 (any agent's usage limit, or a transient provider capacity/5xx failure), its outputs are kept and no attempt is used; a usage limit records the reset on the board, while a transient capacity/5xx failure sets no quota reset; ask the user before switching owner.`

---

## 3. UPGRADE-1 Item 3 — Codex-out fallback uses class-tier Gemini model; `ccx health` for `auth: account`

### `AGENTS.md` (line 182, `# Effort`)
- **Replace:**
  > `` While Codex is at its usage limit, the router falls back to Gemini CLI, then Ollama's free cloud model (policy `providers`), skipping any provider at its own limit. ``
- **With:**
  > `` While Codex is at its usage limit, the router falls back to the `gemini` provider using `classes.<class>.geminiModel` (keeping the task owner unchanged), then the next eligible fallback in policy `providers` or `defer` without looping. ``

### `AGENTS.md` (line 161, `# Control Plane`)
- **Replace:**
  > `` `ccx health` checks the stack. ``
- **With:**
  > `` `ccx health` checks the stack; for an `auth: account` provider it skips the env-key branch and, when the command exists, reports PASS with `<command> --version` output and `sign-in unknown`. ``

### `CLAUDE.md` (line 13)
- **Add after:**
  > `` `ccx route` selects class-tiered Antigravity models (`gemini-3.8-flash-low` routine, `gemini-4-neon-medium` normal, `gemini-4-neon-high` complex, `gemini-4-neon-xhigh` critical/exceptional) and steps up the model tier suffix on retries; explicit `-Model` can also target other slugs in `agy models` (noting they still bill/log under the `gemini` provider). ``
- **Add:**
  > `` When Codex is at its limit and routing falls back to the `gemini` provider, it uses the same `classes.<class>.geminiModel` selection (owner unchanged), moving to the next eligible fallback or `defer` if Gemini is blocked. ``

---

## 4. UPGRADE-1 Item 5 — Symmetry verify stage

### `AGENTS.md` (line 1)
- **Replace:**
  > `> Symmetry rule: Never update AGENTS.md without updating CLAUDE.md in the same commit, or CLAUDE.md without AGENTS.md. Every shared external tool must be available independently to both agents; document a workaround for agent-specific tools.`
- **With:**
  > `` > Symmetry rule: Never update AGENTS.md without updating CLAUDE.md in the same commit, or CLAUDE.md without AGENTS.md (a built-in `ccx verify` stage fails when uncommitted changes vs HEAD, staged or not, touch only one of the two files, and passes when both or neither change). Every shared external tool must be available independently to both agents; document a workaround for agent-specific tools. ``

### `CLAUDE.md` (line 1)
- **Replace:**
  > `> Symmetry rule: Never update AGENTS.md without updating CLAUDE.md in the same commit, or CLAUDE.md without AGENTS.md. Every shared external tool must be available independently to both agents; document a workaround for agent-specific tools.`
- **With:**
  > `` > Symmetry rule: Never update AGENTS.md without updating CLAUDE.md in the same commit, or CLAUDE.md without AGENTS.md (a built-in `ccx verify` stage fails when uncommitted changes vs HEAD, staged or not, touch only one of the two files, and passes when both or neither change). Every shared external tool must be available independently to both agents; document a workaround for agent-specific tools. ``

---

## 5. UPGRADE-1 Item 6 — `gpt-oss-120b-medium` retirement

### `AGENTS.md` (line 126, `# Roles`)
- **Replace:**
  > `` (`agy models` also lists non-Gemini slugs such as `claude-opus-5-5-*` and `gpt-oss-120b-medium`, which count against the `gemini` provider quota and board slot when chosen via explicit `-Model`). ``
- **With:**
  > `` (`agy models` also lists non-Gemini slugs such as `claude-opus-5-5-*` and `gpt-oss-120b-medium`, which count against the `gemini` provider quota and board slot when chosen via explicit `-Model`; `gpt-oss-120b-medium` retires 2026-11-30 and must not be chosen after that). ``

### `CLAUDE.md`
- No edit needed for Item 6: `CLAUDE.md` line 13 refers only to `` other slugs in `agy models` `` and does not name `gpt-oss-120b-medium`.

---

## 6. UPGRADE-2 Item B — Board split into `Status/Terminal.md`

### `AGENTS.md` (line 24, `# Commands`)
- **Add after:**
  > `` Launch registers the brief with ccx, syncs an owner change as a handoff, refuses a duplicate (exit 3), starts the run through WMI so closing Obsidian does not end it, then reruns the brief's `checks:` and `ccx verify`. ``
- **Add:**
  > `` `board` writes briefs first and open approvals to `Status/Board.md`, moves non-brief ccx tasks and raw ccx notices to generated `Status/Terminal.md` (linked in one footer line), and drops notices for tasks already done or abandoned. ``

### `CLAUDE.md` (line 11)
- **Replace:**
  > `` Do not hand-edit `Status/`; rebuild it with `scripts\crucible.ps1 board`. ``
- **With:**
  > `` Do not hand-edit `Status/`; rebuild it with `scripts\crucible.ps1 board` (`Status/Board.md` shows briefs first and open approvals; non-brief ccx tasks and raw ccx notices move to `Status/Terminal.md`, linked in one footer line, and notices for done or abandoned tasks are dropped). ``

---

## 7. UPGRADE-2 Item C — `crucible.ps1 review-pack`

### `AGENTS.md` (line 24, `# Commands`)
- **Add after** the Item B `board` sentence above (keeping `review-pack` separate from `The Obsidian plugin runs exactly these.`):
- **Add:**
  > `` `scripts\crucible.ps1 review-pack -TaskId <id>` (with `-Base <ref>` when no start HEAD is recorded) writes `handoffs/<id>-review.md` for a blind review in the Antigravity IDE—holding the diff range, changed paths, task file path, HANDOFF.md's Plan critique checklist, the latest report's `Untested:` lines if recorded, and `Reference/Review checklist.md` when present—and never calls `agy` or any model. ``

### `CLAUDE.md` (line 11)
- **Add after:**
  > `HANDOFF.md, Briefs from Obsidian, is the contract for every owner.`
- **Add:**
  > `` For a blind review in the Antigravity IDE, `scripts\crucible.ps1 review-pack -TaskId <id>` (with `-Base <ref>` when no start HEAD is recorded) writes `handoffs/<id>-review.md` from the diff range, changed paths, task file path, HANDOFF.md's Plan critique checklist, the latest report's `Untested:` lines if recorded, and `Reference/Review checklist.md` when present; it never calls `agy` or any model. ``

---

## 8. Separate Entry — `HANDOFF.md` exit-code line for 4

### `HANDOFF.md` (line 101, `### Launcher (repo root)`)
- **Replace:**
  > `` - 4: Codex usage limit. Do non-Codex work. `RESETS:` gives the time when Codex states one; with `-TaskId` it is recorded, and routing defers until then. ``
- **With:**
  > `` - 4: usage limit, or a transient provider capacity/5xx failure: no attempt used. For a usage limit, do non-Codex work; `RESETS:` gives the time when stated, and with `-TaskId` it is recorded and routing defers until then. A transient capacity/5xx failure keeps outputs and captures and does not set `unavailableUntil` or `providerLimits` (a recovered 5xx followed by a completed turn still counts). ``
