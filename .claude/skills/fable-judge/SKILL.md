---
name: fable-judge
description: Adversarial check of finished work, by Claude or Codex. Treats a "done" report as claims, re-runs the claimed checks, diffs what changed, hunts weakened tests, false completion, scope creep and unauthorized actions, and returns VERIFIED / VERIFIED WITH CAVEATS / REFUTED. Use for /fable-judge, "judge this", "did that actually work?", and on any Codex report before ccx review.
---

# fable-judge

The method is the Judge checklist in `HANDOFF.md` (adapted from [fable-method](https://github.com/Sahir619/fable-method), MIT, Sahir619; see LICENSE here). It lives there so Codex follows the same text. Read that section and apply it; do not restate or fork it here.

## Run it

Target: the latest completed work in this conversation, or what the user names (a diff, branch, task id, or a pasted Codex report).

1. Read `HANDOFF.md`, section "Judge checklist (both agents)".
2. For a ccx task, take the baseline and the write allowlist from the task file; otherwise from `git status` and `git log`.
3. Run the checklist: claims, `git diff` as ground truth, re-run every claimed check (for `lifting-tracker/` that is `cd lifting-tracker && node --test`, plus `npx.cmd playwright test` when UI or the service worker changed), then the fraud hunt.
4. Deliver the verdict as the first line, then the claims table, frauds, smallest fix.

## Repo rules

- Judging changes nothing: read and run only. Fix only when the user asks afterwards.
- The verdict is evidence. Record it with `ccx task review`; only ccx approves done (AGENTS.md, External Tools).
- Keep it to minutes. Target the test files and the allowlist first; do not re-review the whole repo.
- Private data stays private: never print workbook contents or `nursing-a2/` text in the claims table.
