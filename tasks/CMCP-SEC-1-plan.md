Follow HANDOFF.md, Planner instruction (it replaces the Researcher instruction for this task).

# CMCP-SEC-1 plan brief: harden the Codex MCP bridge before it is exposed through a tunnel

## Goal

`tools/codex-mcp/` (new, untracked, written this session) is an MCP server that lets a Claude Code cloud session ask Codex questions. It will be reachable from the internet through a tunnel (Tailscale Funnel or Cloudflare), gated by a bearer token. The user wants every risk prevented, major risks first. Plan the hardening.

## User requirements

- Prevent risk, especially major risk: the worst outcomes are private data leaving the PC, actions outside the repo (desktop, browser, paid services, publishing), writes to the repo or ccx state, and runaway Codex usage.
- Keep it usable from a cloud session: research and review through Codex, read-only.
- Claude implements; Codex plans now and verifies the diff later.

## What exists (read these)

- `tools/codex-mcp/server.js`: entry; token file at `%LOCALAPPDATA%\Crucible\codex-mcp\token`, loopback-only HTTP on 8787, `--stdio` mode with no token.
- `tools/codex-mcp/src/http.js`: bearer auth (sha256 + timingSafeEqual), 64 KB body cap, global failure lockout (20/min), `/healthz` open.
- `tools/codex-mcp/src/protocol.js`: JSON-RPC/MCP core and argument parsers.
- `tools/codex-mcp/src/tools.js`: tools `codex_research`, `codex_review`, `codex_job`, `codex_status`.
- `tools/codex-mcp/src/dispatch.js`: writes a task file under `%LOCALAPPDATA%\Crucible\codex-mcp\tasks\` and runs `scripts/codex-dispatch.ps1 -Role research|verify -Sandbox read-only` without `-TaskId`; `codex_status` runs `scripts/ccx.ps1 status -Brief`.
- `tools/codex-mcp/src/jobs.js`: in-memory jobs, one running at a time.
- `tools/codex-mcp/test/bridge.test.js`: 17 passing tests (`cd tools/codex-mcp && node --test`).
- `tools/codex-mcp/README.md`.
- `scripts/codex-dispatch.ps1:320` builds the `codex exec` command line; it has no pass-through for extra `-c` overrides.

## Concerns Claude has already noticed (verify each against the code and Codex 0.160.0; add any I missed; rank all by severity)

1. **Tools beyond the file sandbox.** `codex exec` from the repo loads the user config (`~/.codex/config.toml`: plugins such as computer-use, browser, chrome; `mcp_servers.node_repl`; hooks) and the project `.codex/config.toml` (MCP `higgsfield`, which spends credits and can publish, and `rea`). A remote question could steer Codex into them. Does `-s read-only` constrain MCP and plugin tools? What does Codex 0.160.0 offer to switch them off for one run (`--ignore-user-config`, `-c mcp_servers.<name>.enabled=false`, profiles, features)? Keep login working. Source every answer from the installed CLI, not memory.
2. **Private data exfiltration.** Read-only still reads. Can Codex read outside the repo (`~/.ssh`, `%LOCALAPPDATA%\Crucible\credentials`, the token file itself, `~/.codex/auth.json`) and the repo's private paths (`nursing-a2/`, `*.xlsx`, `.env`)? The current guard is prompt text only. What enforceable controls exist (deny-read, readable roots, a different cwd or worktree), and should the report be filtered before it leaves (compare `Protect-CcxText` in `scripts/ccx-core.ps1`)?
3. **Network egress by Codex** (web search, shell network) during a remote job.
4. **Writes that are not file writes.** `ccx status` can run a runtime tick and write state (HANDOFF.md, Researcher instruction 4). The launcher may write captures. Is anything else written?
5. **Usage drain and denial of service.** Unlimited sequential jobs; the global lockout lets an attacker lock the owner out; a stuck job blocks all others for up to timeout + 3 min.
6. **Token and exposure.** File permissions on the token, rotation, a public tunnel URL (the repo may be public, so a committed `.mcp.json` URL is discoverable), `/healthz`, stdio mode without auth, header/size/slow-request limits, logging.
7. **Injection.** The `question`, `focus` and `ref` values go into a task file Codex reads; `ref` is validated by a regex in `tools.js`. Any path from tool input to a command line?
8. **Kill switch.** No idle timeout or time box; the server runs until stopped.

## Constraints

- Allowlist candidates: `tools/codex-mcp/**`, `tasks/CMCP-SEC-1.md`. Changing `scripts/codex-dispatch.ps1`, `.codex/config.toml` or `ccx/` is out of scope unless you show it is the only way; then say so as a decision for the user, with the smaller alternative.
- No new dependencies. Node 18.11+, standard library. Windows PowerShell 5.1.
- Never read or quote private data while planning: `nursing-a2/`, `*.xlsx`, `.env*`, credential files, `~/.codex/auth.json`, the token file. Inspect config by key names only.
- The base checkout has many unrelated uncommitted changes; they are not part of this task.
- Verify commands must exist (AGENTS.md, Commands, or `node --test` in `tools/codex-mcp`, which this session ran: 17 passing). Anything only a live cloud session can show is NEEDED, owner the user.
