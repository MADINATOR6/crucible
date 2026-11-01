# LT-QUALITY-1: local quality update ready for device validation

Repository: C:/Users/Madison/code/claude-codex-collab; start HEAD 10908c0. User selected Crucible and authorized improvements and cross-device support. Dispatch mode. Existing edits preserved, including train.js styling. No staging, commits, push, publish or mirror sync. No private data read. Saved scope: tasks/LT-QUALITY-1.md.

## Implemented
- Atomic food/activity additions and settings list/map deltas against current storage; atomic programme appends/revisions.
- Same-transaction stale guards on workout save/delete/Undo, block removal, programme replacement, backup restore and reset. A coded conflict refreshes the app before rejection; no destructive action retries automatically. Broadcast notifications refresh other tabs when supported.
- Last actual working set on Train and explicit Use last numbers: weight/reps conversion, fresh effort entry, no automatic save. Stale form sources and saves queued behind reload are rejected.
- Actual-only strength chart option, with clear limits and imported-date provenance.
- Same-tab rest recovery, image-sharing fallback, named keyboard-accessible nested dialogs, safe-area spacing, iOS input sizing, landscape support. App/cache lt-v21.

No schema, dependency, training or nutrition formula changes. Larger scheduling/substitution, personal calibration, readiness, meet-flow, nutrition-polish and device-sync features remain future work.

## Evidence
- Final node --test: 404 pass, 0 fail, 1 opt-in workbook skip (405 total). Log: %TEMP%/LT-QUALITY-1-full-tests.log.
- Changed-module syntax checks and git diff --check: PASS.
- Genuine independent Claude review: APPROVE after stale-tab recovery fix; final queued-save guard addendum also APPROVE. Receipts: %TEMP%/LT-QUALITY-1-claude-final-review.txt and LT-QUALITY-1-claude-addendum.txt.
- Codex peer verifier found and helped resolve nested Escape handling and form-date issues; focused tests passed. Final integration added queue revision guard and regression.
- Local preview http://127.0.0.1:5187/ running. Home, version module and browser smoke HTTP routes return 200. HTTP delivery is not render proof.

## Acceptance limits and next owner
Browser inventory explicitly reported Local browser use is disabled in Work settings. Real IndexedDB smoke page and physical Safari/iPhone/iPad/Android/Mac checks NOT RUN. Node's IndexedDB-shaped harness is not real-browser proof. README gives exact manual checks; /test/browser/storage.html uses an isolated synthetic database and refuses non-local origin. Use it on the local preview, then verify actual devices before release.

ccx verify JSON/secrets/memory checks passed; scope fails because unrelated dirty files predated this task and were not baseline-captured at dispatch. None were reverted or staged; no late baseline capture hides them. ccx done/acceptance NOT claimed. Final acceptance/commit/publish remain with Claude under AGENTS.md; separate existing edits before release. A main push touching lifting-tracker publishes via Pages.

Known limits: guarded writes scan every store (measure with large history before introducing revisions); remote refresh safely clears Undo; notifications can be delayed; distinct devices/origins do not sync. Stale preview must be recreated, changed set reopened, failed refresh manually reloaded. Same-tab timer recovery depends on session storage surviving the OS lifecycle.
