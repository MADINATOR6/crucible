# LT-USE-1: finish the daily usability loop

User authorised items 1-6 in this chat. Dispatch mode; Codex implements and verifies, Claude reviews and owns commits/publication. Risk high: logged data, undo and replacement workflows. Start HEAD dcf1e2a. Worktree codex-LT-USE-1. Synthetic fixtures only; no athlete workbook or private folders.

## Scope and ownership

Only these paths may change (all below lifting-tracker/ except this spec):
- src/ui/views/train.js, plan.js, data.js; src/ui/state.js, app.js, dom.js, updates.js, drafts.js.
- styles/app.css, UI-CLASSES.md, sw.js, README.md.
- test/ui/usability.test.js, recovery.test.js, updates.test.js, import-review.test.js, state.test.js, plan-flow.test.js, train-focus.test.js, navigation.test.js, sw.test.js.
- tasks/LT-USE-1.md for this execution checklist/report.

Parent owns state/storage integration, Coach recovery, updates/SW/app shell, CSS/docs and integration. Train worker owns train.js and usability.test.js. Import worker owns data.js and import-review.test.js. Workers are not alone; no overlapping writes, no nested agents, no Git mutations. No npm/dependencies, schema migration or remote service. Existing meta store suffices. Temporary synthetic browser fixtures/screenshots may be saved in the chat's writable visualizations directory, not committed.

## Resolved behavior

1. Actual session date: default new logs to today, never silently to estimated programme dates. A visible date selection applies to the chosen training day/session, with explicit backdated/future labels. Editing a saved set preserves its saved date. Existing history/dates are not rewritten. Quick logs default today. logAsPlanned accepts an explicit date and defaults today.
2. Mistake recovery: ordinary saves, edits and removals get Undo using an atomic, receipt-based state API. Only the most recent unchanged set operation is reversible; stale receipts reject instead of overwriting newer work. Preserve empty-session cleanup, planned-set identity, PR recomputation and transactional failure behavior. Inline errors identify/focus invalid fields and preserve entered values. No validation is weakened.
3. Unsaved input recovery: keep only one unsaved set form and Coach request/settings locally in IndexedDB meta, bounded and whitelisted at UI restore. Recover as clearly UNSAVED; never auto-log or auto-add a generated block. Persist editable Coach inputs only; rebuild previews from current history after recovery. Preserve raw form strings, units, date and set identity; never silently attach to a changed programme. Save/cancel/discard clears the applicable draft. Clear drafts when replacing programme/backup/resetting data. No live models/DOM/undo receipts in drafts or backups. Storage-unavailable status must be honest.
4. Import/restore preview: parse/validate before mutation, show planned blocks/sets and warnings, distinguish existing logged sets from planned sets, and state exactly what will be replaced/kept. Offer an export/share backup first, keep preview open afterward. Cancel leaves all data unchanged. Disable repeated Apply while writing; errors stay visible and preserve current data. Reject stale previews if training data changes while open. Preserve existing importer/privacy/restore validation.
5. Version/update status: Data shows loaded app version plus update/check status. Waiting updates are explicit actions, can wait until after a workout, and must not auto-reload a form/session. Classic service worker retains offline caching and weekly summary handlers; future updates wait until user activation (first install still activates). One UI version constant and SW version are kept equal by a test. New runtime files must be precached, cache advances to lt-v14. No new notifications/permissions are requested.
6. Workout verification: exercise current set, keyboard/form errors, correction/undo, timer/next set, draft recovery after reload, synthetic import cancellation/application and offline reopen. A responsive browser pass is not physical Samsung evidence. No connected Android/ADB was found; ask for an existing connection or a user-run checklist and report any physical checks as pending.

## APIs shared between parent and workers

- app.logSet(input, { withUndo: true }) -> { set, undoToken }; existing callers without option still receive the set.
- app.deleteSet(id, { withUndo: true }) -> { removed, undoToken }; existing callers remain compatible.
- app.logAsPlanned(...) -> { set, newPRs, undoToken }; app.undoSetChange(undoToken) atomically reverses that exact latest set change.
- app.getDraft('set'|'coach') -> cloned envelope { value, savedAt } or null; app.saveDraft(kind, plainObject), app.clearDraft(kind). Writes do not trigger a page rerender. Reject oversized/non-object input; UI whitelists fields on restore.
- app.dataRevision is incremented on training/programme/restore changes (not settings or draft writes), for import-preview staleness.
- ui.updates supplied by app shell: { status, version, check(), apply() }. Status: checking/current/available/offline/error/unsupported/development. Data imports APP_VERSION from ../updates.js; optional absence is handled.

## Checks / done when

- [x] 1 Actual date and existing history covered by synthetic tests (Codex).
- [x] 2 Save/edit/remove Undo and validation tested, including stale receipt and failed transaction (Codex).
- [x] 3 Coach and set inputs survive app reopen; malformed/stale drafts cannot write or break views (Codex).
- [x] 4 Preview/cancel/apply/backup/error/staleness paths covered for synthetic workbook and JSON restore (Codex).
- [x] 5 Version, waiting update, explicit activation and no unsolicited reload tested; all modules precached (Codex).
- [x] Full `cd lifting-tracker; node --test`, changed-JS `node --check`, `git diff --check`, ccx verify pass (Codex).
- [x] Browser workout/offline/reload pass with synthetic data and screenshots (Codex).
- [ ] Physical Samsung pass (user/device access; report pending if unavailable).
- [x] Independent read-only verifier and Claude risky-diff review; no commit/release by Codex.

## Execution report (2026-10-26)

Status: READY_FOR_CLAUDE_REVIEW / publication handoff. Start HEAD dcf1e2a; branch codex/lt-use-1. All implementation and review checks finished. User explicitly chose to run the Samsung checklist; it is in lifting-tracker/README.md. Physical pass and Claude-owned commit/release remain open. No stage, commit, push, deploy or OneDrive sync was performed.

Checks from this run:
- `cd lifting-tracker; node --test`: exit 0, 357 passed, 1 opt-in real-workbook skip, 0 failed. LT_REAL_WORKBOOK was unset; no private workbook was read.
- `node --check` on changed runtime JS (state, app, Train, Coach, Data, drafts, updates, sw): exit 0. New UI tests also parsed and ran in the suite.
- `git diff --check`: exit 0. Only allowlisted files changed; new draft/update modules, four synthetic UI tests and this spec are untracked pending Claude commit.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ccx.ps1 verify -TaskId LT-USE-1`: exit 0. JSON, secrets, scope, memory PASS; no formatter/linter configured; unrelated stages N/A.
- Independent verifier (separate Codex worker): initial timer stacking and waiting-version wording findings fixed. Final read-only signoff PASS; 18 focused tests passed, exit 0.
- Claude planning review completed; saved-date edits, queue-based receipt/replacement checks and backup draft exclusion were addressed. Scoped risky diff review PASS; five follow-up suggestions fixed; second/final review PASS with no blocking regressions. Review captures: C:/Users/Madison/AppData/Local/Temp/LT-USE-1-claude-review.txt and LT-USE-1-claude-final.txt. Source and synthetic tests only were supplied through the authorised existing Claude account.
- Browser, 390 x 844: inline fractional-reps error retained inputs and focused Reps; recovered 151.5 kg x 3 after reload without logging; saved and advanced current set/timer; receipt Undo visibly restored the previous progress. Coach request survived reload as UNSAVED without adding a block. Synthetic workbook preview/Cancel kept source and 2 logged sets; Apply replaced the planned block and kept both logs. Final build reinstalled its 63 offline files. With the local server stopped, reload recovered a separate unsaved 82.5 kg set and both stored logs. Screenshot: C:/Users/Madison/.codex/visualizations/2026/10/25/01a172d4-a189-7610-8e2f-35125674ada1/usability-offline.jpg.

Decisions: settings/draft writes do not invalidate an import preview; training/programme writes do, checked inside the queue. Editing a planned log without an explicit date keeps its saved date. First installation can activate naturally; later workers wait for Apply, and other controlled tabs offer a manual reload. Version 13 users must fully close the app and site tabs once to let version 14 activate. Draft recovery from memory-only fallback is explicitly temporary. No database version or dependencies changed.

UNKNOWN: Samsung keyboard/touch ergonomics, screen wake lock, vibration and installed-app close/reopen behavior; these need the user-run device pass. Live deployment is unchanged. CHECKED: synthetic browser, offline cache, automated suite, scope and independent/Claude reviews. NEEDED: Claude commit/release, then user Samsung checklist; report any failure before declaring physical acceptance.

Stop on real-data exposure, inability to preserve existing records, or unsafe undo/import semantics; report exact blocker. Preserve the base checkout's unrelated changes.

## Publication authorisation

After the reviewed implementation handoff, the user explicitly requested: "publish first then ill complete the checklist". This authorises the task-scoped commit, integration and GitHub Pages publication now, overriding the earlier Claude-only release handoff for this request. Physical Samsung acceptance remains with the user after publication. Publish only the reviewed LT-USE-1 changes; preserve all unrelated working-tree files.
