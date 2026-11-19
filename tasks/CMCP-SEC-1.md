# CMCP-SEC-1: harden the Codex MCP bridge for tunnel exposure

Owner: Claude (implements). Codex planned (plan brief `tasks/CMCP-SEC-1-plan.md`; report PARTIAL, capture `codex-02b8a022...`) and verifies. Class complex, risk high. Start HEAD d6a93f7.

## Goal

A remote caller holding the token can ask Codex questions and get answers, and nothing else: no reading of this PC's files, no commands, no tools, integrations, network or repo/ccx writes, bounded usage, and a bridge that cannot outlive its operator's intent.

## Plan critique and decisions

- Claims (1): checked. `ccx status` ticks state (`scripts/ccx-ops.ps1:760`); the launcher has no `-c` pass-through (`scripts/codex-dispatch.ps1:320`); the env and lockout findings hold.
- Plan step 1 left isolation UNVERIFIED. Claude probed the installed CLI (scratchpad `probe.mjs`, synthetic canary outside the work dir, gpt-6.1-sol low):
  - `codex exec --ignore-user-config --ignore-rules --ephemeral --skip-git-repo-check --strict-config -s read-only -C <empty dir> -c approval_policy="never" -c web_search="disabled"` plus `--disable` for shell_tool, unified_exec, code_mode_host, apps, plugins, browser_use*, computer_use, memories, hooks and the rest. Login kept working (`--ignore-user-config` keeps `CODEX_HOME` auth).
  - Result: canary not leaked; no command/file/MCP/web events; Codex reported its file, shell and web attempts failed; tools left were `functions.exec` (fails closed: "code-mode host is disabled") and `collaboration.*` helper agents.
  - Second probe: a spawned helper also could not read the canary (same isolation). Helper spawning does not appear in the `--json` event stream, so an event tripwire alone cannot catch it.
- **Decision (narrow functionality, per plan step 1's alternative):** the bridge stops pointing Codex at this repo. The caller (a cloud session with its own clone) sends the question plus any context (files, diff) as text. Codex runs toolless in an empty per-job dir outside the repo, so the project `.codex/config.toml` (Higgsfield, Rea) is never loaded. `codex_review` takes a diff instead of a ref. This removes the repo, ccx and launcher from the bridge entirely.
- Decision: the bridge runs `node <npm>/@openai/codex/bin/codex.js exec ... -` itself (prompt on stdin, fixed argument list, minimal environment), not `scripts/codex-dispatch.ps1`. Shared scripts stay untouched.
- Decision: `codex_status` reports bridge health and budgets only (no ccx subprocess).
- Kept from the plan: budgets, batch rejection, valid-token-first auth, Host/Origin policy, HTTP timeouts and connection caps, sanitized logs, token ACLs, rotation, lifetime, child-tree cleanup, bounded redacted output, strict argument shapes.
- Rejected: Windows ACL verification by a separate OS user or a separate worker environment (out of scope, OS security change); not needed once Codex has no execution path.

## Write allowlist

`tools/codex-mcp/**` (server.js, package.json, README.md, src/*.js, test/*.js), `tasks/CMCP-SEC-1.md`. Out of scope: `scripts/`, `.codex/`, `ccx/`, AGENTS.md, CLAUDE.md, tunnel install, publishing.

## Done When

1. Worker argument list is fixed: contains every isolation flag above, `-s read-only`, `-C <job dir>`, ends with `-`, and never contains caller text (unit test).
2. Child environment is an allowlist; `CODEX_MCP_TOKEN` and unknown variables are absent (unit test).
3. Live: a toolless job answers a content question; a job told to read a synthetic canary outside its dir, run a command and search the web does not leak the canary (Claude, live run).
4. Live: repo `git status --short` and `state/` unchanged by a job (Claude, before/after).
5. Tripwire: any `--json` item type other than agent_message, reasoning or error kills the job and reports it blocked (unit test with a fake child).
6. Budgets: per-run job cap and token cap refuse new jobs; one running job; `codex_cancel` kills it; timeout kills the process tree; server lifetime (`--hours`) and shutdown kill children (unit tests; tree kill checked live by Claude).
7. Protocol: batches rejected; unknown argument keys rejected; sizes bounded (unit tests).
8. HTTP: valid token is never locked out; bad tokens lock only themselves; token re-read on change so rotation revokes at once; Host allowlist and Origin rejection; 503 over the in-flight cap; logs carry fixed labels only (unit tests).
9. Output: only the redacted, bounded final report and counters leave the bridge; no paths, stderr or launcher text; synthetic secrets are redacted (unit test).
10. Token file ACL restricted on `--init`; startup refuses a token file readable by Everyone/Users (Claude, live icacls check).
11. `cd tools/codex-mcp && node --test` passes in full.
12. README states the real guarantees and limits (redaction is pattern-based; the provider sees what the caller sends; helper agents may run but are equally toolless).

## Verify

`cd tools/codex-mcp && node --test` (this repo, run this session). Live checks 3, 4, 6 (tree kill), 10 by Claude. Cloud usability: NEEDED, user, after a tunnel exists.

## Implementation notes (Claude)

- Files: `server.js`, `src/{protocol,jobs,tools,http,worker,watchdog,redact}.js`, `test/bridge.test.js`, `README.md`, `package.json`. `src/dispatch.js` removed (the launcher-based runner).
- Added beyond the plan: `src/watchdog.js` sits between the bridge and Codex and kills the Codex tree when the bridge pid disappears or a hard limit (job timeout + 30 s) passes, because a hard-killed bridge on Windows otherwise leaves Codex running; stale job folders (>25 h) are purged at start; `keepAliveTimeout` 95 s so a tunnel never reuses a socket the bridge just closed.
- Defect found and fixed in live testing: `--init --rotate` overwrote the token file and kept extra ACL grants. It now deletes and recreates the file and fails if the result is not private. TWINS: searched for other files the bridge writes that must stay private - found 0 other sites (job folders hold no prompt; the prompt goes on stdin).
- Live evidence (Claude, 2026-11-12): content answer correct; canary attack not leaked; cancel 2 -> 0 processes; hard kill of the bridge 3 -> 0 processes after 4 s; `git status` and `.git/ccx/` byte-identical before/after; init grants only the owner; startup refuses a token file with `BUILTIN\Users:(R)`; rotate removes the grant; `--init` never prints the token. `node --test`: 30/30.

## Round 2 (after Codex verifier round 1: REFUTED, 3 findings)

Verify these fixes first, then re-attack anything they touch:
1. P1 token ACL: `src/acl.js` checks by SID; only the owner, SYSTEM (S-1-5-18) and Administrators (S-1-5-32-544) may hold Allow entries, the owner must be present, unresolvable principals count as exposure. `--init` grants `*<owner SID>:F` and re-checks. Live: a `*S-1-5-19:R` grant (LOCAL SERVICE) now refuses startup; rotate removes it.
2. P2 startup cancel: `jobs.cancel` sets `job.cancelRequested`; `worker.run` installs a pre-spawn cancel and checks it and the `closed` flag (set by `killAll`) after folder creation; nothing spawns once cancelled or closed.
3. P2 redaction: the key/value pattern now accepts quoted keys and values, prefixed names (`client_secret`, `OPENAI_API_KEY`), YAML and env forms; tested through the final `codex_job` response.
Test file: synthetic secrets are assembled at run time so `ccx verify`'s secrets stage passes; assertions unchanged. `node --test`: 34/34. `ccx verify -TaskId CMCP-SEC-1`: PASS (secrets, scope, json).
Rotation mid-request (round 1 UNKNOWN): policy is authentication at request start; a request already authenticated finishes.

## Round 2 result

Codex hit its usage limit (resets 2026-11-13 03:08); the `ccx-reviewer` agent ran round 2 instead. Fixes 1 and 2: PASS under every attack (ACL entry shapes, a real Get-Acl read with hostile path characters, a 200-run cancel/shutdown timing sweep). Fix 3: REFUTED narrowly (D1: `SECRET_KEY=`, `pwd`, `passphrase`, spaced keys, quoted values with spaces or commas, URL user info, Basic, Cookie and YAML blocks leaked). P3: shutdown after spawn reported "exited with code 1" (D2); the README overstated "owner only" (D3).
Fixed: redaction patterns widened, with all reviewer shapes plus prose non-regressions in a new test; `killAll` stops each job with "bridge is shutting down", and the test now asserts that reason; README corrected. Accepted: a token file swapped at runtime is not re-checked, because an account that can write `%LOCALAPPDATA%` as the user can already run code as the user (README). `node --test`: 35/35. Review cap reached (two cycles): decided on evidence. A Codex confirmation pass after the reset is optional.

## Round 3 (Codex, after its reset)

Finding: P2 event-loop stall. Unbounded, unanchored redaction patterns went quadratic (`redact('a'.repeat(60000))` > 5 s) and `codex_job` re-ran them on every poll.
Fixed:
- every pattern now starts at a literal or keyword, and every repeat is bounded (values ≤ 1024 characters, marked with a `ponytail:` note);
- the report is cut to 60 000 + 2048 characters before redaction and to 60 000 after;
- the redacted report is rendered once per job and cached (`job.rendered`).
New tests: 21 hostile 61 kB inputs each under 1 s (measured worst: 57 ms), and a 1 MB report through `codex_job` that renders in under 1.5 s, does not block timers, and is reused on the next poll. `node --test`: 37/37.
Confirmation run: Codex checks only this fix and anything it touches.

## Round 3b (Codex confirmation: REFUTED, 2 findings)

1. P2 YAML stall: `password: |\n` + 60 000 spaces + `\rX` took 3.8 s, because `[ \t]+[^\r\n]*` overlapped. Fixed: each line is now `[ \t][^\r\n]*` plus `\r\n|\n|\r|$`. The regression test covers four tails, each under 1 s.
2. P2 split secret at the cut: replacements earlier in the text shrank it enough to pull a split token's prefix inside the output. Fixed with `redactAndCut`:
   - it redacts up to max + `MAX_SECRET_SPAN` (16 384, larger than the longest match, JWT about 9.7 k);
   - it limits the output to the redacted length of the first `max` input characters.
   - The test places the token, a JWT and a long password at both cut points behind 1 600 shrinkable keys, and also runs through `codex_job`.
   - Check: the old cut-redact-cut approach leaks on the same input; the new one does not. A 5 MB report renders in 3 ms.
   - Impact note: only the token holder sees answers, and Codex never sees the token, so this was defence in depth.

`node --test`: 39/39.

## Final state (2026-11-13, Claude)

- Codex round-4 evidence run on the round-3b fixes: VERIFIED WITH CAVEATS, no defects (18 YAML variants, worst 1 ms; 300 split-secret boundary cases; 5 MB in 2.5 ms; codex_job caches). Caveat: its sandbox blocked 6 temp-dir tests; Claude's run outside the sandbox: `node --test` 39/39.
- `ccx verify -TaskId CMCP-SEC-1`: PASS (json, secrets, scope, memory). Live: answer correct, canary not leaked, cancel and hard kill leave 0 processes, repo and `.git/ccx/` unchanged, ACL checks hold.
- Not closed: `ccx task review` hit REVIEW CAP REACHED after round 3b, and `task done` needs a passing cross-model review or the user's `task-accept`. Claude did not record a pass Codex did not give, and did not approve on the user's behalf.
- Not committed, because acceptance comes first. Not pushed, no tunnel, nothing exposed.
- Next (user): read this file. Then accept with `ccx gate -Action task-accept -Target CMCP-SEC-1` and approve it, then `ccx task done -Id CMCP-SEC-1`; Claude commits `tools/codex-mcp/` and the two task files and syncs the mirror. Or raise the cap so the round-4 pass can be recorded.
- Closed 2026-11-13: the user accepted in chat ("Accept and commit", approval A-0108); `ccx task done` passed.
- Cloud check (2026-11-13, after closing): Tailscale Funnel on `desktop-7j8hu17`, cloud environment `codex-bridge` with a Bearer network secret. A real cloud session connected, listed the five tools, and ran `codex_status` and a `codex_research` job (correct answer "6"). The MCP client sent no `Origin` header. This resolves both untested items below.
- Previously untested: whether a real cloud session reaches the bridge through a tunnel and network secret (needs the user's tunnel and claude.ai account), and whether its MCP client sends an `Origin` header (the bridge refuses any).

## Stop conditions

A live check leaks the canary or shows a tool executing; login only works with user config; a child survives shutdown. Then stop and report; do not expose the bridge.
