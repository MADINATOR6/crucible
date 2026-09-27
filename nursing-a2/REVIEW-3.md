# NA2-REVIEW-3

Source-text review: 77 Module 1–4 questions checked; one incomplete safety answer and two citation gaps identified, with no wrong keyed answers found. Guide and core skill coverage and image-only limitations are recorded below.

Baseline: `6b264fe59d4a9aabc490d588bbb18a67c01dbe7a`. Review is against the cited local source text, not an independent clinical-guideline review. Locations use the extraction markers, not the documents' printed pagination. Known conflicts in `CONFLICTS.md` were not re-reported. Suggested changes are for Claude; content files were not edited.

## Findings (corrections first, verification limitations last)

Guide identifiers below use section ID / block heading / one-based point number. Skill identifiers use skill / variant / one-based step or note number.

| Item ID | Issue type (factual error / wrong key / unsupported / ambiguous / wrong distractor logic / missing or wrong citation / cannot verify (image-only)) | What is wrong | Source reference (short quote < 15 words) | Suggested fix |
|---|---|---|---|---|
| M4-11 | factual error | The model and water-test rubric omit **throat clearing** from the stop signs. The question asks for the ASSIST stop rules; a learner could omit this distinct trigger while satisfying the supplied answer. | ASSIST p.1, sections 3 and 4: “Any coughing/throat clearing” | Add “coughing or throat clearing” to the model and water-test rubric. Keep NBM and speech pathology referral. |
| M4-08 | missing or wrong citation | The keyed answer is supported by p.14, but the distractor explanation rejecting auscultation is on p.13, and the nostril-mark monitoring explanation is on p.15. Neither page is cited. | NGTPOL p.13: “Never use auscultation as a form of tube position confirmation”; p.15: “ensure that there has been no migration” | Retain p.14 and add p.13 and p.15 to support the distractor explanations. |
| M4-09 | missing or wrong citation | The keyed answer is supported by p.15. The explanations about absence of coughing and the limitations of an old x-ray are on other pages. | NGTPOL p.16: “the absence of coughing does not rule out misplacement or migration”; p.14: “indicative at the time of the x-ray only” | Retain p.15 and add p.14 and p.16. No answer-key change. |
| oxygen / hudson steps 1–24; nrb steps 1–26; venturi steps 1–25; oxygen note 1; g-o2 / Devices points 3–4 (O2CHK portions); g-o2 / Every device, every time point 1 | cannot verify (image-only) | **One grouped O2CHK limitation:** the three appraisal forms are image-only. Their 75 steps and the form-derived note/guide details cannot be checked against extracted text. Other citations support the device ranges, reservoir inflation and Venturi settings. | O2CHK p.1–3: no substantive extracted text available to quote. | Retain as unverified in this text review; Claude should compare the transcribed details with the three appraisal-form images. |
| g-neb / Driving gas (sources differ) point 2; g-asthma / Assessment and severity point 1; g-asthma / Treatment and escalation point 1 (diagram-derived portions) | cannot verify (image-only) | ASTHMA slides 15–16 contain no substantive extracted diagram text. Severity thresholds, continuous oxygen-driven nebulisation and the associated escalation instructions cannot all be verified from these exports. Slide 18 and S126 support only parts of the treatment point. | ASTHMA slide 15: “Australian Asthma Handbook”; slide 16: page number only. | Check the original figures before calling these points verified. Do not infer an error from absent extraction. |
| g-neuro / AVPU and GCS point 3 | cannot verify (image-only) | The cited STROKE slide 21 chart is absent from the text extraction. A similar readable chart exists in LAB1PKG p.8, but that is not the source cited by this guide point. | STROKE slide 21: “Glasgow Coma Scale” | Check the slide image, or cite LAB1PKG p.8 after comparing all scoring and escalation details. |
| g-copd / Key points point 4 | cannot verify (image-only) | The cited COPD slide 29 treatment chart has only its page number in the text export. The stepwise therapy, vaccination, rehabilitation and technique-check claims cannot be verified from that text. | COPD slide 29: “29” | Compare with the original chart. |
| g-pneu / Key points point 2 | cannot verify (image-only) | The symptoms diagram is absent from the cited page's text extraction. | COPD slide 13: “Case Study: Pneumonia” | Compare each listed symptom with the original diagram. |

## IDs with no problems found

### Questions

- M1-01, M1-02, M1-03, M1-04, M1-05, M1-06, M1-07, M1-08, M1-09, M1-10, M1-11, M1-12, M1-13, M1-14, M1-15, M1-16, M1-17, M1-18, M1-19, M1-20.
- M2-01, M2-02, M2-03, M2-04, M2-05, M2-06, M2-07, M2-08, M2-09, M2-10, M2-11, M2-12, M2-13, M2-14, M2-15, M2-16, M2-17, M2-18, M2-19, M2-20, M2-21, M2-22, M2-23, M2-24, M2-25.
- M3-01, M3-02, M3-03, M3-04, M3-05, M3-06, M3-07, M3-08, M3-09, M3-10, M3-11, M3-12, M3-13, M3-14, M3-15, M3-16, M3-17, M3-18, M3-19, M3-20.
- M4-01, M4-02, M4-03, M4-04, M4-05, M4-06, M4-07, M4-10, M4-12.

Question coverage: 20 + 25 + 20 + 12 = **77**; 74 have no findings. Stems, options and their explanations, answer keys, models, rubrics and citations were included. M3-15's rewritten version was included.

### Guide

Guide coverage: **14 sections, 107 points**. No discrepancy was found in the readable cited text; the image-dependent points listed above remain unverified.

- g-ausc: all 15 points.
- g-ecg: all 10 points.
- g-o2: Principles points 1–5; Devices points 1–2. Devices points 3–4 are text-supported by S125/WB2, with their O2CHK citations covered by the grouped limitation.
- g-neb: Why and when points 1–3; Procedure essentials points 1–5; Driving gas point 1.
- g-agh: all 6 points.
- g-neuro: Focused neuro assessment points 1–2; AVPU and GCS points 1–2.
- g-bls: all 7 points.
- g-asthma: Assessment and severity point 2; Treatment and escalation point 2; Self-management points 1–2.
- g-copd: Key points 1–3 and 5.
- g-pneu: Key points 1 and 3.
- g-cardfind: all 7 points; g-acs: all 9 points; g-hf: all 7 points.
- g-stroke: all 7 points. Its general failed-screen referral statement matches the cited Canvas page 4.3; it does not enumerate water-test signs, so M4-11's omission does not apply here.

### Core skills

- auscultation / procedure steps 1–19; workbook steps 1–14; core notes 1–4.
- ecg / 12lead steps 1–32; monitor steps 1–16; notes 1–4. Note 4 explicitly labels the critical-step rationale as an editorial inference and does not claim assessor fail criteria.
- nebuliser / text steps 1–23; workbook steps 1–10; notes 1–6.
- oxygen / np steps 1–10; notes 2–5. Note 1's Canvas assessment statement is supported; its O2CHK-derived portion remains unverified.

Skill coverage: **124 text-backed core steps + 75 image-only core steps = 199 core steps**. The six supplementary auscultation steps are outside the requested core-step scope. Of 20 notes, 18 wholly text-backed core notes have no discrepancy; oxygen note 1 is partly image-dependent; auscultation note 5 is supplementary (its COPD slide 9 citation was also checked and supports it).

## Verification and handoff

- `python nursing-a2/tools/build_reviewer.py --check`: PASS — `160 questions, 205 skill steps, 0 errors, 0 warnings`. This checks content structure, not clinical correctness.
- Only `nursing-a2/REVIEW-3.md` was written by this review. No staging, commits, builds that write output, or content fixes were performed.
- Initial Git status already contained modified `nursing-a2/GAPS.md`. During review, unrelated changes also appeared in `MEMORY.md`, `nursing-a2/CONTENT_MAP.md`, and untracked `nursing-a2/content/questions-hf.json`. These were preserved. Therefore the task's literal “only REVIEW-3.md added” working-tree check cannot pass against this shared working tree.
- Codex acceptance: report produced with findings, short source quotations, fixes, clean IDs and coverage limitations. Claude owns fixes, rebuild, final review and commit.

## Claude resolution (28 Sep 2026)

- M4-11: 'coughing or throat clearing' added to the model answer and the water-test rubric point.
- M4-08: added NGTPOL p.13 and p.15. M4-09: added NGTPOL p.14 and p.16.
- g-neuro GCS point: now cites the readable Lab 1 package chart (LAB1PKG p.8, which has the clinical review and rapid response rules) as well as STROKE slide 21.
- Image-only groups: the O2CHK steps were transcribed by Claude directly from the three appraisal-form images on 27 Sep. The ASTHMA 15-16, COPD 13 and 29 figures were read visually earlier (REVIEW.md, Claude resolution; the asthma figures at full resolution). Verified by Claude visually, not independently by Codex.
- Not in this review: questions-hf.json (HF-01 to HF-07, written by Claude from Lecture 3 p.10-37 after this review started).
