# Collaboration: crucible-cockpit

Phase: 4 Independent review (complete)
Participants: Claude (planned, implemented, browser-verified); Codex (reviewed, two cycles, signed off)

Role lines use `- Phase <n> <name>: <Agent> [PLAN|IMPLEMENT|REVIEW|RESEARCH] (done|active|pending|blocked)`; the cockpit reads them. The newest task is the first section of this file; older tasks follow below it.

## Roles
- Phase 1 Plan and stack: Claude [PLAN] (done)
- Phase 2 Implementation and tests: Claude [IMPLEMENT] (done)
- Phase 3 Browser verification: Claude [VERIFY] (done)
- Phase 4 Independent review: Codex [REVIEW] (done)

## Decisions
- C1 (Claude, 2026-11-09): stack is Node.js standard library (`node:http`, SSE) plus a vanilla JS/CSS frontend, no dependencies, no build step. The brief allows Node and "Vanilla + Tailwind"; Express, React/Vite and Tailwind would all need npm downloads or a build, and the brief stops on anything that cannot be bundled. Plain CSS gives the same dark, dense layout offline. Fonts are system stacks (no external fonts).
- C2 (Claude): reads go through `tools/crucible-monitor/src/collect.js` (already reviewed and committed at 4c1f21d) instead of a second set of parsers; cockpit-only parsers (role tags, queue feed, approvals, human-review tags) live in `tools/crucible-cockpit/src/`.
- C3 (Claude): `handoffs/APPROVALS.md` records a person's decision for the agents to read. It is not a ccx approval and cannot authorise an L4/L5 action; the UI and the file header say so and show the `ccx approve` command to run in the user's own terminal.
- C4 (Claude): writes are append-only (a new APPROVALS entry, or a new human question in QUEUE.md), never in-place edits, so an agent editing the same file concurrently cannot lose text. Answering a question in place is left out.
- C5 (Claude): the server binds 127.0.0.1 only. Requests must carry `Host: 127.0.0.1:<port>` or `localhost:<port>` (DNS-rebinding guard); writes also need a per-launch token from the served page and a same-origin `Origin`, so other websites cannot post to it.
- C6 (Claude): "silence" is time since any handoff file (TASK.md, COLLAB.md, QUEUE.md, NOTES-*.md) changed, against a threshold the user sets (`--silence-minutes`, default 30). It is a cockpit setting, not a fact from the sources. "Deadlock" is shown only when each agent has an open question addressed to it by the other.
- C7 (Claude): branch indicators show each `claude/*` and `codex/*` branch's newest commit time, labelled as commit evidence; a branch is never shown as being actively edited.
- C8 (Claude): Codex reviews read-only; Claude implements. Neither commits; changes are left for review, per the brief.

## Open questions
- See `handoffs/QUEUE.md`.

## Review and sign-off
- R1 (Codex, 2026-11-09, verify run in a workspace-write sandbox, edits none): changes needed. P1: links could redirect the two writes: a `handoffs/` junction to another folder inside the repo, `QUEUE.md` symlinked to `TASK.md`, and a dangling `QUEUE.md` link to an outside file all returned 201 and wrote there. Everything else PASS: `node --test` 16 entries, Host/Origin/token/CORS/traversal/oversize/heading and control-character attacks, SSE after edits and deletions, headless Chromium (same-origin requests only, no overflow at 375 px), no fabrication found, real-checkout hashes unchanged.
- R1 fix (Claude): `target()` in `src/writes.js` now requires `handoffs/` to be a plain folder resolving exactly to `<repo>/handoffs`, and the file to be absent or a plain, singly linked regular file; links are refused, not followed. New test covers the in-repo junction, hard links to `TASK.md` and file symlinks (including a dangling one) for both writes. Cockpit `node --test` 16/16, monitor 20/20.
- R2 (Codex, 2026-11-09, scoped re-review): **sign off on the R1 fix.** Cockpit `node --test` 17/17 runner entries; in-repo and outside `handoffs` junctions, file symlinks to `TASK.md`, dangling outside symlinks, hard links, `handoffs` replaced by a file and privacy paths all refused with 400 for both writes; normal writes, absent files, a parent junction in the repo path and mixed-case paths still 201 into the real files. Remaining risk: the documented check-to-append link-swap race. Out of scope: `tools/crucible-monitor/test/monitor.test.js:102` assumes its temp copy is not inside a Git repo, so it fails when `TEMP` points into a repo; it passes with `GIT_CEILING_DIRECTORIES` set.
- Sign-off recorded by Claude from Codex's read-only report (the verifier cannot write files). Implementer Claude, reviewer Codex. No commit, push or sync.

# Collaboration: crucible-monitor

Phase: 3 Independent review and final verification (complete)
Participants: Claude (discovery, implementation, final verification); Codex (independent review, two read-only cycles)

## Roles
- Phase 1 Discovery and source mapping: Claude. Owns `tools/crucible-monitor/README.md` (source map).
- Phase 2 Implementation and tests: Claude. Owns `tools/crucible-monitor/**`.
- Phase 3 Independent review: Codex (read-only verify run; edits nothing). Claude runs final verification.
- Shared records: `handoffs/COLLAB.md`, `handoffs/QUEUE.md`, `handoffs/NOTES-crucible-monitor.md`, `TASK.md` (status only). Claude writes them; Codex reports in its review and Claude records it verbatim in substance.

## Decisions
- D1 (Claude, 2026-11-09): target confirmed. Checkout `C:/Users/Madison/code/claude-codex-collab`, remote `MADINATOR6/crucible`, branch `main` @ 0fee953, 67 pre-existing changed/untracked paths recorded as the baseline (none touched).
- D2 (Claude): Node.js, zero dependencies. The repo's verified runtime is Node v24 (`lifting-tracker`, AGENTS.md Stack, `node --test`); Python is used only by `finance-shorts`. Node's standard library (raw stdin, ANSI escapes, `fs`, `child_process.execFile`) covers a refreshing, scrollable dashboard, so the smallest suitable terminal library is none. No lockfile is needed with no dependencies.
- D3 (Claude): no `ccx task add` registration. ccx writes `.git/ccx/state.json`, which is outside this task's write allowlist; the task is tracked here instead.
- D4 (Claude): Codex participation was not used for discovery or implementation to avoid duplicate investigation; Codex performs the required independent review.
- D5 (Claude): the monitor reads `telemetry.jsonl` and `telemetry.1.jsonl` only; `history.jsonl` feeds no required panel and is not read.
- D6 (Claude): usage totals come only from telemetry `dispatch` records; `task-done` tokens and `state.tasks.*.tokens` are aggregates of the same runs and are never added to them.
- D7 (Claude): no liveness timeout. Freshness is shown as age since each source's modified time, because no source documents a timeout.

## Open questions
- See `handoffs/QUEUE.md`.

## Review and sign-off
- R1 (Codex, 2026-11-09, read-only verify run at 0fee953): changes needed. P1 task-file guard checked lexical paths only, so a symlink/junction could reach outside the repo or a privacy-excluded path (also the handoffs folder). P2 a throw during live-view startup (e.g. `setRawMode`) left the alternate screen on. P2 an unknown risk value still produced a budget, unlike `Get-CcxClass`. Q-2 answered: formulas match `ccx-core.ps1:494-518,616,653` and `codex-dispatch.ps1:190-192`. Codex's sandbox blocked `mkdtemp` (EPERM), so 11 of 17 tests could not run there; `--once` and the permission-model run passed.
- R1 fixes (Claude): `guardPath` in `src/collect.js` checks the path as written and after `realpath` for the task file and the handoffs folder; `startLive` in `src/live.js` restores the terminal before rethrowing a startup error; `effectiveClass` in `src/panels.js` returns no class for an unknown risk. Three regression tests added; `node --test` 20/20 pass on Windows.
- R2 (Codex, 2026-11-09, read-only scoped re-review): **sign off with verification caveats.** All three fixes PASS: `node --test test/live.test.js` 5/5 including startup cleanup; `--once` and the permission-model snapshot PASS with source hashes unchanged; path guard refuses outside and mixed-case private paths and accepts legitimate ones (synthetic resolution probes); unknown risks give no class or budget. Caveats: the full suite was BLOCKED in Codex's sandbox (12 tests, `EPERM: mkdtemp`), real junction fixtures and a physical terminal were not exercised by Codex, and the check-to-open race documented in `guardPath` remains.
- Claude final verification: full `node --test` run on Windows (real junction fixtures included), real-checkout snapshot, Git baseline comparison. Results in `handoffs/NOTES-crucible-monitor.md`.
- Status: implementation complete; independent review recorded (2 cycles, the cap). No commit, push or sync.
