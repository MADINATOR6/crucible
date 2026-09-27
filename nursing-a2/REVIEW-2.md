# NA2-REVIEW-2 — source accuracy review

Summary: all five sampled original findings are resolved using the authorised image readings; AS-02 needs an age qualification; the 13 new items have five findings across four items (including two image-detail verification gaps); no tutorial-patient recall content or patient names found; build check: 0 errors, 0 warnings.

## Scope and evidence

Reviewed the five requested spot-checks and all 13 new items, including each MCQ option, rationale, explanation and citation, and the SAQ model and every rubric point. Judgements concern fidelity to the supplied sources, not independent clinical guidance. Australian spelling is intentional.

Citation keys were resolved through `content/base.json`. Source references below name the PDF; extracted text is in the matching `supplementary_text/*.pdf.txt`. Slide numbers equal PDF page numbers. No required source-text file was missing.

As TASK.md permits, **Claude's visual readings in CONTENT_MAP.md and REVIEW.md → Claude resolution were treated as source evidence for image-only content**. This is not independent image verification by Codex. This includes ASTHMA slides 15–16, COPD slides 13 and 29, ACS slides 14, 16, 19 and 30–31, and STROKE slide 26. The earlier AS-04 resolution supports AS-19's spacer-after-improvement rationale; the earlier CP-06 resolution supports the pharmacological-step distinction in CP-11. The two narrowly identified image details below are not explicitly recorded in those readings; absence from a summary is not proof that they are absent from the slide.

## Spot-check of fixed items

| Item | Original finding resolved yes/no | New problem or none |
|---|---|---|
| AS-02 | Yes. The pneumonia exclusion rationale is gone. The severe category, saturation band and reassessment timing match the authorised reading of ASTHMA slide 16. | Age qualification needed after generalising the named case to any child: the mild/moderate rationale universally requires whole sentences, whereas CONTENT_MAP.md records the young-child alternative, “move about, speak in phrases”. Add that exception or specify an older child. The keyed severe answer remains supported by increased work of breathing and SpO2 92%. |
| CP-03 | Yes. It now tests the stable-COPD chart's oxygen-for-hypoxaemia statement, not an undocumented bedside response. COPD slide 22 supports the discussion-question explanation; the authorised slide 29 reading supports the answer and treatment-stage distinctions. | none |
| CP-10 | Yes. Four specified findings now match four distinct rubric points. All four mappings and the model's additional lung symptoms match the authorised COPD slide 13 reading. | none |
| CV-07 | Yes. The authorised ACS slide 30 reading supports the VT criteria and treatment wording. Slide 31 is now cited for VF; the unsupported asystole definition and sinus-rhythm comparison are gone. | none |
| ST-07 | Yes. The authorised STROKE slide 26 reading supports CT's purpose; slide 25 supplies the thrombolysis contraindication. Distractor rationales now stay within the pathway's stated purpose. | none |

## Findings for new items

| Item ID | Issue type | What is wrong | Correct source reference (file + slide/page, short quote under 15 words) | Suggested fix |
|---|---|---|---|---|
| CP-13 | unsupported | The model and fourth rubric point make pulmonary rehabilitation referral unconditional. The chart's recorded recommendation applies to symptomatic patients; the prompt only says the person is ready for discharge. | COPD .pdf, slide 29, authorised CONTENT_MAP.md reading: “refer symptomatic to pulmonary rehab”. | Retain the symptomatic-patient condition in both model and rubric, or state that the person remains symptomatic. |
| CP-13 | cannot verify (image-only) | The model attributes “regular review” to the chart's optimise-function section. Extracted slide 29 contains only its page number; the authorised reading records exercise, nutrition, education and management/action plans, but not this extra instruction. | COPD .pdf, slide 29; CONTENT_MAP.md: “exercise, nutrition, education, GP mgmt plan & written COPD action plan”. | Verify and record the chart's exact regular-review wording, or remove this addition. This is a verification gap, not a claim that regular review is clinically wrong. |
| CV-14 | cannot verify (image-only) | The explanation specifies “surgical ablation”. The authorised reading records only “ablation”; extracted slide 30 contains no treatment text. The treatment criteria and repeated-episode ablation/ICD alternatives are otherwise supported. | ACS.pdf, slide 30; CONTENT_MAP.md: “ablation or ICD for repeated episodes”. | Verify the “surgical” modifier from the image or use the recorded wording “ablation”. |
| ST-13 | missing or wrong citation | The explanation names surgical clipping and endovascular coiling/stenting, but only slides 10–12 are cited. Slide 12 supports the need for vascular treatment, not the named procedures. | STROKE.pdf, slide 14: “Craniotomy (open surgery) and physical clipping of aneurysm”; slide 15: “Stenting and coiling”. | Add slides 14–15, or omit the procedure names. |
| ST-14 | missing or wrong citation | The magnesium distractor rationale refers to asthma material, but every citation is to STROKE. The keyed DAPT answer, thrombolysis distinction and permanent surgical clip explanation are supported. | ASTHMA.pdf, slide 18: “Magnesium sulphate (MgSO4) for bronchospasm may be given”. | Add ASTHMA slide 18 or simply contrast the distractor with the DAPT instruction on STROKE slide 15. |

No problems found in the other nine new items: **AS-19, RA-11, CP-11, CP-12, CV-12, CV-13, ST-15, ST-16, ST-17**. Their evidence is ASTHMA 15; COPD 6–7, 9–11 and 29; ACS 14, 16 and 19; and STROKE 13, 17 and 24 respectively. CP-13's remaining discharge goals, service links and rubric points agree with COPD 27–29. All new keyed MCQ answers are supported by the permitted evidence; the findings above concern qualifications, explanation details and citations.

## Case-study removal check

**PASS against TASK.md's criterion:** case-insensitive scans of all 11 `content/*.json` files found zero occurrences of Vincent, Holly, Trent, Sarah or Lui. Semantic inspection covered all 76 questions (stems/prompts, options, rationales, explanations/models and rubrics), four skill files and the base metadata/context.

No question requires recall of a specific tutorial patient's orders, recorded findings or discharge. The removed AS-08, CP-02 and CP-08 IDs remain absent. Patient-specific oxygen orders, antibiotic orders and the named child's 4–5-hour discharge criterion are absent.

Search hits that remain are not patient-recall content:

- AI-05 names Assessment 3's “Case-Based Assessment” as a weighting distractor.
- AS-16/AS-17, CV-11 and CP-07/CP-09/CP-13 concern general education or discharge planning.
- AS-01/AS-02 use generic clinical cues, including values also seen in the former case, but supply those cues in the stem and test a condition-based threshold/category. They do not ask students to remember a tutorial patient's findings.
- AS-06/AS-07 and the oxygen/nebuliser notes retain the tutorial's general doctor's-note instructions from ASTHMA slide 18; no named patient's prescription or discharge regimen is tested.
- CP-03 and the COPD oxygen gap notice mention the tutorial discussion question, but test/document the chart recommendation and source gap rather than the case's undocumented management decision.

This result does not mean all hypothetical patient scenarios were removed; it means the remaining items test conditions and supplied general principles rather than tutorial-patient recall.

## Verification and handoff

- Start HEAD: `698cb641c8614072ce2df7a3e97c845f182cb92f`; repository root confirmed; initial `git status --short` was empty.
- `python nursing-a2/tools/build_reviewer.py --check`: **PASS**, `76 questions, 6 skill steps, 0 errors, 0 warnings`.
- Patient-name scan: **PASS**, zero hits across 11 JSON files; semantic case-study check: **PASS**, as qualified above.
- Only `nursing-a2/REVIEW-2.md` was written. No JSON, application, source or workflow file was changed; no staging or commits performed.
- Codex Done When 1: complete (spot-check table, new-item findings, case-study result and one-line summary).
- Claude Done When 2: pending — resolve the findings and two image-detail gaps, review the diff, rebuild and commit.
- UNKNOWN: the exact image wording for CP-13's regular review and CV-14's surgical modifier. CHECKED: extracted source text and authorised recorded image readings. NEEDED: Claude's targeted visual confirmation or removal of those additions.
- Search friction, count 1: `rg` with a literal `questions-*.json` path failed on Windows; repeating with the content directory and `-g 'questions-*.json'` succeeded. No workflow edit needed.

## Claude resolution (27 Sep 2026)

- AS-02: the stem now specifies a 10-year-old, and the mild/moderate rationale includes the young-child wording.
- CP-13: pulmonary rehabilitation is now conditional on the person being symptomatic. 'Regular review' was confirmed visually on COPD slide 29: '...written COPD action plan (and initiate regular review)'.
- CV-14: confirmed visually on ACS slide 30: 'Surgical ablation or pacing with an implanted cardioverter-defibrillator (ICD) for repeated episodes'. The explanation now uses that wording.
- ST-13: now cites slides 10-15. ST-14: the magnesium rationale now contrasts with the DAPT statement only.
