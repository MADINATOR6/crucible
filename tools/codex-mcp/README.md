# codex-mcp

An MCP server that lets Claude Code, including cloud sessions, ask Codex for a second opinion. Codex answers **only from the text the caller sends**: it has no tools, cannot see this PC's files and never opens this repository. No dependencies, no build step. Node 18.11+.

Hardened in task CMCP-SEC-1 (`tasks/CMCP-SEC-1.md`). Claude-facing tool: Codex does not need it, so it is not in the shared External Tools table.

## Tools

| Tool | Does |
| --- | --- |
| `codex_research` | A question plus optional `context` (files, code, logs pasted as text). Returns a `job_id`. |
| `codex_review` | A unified `diff` (plus optional `focus` and `context`); Codex tries to break it. Returns a `job_id`. |
| `codex_job` | Waits up to 25 s; returns the status and, when done, the answer with token counts. |
| `codex_cancel` | Stops a running job. |
| `codex_status` | Jobs and tokens used this run, the running job, when the bridge shuts down. |

The caller cannot choose a path, git ref, sandbox, model, role or command. Unknown arguments are rejected.

## What stops what

| Risk | Guard | Checked by |
| --- | --- | --- |
| Codex reads your files (keys, tokens, `nursing-a2/`, workbook) | Codex runs with shell, code mode, file viewing and every plugin off, in an empty per-job folder outside the repo. It has nothing to read with. | Live canary test: a fake secret beside the job folder never came back. |
| Codex uses MCP servers (Higgsfield, Rea), browser, computer use, memories, hooks, web search | `--ignore-user-config`, `--ignore-rules`, no repo config (the job folder is outside the repo), `web_search="disabled"`, 31 features disabled, `--strict-config`. | Probe: Codex's own tool list held no MCP, browser or web tool; file, shell and web attempts failed. |
| A tool runs anyway | Tripwire: any event other than a message, reasoning or an error kills the job. | Unit tests. |
| Repo or ccx state changes | No repo, launcher or ccx process in the path at all. | Live before/after snapshot of `git status` and `.git/ccx/`: identical. |
| Secrets leak through the environment | Codex gets an allowlisted environment; `CODEX_MCP_TOKEN` and API keys are dropped. | Unit test. |
| Secrets leak in answers | Pattern redaction (private keys, `sk-`, GitHub, AWS, Slack, Google, JWT, bearer, `password=`) plus the bridge token itself. Only the final answer and counters leave; no paths, stderr or logs. | Unit tests. |
| Usage drain | One job at a time; per-run caps of 20 jobs and 5,000,000 tokens (uncached input + output); 30-minute maximum per job; failed starts still count. | Unit tests. |
| Runaway or orphaned Codex | Timeout and cancel kill the whole process tree. A watchdog kills Codex if the bridge dies, even from a hard kill. Ctrl+C, closing the window and the lifetime limit kill children too. | Live: 2-3 processes before, 0 after cancel and after a hard kill. |
| Bridge left running | Shuts itself down after `--hours` (default 8, max 24). Stale job folders are purged at start. | Unit test (purge). |
| Stolen or guessed token | 256-bit random token; constant-time compare; the token file may be readable only by your account, SYSTEM and Administrators, checked by SID (startup refuses anything else); rotation revokes at once, no restart. | Live icacls checks; unit tests. |
| Lockout of the real user | Bad tokens are throttled (20/min); the real token is never locked out. | Unit test. |
| Browser and DNS-rebinding attacks | Only loopback and `--public-host` names are accepted in `Host`; any `Origin` header is refused. | Unit test. |
| Flooding | 512 KB bodies, no batches, 8 requests in flight, 32 connections, header and request timeouts. | Unit tests. |
| Log injection | Logs use fixed labels only, never request text. | Unit test. |

What it cannot stop:
- **The model provider sees what you send.** Text you paste into `context` or `diff` goes to OpenAI through Codex. Send only what the cloud session would share anyway, never secrets or private data.
- **Redaction is pattern-based.** It catches common key, token, password, cookie and URL-credential shapes, and errs toward over-redacting (`token = tokens.get()` becomes `token = [REDACTED]`). It cannot recognise confidential prose.
- **Anyone who can write to your `%LOCALAPPDATA%` as you can already run code as you.** The bridge does not defend against that account; a token file swapped at runtime is not re-checked.
- **Codex can still start helper agents.** They run with the same no-tools setup (probe-verified) and are bounded by the job timeout and budgets, but they spend usage.
- **The token is the key.** Whoever holds it can spend your Codex usage, up to the per-run caps. Keep it out of chat, git and screenshots.

## Run it

```powershell
node tools/codex-mcp/server.js --init                     # once: creates the token file, prints only its path
Get-Content "$env:LOCALAPPDATA\Crucible\codex-mcp\token" | Set-Clipboard
node tools/codex-mcp/server.js --public-host <your-tunnel-host>
```

Options: `--public-host a,b` (tunnel host names to accept; loopback is always accepted), `--port` (8787), `--hours` (8, max 24), `--max-jobs` (20), `--max-tokens` (5000000), `--model` (`gpt-6.1-sol`).

- `--init --rotate` makes a new token file with fresh permissions. A running bridge switches to it on the next request, and the old token stops working.
- `CODEX_MCP_TOKEN` overrides the file, but then rotation needs a restart and the file checks are skipped. Prefer the file.
- `--stdio` runs a local stdio server with no token, with the same isolation and budgets: `claude mcp add codex -- node C:\Users\Madison\code\claude-codex-collab\tools\codex-mcp\server.js --stdio`.
- Logs go to stderr, one fixed label per request.
- Tests: `cd tools/codex-mcp && node --test`.

## Cloud sessions

1. **Tunnel with a stable address.** Tailscale Funnel gives a fixed `https://<pc>.<tailnet>.ts.net`: install Tailscale, sign in, then `tailscale funnel --bg 8787`. Start the bridge with `--public-host <pc>.<tailnet>.ts.net`. (Cloudflare's quick tunnel works too, but its address changes every start.) The first `tailscale funnel` prints a link that enables HTTPS certificates and Funnel for the tailnet. Public DNS then takes several minutes to point at Funnel. Check it from outside, or over DNS-over-HTTPS (`https://dns.google/resolve?name=<host>`): on the PC itself, Tailscale answers `.ts.net` lookups with the private 100.x address. Stop it with `tailscale funnel --https=443 off`.
2. **Cloud environment** (claude.ai/code, edit the environment):
   - Network access: **Limited** with the tunnel host under *Allowed domains*.
   - *Network secrets* > Add secret: website = the tunnel host, header `Authorization`, prefix `Bearer`, value = the token. The session never sees the token.
3. **Point the session at it.** In the `.mcp.json` of the repo the cloud session clones:

   ```json
   { "mcpServers": { "codex": { "type": "http", "url": "https://<your-tunnel-host>/mcp" } } }
   ```

   If the repo is public, the URL is public too. That is fine, because the token is what protects the bridge, but expect strangers to knock (they get 401s). If the network secret is not applied to MCP traffic, fall back to a cloud environment variable `CODEX_MCP_TOKEN` and `"headers": { "Authorization": "Bearer ${CODEX_MCP_TOKEN}" }`. Session code can read environment variables, so prefer the secret.
4. **In the session:** have Claude paste the files or `git diff` Codex needs into `context` or `diff`.

Stop the tunnel and the bridge when you are not using them.

Verified 2026-11-13 from a real cloud session in its own environment: the network secret reaches the bridge, the MCP client sends no `Origin` header, and `codex_status`, `codex_research` and `codex_job` work end to end. Pitfalls met on the way:
- The secret must be **Secret type: Bearer** (header `Authorization`, prefix `Bearer`, value = the token). *Username and password* sends `Basic` and is refused. A saved secret's type cannot be changed: delete it and add a new one. Replacing a value also clears the prefix, so type `Bearer` again.
- Paste the token straight after copying it. Copying anything else first (such as the host name) pastes that instead. Clear the clipboard afterwards.
- MCP servers connect when a session starts: after changing the secret, start a new session.
- A session in an environment without the secret (other environments clone the same `.mcp.json`) shows `codex` as failed with a 401. That is expected.
