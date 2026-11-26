---
crucible: brief
owner: gemini
owns: handoffs/UPGRADE-3-live.md
---
# UPGRADE-3-LIVE: prove the sandboxed shell works

Do this now: use your shell tool to run `git status --short` and `git log --oneline -3` in the repository, then write `handoffs/UPGRADE-3-live.md` with each command and its exact output. Also try `cmd /c "echo probe> handoffs\UPGRADE-3-shell-write.txt"` with the shell and record whether it succeeded (it is expected to be denied: the shell sandbox is read-only). Follow HANDOFF.md, Implementer instruction; `handoffs/UPGRADE-3-live.md` is your only write location. End with `Status`, `Untested:`.
