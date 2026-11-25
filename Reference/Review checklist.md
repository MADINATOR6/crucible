# Review Checklist (Blind Reviewer)

Use this checklist when reviewing a `handoffs/<id>-review.md` pack read-only with no chat history. Treat every report as a set of claims, not evidence: judge only from the pack, the diff, the task file, and repository files. Do not edit files.

## Checks

1. **Diff vs allowlist:** Does every path in the pack's changed-paths list and diff range appear in the task file's write allowlist (`owns:` or `Write allowlist`), with no extra or unowned files modified?
2. **Claims vs ground truth:** Does the actual diff match every file and behavior claimed in the task file and latest report, with no missing requirements or undocumented behavior changes?
3. **Callers and siblings:** For every changed function, command, or contract, are all callers and sibling sites in the repository updated or explicitly accounted for (including a `TWINS:` search after any defect fix)?
4. **Weakened tests or checks:** If any test or check changed, does the change trace directly to the task spec, with no loosened assertions, deleted checks, added skips, widened tolerances, or real calls replaced with mocks?
5. **Spec alignment (`INTENT:`):** Where code behavior changed to satisfy a failing check, does it match the user's stated requirement and the task spec rather than contradicting them?
6. **Claims without a run and `Untested:`:** Does every "pass" or "done" claim cite an observed run (not a partial run reported as full), and is every uncovered or unrun Done When item listed under `Untested:` with a next owner?
7. **Failure paths:** Does the change handle bad input, missing files, refused steps, and interrupted runs cleanly rather than only the happy path?
8. **Scope debris:** Is the diff free of drive-by reformatting, debug prints, scratch files, unrelated refactors, or unnecessary new dependencies?
9. **Secrets and private data:** Are the diff, task file, and pack free of secrets, tokens, credentials, and private data—including `*.xlsx` (or anything derived from the athlete's workbook) and `nursing-a2/` course material?
10. **Unauthorized outward actions:** Is the diff free of unapproved pushes, PRs, deploys, publishes, external sends, tool installs, or paid actions without explicit user authorization or a recorded `ccx gate` approval?
11. **Symmetry rule:** If the diff touches `AGENTS.md` or `CLAUDE.md`, does it update both in the same change so shared workflow rules and external-tool workarounds stay in sync?
12. **Generated and protected files:** Does the diff leave generated, vendored, and protected paths untouched (such as `Status/` outputs and `lifting-tracker/vendor/`) unless the task file explicitly authorizes editing them?
13. **Done When checkability:** Is every Done When item in the task file demonstrably satisfied by recorded evidence or direct inspection of the diff and repository, or explicitly flagged as an open caveat?

## Verdict Format

End the review with this exact structure. Do not soften a refutation or inflate a caveat.

```text
Verdict: VERIFIED | VERIFIED WITH CAVEATS | REFUTED

Claims:
| Claim | Observed | Status |
| --- | --- | --- |
| <claim from task/report> | <what the diff, repo, or recorded output shows> | PASS / CAVEAT / REFUTED |

Findings:
- <path:line> | <high|medium|low> | <what is wrong> | Smallest fix: <minimal concrete change>
(or "none")

Caveats / Unverified:
- <check or Done When item that could not be verified read-only> — Next owner: <agent or user>
(or "none")
```

- **VERIFIED:** No defects found, and every claim is backed by the diff, repo, and recorded runs.
- **VERIFIED WITH CAVEATS:** No defects found, but one or more claims or checks could not be verified from the pack alone (name each and who can run it).
- **REFUTED:** The diff or repository contradicts a claim or shows a defect (cite `path:line`, severity, and smallest fix).
