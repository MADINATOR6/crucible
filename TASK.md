# Task

## Mode and Owner
Task ID: NA2-REVIEW-1. Depth: normal. Dispatch. Codex reviews content accuracy and writes REVIEW.md; Claude applies fixes and commits.

## Goal
Check every item in `nursing-a2/content/*.json` (66 questions in `questions-*.json`, skill steps and notes in `skill-*.json`, SLO text in `base.json`) against its cited source text. Write `nursing-a2/REVIEW.md` listing every problem found.

## Relevant Files
- `nursing-a2/content/*.json`: items. Each citation is `{"src": KEY, "loc": "slide N" | "p.N" | section}`. KEY maps to a file in `base.json` → `sources`.
- Source text, one file per source, with `[[slide N]]` / `[[p.N]]` markers (slide N = PDF page N):
  - `nursing-a2/supplementary_text/ACS.pdf.txt`, `ASTHMA.pdf.txt`, `COPD .pdf.txt`, `STROKE.pdf.txt`
  - `nursing-a2/modules_text/UTS 93225 Clinical Practice 2B Spring C Session 2026 Subject Information.pdf.txt`
- The original PDFs are in `nursing-a2/supplementary/` and `nursing-a2/modules/` if you need them (python + pypdf is installed).
- Source key A2 (Canvas Assessment 2 page) is a screenshot with no text file. Its transcription is in `nursing-a2/CONTENT_MAP.md` under "## A2". Treat that as the source text.
- `nursing-a2/CONTENT_MAP.md` → "Readings to double-check" lists three values read from small images; some slides are image-only (see `supplementary_text/INDEX.md`). The slide-level notes in CONTENT_MAP.md are Claude's visual reading of those slides.

## Write Allowlist
- `nursing-a2/REVIEW.md` (create). Nothing else. Temporary scripts only under `%TEMP%\na2-review\`.

## Constraints
- Judge only against the cited source. General clinical knowledge is not a source. If an item states anything the cited location does not support, it is "unsupported", even if it is clinically true.
- If a cited slide is image-only (no extractable text), say so: issue type "cannot verify (image-only)", giving the item ID and slide. Do not guess.
- Australian English and Australian terminology are intended; do not flag spelling such as "haemorrhage", "oedema", "paediatric".
- For each MCQ, check: the correct option is supported; each distractor is actually wrong according to the source; each option's `why` is accurate; the explanation is supported; the citation locations are right.
- For SAQs: model answer and every rubric point are supported at their cited location.

## Out of Scope
- App code, the build tool, styling. Do not edit any JSON.
- Adding new questions or suggesting new topics.

## Done When
1. (Codex) `nursing-a2/REVIEW.md` exists with a Summary line (items checked, problems by type) and one table row per problem: `Item ID | Issue type (factual error / unsupported / ambiguous / wrong distractor logic / missing or wrong citation / cannot verify (image-only)) | What is wrong | Correct source reference (file + slide/page, short quote under 15 words) | Suggested fix`.
2. (Codex) Every question ID and every skill step and note was checked; list IDs with no problems in one line at the end.
3. (Claude) Applies fixes, rebuilds, commits.

## Verify
- `python nursing-a2/tools/build_reviewer.py --check` must still print `0 errors` (you must not have changed content).
- `git status --short` must show only `nursing-a2/REVIEW.md` added (and TASK.md if Claude left it modified).

## Stop Conditions
- A source text file is missing or unreadable: report it and continue with the rest.
- Do not edit any file other than REVIEW.md, for any reason.
