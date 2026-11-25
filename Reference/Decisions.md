# Decisions

Decisions worth revisiting. Each has its reason and the condition that would reopen it. Add one when a choice took real thought; delete one when its condition fires and the decision changes.

| Date | Decision | Why | Reopen when |
| --- | --- | --- | --- |
| 2026-11-25 | Gemini runs through Gemini CLI with the saved API key (`GEMINI_API_KEY`), not your Google AI Pro sign-in. | Live test 2026-11-25: Google sign-in in Gemini CLI 0.62 is refused (`UNSUPPORTED_CLIENT`, "no longer supported for Gemini Code Assist for individuals"); the API key answered in 8 s. | Google lets Gemini CLI (or its successor) sign in with AI Pro, or the API key's free quota blocks daily work. |
| 2026-11-25 | The Gemini desktop app stays for interactive work only. | It has no command line or automation interface ccx could launch or read back from. | It gains a CLI, an MCP server or a scriptable API. |
| 2026-11-25 | The repository root is the Obsidian vault; briefs live in `tasks/`; generated Status notes live in gitignored `Status/`. | One copy of every fact: the brief is the task file ccx reads, ccx state is the record, and Status is a view rebuilt from it, never edited by hand. | You want the vault elsewhere (for example synced to the phone with Obsidian Sync), or Status needs to reach the phone mirror. |
| 2026-11-25 | Launching happens only by an explicit command (ribbon rocket or Ctrl+P); an agent's `Next owner:` is a suggestion, not an automatic launch. | ccx policy keeps `runtime.autoDispatch` false; a note edit or a model's line must never spend a run. | Handoffs between agents become routine enough that the extra click costs more than an occasional wrong launch. |
| 2026-11-25 | Gemini and headless Claude may run only the permitted checks in `ccx/policy.json` (`checks`) without asking; everything else in the shell is refused. | Neither has a sandbox on Windows; Codex keeps its own sandbox. The launcher reruns the checks itself, so the evidence never depends on the agent. | A Windows sandbox becomes available for either CLI. |
