# Task

## Mode and Owner
Task ID: NA2-REVIEW-2. Depth: normal. Dispatch. Codex spot-checks fixes and reviews new items, writing a report; Claude applies fixes and commits.

## Goal
1. Spot-check 20% of the items fixed after NA2-REVIEW-1: **AS-02, CP-03, CP-10, CV-07, ST-07**. Is each original finding resolved, with no new problem introduced?
2. Fully review the 13 new items: **AS-19, RA-11, CP-11, CP-12, CP-13, CV-12, CV-13, CV-14, ST-13, ST-14, ST-15, ST-16, ST-17**.
3. Confirm no tutorial case-study content remains in `nursing-a2/content/*.json`: no patient names (Vincent, Holly, Trent, Sarah, Lui), and no question that tests a specific tutorial patient's orders, findings or discharge. The user asked for conditions only.

## Relevant Files
- Items: `nursing-a2/content/questions-*.json`, `skill-*.json`. Citation keys map to files via `base.json` → `sources`.
- Source text: `nursing-a2/supplementary_text/*.txt` and `nursing-a2/modules_text/*.txt` (markers `[[slide N]]`, `[[p.N]]`; slide N = PDF page N).
- Previous review and Claude's resolution: `nursing-a2/REVIEW.md` (read it; do not edit it).
- Image-only slides: Claude's visual readings are in `nursing-a2/CONTENT_MAP.md` (per-source notes) and in REVIEW.md → "Claude resolution". For image-only content, you may treat those readings as the source text, but say in the report that you did.

## Write Allowlist
- `nursing-a2/REVIEW-2.md` (create). Nothing else. Temporary files only under `%TEMP%\na2-review2\`.

## Constraints
Same rules as NA2-REVIEW-1: judge only against the cited source; general knowledge is not a source; Australian spelling is intended.

## Out of Scope
Items not listed above, app code, the build tool. Do not edit any JSON.

## Done When
1. (Codex) `nursing-a2/REVIEW-2.md` has: a spot-check table (item, original finding resolved yes/no, new problem or "none"); a findings table for the new items using the NA2-REVIEW-1 columns; the case-study check result with any hits; and a one-line summary.
2. (Claude) Applies fixes, rebuilds, commits.

## Verify
- `python nursing-a2/tools/build_reviewer.py --check` prints `0 errors`.
- `git status --short` shows only `nursing-a2/REVIEW-2.md` added.

## Stop Conditions
Do not edit any file other than REVIEW-2.md. A source file is missing: report it and continue.
