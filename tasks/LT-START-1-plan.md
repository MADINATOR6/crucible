Follow HANDOFF.md, Planner instruction (it replaces the Researcher instruction for this task).

# LT-START-1 plan brief: use the app without a coach's workbook, and choose whether workbook history counts

## Goal
Today `lifting-tracker/` only becomes "yours" after importing a coach's .xlsx. Without one the athlete stays on
labelled example data and the Coach tab refuses to work (`src/ui/views/plan.js:236-237`,
`src/ui/state.js:157-169`). Plan the change that removes that dependency. No files change in this run.

## User requirements (decided with the user 2026-11-10; do not reopen)
1. **Start without a workbook.** A beginner, or someone back from a long break, with no tracked programme
   enters their stats (recent best squat, bench and deadlift, and training days per week) and the app builds
   a first block as their own programme, not example data. A "back from a break" option starts lighter and
   ramps up. Must be beginner friendly: plain words, few fields, nothing that assumes a coach.
2. **Same Coach review for everyone.** The existing Coach review and block builder work for that athlete
   from the sets they log in the app, the same way they work for a workbook athlete.
3. **History choice for workbook athletes.** Import asks whether the workbook's past weeks count in Progress
   and Coach, or the athlete starts clean from today. One switch in Data changes it later. Nothing is deleted
   either way.

## What I need back
- Approach in steps, a write allowlist, Done When items, Verify commands that already exist in this repo, and
  stop conditions.
- Where the starter block comes from. Check before proposing anything new: `src/core/generator.js`
  (`generateBlock`, `projectedE1rm` and its `layoffWeeks`), `src/core/template.js` (`learnTemplate` needs a
  programme to learn from), `src/core/athlete.js` (`buildAthleteModel` needs events), `src/ui/example-data.js`
  (a ready-made block shape). Prefer reusing these over a second generator.
- How entered stats become what the generator needs, and what is stored so the Coach review still has
  something true to say in week 1.
- The history switch: one place that decides it (find every reader of imported history: `app.events()`,
  Progress's existing `All history / Logged only` filter at `src/ui/views/progress.js:187-189`, the Coach
  review, bodyweight points at `src/ui/state.js:297-307`). Say which of those the switch governs and which
  it must not.
- Storage and backup consequences: `sanitizeProgramme`, `sanitizeSettings`, `BACKUP_VERSION` policy in
  `src/store/backup.js:6-10` (now 4), and whether any of this needs a format bump.
- Every claim about the code grounded in path:line. Mark anything unchecked UNKNOWN / CHECKED / NEEDED.

## Known constraints
- Offline PWA, plain ES modules, no build step, no new dependency, no network. iOS Safari and Android Chrome.
- Smallest correct change; reuse what exists; no speculative features (no exercise picker, no accounts).
- The working tree already holds uncommitted LT-CALORIE-2 and UI compatibility edits (`sw.js` is lt-v24).
  Plan on top of the working tree, not HEAD.
- Tests use synthetic data only. Never read `*.xlsx` or anything under `privacy.excludePaths`.
- Risk tier: risky (programme data model, important business logic). Plan for a verifier run.

## Relevant paths
`lifting-tracker/src/ui/state.js`, `src/ui/views/{plan,data,train,progress}.js`, `src/ui/example-data.js`,
`src/core/{generator,template,athlete,coach}.js`, `src/store/{programme-schema,backup}.js`,
`lifting-tracker/GENERATOR.md`, `lifting-tracker/ARCHITECTURE.md`, `lifting-tracker/test/`.
