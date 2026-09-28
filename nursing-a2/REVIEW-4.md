# Heart failure question review — NA2-REVIEW-4

Summary: Reviewed HF-01–HF-07 against the supplied Lecture 3 text; four findings across three items, with no wrong MCQ keys identified.

Scope: Every stem/prompt, option, keyed answer, option `why`, explanation, SAQ model and rubric point was checked against L3 in `modules_text/CP2B_Lecture_3_slides.pdf.txt`, using its page markers. Findings concern fidelity to that source, not independent clinical guidance.

| Item ID | Issue type (factual error / wrong key / unsupported / ambiguous / wrong distractor logic / missing or wrong citation) | What is wrong | Source quote < 15 words | Suggested fix |
| --- | --- | --- | --- | --- |
| HF-03 | ambiguous | The second option's `why` replaces the lecture's directional/trend criteria with “if they are abnormal”. This can suggest that a result must be outside its normal range, whereas the lecture also names rising potassium or creatinine. The stem and key are supported. | L3 p.34: “Low BP or pulse, or a rising potassium or creatinine” | Keep the initial checks, then say to ask the MO before administration for low BP/pulse or rising potassium/creatinine. |
| HF-05 | wrong distractor logic | The third option's `why` uses the general instruction to know which medicines must never be stopped to reject skipping the diuretic. The cited page does not identify the diuretic as one of those medicines, so this rationale implies more than the source establishes. | L3 p.37: “which ones must never be stopped” | Explain that skipping on well days is not the instruction given: the lecture instructs morning rather than night dosing. Avoid implying a source-defined never-stop classification for the diuretic. |
| HF-05 | unsupported | The fourth option's `why` attributes “not to self-adjust” to the lecture. The page instructs contacting the HF nurse or GP at the stated weight/symptom trigger, but does not explicitly state a general prohibition on self-adjustment. | L3 p.37: “Call the heart failure nurse or GP if weight goes up” | Retain the approximately 2 kg in two days contact trigger and remove “not to self-adjust”. Say that taking the tablet only when weight rises is not the instruction on this page. |
| HF-07 | ambiguous | The model's final sentence and fifth rubric point merge the before/after diuretic checks into one shared list. L3 distinguishes baseline checks from response checks; the merged wording loses the explicit postural BP, urine output and weight-trend checks after administration. | L3 p.34: “After: urine output, postural BP, weight trend, potassium, magnesium” | Split both model and rubric into before: BP, weight, fluid balance, latest electrolytes and renal function; after: urine output, postural BP, weight trend, potassium and magnesium. |

IDs with no problems: **HF-01, HF-02, HF-04, HF-06**.

Other reviewed content in HF-03, HF-05 and HF-07 is supported. HF-07's daily-weight technique is supported by p.15, which is already cited in its second rubric point. The different weight thresholds in HF-01 (more than 2 kg in three days, p.15) and HF-05 (about 2 kg in two days, p.37) reproduce their respective lecture contexts and are not errors.

Verification: `python nursing-a2/tools/build_reviewer.py --check` — PASS: `160 questions, 205 skill steps, 0 errors, 0 warnings`. This validates content structure; it does not resolve the source-fidelity findings above.

Acceptance: Codex review complete. Claude owns any question fixes, rebuild, final review and commit.

## Claude resolution (28 Sep 2026)

All four findings fixed as suggested. HF-03: the rationale now uses the lecture's low BP/pulse and rising potassium/creatinine wording. HF-05: both distractor rationales now say only 'not the instruction given', plus what the lecture does say. HF-07: the model and rubric now split the before and after diuretic checks.
