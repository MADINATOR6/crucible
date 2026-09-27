# Task

## Mode and Owner
Task ID: NA2-CONTENT-3. Depth: normal. Dispatch. Codex writes Part A questions from the 93225 Modules; Claude reviews, verifies and commits. Claude is working in parallel on skill files and the study guide (different files, see the allowlist).

## Goal
Write cited Part A practice questions for UTS 93225 Assessment 2 from the newly loaded 93225 Module material, in four new files:
- `nursing-a2/content/questions-m1.json`: Module 1 (A-G/A-H assessment, respiratory/cardiovascular/neurological focused assessment, AVPU/GCS/limb strength, chest auscultation, BLS). About 20 items.
- `nursing-a2/content/questions-m2.json`: Module 2 (acute oxygen therapy (TSANZ), oxygen devices, inhaled medicines and nebuliser, suctioning and sputum, COPD/pneumonia/asthma nursing care). About 25 items.
- `nursing-a2/content/questions-m3.json`: Module 3 (focused cardiovascular assessment, 12-lead ECG, cardiac monitoring, rhythm interpretation and dysrhythmias, burette infusion). About 20 items.
- `nursing-a2/content/questions-m4.json`: Module 4 (stroke, NGT and medicines via enteral tubes / swallowing difficulty, ASSIST tool, cranial nerves). About 12 items.

## Relevant Files
- Schema and style: copy the structure of `nursing-a2/content/questions-asthma.json` exactly (mcq: stem, 4 options each with `why`, exactly one `correct`, `explanation`, `cite`; saq: prompt, model, rubric points each with `cite`, `cite`). Fields: `id`, `type`, `week`, `topic`, `slo` (subset of SLO1-SLO4), optional `skill` (auscultation / ecg / oxygen / nebuliser), optional `reasoning: true`.
- Sources: `nursing-a2/content/base.json` → `sources` (use only keys whose `set` is `core`). Extracted text, with `[[p.N]]`, `[[slide N]]`, `[[p.~N]]` or `[[page <slug>]]` markers, is in `nursing-a2/modules_text/` (file name = source file name + `.txt`, with `/` replaced by `__`). Cite with those markers, e.g. `{"src": "S126", "loc": "p.4"}`, `{"src": "L2", "loc": "slide 7"}`, `{"src": "CANVAS", "loc": "page 2-dot-2-preparation-activities-respiratory-nursing-skills"}`.
- `nursing-a2/modules_text/INDEX.md` lists image-only pages. Do not write items that depend on image-only pages.

## Write Allowlist
- `nursing-a2/content/questions-m1.json`, `questions-m2.json`, `questions-m3.json`, `questions-m4.json` (create). Nothing else. Temporary files only under `%TEMP%\na2-content3\`.

## Constraints (non-negotiable)
- Every question, option `why`, explanation, model answer and rubric point must be supported by the cited source text at the cited location. No general clinical knowledge. Clinical values (flow rates, FiO2, SpO2 targets, doses, electrode positions, timings, ranges) only where the source states them, word for word in meaning.
- IDs: `M1-01`, `M1-02`, ... `M2-01` ... etc. `week` values: "Module 1", "Module 2", "Module 3", "Module 4". Give each item a short `topic`.
- Conditions and principles only: **no tutorial case-study patients**. No patient names, and no questions testing a specific scenario patient's orders or findings. Generic vignettes ("A patient with COPD has…") are fine and encouraged.
- Prioritise clinical reasoning (findings → interpretation → nursing action → escalation). Aim for at least 40% `reasoning: true`, about 1 short answer per 5 items. Distractors must be plausible and each `why` must say, from the source, why it is wrong.
- Australian English and Australian clinical terminology.
- Do not duplicate what the existing files already test (skim `questions-*.json`); new angles only.
- If a source contradicts another source or an existing item, do not write the item; list it in the report under Decisions.

## Out of Scope
Existing content files, skill files, the app template, the build tool, docs.

## Done When
1. (Codex) The four files exist and `python nursing-a2/tools/build_reviewer.py --check` prints `0 errors`.
2. (Codex) The report lists item counts per file, the reasoning share, and any source conflicts or gaps noticed.
3. (Claude) Reviews the items against the sources, fixes or removes any it cannot verify, rebuilds and commits.

## Verify
- `python nursing-a2/tools/build_reviewer.py --check`
- `git status --short` shows only the four new files (plus Claude's parallel work in skill-*.json, guide-*.json, app/, base.json and docs, which you must not touch).

## Stop Conditions
- The validator fails twice on the same item: drop that item and report it.
- Never edit any file outside the allowlist.
