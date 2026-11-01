# Task REA-1: Rea for Crucible

Direct user request: add https://github.com/morluto/rea to Crucible (2026-10-28).
Mode: Dispatch; Codex implements, Claude reviews and commits. Start HEAD: f8a747d74b6ca273100c34b392acaf74f266516c.

## Goal and write allowlist

Offer the pinned Rea MCP independently to Claude and Codex in this repository, with a compatible private Node runtime and a synthetic end-to-end check. Use the existing MCP configuration pattern; retain normal permissions and ccx acceptance.

Writes: `.mcp.json`, `.codex/config.toml`, `AGENTS.md`, `CLAUDE.md`, `EXTERNAL-TOOLS.md`, `scripts/test-rea.mjs`, `tasks/REA-1.md`. npm may populate its user cache outside Git. Synthetic test targets may be created only in an OS temporary directory owned by the test.

Pre-existing changes: `.gitignore`, `AGENTS.md` (two routing lines outside External Tools), `HANDOFF.md`, finance-shorts files, plus untracked nursing, finance, prompts, roblox, wallpaper and task files. Preserve all of them. Append only Rea-specific text to shared instructions; do not overwrite TASK.md.

## Decisions and exclusions

- Pin rea-agents 6.8.0 and node 24.22.1 through npm exec/npx; global Node 24.21.0 does not meet Rea's declared engine floor. Keep npm packages in its cache, outside this repository.
- Same Windows stdio command in both client configs; keep existing Higgsfield registration.
- No automatic tool approvals, global client configuration changes, engine installs (Ghidra/Hopper/IDA), credentials, real target analysis, provider calls, product edits, commits, push or mirror sync.
- Rea remains optional. It cannot approve completion or change target scope. Use only explicitly authorized targets and synthetic fixtures during setup.

## Verify / Done When

- [x] Both configurations select the same pinned command and retain Higgsfield; shared External Tools sections remain identical.
- [x] Rea --version starts under the private compatible Node runtime.
- [x] `node scripts/test-rea.mjs` validates config parity, MCP initialize/tools/list, and a static JavaScript analysis of its own temporary synthetic target, with no execution of that target.
- [x] `git diff --check` passes; final diff stays inside the allowlist and preserves existing edits.
- [x] Claude: review final diff, ccx verification/review/done, then commit under existing ownership. (2026-11-01: test-rea.mjs 3 PASS, review pass, task done.)

Stop conditions: install/startup fails twice, unexpected writes, private data needed, or a required permission cannot be obtained. Diagnose once; never weaken validation or permissions. Report material unknowns and preserve partial work.

## Evidence and handoff

Status: READY_FOR_CLAUDE_REVIEW. Implementation and Codex-owned checks complete; not accepted or committed. Next owner for final acceptance and commit: Claude (AGENTS.md Roles / Dispatch).

PASS criteria: both client registrations use the identical pinned command, Rea starts and returns its tool catalog, and static analysis returns both fixture modules and the exported symbol without executing the target. Existing integrations keep passing.

Checked 2026-10-28 (client date):
- `npm.cmd exec --yes --package=node@24.22.1 --package=rea-agents@6.8.0 -- rea --version`: `6.8.0`, exit 0. Initial cache fill succeeded; npm emitted an engine warning for the outer system Node during installation.
- `npx.cmd --yes --package=node@24.22.1 --package=rea-agents@6.8.0 -- node --version`: `v24.22.1`, exit 0. Global Node is still `v24.21.0`.
- `node --check scripts/test-rea.mjs`: PASS, exit 0.
- `node scripts/test-rea.mjs`: all three PASS groups, exit 0: config/instruction parity, MCP initialize at 6.8.0 with 229 tools, static analysis found index.js, math.js and double. Final rerun after shared selection instructions changed also passed. Fixtures removed from the OS temp directory.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-external-tools.ps1`: 23 passed, 0 failed, exit 0. No provider calls.
- `codex.cmd mcp get rea --json`: enabled, matching pinned transport and configured timeouts, exit 0.
- `claude.exe mcp get rea`: project scope found, Pending approval, matching command, exit 0. The installed native Claude command is claude.exe, not claude.cmd. Normal project approval must be completed inside Claude; no settings bypass was added.
- `git diff --check`: PASS, exit 0 (only existing CRLF normalization warnings).

During test authoring, the first test failed because CLAUDE.md ends after External Tools rather than having a Windows heading. Fixed the test's EOF handling; the shared text already matched. The first MCP analysis probe used CLI-style path; the advertised MCP schema requires input_path. Corrected it and the actual analysis passed. Neither was a Rea runtime failure.

UNKNOWN: tools in a fresh interactive Claude/Codex session, optional native engines, real-target analysis. CHECKED: real MCP process and synthetic static analysis, actual client registration discovery. NEEDED: restart clients in Crucible; approve Rea in Claude normally, then Claude diff review and ccx review/done before commit. No commit, push, sync, global client setup, provider inference, or real-target analysis performed.

Pre-existing work was retained. Rea changes only seven allowlisted paths; AGENTS.md also retains its two pre-existing routing additions.


Final git status --short (includes pre-existing work):

```text
 M .codex/config.toml
 M .gitignore
 M .mcp.json
 M AGENTS.md
 M CLAUDE.md
 M EXTERNAL-TOOLS.md
 M HANDOFF.md
 M finance-shorts/.env.example
 M finance-shorts/README.md
 M finance-shorts/briefs/compound-interest.json
 M finance-shorts/prompts/script_prompt.txt
 M finance-shorts/src/pipeline.py
 M finance-shorts/style/persona.md
?? .claude/skills/nursing-notes/
?? finance-shorts/src/local_voice.py
?? finance-shorts/style/paulie.md
?? finance-shorts/tests/test_voice.py
?? prompts/crucible-overall-upgrade.md
?? prompts/higgsfield-video-pipeline.md
?? roblox-videos/
?? scripts/nursing-notes.ps1
?? scripts/test-rea.mjs
?? tasks/FS-1.md
?? tasks/REA-1.md
?? tasks/VOICE-2.md
?? tasks/WP-1.md
?? wallpaper/
```
