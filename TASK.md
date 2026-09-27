# Task

## Mode and Owner
Task ID: NA2-REVIEW-3. Depth: normal. Dispatch (review). Codex checks new content against the 93225 sources and writes a report; Claude fixes and commits. The student sits the assessment today, so prioritise errors that would teach something wrong.

## Goal
Check against the cited source text, in this priority order:
1. `nursing-a2/content/questions-m1.json`, `-m2.json`, `-m3.json`, `-m4.json` (77 items, M1-01 … M4-12; M3-15 was already rewritten by Claude).
2. `nursing-a2/content/guide.json` (study guide points).
3. Steps and notes in `nursing-a2/content/skill-*.json` whose `src` is a `core` source (O2CHK is image-only: its steps were transcribed visually by Claude from the three appraisal-form images; mark those "cannot verify (image-only)" only once, as a group).
Write `nursing-a2/REVIEW-3.md`.

## Relevant Files
- Source keys → files: `nursing-a2/content/base.json` → `sources`. Text with `[[p.N]]` / `[[slide N]]` / `[[p.~N]]` / `[[page <slug>]]` markers: `nursing-a2/modules_text/` (and `supplementary_text/` for supp keys). File name = source file + `.txt`, `/` replaced by `__`.
- Known conflicts are documented in `nursing-a2/CONFLICTS.md`; do not report those again unless an item states one side as the only answer.

## Write Allowlist
- `nursing-a2/REVIEW-3.md` only. Temporary files under `%TEMP%\na2-review3\`.

## Constraints
Judge only against the cited source (general knowledge is not a source). Australian spelling is intended. Report factual errors and keyed answers that are wrong or ambiguous first.

## Done When
1. (Codex) REVIEW-3.md: a summary line; a table `Item ID | Issue type (factual error / wrong key / unsupported / ambiguous / wrong distractor logic / missing or wrong citation / cannot verify (image-only)) | What is wrong | Source reference (short quote < 15 words) | Suggested fix`, most severe first; then the IDs with no problems.
2. (Claude) Fixes, rebuilds, commits.

## Verify
- `python nursing-a2/tools/build_reviewer.py --check` prints `0 errors`.
- `git status --short` shows only `nursing-a2/REVIEW-3.md` added.

## Stop Conditions
Do not edit any other file. If time is short, finish priority 1 fully before starting 2 and 3, and say what was not reached.
