# ccx: the Claude + Codex control plane

ccx turns this workflow template into a self-routing, verified, human-governed Claude Code + Codex system. It is a set of PowerShell 5.1 scripts plus one policy file:
- no daemon, service, database or network gateway;
- no new dependencies.

Read this file on demand. AGENTS.md and HANDOFF.md hold the rules every session needs.

Everything is opt-in: plain Dispatch (`scripts\codex-dispatch.ps1` without `-TaskId`) works exactly as before.

## 1. Architecture

```
USER ──> Claude Code session (orchestrator: AGENTS.md, HANDOFF.md)
           │
           ├── Master Computer view ........ ccx status
           ├── Kairos-style runtime ........ ccx event / tick / runtime   (when work happens)
           ├── OMNIROUTE ................... ccx route + ccx/policy.json  (who, which model, what effort)
           ├── Orchestrator ................ Claude + ccx task           (decompose, sequence, merge)
           │
           ├── Workers
           │     Codex ..................... scripts\codex-dispatch.ps1 [-TaskId]  (gpt-6-astra)
           │     Claude .................... this session (claude-opus-5-5)
           │     Claude subagents .......... .claude/agents/ccx-scout (haiku), ccx-reviewer (opus)
           │     Codex subagents ........... ~/.codex/agents (user's: researcher/worker/advisor)
           ├── MCP / tools ................. policy mcp section + agent tool allowlists
           ├── Isolated worktrees .......... ccx worktree add|list|prune, ccx merge-check
           ├── Verification pipeline ....... ccx verify, launcher post-checks, task review
           ├── Approval gate ............... ccx gate / approve / deny
           └── Merge / action .............. Claude commits and merges (L3); push after approval (L4)
```

Responsibilities stay separate:

| Layer | Question it answers | Component |
|---|---|---|
| Runtime | When should work happen? | durable event queue, idempotent `tick`, stale scan |
| OMNIROUTE | Which route, agent, model and effort? | `ccx route`: deterministic rules from the policy, no LLM |
| Orchestrator | How is work split, ordered and merged? | Claude, recorded with `ccx task` |
| Worker | Do the task | Codex dispatch, Claude, subagents |
| Verifier | Is it correct, safe and complete? | `ccx verify`, a cross-model review, the Codex verifier role |
| Approval gate | Is this consequential action authorised? | `ccx gate`, and a human through `ccx approve` |

## 2. Files

| Path | Role |
|---|---|
| `ccx/policy.json` | All tunables: models, effort ladder, classes and budgets, task types, permission levels, runtime, redaction patterns, memory limits, verify stages, worktrees, MCP scopes |
| `scripts/ccx.ps1` | CLI entry point |
| `scripts/ccx-core.ps1` | State store and lock, tasks and ownership, router, gate, events, telemetry, redaction, quick checks |
| `scripts/ccx-ops.ps1` | Tick and runtime, verify pipeline, memory lint, worktrees, merge-check, health, status |
| `scripts/codex-dispatch.ps1` | Codex launcher; `-TaskId` ties a dispatch to ccx |
| `scripts/test-ccx.ps1`, `scripts/test-ccx-ops.ps1` | Regression tests; isolated temp state, never the real one |
| `.claude/agents/ccx-scout.md`, `ccx-reviewer.md` | Scoped Claude subagents |
| `tasks/<ID>.md` | Task specs when several Dispatch tasks run at once; TASK.md stays the single-task default |
| `<git common dir>/ccx/` | Shared state (never committed): `state.json` (+ `.bak`), `state.lock`, `history.jsonl`, `telemetry.jsonl`, `logs/` |

Run any command as `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 <command> ...`. Below it is written `ccx <command>`.

## 3. Everyday flow

```
ccx route -Type git-state                        # deterministic: no LLM, just run the tool
ccx task add -Id T7 -Title "..." -Type implement -Class normal -Risk low -Owner codex -Owns scripts/foo.ps1 -TaskFile tasks/T7.md
ccx route -TaskId T7                              # codex gpt-6-astra medium, budget, verification list
ccx worktree add -TaskId T7                       # optional isolation: .ccx-worktrees/codex-T7 on codex/t7
scripts\codex-dispatch.ps1 -TaskId T7             # from the task's worktree; routed model and effort
ccx task escalate -Id T7 -Reason "..."            # only when route says premium: hands the task to Claude
ccx verify -TaskId T7                             # full pipeline; records the fingerprint
ccx task review -Id T7 -Result pass -By claude    # cross-model review (the author cannot review)
ccx task done -Id T7                              # refused unless verification and reviews are satisfied
ccx merge-check -Branch codex/t7                  # conflicts and scope before merging
ccx gate -Action push -Target origin/main         # L4: approval required before pushing
ccx status                                        # Master Computer view
```

## 4. OMNIROUTE routing

`ccx route` is deterministic. The same inputs, policy and telemetry always give the same decision, and it never calls a model or the network.

Routing priority, cheapest reliable route first:

| Rung | Route | Meaning in this repo |
|---|---|---|
| 1 | `tool` | A deterministic command answers it: git state, file listing, search, lint/parse, tests, health. `llmRequired: false` |
| 2 | (procedure) | Existing result: check `ccx status`, MEMORY.md and the task history before asking a model. Not automated |
| 3 | `script` | Mechanical change: the agent writes or reuses a script, and the script makes the edits |
| 4 | `cheap` | `ccx-scout` (Claude Haiku, read-only) for extraction, or Codex `-Role research` at the class's low effort |
| 5 | `worker` | Codex implements, refactors, writes tests and debugs; Claude writes docs; the reviewer is the other model |
| 6 | `premium` | Claude lead (Opus 5.5) for architecture and planning, or as the escalation when the retry cap is reached |
| 7 | `mythos` | Escalation-only tier; see 5.2 |
| - | `defer` | Codex is at its usage limit until a recorded time: do non-Codex work |
| - | `surface` | Caps exhausted: stop retrying, collect evidence, decide on evidence or ask the user |

Inputs: task type (see `taskTypes` in the policy), class (routine, normal, complex, critical, exceptional), risk (low, medium, high), attempt, ambiguity, author (for reviews), and a mythos request.
- High risk raises the class to at least complex and adds an independent verifier.
- Every decision is logged: `state.routingLog` and telemetry.

**Adaptive routing** (bounded by `adaptive` in the policy) reads telemetry for the same type, agent and effort:
- After at least `minSamples` accepted tasks with a first-try rate of at least 0.9, it steps effort down one level, never below the class minimum.
- A dispatch failure rate of at least 0.5 steps it up one level, never above the class maximum.
- It never changes permissions, and never switches agents (`allowAgentSwitch: false`).

## 5. Models and effort

| Agent | Model | Set in |
|---|---|---|
| Claude (lead, orchestrator) | claude-opus-5-5 | the session; policy `models.claude.lead` |
| Claude cheap subagent | claude-haiku-4-5 (`ccx-scout`) | `.claude/agents/ccx-scout.md` |
| Claude independent reviewer | opus, effort high (`ccx-reviewer`) | `.claude/agents/ccx-reviewer.md` |
| Codex dispatches | gpt-6-astra; falls back to gpt-6-sol, then gpt-5.6-sol, when the catalog lacks it | policy `models.codex` |
| Codex everyday use (outside dispatches) | the user's global default (gpt-6-sol, medium) | `~/.codex/config.toml`, unchanged |

Effort by class (Codex base → max; Claude base → max):

| Class | Codex | Claude | Typical work |
|---|---|---|---|
| routine | low → medium | medium | small edits, deterministic-adjacent |
| normal | medium → high | medium → high | ordinary engineering |
| complex | high → xhigh | high → xhigh | hard debugging, architectural change |
| critical | xhigh | xhigh → max | ambiguous, cross-system, high consequence |
| exceptional | xhigh → max | max | one-off migration, deep audit |

- **Escalation:** a failed attempt or declared ambiguity raises effort one step (for example high → xhigh), capped by the class. max needs at least two failed attempts. The first upgrade ran Claude at max and Codex at high, with xhigh only for hard review or unresolved failures.
- **Retry cap:** past `maxDispatches`, the route becomes `premium` (the Claude lead) while `maxModelEscalations` allows it; otherwise it becomes `surface`.
- **Recording an escalation:** `ccx task escalate -Id X -Reason "..."`. The owner becomes Claude, attempts restart, and the task routes at the class's maximum Claude effort. Failed attempts from before the escalation still count toward max. A further escalation beyond the cap exits 8.
- **Owner decides the agent:** a task's own type of work routes to its owner, so a Claude-owned `implement` task goes to Claude. The launcher refuses to dispatch it.

### 5.1 Adding or removing a model
- Edit `ccx/policy.json` (`models.*`, `fallbacks`). No code change is needed.
- `ccx health` checks the Codex default against the local catalog (`%USERPROFILE%\.codex\models_cache.json`).
- To remove a model, take it out of `default`/`fallbacks`. Retiring models show an `upgrade` note in that catalog (for example gpt-5.5 on 2026-10-14).

### 5.2 Mythos-class tier
Mythos-class is an escalation tier, not a worker.
- Policy `models.mythos.available` is false, so a mythos request falls back to Claude Opus at max, then Codex at xhigh.
- If the account gains legitimate, authorised access, set `available`, `agent` and `model`. Even then:
  - the tier serves only the `exceptional` class;
  - its decisions carry permission level L0, analysis only;
  - independent review, deterministic tests and, for consequential actions, human approval must follow before anything executes.
- ccx never probes providers, spoofs model identifiers or works around access controls.

### 5.2a Codex model per class
A class's `codexModel` overrides `models.codex.default`: routine and normal work use `gpt-6.1-sol` (the catalog's latest workhorse) and save `gpt-6-astra` (frontier) quota for complex and higher classes. A model missing from the catalog falls back to the default, then `fallbacks`. `ccx health` line `codex-updates` warns when the catalog ranks a model above every policy model, or a policy model is retiring.

### 5.3 Other providers (Ollama, LM Studio, DeepSeek, Gemini)
- **Fallback chain while OpenAI Codex is at its limit:** `gemini`, then `ollama-cloud`, then defer. A provider that hits its own limit is recorded in `state.providerLimits` (reset time, else the 60-minute backoff) and skipped until then; that run does not use a retry. Verified live 2026-10-01: Codex out, Gemini quota hit and recorded, Nemotron finished the task (110 s, scope PASS).
- **Active: `gemini`** runs Google's Gemini CLI (`gemini.cmd`, npm `@google/gemini-cli`), not Codex, with the `GEMINI_API_KEY` saved for the Windows user (the launcher passes it to the child only). Google's free sign-in tier refused this client on 2026-10-01; the free API tier allows 20 requests a day (one to three small tasks). Gemini has no sandbox on Windows, so the launcher never uses yolo: `auto_edit` (file edits, no shell) for implement, `plan` (read-only) for other roles. It reads the JSON result (`-o json`) for the report and token counts.
- **Active: `ollama-cloud`** (`nemotron-3-super:cloud`, Ollama's free cloud plan through the signed-in local Ollama app). It is the fallback while OpenAI Codex is at its usage limit. It passed a one-file `codex exec` edit (slow, token-heavy, summary misnamed the file), so its work gets the usual post-checks and review. On the free plan, DeepSeek, GLM, Kimi and MiniMax cloud models return 402; gpt-oss:120b answered but printed its tool call as text.
`policy.providers` lists models Codex can run besides OpenAI's. The router uses one only when it is ready, so nothing changes until the user sets it up:
- **Local** (`ollama`, `lmstudio`): ready when its CLI (`ollama` / `lms`) is on PATH. It takes the **first attempt of routine work** only; a retry goes back to the OpenAI model. The launcher adds `--oss --local-provider <name>` and the policy's model. The user installs the app and pulls the model; ccx never downloads anything. A provider's `reasoningEffort` replaces the effort Codex sends (small models reject thinking requests; `none` works). Both ship **disabled**: on this PC (4 GB GPU, Ollama 0.35.0 installed 2026-10-01) `qwen2.5-coder:3b` printed a fake tool call and `qwen3:4b` found no file tool, so neither completed a one-file `codex exec` edit. Enable one only after its model passes that test.
- **Cloud** (`deepseek`, `gemini`): ready when the provider is enabled **and** its key env var is set. Setting the key is the opt-in to send task code to that company. It runs only as a **fallback while OpenAI Codex is at its usage limit**; without one, the route defers as before. Both ship **disabled**: Codex CLI now accepts only `wire_api = "responses"` provider blocks (chat was removed, verified 2026-10-01), and these endpoints serve chat completions. Enable one once it, or a local proxy, serves `/v1/responses` and `~/.codex/config.toml` has a matching `[model_providers.<name>]` block.
- A provider's own usage limit is not recorded as an OpenAI Codex limit. Telemetry and `lastDispatch` record `provider`.
- `ccx health` shows one `provider-<name>` line each: installed or not, key set or not (never the value), and a WARN when a key is set without the Codex config block.
- Policy validation keeps provider names, flags, commands, env key names and models to plain characters, since they reach the Codex command line.

## 6. Claude ↔ Codex contract

- **Default roles:** Claude plans, orchestrates and reviews. Codex implements. The other model reviews the author's work, and ccx enforces it: `task review -Kind review` refuses the task owner. Identical tasks never go to both.
- **Handoff:** a task spec (TASK.md, or `tasks/<ID>.md` for concurrent tasks) plus `ccx task add` with type, class, risk, owner, owns and taskFile. Claude then runs the launcher with `-TaskId`.
- **Return:** Codex replies in HANDOFF.md's Report format. The launcher records the status line, tokens, exit code and post-checks in the task's `lastDispatch`, writes telemetry and queues a `dispatch-finished` event.
- **Caps:**
  - at most `maxReviewCycles` review cycles (2 for complex and above; `task review` exits 8 at the cap);
  - at most 2 architecture challenge rounds, then the orchestrator decides on evidence or asks the user.

## 7. Subagents

Default topology: 1 orchestrator (Claude), 1 worker (usually Codex) and 1 verifier (deterministic checks plus the other model).

| Agent | Tools | Use |
|---|---|---|
| `ccx-scout` | Read, Grep, Glob; Haiku; 20 turns | cheap extraction and file scoping |
| `ccx-reviewer` | Read, Grep, Glob, shell; Opus, high; 40 turns | independent verification when Codex is unavailable, or a second opinion on risky work |
| Codex `-Role verify` / `-Role research` | read-only sandbox | adversarial verification; sourced research |
| user's Codex agents | inside Codex | Codex delegates on its own (`~/.codex/AGENTS.md`) |

**Adding an agent:**
1. Add `.claude/agents/<name>.md` with name, description, a minimal `tools` list, `model` and `effort`.
2. Reference it from the policy if routing should use it.
3. Run `ccx health`, which checks the definitions and their MCP scopes.

**Removing an agent:** delete the file and its policy references.

Add an agent only when parallelism or real specialist value justifies it: no reviewer of reviewers.

## 8. Shared state

- **Location:** `<git common dir>/ccx/`, shared by every worktree. It is never committed, never mirrored to OneDrive, and read-only inside Codex's sandbox. Tests use `CCX_STATE_DIR`.
- **Writes:** every write holds `state.lock`, then replaces `state.json` atomically and keeps `state.json.bak`.
- **Contents:** tasks (owner, owns, status, worktree, branch, budget, dispatches, tokens, verification, reviews), approvals, the event queue and dedup keys, notifications, the routing log, and the runtime flag.
- **Ownership:** `task start`, `worktree add` and the launcher refuse (exit 7) when two active tasks own overlapping paths.
- **Baseline:** pre-existing unrelated changes are recorded once per worktree, the first time a task starts there. Restarts, resets to `planned`, naming the same worktree again, and moving away and back never re-take it, so stray edits cannot be laundered into the baseline (CCX-4/4b findings).
- **Never stored:** secrets, file contents or prompts. Strings pass through redaction.
- **Private data:** paths in `privacy.excludePaths` are never listed, owned, scanned or fingerprinted. Here that is `nursing-a2/`, the study-material project on its own branch. Clear the list when copying the template.

## 9. Worktrees

- `ccx worktree add -TaskId X` creates `.ccx-worktrees/<agent>-X` (gitignored, inside the repo) on branch `<agent>/x`, after the ownership check.
  - It starts from the caller's HEAD, or from `-Base`, resolved in the caller's worktree. Git itself would resolve HEAD in the main checkout, which the CCX-5a trial caught.
  - `merge-check` compares with `--no-renames`, so a rename out of unowned scope flags its source.
- Codex's sandbox cannot write `.git`, so Claude creates worktrees and commits for Codex.
- **Claude's own work stays in its session worktree.** A desktop-app session may only edit files inside its own worktree (`.claude/worktrees/<session>`). So `ccx worktree add` is for Codex tasks. To finish Codex's work, Claude commits it on the Codex branch, merges it into the session branch and continues there.
- **Merge workflow:**
  1. Commit on the task branch.
  2. `ccx merge-check -Branch <b>` checks conflicts (`git merge-tree`) and scope.
  3. Merge into the base branch locally (L3).
  4. Push after approval (L4).
- **Cleanup:** `ccx worktree prune` lists candidates; `-Apply` removes only clean, merged, ccx-created worktrees of finished tasks, with `git worktree remove` and `git branch -d` (never force). It never touches worktrees the desktop app made (`.claude/worktrees/`).

## 10. Kairos-style runtime

ccx has no background process.

**Events** come from:
- the launcher (`dispatch-finished`);
- `ccx verify` (`verification-failed`);
- the gate (`approval-requested`);
- the user (`ccx event add`).

**`ccx tick`** processes them:
- **Dedup:** events are deduplicated by key within `dedupWindowMinutes`.
- **Claim:** each event is claimed with a lease, so a crashed tick's events are retried after `leaseSeconds`.
- **Handlers:** idempotent and never above L2. They add notifications, block tasks and suggest the next route. They never launch Codex (`autoDispatch: false`).
- **Retries:** capped with exponential backoff; after `maxAttempts` an event is marked dead and surfaced.

The stale scan flags idle tasks and missing worktrees, and expires old approvals. `ccx status` runs one bounded tick first, so a session always sees current notifications. "Do nothing" is a normal result.

**Start/stop:**
- Nothing to start.
- `ccx runtime off` stops event processing; events still queue.
- `ccx runtime on` resumes.

**Optional schedule:** add a Windows Task Scheduler task yourself if you want periodic ticks. It is a user-level change, so ccx never installs one.

```
schtasks /Create /SC HOURLY /TN ccx-tick /TR "powershell -NoProfile -ExecutionPolicy Bypass -File <repo>\scripts\ccx.ps1 tick"
schtasks /Delete /TN ccx-tick /F
```

## 11. Memory

| Store | Holds | Loaded |
|---|---|---|
| AGENTS.md, CLAUDE.md, HANDOFF.md | rules and contracts | every session |
| MEMORY.md (+ MEMORY-ARCHIVE.md) | long-session state, decisions, research, failure modes, checkpoints | unattended sessions; on demand otherwise |
| FRICTION.md | recurring workflow friction | on demand |
| Claude auto-memory (`~/.claude/projects/.../memory/`) | user preferences and feedback | by Claude Code |
| ccx state and telemetry | task history, routing evidence | by ccx only |

**Retrieval** is on demand: Grep the files above. Full transcripts are never fed into tasks.

**`ccx memory lint`** checks the memory files (it is also a verify stage):
- secrets;
- size caps;
- duplicate lines;
- checkpoint overflow.

**Consolidation** (monthly, or when lint warns), routed as `docs` / routine to Claude at medium:
1. Run `ccx memory lint`.
2. Move checkpoints older than the newest `maxCheckpoints` to MEMORY-ARCHIVE.md.
3. Fold repeated findings into one dated line each under Decisions, Research findings or Known failure modes, keeping the source and date.
4. Delete facts the code or git history already records.
5. Mark anything unverified as UNVERIFIED.
6. Keep MEMORY.md under its line cap.
7. Run lint again, then commit.

For Claude's auto-memory, use the `consolidate-memory` skill.

## 12. Permission levels and approvals

| Level | Examples | Mode |
|---|---|---|
| L0 read-only | read, search, status | autonomous |
| L1 project write | edit files in the task's worktree | autonomous |
| L2 safe local execution | build, lint, test, project scripts, a Codex dispatch in the workspace-write sandbox | autonomous |
| L3 system, dependency or git | install dependency, branch or worktree create/remove, local commit and merge, mirror sync, dev config | allowed, logged to history |
| L4 external or remote | push, open PR, remote merge, delete remote branch, send a message, publish, paid action, Codex full access, task-accept | approval: interactive, or a quoted chat approval |
| L5 high consequence | production deploy, remote data deletion, credential or security change, force-push, history rewrite, irreversible migration | approval: interactive console only |

An unknown action counts as L4, so the gate fails closed.

**Approval flow:**
1. `ccx gate` returns 10 and prints the approval id.
2. The user approves:
   - Either in their own terminal: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 approve -Id A-0003`, then typing the id.
   - Or, for L4 only, in chat. Claude then records `ccx approve -Id A-0003 -Chat -Quote "<the user's words>"`.
3. An approval expires after `approvalTtlMinutes` and is single-use.

**What is technical and what is logical:**
- *Technical:* Codex's sandbox cannot write the state, so it can neither request nor grant approvals.
  - Interactive approval needs a real console: agent shells have redirected stdin, and the CLI refuses them (exit 12).
  - The launcher refuses full access without an approval.
  - Tick handlers are hard-limited to L2.
- *Logical:* a process with unrestricted shell access could still edit the state file directly. That case is governed by AGENTS.md and by Claude Code's own permission prompts.
- *Rule:* broad machine access is never authorisation.

## 13. Verification pipeline

`ccx verify` runs the stages in `verify.stages`, in order:

| Stage | What it checks |
|---|---|
| parse | PowerShell syntax |
| json | JSON validity and the policy schema |
| secrets | secret patterns in changed files |
| scope | changed files outside the task's owns |
| memory | memory lint |
| format, lint | configured commands (none here: SKIP) |
| tests-ccx, tests-ccx-ops, tests-dispatch, tests-mirror | the regression suites, run only when their `when` paths changed |

- **Result values:** SKIP and N/A never count as failures, and are printed so they stay visible. A FAIL blocks.
- **Recording:** `ccx verify -TaskId` records the result against a fingerprint of the task's owned files.
- **Coverage:** the built-in stages check every owned file, tracked or untracked, not only the changed ones. Committed broken code beside a dirty sibling still fails (CCX-4 F2).
- **Command output:** it is redacted as one text before it is split into log lines, so a secret spanning lines is removed whole (CCX-4 F1).
- **Verify tasks:** a task of type `verify` needs deterministic checks and a cross-model review, but no verifier of its own.
- **`task done` requires:**
  - a passing full verification whose fingerprint still matches;
  - a cross-model review, for normal work and above;
  - an independent verifier review, for complex work, high risk and above;
  - a `task-accept` approval, for critical and exceptional work.
- **Launcher post-checks:** after every `-TaskId` implement dispatch, the launcher runs parse, json, secrets and scope. A violation turns exit 0 into 9.
- **Baseline:** `ccx verify -Baseline` records a baseline (it never counts toward done).
- **This upgrade:** the baseline at c2f515b was dispatch 23/23 and mirror 21/21 + 1 skip.

## 14. Budgets and cost controls

| Class | Dispatches | Model escalations | Review cycles | Agents / parallel | Timeout | Effective-token target* |
|---|---|---|---|---|---|---|
| routine | 2 | 0 | 1 | 1 / 1 | 30 min | 150k |
| normal | 3 | 1 | 1 | 2 / 1 | 60 min | 400k |
| complex | 4 | 1 | 2 | 4 / 3 | 120 min | 1.5M |
| critical | 4 | 2 | 2 | 4 / 3 | 180 min | 3M |
| exceptional | 4 | 2 | 2 | 5 / 3 | 240 min | 5M |

\* Effective tokens = uncached input + output, as Codex reports them.

- **Enforced by the launcher:** the dispatch cap (via the router), the token target and a recorded usage limit.
- **Enforced by the router:** effort caps and model escalations.
- **Enforced by `task review`:** review cycles.
- **Enforced by agent definitions:** subagent turns (`maxTurns`).
- **Raising a cap:** `ccx task budget -Id X -Add maxDispatches=1 -Reason "..."`. Every raise is logged.
- **Starting values:** tune the targets from `ccx stats`.

## 15. Failure handling and recovery

- **Dispatch failure:** exit ≠ 0 or a status other than READY.
  1. The event handler suggests the next route (one effort step up, capped).
  2. Claude re-dispatches with only the open items (HANDOFF.md).
  3. Past the cap, the route says premium. Claude records `ccx task escalate` and finishes the task, or surfaces it once the escalation cap is used.
- **Codex usage limit (exit 4):** the reset time is recorded. Routing returns `defer`, and the launcher refuses until the reset.
  - A run cut off by the limit does not use one of the task's retries.
  - Adaptive routing ignores exits 4, 6, 7, 8 and 10, so quota never raises effort.
  - Measured on this account (2026-09-30/10-01): one GPT-6 Astra high-effort dispatch used the window in about 35 minutes, and two in parallel used it in about 19. Under that limit, prefer one Codex task at a time, and spend Codex quota first on work only a second model can do, such as independent verification.
- **Crashes:**
  - The launcher lock is a held handle, so a crash cannot leave it stale.
  - Tick leases expire.
  - `state.json.bak` holds the previous state.
- **Resume:** `ccx task show -Id X` shows the checkpoints and the last dispatch. The spec lives in its task file.
- **Stale work:** the stale scan and `ccx worktree list` flag idle tasks and old worktrees. Cleanup is always explicit.
- **Rolling back one task:** `git revert` its commits on the base branch. Never reset or force-push.

## 16. Observability

- **Views:**
  - `ccx status`: tasks, approvals, notifications, worktrees, routes, runtime, and the availability of models and agents.
  - `ccx status -Brief`: at most 5 lines.
  - `ccx stats`: per-route evidence.
- **Logs:**
  - `history.jsonl`: audit lines and finished events.
  - `telemetry.jsonl`: routes, dispatches, verifications, completions.
  - `logs/verify-*.log`: test output, newest 20.
- **Rotation and redaction:** logs are bounded and rotated. Every string passes through the policy's redaction patterns and a length cap. Prompts and file contents are never logged.

## 17. MCP inventory and scopes

Inventoried 2026-09-30 from this machine.

| Server or group | Purpose | External effect | Who may use it | Approval |
|---|---|---|---|---|
| Codex `node_repl` | Codex app browser and computer-use bridge | local | Codex (the dispatch sandbox keeps network off) | in policy `codexAllowedServers` |
| Built-in browser, Claude in Chrome | web pages; Chrome has the user's logged-in sessions | read, or act as the user | main Claude session, when the task needs it | L4 for any submit, post or account change |
| Firecrawl | web, developer and paper search | sends queries to a third party | main session, research tasks | never put private data or secrets in queries |
| Gmail, Google Calendar, Google Drive | the user's private data | read and write | main session, only on the user's explicit request | writes (send, create, update, share, trash) L4 |
| Health Data Avatar | the user's health data | read | never for engineering tasks | explicit user request only |
| Canva, Figma (official), Claude Docs, Artifacts | design and documents | create and edit, private by default | main session for design and doc tasks | sharing or publishing L4 |
| computer-use, desktop-commander, Blender, terminal | local desktop, processes, apps | local control | main session, when named by the task | L3; destructive steps L5 |
| scheduled-tasks, desktop app session tools | schedules, app settings | persistent configuration | main session on request | L3; settings need the user's approval |
| Plugin connectors needing auth (GitHub, Slack, Notion, Linear and others), Zoom (auth failing) | unavailable until authorised | - | - | - |

- **Enforced scoping:**
  - `ccx-scout` and `ccx-reviewer` have no MCP tools. Their `tools` allowlists exclude every `mcp__*` tool, and `ccx health` fails a definition that adds one.
  - Codex dispatches carry only the servers in `mcp.codexAllowedServers`. Health warns about any other server.
  - The user's `~/.claude/settings.json` denies `mcp__Figma__*`.
- **Project scope:** there is no project-level `.mcp.json`. Adding one needs an entry in `mcp.projectAllowedServers`.
- **Codex app agent sync (seen 2026-10-01):** with "external agent import sync" on, the Codex desktop app turned `.claude/agents/ccx-scout.md` into `.codex/agents/ccx-scout.toml` inside a worktree. The conversion is lossy:
  - it drops the tool allowlist and the model;
  - it adds no `sandbox_mode = "read-only"`, so the copied "read-only" scout is not read-only in Codex;
  - it rewrites text blindly ("Claude Code + Codex" became "Codex + Codex").

  Here `.codex/agents/` is in `.git/info/exclude`, so the copies are never committed. For a Codex-side scout, define it deliberately with `sandbox_mode = "read-only"`, or turn the sync off.

## 18. Health check

`ccx health` runs in about 20 seconds; `-Full` also runs every test suite. It checks:
- PowerShell and git;
- the policy;
- state read/write and the lock;
- router, gate, budget, event and tick self-tests (in a temporary state);
- memory lint;
- Codex: CLI, login and model catalog;
- Claude CLI;
- Mythos tier configuration;
- agent definitions and their MCP scopes;
- Codex and project MCP servers;
- worktree creation and removal (a temporary detached worktree);
- the verify runner;
- runtime queue health.

It exits 0 when nothing FAILs.

## 19. Disabling ccx

- **The runtime:** `ccx runtime off`.
- **Everything:** stop using `-TaskId` and `ccx`. Dispatch works as before. The state directory can then be deleted: `<git common dir>\ccx`.

## 20. Rolling back this upgrade

The upgrade is a series of commits on `claude/architecture-audit-migration-649829`, based on `c2f515b`.
- **Before the merge:** delete or ignore the branch. Nothing else changed.
- **After the merge into main:**
  1. `git revert -m 1 <merge commit>`, on a branch.
  2. Run `scripts\test-codex-dispatch.ps1` and `scripts\test-sync-mirror.ps1`.
  3. Merge and push (the push is L4).
  4. Delete `<git common dir>\ccx` (local state only).
  5. Remove any `ccx-tick` scheduled task you added.

  Never reset or force-push `main`.
- **Rehearsed 2026-10-01** in a temporary detached worktree:
  1. `main` plus a `--no-ff` merge of the branch.
  2. `git revert -m 1 HEAD`.
  3. The resulting tree is identical to `c2f515b` (`git diff --stat c2f515b HEAD` is empty).
  4. The pre-upgrade suites pass there: dispatch 23/23, mirror 21/21 + 1 skip, matching the baseline.

## 21. Known limits

- A model classifies free-text requests (Claude, as orchestrator). `ccx route` then applies the policy deterministically.
- Rung 2 (reuse an existing result) is a procedure, not an automatic cache.
- `cross-model-review` needs a different model than the author. If Codex is unavailable, Claude-authored complex work waits for Codex or goes to the user. The `ccx-reviewer` subagent covers only the independent-verifier item.
- Approvals are technically enforced against sandboxed or non-interactive agents, not against arbitrary processes with full shell access (section 12).
