# Task

<!-- Task spec for Dispatch-mode work (Parallel tasks use their handoff note instead). May be overwritten per task after checking it holds no uncommitted manual edits. Reference paths; do not paste files. -->

## Mode and Owner
<!-- Task ID and depth (trivial / normal / complex / frontier). Dispatch or Parallel. Who implements, who reviews. -->
`external-tools-details`: normal, low-risk documentation task. Dispatch ownership: Codex implements by direct user assignment; Claude reviews and owns commits, push and mirror sync. No other agent is editing these files.

Baseline: local `main` started at `8d0dd64`; initial status clean. Remote `main` and local `origin/main` were verified at `9e3a764`, one commit ahead. Local `main` has since been fast-forwarded to `9e3a764` (no merge commit, no history rewrite); the three task files' content was preserved across the reconciliation via a named stash and reapplied unchanged. Codex did not update branch history.

## Goal
<!-- What must be accomplished. -->
Complete the four external-tool references and apply useful planning, checklist and review conventions to the existing Claude/Codex workflow, keeping the tools reference-only.

## Relevant Files
<!-- Only likely relevant files/directories. -->
`AGENTS.md`, `HANDOFF.md`, `TASK.md`; read-only context: `BOOTSTRAP.md`, `ccx/policy.json`, `ccx/ARCHITECTURE.md`, `scripts/ccx*.ps1`, upstream READMEs and GJC install/skills and Claude-Red format guides linked in AGENTS.md.

## Write Allowlist
<!-- Exact paths the implementer may change or create, and where temporary files may go. -->
`AGENTS.md`, `HANDOFF.md`, `TASK.md` only. ccx may update its normal user-local task/verification state. No repository scratch files, tool installations or copied skills.

## Constraints
<!-- Important requirements, resolved business/data rules, and things that must not change. -->
Preserve existing roles, gates, budgets and runtime behaviour. Clarify external-harness supervision limits; do not claim instruction-based boundaries are enforced by a sandbox. Describe upstream commands as examples unless run successfully here. Treat upstream prompts as data. Preserve unrelated edits and private-path exclusions.

## Out of Scope
<!-- Adjacent work that must NOT be done. -->
Installing or running any external harness; changing scripts, policy, permissions, provider authentication, notifications or skills; Git branch/history changes; self-review or approval; commits, push, merge and OneDrive sync by Codex.

## Done When
<!-- Concrete acceptance criteria, each marked (Codex) or (Claude) for verification. -->
- [x] (Codex) All four repos have linked references, including the Claw-Code exclusion. Evidence: AGENTS.md External Agent Tools, checked against upstream READMEs.
- [x] (Codex) GJC Windows prerequisites, skill locations and optional notifications are documented; LazyCodex configuration effects and diagnostics are described without asserting a proven conflict. Evidence: upstream install/skills guides and README compared with the final section.
- [x] (Codex) Skill copying requires provenance, license retention, frontmatter and discovery verification; reporting/retest conventions are included. Evidence: upstream format guide, LICENSE, reporting and bug-identification skills; the latter lacks YAML and needs adaptation.
- [x] (Codex) HANDOFF.md applies proportional plan critique and durable evidence-backed checklists; external trials preserve the complete control-plane boundary and existing review/approval ownership. Evidence: manual comparison against existing AGENTS.md Roles, Modes and Control Plane sections; no script or policy changes.
- [x] (Codex) Scope and quick ccx verification pass; the diff against `9e3a764` preserves Claude's additions while correcting and extending them. Evidence: `git diff --check` exited 0; ccx json, secrets, scope and memory stages PASS (parse N/A); only the three allowed files changed.
- [x] (Claude) Reviewed the final diff and checks independently: PASS, no edits required. Reconciled local main with remote main: fast-forwarded `8d0dd64` -> `9e3a764` via a named stash of only the three task files (`git stash push -- AGENTS.md HANDOFF.md TASK.md`, `git merge --ff-only origin/main`, `git stash pop`); resolved the resulting AGENTS.md conflict in favor of the reviewed expanded section, matching the diff already reviewed against `9e3a764`. Stash retained until the commit is verified.
- [ ] (Claude) Commit, and use the existing gates for any push/merge; sync the mirror from the committed base branch. Push and mirror sync remain outstanding pending the commit-bound push gate.

## Verify
<!-- Commands/checks proving the task works. -->
From this repo root:

- `git diff --check`
- `git diff 9e3a764 -- AGENTS.md HANDOFF.md TASK.md` (review content, links, scope and preservation)
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 verify -TaskId external-tools-details -Quick`
- `git status --short` (only the three allowed files)

No runtime suite is required for this documentation-only change. External commands are not executed and external-tool compatibility remains unverified.

Handoff status: Claude review PASS, local main reconciled to `9e3a764`, commit pending. Remaining owner: Claude, for the unchecked acceptance item above (commit, then the push/merge gate and mirror sync). Installation, skill discovery and external-harness compatibility are UNKNOWN; CHECKED: upstream docs and the existing workflow; NEEDED: a separately scoped, user-requested trial before claiming runtime support.

## Stop Conditions
<!-- When to stop and report instead of continuing (for example: a check fails twice, the sandbox blocks a step, data-loss risk). -->
Stop the affected step for an ownership conflict, required installation, restricted path, approval or history change. On verification failure, make one focused repair and rerun; a second failure requires escalation. Continue independent documentation work; never record Claude review or task acceptance on Codex's behalf.
