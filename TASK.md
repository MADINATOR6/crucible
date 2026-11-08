# Task: Build crucible-cockpit

Task ID: `crucible-cockpit`. Mode: Peer. Baseline `4c1f21d`, `main`, 2026-11-09. The previous TASK.md (external-tools-operational, with the crucible-monitor status note) is in Git history at `4c1f21d`.

A local, offline, dark-mode web dashboard ("Mission Control") for the Crucible peer-mode workflow: it shows the active task, agent roles, the handoff loop, the question queue and items waiting for a human, and records human decisions in `handoffs/APPROVALS.md`. It binds to 127.0.0.1 only and makes no external network calls. Plan, roles and decisions: `handoffs/COLLAB.md`.

## Write allowlist

- `tools/crucible-cockpit/**`
- `handoffs/COLLAB.md`, `handoffs/QUEUE.md`, `handoffs/NOTES-*.md`, `handoffs/APPROVALS.md`
- `TASK.md` (status updates only)

The running cockpit writes only `handoffs/QUEUE.md` and `handoffs/APPROVALS.md`, and only when a person submits the form. Everything else it reads.

## Out of scope

- Changing ccx, its state, policy, scripts or repository instructions. A cockpit decision is a record for the agents, never a ccx approval: L4/L5 actions still need `ccx gate` and the user's approval in chat or at their own console.
- Exposing the server beyond 127.0.0.1, CDNs, external fonts, telemetry.
- Commit, push, deploy, mirror sync.

## Done When

- [x] (Claude) The backend starts locally and serves the frontend.
- [x] (Claude) The UI renders the Cockpit layout: top bar (task, allowlist, budget), agent cards, handoff loop, Q&A feed and approval center.
- [x] (Claude) The UI updates over SSE when `TASK.md`, `COLLAB.md` or `QUEUE.md` change on disk.
- [x] (Claude) The approval center writes to `handoffs/APPROVALS.md`.
- [x] (Codex) Independent review runs the test suite and signs off in `COLLAB.md`; the implementer and reviewer are different agents.
- [ ] (Claude) `git status` shows only allowlisted changes.

## Verify

```powershell
cd tools/crucible-cockpit; node --test
node tools/crucible-cockpit/server.js --repo <copy of test/fixtures/repo>
git status --porcelain=v1 -uall
```

Browser checks: the UI loads on 127.0.0.1; a manual edit of `handoffs/QUEUE.md` appears without reloading; the network log shows only same-origin requests.

## Stop conditions

- Stop if a feature needs the server reachable from another machine.
- Stop if a dependency cannot be pinned or bundled locally.
- Do not commit; leave changes for review.

## Status

- 2026-11-09 Claude: plan and stack in `handoffs/COLLAB.md`; implementation in progress.
- 2026-11-09 Claude: implemented; `node --test` 15/15; browser checks on a fixture copy and a read-only run on the real checkout passed (tools/crucible-cockpit/README.md, Verification). Codex review in progress.
- 2026-11-09 Claude: Codex review R1 found link redirection of writes (fixed); R2 signed off. Cockpit `node --test` 16 tests pass (17 runner entries), monitor 20/20. Not committed.
