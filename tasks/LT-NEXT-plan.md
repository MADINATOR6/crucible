Follow HANDOFF.md, Planner instruction (it replaces the Researcher instruction for this task).

# LT-NEXT plan brief: what to improve next in lifting-tracker

## Goal
The user asked "what to do to improve the lifting tracker". Produce a ranked shortlist of the
next improvements worth making to `lifting-tracker/`, grounded in the code as it stands today.
This is a prioritisation question, not an implementation task: no files change in this run.

## What I need back
1. A ranked list of at most 7 candidate improvements. For each: what it is, why it matters to a
   single athlete using this app for their own training, the paths it would touch, rough size
   (S/M/L), and the risk tier (see AGENTS.md, Risky Changes).
2. For the top 3, the approach in steps, a write allowlist, Done When items and Verify commands
   that already exist in this repo.
3. Anything you judge is NOT worth doing, and why. Say plainly if you think the app's next win is
   quality/correctness rather than a new feature.
4. Ground every claim about the code in path:line. Mark anything you could not check
   UNKNOWN / CHECKED / NEEDED.

## Known constraints
- Offline-first PWA, plain ES modules, no build step, one vendored dependency (three.js, 3D only).
  No accounts, no server, no analytics, no third-party scripts. All data on the device.
- Pushing anything under `lifting-tracker/` to `main` republishes the live GitHub Pages app, so
  app changes also need `VERSION` in `lifting-tracker/sw.js` and `APP_VERSION` in
  `src/ui/updates.js` bumped together.
- Must work on both iOS (Safari) and Android (the user is an Android user).
- The athlete's real workbook and anything derived from it is private: never read it, never commit
  it. Tests use synthetic data only.
- `lifting-tracker/README.md:146` already names the author's own remaining list: flexible session
  scheduling/substitutions, personal coaching calibration, readiness tracking, a consolidated meet
  workflow, nutrition logging refinements, conflict-aware device sync. Treat that as input, not as
  the answer — say which of those actually earn their place and which do not.
- Prefer the smallest correct change. The repo's bias is against speculative features.

## Relevant paths
- `lifting-tracker/ARCHITECTURE.md`, `lifting-tracker/README.md`, `lifting-tracker/GENERATOR.md`
- `lifting-tracker/src/core/`, `src/store/`, `src/ui/`, `src/import/`, `src/plates/`
- `lifting-tracker/test/` (suites run with `cd lifting-tracker && node --test`)
- `AGENTS.md` (roles, routing, scope, risky changes), `FRICTION.md`
