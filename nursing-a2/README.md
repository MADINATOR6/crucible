# Assessment 2 reviewer (UTS 93225 Clinical Practice 2B)

Open `reviewer.html` in any browser, on a laptop or phone. It is one offline file: no internet, no login. Progress is saved in that browser only.

- **Part A quiz**: multiple choice with instant feedback (why each option is right or wrong, plus the source), and short answers you self-mark against a rubric. Filter by week, topic, SLO, skill, weak areas or clinical-reasoning items.
- **Part B skills**: checklist, put-in-order drill, "what's missing?" drill, and verbalise mode for each skill, where the sources have steps.
- **Mock exam**: a 15-minute timed Part A mock, and a random allocation of 2 of the 4 skills with a 15-minute timer.
- **Sources & gaps**: every file used, and what is not covered yet.

Items marked **Supplementary** come from UTS slides outside the 93225 Modules. The switch on Home excludes them.

## Files

| Path | Purpose |
|---|---|
| `reviewer.html` | Built app (generated; do not edit by hand) |
| `app/reviewer.template.html` | App code |
| `content/*.json` | All questions, skill steps, gaps and sources (edit these) |
| `tools/build_reviewer.py` | Validates citations and builds `reviewer.html` |
| `tools/extract_modules.py` | Extracts text from `modules/` (PDF, PPTX, DOCX) into `modules_text/` with page/slide markers |
| `CONTENT_MAP.md`, `GAPS.md`, `CONFLICTS.md` | Phase 1 inventory |
| `REVIEW.md` | Codex accuracy review (Phase 3) |
| `modules/`, `supplementary/` | Source files, kept out of git |

## Commands (run from the repo root)

```bash
python nursing-a2/tools/extract_modules.py
```

```bash
python nursing-a2/tools/build_reviewer.py
```

`--check` validates without writing. The build refuses any item without a citation, any citation without a page or slide, any MCQ without exactly one correct answer and a reason for every option, and any context note not labelled "NOT FROM MODULES — verify".
