# Task

## Mode and Owner
Task ID: NA2-REVIEW-4. Depth: normal. Dispatch (review). Codex reviews; Claude fixes and commits.

## Goal
Check `nursing-a2/content/questions-hf.json` (HF-01 to HF-07) against the cited source text: every stem, keyed answer, option `why`, explanation, SAQ model and rubric point. Write `nursing-a2/REVIEW-4.md`.

## Relevant Files
- Source key L3 → `nursing-a2/modules/CP2B_Lecture_3_slides.pdf`; text with `[[p.N]]` markers in `nursing-a2/modules_text/CP2B_Lecture_3_slides.pdf.txt`.

## Write Allowlist
- `nursing-a2/REVIEW-4.md` only.

## Constraints
Judge only against the cited source; general knowledge is not a source. Australian spelling is intended.

## Done When
1. (Codex) REVIEW-4.md: a summary line; table `Item ID | Issue type (factual error / wrong key / unsupported / ambiguous / wrong distractor logic / missing or wrong citation) | What is wrong | Source quote < 15 words | Suggested fix`; then the IDs with no problems.
2. (Claude) Fixes, rebuilds, commits.

## Verify
- `python nursing-a2/tools/build_reviewer.py --check` prints `0 errors`.

## Stop Conditions
Do not edit any other file.
