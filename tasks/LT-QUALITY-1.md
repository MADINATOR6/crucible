# LT-QUALITY-1: Cross-device quality and data safety

Direct user assignment: improve the Crucible tracker; support PC, Mac, Android and Apple devices. Dispatch; no staging, commit, push, publish or mirror sync. Existing changes, including train.js styling, must be preserved. Synthetic data only. User authorizes implementation; this saved spec makes scope reviewable.

## Write allowlist
lifting-tracker/src/store/db.js, lifting-tracker/src/ui/state.js, lifting-tracker/src/ui/dom.js, lifting-tracker/src/ui/app.js, lifting-tracker/src/ui/views/train.js, lifting-tracker/src/ui/views/progress.js, lifting-tracker/src/ui/share-image.js, lifting-tracker/src/ui/rest-timer.js, lifting-tracker/styles/app.css, lifting-tracker/index.html, lifting-tracker/manifest.webmanifest, lifting-tracker/sw.js, lifting-tracker/src/ui/updates.js, lifting-tracker/test/, lifting-tracker/README.md, tasks/LT-QUALITY-1.md, handoffs/LT-QUALITY-1.md. No private files.

## Acceptance
- [x] Atomic shared-list/settings writes prevent cross-tab lost updates; stale program/restore protection assessed and tested.
- [x] Workout shows last comparable logged performance with safe explicit repeat action.
- [x] Progress distinguishes imported estimated dates from actual logged sessions and permits actual-only analysis.
- [x] Dialog keyboard access, touch layouts, safe areas and browser fallbacks improved.
- [x] Rest timer survives app reload where storage is available; feature absence is graceful.
- [x] Existing failing markup assertions corrected without weakening behavior checks.
- [x] Synthetic regression checks pass; app/cache version synchronized.
- [x] Browser/physical-device limitations and remaining broader roadmap recorded honestly.
- [x] Independent review of risky changes (Claude per AGENTS.md), no invented acceptance.

## Boundaries and verification
No training formula changes, cloud sync, data migration, extra dependencies or invented athlete history. Existing Coach draft review, backup previews and undo remain. Local node --test and syntax/diff checks; browser checks when enabled, otherwise document blocker and provide reproducible browser smoke procedure. Full device certification requires actual Apple/Android hardware. Stop on data integrity failures and report, never weaken validation.


## Evidence and boundaries
Full `node --test` (2026-11-01): 404 pass, 0 fail, 1 opt-in real-workbook skip. Syntax checks of changed modules and git diff --check pass. Existing train.js styling preserved; exact-class test assertions now accept extra classes while retaining behavior assertions.

Actual browser use is disabled by Work settings. Real IndexedDB smoke and physical iPhone/iPad/Android/Mac checks are NOT RUN. The Node IndexedDB-shaped concurrency harness is not browser certification. Independent Claude review APPROVE, including the final queued-save guard addendum. No commit, push, deployment or final ccx done claimed.

Pre-existing dirty paths were recorded from initial git status in the session: workflow/config files, finance-shorts files, train.js styling, nursing notes tooling, media/task prompts and unrelated folders. None were reverted/staged. Task owns only tracker and its own spec/handoff. No late baseline capture is used to erase unrelated dirty paths from verification.

Final review receipts: %TEMP%/LT-QUALITY-1-claude-final-review.txt and %TEMP%/LT-QUALITY-1-claude-addendum.txt. ccx final acceptance remains blocked by unrelated pre-existing dirty paths; do not mark task done or publish.
