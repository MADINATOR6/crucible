Follow HANDOFF.md, Verifier instruction. Read-only review of the uncommitted diff in lifting-tracker/ (git diff -- lifting-tracker).
Intent: Progress "By block" table and planned-vs-actual RPE should include sets logged in the app (app.programmeMerged) instead of only the imported programme (app.analysisProgramme). Files: src/ui/views/progress.js, test/ui/progress-source.test.js, sw.js and src/ui/updates.js (lt-v25 -> lt-v26).
Try to break it: double counting of a logged replacement for an imported set, warm-ups, workbookHistory=false, null programme, unassigned Quick Log sets. Run: cd lifting-tracker; node --test test/ui/progress-source.test.js. Do not edit files.
Reply: Status (PASS | CHANGES), findings with path:line, and a TWINS: line.
