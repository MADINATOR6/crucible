---
crucible: brief
id: SAVE-FEEDBACK-REVIEW
owner: codex        # Gemini reviewed the recording; Codex checks the behaviour
type: ux-review
class: normal
risk: low
owns: [Reference/Save feedback review.md]
checks: [lt-persist]
---
# Can the athlete tell a logged set was saved?

## Outcome
One finding about the lifting tracker's save feedback, checked two ways, recorded in `Reference/Save feedback review.md`:
1. **Gemini (UX):** watch the recording and judge whether a user can tell the set was saved. Report at most one issue, with the timestamp (mm:ss) where it shows and what is on screen at that moment. If there is no issue, say so with the timestamp of the moment that proves it.
2. **Codex (behaviour):** check whether the logged set actually persisted (the permitted check `lt-persist` runs the browser smoke test for a logged set surviving a reload) and record either a fix proposal or an evidence-backed dismissal of Gemini's finding under a `## Codex check` heading in the same file. Do not edit the app.

## Inputs
- Recording (shareable: the app's built-in EXAMPLE programme, no personal data): `media-out/crucible-demo/log-a-set.webm`, 17.7 s, Pixel 5 size. Sequence: app opens, the current set's log button is tapped, 142.5 kg x 4 @ 8.5 is typed, Save, the page reloads, the Full workout list opens.
- Timestamped PNG snapshots of that recording are in `media-out/crucible-demo/frames/`. If the video format is unavailable to your file tools, inspect the PNGs directly and state the sampling limit in the report. The filename gives the time in seconds.
- App code, read only: `lifting-tracker/src/ui/`, and `lifting-tracker/e2e/smoke.spec.js` (test "a logged set is still there, unchanged, after a reload").

## Done When
- `Reference/Save feedback review.md` has a `## Gemini review` section with the finding, its timestamp and the on-screen evidence, and a recommendation.
- It has a `## Codex check` section (after the owner switches to Codex) with the command run, its result, and fix proposal or dismissal.
- Each report ends with `Next owner:`.

## Answers
Replies to an agent's question go here; launching again sends them.

## Status
![[Status/SAVE-FEEDBACK-REVIEW]]
