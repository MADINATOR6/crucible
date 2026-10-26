# LT-USE-2: keep workout context and dismiss floating controls

User feedback after publishing lt-v14: timer and Undo get in the way; ticking/editing a set or changing Data collapses the current screen and forces repeat navigation. Continue the authorised app fix/publication workflow. Start HEAD 7df3c40, branch codex/lt-use-2. Synthetic data only. Preserve unrelated base checkout changes.

Write allowlist: this spec; lifting-tracker/src/ui/{dom.js,rest-timer.js,app.js,updates.js}; lifting-tracker/src/ui/views/{train.js,data.js}; lifting-tracker/styles/app.css; lifting-tracker/sw.js; lifting-tracker/test/ui/{interaction.test.js,navigation.test.js,train-focus.test.js}; lifting-tracker/README.md. No data model, database, importer, generator, dependencies or private data changes.

Implementation: shared horizontal swipe dismissal for the timer and toast; vertical page scrolling and taps on Undo/+30/close still work. Swiping never runs Undo. Add a labelled message close button for a non-gesture alternative. Swipe timer matches its existing close action. Retain opened workout/week/settings details, focused controls and scroll on same-view saves; restore sheet focus without scrolling or focusing detached old controls. Explicit tab/day navigation remains deliberate. Stable disclosure keys include training-day identity. No automatic advance to another day. Version/cache lt-v15.

Done when:
- [x] Synthetic regression tests cover swipe directions, short/vertical/cancelled drags, action safety and close behavior.
- [x] Same-view rerender keeps open sections, focus and scroll; new day/tab navigation does not inherit unrelated section state. Saving a set retains the expanded workout; settings date changes retain expanded controls.
- [x] Full app suite, syntax, diff and ccx scope/secrets verification pass (362 passing, 1 opt-in skip).
- [x] Narrow browser workout/settings/swipe checks pass with synthetic data; Claude scoped review passes. Review fix: the `rise` entry animation now uses `translate`, so the toast and timer no longer jump off-centre as they appear.
- [ ] Publish requested fix and verify public lt-v15; physical gesture/keyboard behavior remains user-owned.

Stop if a fix would change stored training records or overwrite unrelated files. Keep native vertical scroll and accessible button alternatives. No new permissions, remote services or framework.
