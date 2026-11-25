# Next: finish the Obsidian + Gemini (agy) integration

State (commits cb7b162..HEAD on main, not pushed): Gemini owns tasks through the Antigravity CLI `agy` 1.5.17
(installed at %USERPROFILE%\.local\agy\bin, signed in with the user's Google AI Pro account; NOT %LOCALAPPDATA%,
which the Claude desktop app's MSIX package redirects). Obsidian bridge: scripts/crucible.ps1, plugin
.obsidian/plugins/crucible, Start Here.md, Status/ (generated). Tests: scripts/test-crucible.ps1 19/19,
scripts/test-codex-dispatch.ps1 64/64. Case A (Codex routine, task DISPATCH-HEADER) is done.

## Open items, in order
1. agy headless ends with an empty response when it tries any shell command not allowed
   (stderr: "a tool required the command permission ... auto-denied"; agy log in
   %USERPROFILE%\.gemini\antigravity-cli\log). agentShell is now [] on purpose: open git prefixes allow
   `git diff --output=...`. Find what agy tries (rerun with --output-format stream-json, or read the
   conversation in the log) and fix without broad shell: e.g. the launcher puts HEAD and `git status --short`
   into the prompt and HANDOFF.md "Briefs from Obsidian" tells Gemini not to run git. Also replace the
   invalid deny tool `edit_file` in scripts/codex-dispatch.ps1 (agy log: unknown action) with agy's real
   edit tool names.
2. Resume Case B: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\crucible.ps1 launch -Note tasks/GUIDE-TO-WRITING-A-BRIEF.md`.
   Deliverable Reference/Writing a brief.md exists (7 passages, check-sources PASS). Then
   `ccx verify -TaskId GUIDE-TO-WRITING-A-BRIEF`, a review by another agent (`ccx task review -By codex`),
   `ccx task done`, commit the brief and deliverable.
3. Case C: tasks/SAVE-FEEDBACK-REVIEW.md (owner gemini; recording media-out/crucible-demo/log-a-set.webm,
   frames media-out/crucible-demo/frames/). Launch; then set `owner: codex` in the brief and launch again
   (Codex runs check lt-persist and writes "## Codex check"); Claude reviews with ccx task review.
4. Obsidian UI (user asked the agent to do it): Open folder as vault C:\Users\Madison\code\claude-codex-collab,
   Trust author and enable plugins, open Start Here, run Crucible: Launch from the ribbon on one brief, and
   confirm Status updates in Obsidian.
5. Docs: README/AGENTS Commands line for agy; FRICTION.md rows (MSIX AppData redirection hid installs from
   background runs; agy headless deny ends the run) once FRICTION.md's other uncommitted edit is committed.
