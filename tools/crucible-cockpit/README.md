# crucible-cockpit

Local, offline Mission Control for the Crucible peer-mode workflow. A dark three-pane web page shows the active task, each agent's declared role and branches, the handoff loop with silence and deadlock flags, the question queue, and everything waiting for a human. It records your decisions in `handoffs/APPROVALS.md`.

## Start

Requires Node.js 18 or newer (tested on v24.21.0). There are **no dependencies and no build step**: the server is Node's standard library and the page is plain HTML, CSS and JavaScript served from `public/`. Nothing is downloaded at install time or at startup, and the page loads no CDN files or web fonts. The optional prompt console needs the `claude` and/or `codex` CLIs on PATH, signed in.

From the repository root:

```bash
node tools/crucible-cockpit/server.js
```

Then open http://127.0.0.1:4780/ in a browser. Stop the server with `Ctrl+C`.

| Option | Meaning |
|---|---|
| `--repo <path>` | Repository to read. Default: current directory. |
| `--port <n>` | Port on 127.0.0.1. Default 4780; `0` picks a free one. |
| `--state-dir <path>` | ccx state directory. Default: `CCX_STATE_DIR`, else `<git common dir>/ccx`. |
| `--silence-minutes <n>` | Flag silence after this many minutes with no handoff-file change. Default 30. |
| `--run-timeout-minutes <n>` | Stop a prompt run after this long. Default 15. |
| `-h`, `--help` | Help. |

To try it without touching real files, copy `test/fixtures/repo` somewhere outside the repo and run `node tools/crucible-cockpit/server.js --repo <copy> --state-dir state`.

Tests (from `tools/crucible-cockpit`):

```bash
cd tools/crucible-cockpit && node --test
```

## Prompt console

At the top of the centre pane: pick **Claude** or **Codex**, type a prompt, and press **Run** (or `Ctrl+Enter`). The cockpit starts that agent's CLI on the repository and streams the reply into the page, with the model, duration, reported cost or tokens, exit code and an expandable activity log (tool calls for Claude, progress lines for Codex). **Cancel** stops the run and its process tree. One run at a time; a run stops after `--run-timeout-minutes` (default 15).

Runs are **read-only**:

| Agent | Command (no shell; prompt on stdin) | What stops writes |
|---|---|---|
| Claude | `claude -p --output-format stream-json --verbose --no-session-persistence --permission-mode dontAsk --strict-mcp-config --settings {"disableAllHooks":true} --tools Read Grep Glob --allowedTools Read Grep Glob --disallowedTools Edit Write NotebookEdit Bash PowerShell WebFetch WebSearch Agent Task` | only Read, Grep and Glob exist (`--tools`) and are allowed. Everything else is denied without asking. No MCP servers load, and no user, project or plugin hooks run (hooks can run commands and load plugin MCP servers). Checked against claude 2.1.287's start-up event: tools `Glob, Grep, Read`, no MCP servers. Without `disableAllHooks` two SessionStart hooks ran and a plugin MCP server connected |
| Codex | `codex [-c overrides] exec --sandbox read-only --color never --ephemeral -` (on Windows, Node runs the `codex.js` that `codex.cmd` would start) | Codex reads files with shell commands, so its shell stays, inside the read-only OS sandbox (no file writes, no network). Overrides switch off plugins, apps, browser use (including full CDP access), computer use, local automation, image generation, hooks, memories, multi-agent (v1 and v2), tool suggestions, workspace dependencies and web search. `code_mode_host` stays on, because codex 0.160.0 runs its tools through it; with it off Codex cannot read files. A **pre-flight** before every run lists Codex's MCP servers (`codex mcp list --json`), disables each by name, lists again, and refuses the run unless all are disabled. A server name that is not plain letters, digits, `-` or `_` also refuses the run. The config files Codex reads are fingerprinted during the pre-flight. These are `config.toml` and `managed_config.toml` in `CODEX_HOME` or `~/.codex`, and `.codex/config.toml` in the repo and in every parent folder up to the drive root, because the project root can be any ancestor. On macOS and Linux, `/etc/codex/config.toml` and `managed_config.toml` count too. They are checked again just before `exec` starts. Any change refuses the run, so a server added after the check is never enabled. A change in the last milliseconds before Codex reads its config is not prevented. `--sandbox read-only` overrides a full-access default in `~/.codex/config.toml` |

Things to know:

- A run uses your Claude or Codex usage, and the CLI talks to its own model provider. The cockpit's page and server still make no external requests.
- Replies live in the server's memory (the last 20). They are not written to the repo and disappear when the server stops.
- A prompt is your instruction to that agent, sent as typed. It is not added to `QUEUE.md`; use the Ask form for that.
- The run endpoints use the same Host, Origin and token guards as the writes.
- If a CLI is missing, or `claude` resolves only to a `.cmd` shim, the console says the agent is unavailable instead of running it.
- A run is marked finished when the agent process exits, even if a helper it started keeps the output pipes open. Codex's `codex-windows-sandbox-setup.exe` does this.
- If Cancel cannot stop the whole process tree (for example `taskkill` is denied), the run's activity says so and the cockpit stops the agent process itself.
- Only absolute PATH entries are searched for `claude` and `codex`.

## Layout

- **Top bar:** active task (title, Task ID and mode from `TASK.md`), the write allowlist as badges (backticked paths under the "allowlist" heading), the token budget gauge, and the live-connection indicator.
- **Left: agents and roles.** A card each for Claude and Codex with their role from `COLLAB.md` (for example `CLAUDE: [IMPLEMENT]`), all their declared phases, questions waiting on them, and their `claude/*` or `codex/*` branches with the newest commit time and a worktree badge.
- **Centre: handoff loop.** The phase pipeline with a one-line summary ("Claude implemented → Codex reviewing"), flags for silence, deadlock, waiting questions and blocked phases, the `TASK.md` checklist with owners (unowned items highlighted), and recent decisions.
- **Right: comms and approvals.** The human approval center with Approve and Request changes buttons, and the Q&A feed from `QUEUE.md` with a form to ask Claude or Codex a question.
- **Bottom: source health.**

The page updates over Server-Sent Events. The server checks the watched files' sizes and modified times every second, rebuilds when something changed (and every 30 s regardless, so ages and silence stay current), and refreshes Git every 5 s.

## Data sources

Reading goes through `tools/crucible-monitor/src/collect.js`, so the bounds, partial-write handling, control-character neutralisation and privacy rules documented in [the monitor's README](../crucible-monitor/README.md#data-sources) apply here too. Cockpit-specific rules:

| Field | Source | Rule | Missing/invalid |
|---|---|---|---|
| Active task, ID, mode | `TASK.md` | first `# ` heading (without `Task:`), ``Task ID `<id>` ``, `Mode: <word>` | n/a |
| Allowlist badges | `TASK.md` heading containing "allowlist" | backticked paths, else bullet text | n/a with reason |
| Task queue | `TASK.md` "Done When"/"Acceptance" checkboxes | `- [ ] (Claude\|Codex\|Human) text`; no owner = unassigned | n/a |
| Budget gauge | `state.tasks.<Task ID>` and `ccx/policy.json` | effective tokens used vs `tokenTarget`, same formulas as ccx (monitor README) | n/a with the reason, e.g. "not registered in ccx" |
| Roles and pipeline | first `# ` section of `handoffs/COLLAB.md`, `## Roles` bullets | `Phase <n> <name>: <Claude\|Codex\|Human> [PLAN\|IMPLEMENT\|REVIEW\|RESEARCH\|VERIFY] (done\|active\|pending\|blocked)` | lines in other shapes listed as unparsed; no lines means the loop is unknown |
| Decisions | same section, `## Decisions` bullets | newest 6 | n/a |
| Q&A feed | `handoffs/QUEUE.md` | `### Q-<n> [open\|answered] <from> -> <to>: <title>`, body lines, `Answer (<who>, <date>): text` | other `###` headings counted as malformed |
| Waiting on an agent | open questions whose `to` is that agent | listed on the card and as a flag | — |
| Deadlock | Claude has an open question from Codex **and** Codex has one from Claude | flag | — |
| Silence | newest modified time of `TASK.md`, `COLLAB.md`, `QUEUE.md`, `NOTES-*.md` | flagged when older than `--silence-minutes` and a phase is not done. A cockpit setting, not a fact from the sources | no files: no flag |
| Branches | `git for-each-ref refs/heads/claude refs/heads/codex` | newest commit time per branch; worktree badge from `git worktree list`. Commit evidence only, never "editing now" | n/a, Health shows the error |
| Last Codex run | telemetry `kind:"dispatch"` | newest `at` | none |
| Waiting for a human | pending `state.approvals`; lines containing `[WAITING FOR HUMAN]` in `TASK.md`, `COLLAB.md`, `QUEUE.md` and the newest handoff notes; open questions to `Human`; `HEAD` ahead of its upstream (`git rev-list --left-right --count HEAD...@{upstream}`) | one item each, with its source | — |
| Decisions on those items | `handoffs/APPROVALS.md` `### AP-<n> [approved\|changes-requested] <key>` | newest decision per item key | — |

## Writes and safety

- The server binds **127.0.0.1 only**; there is no host option.
- Every request must carry `Host: 127.0.0.1:<port>` or `localhost:<port>`, otherwise 421 (DNS-rebinding guard).
- Writes need a random per-launch token embedded in the served page, a same-origin `Origin` header and a JSON body of at most 16 KiB. No CORS headers are sent, so other websites can neither read the token nor post.
- The page has a strict Content-Security-Policy (`default-src 'none'`, scripts, styles and connections from the same origin only) and renders all source text with `textContent`.
- Only two files are ever written, both **append-only**, both from a form you submit:
  - `handoffs/APPROVALS.md`: `### AP-<n> [approved|changes-requested] <item key>` with time, item and note. The key must be on the current review list.
  - `handoffs/QUEUE.md`: `### Q-<n> [open] Human -> Claude|Codex: <title>` with your text.
  Text is flattened to one line, control characters are replaced, a leading `#` is escaped, and lengths are capped. A write lands only in `<repo>/handoffs/<file>`: `handoffs/` must be a plain folder that resolves to exactly that place, and the file must be absent or a regular file with one hard link. Symlinks, junctions, dangling links and hard links are refused, not followed, as are paths under `privacy.excludePaths`. Writes are serialised within the server. A link swapped in between the check and the append is not prevented (Windows has no `O_NOFOLLOW`).
- **An APPROVALS.md entry is not a ccx approval.** It tells the agents your decision; ccx still requires `ccx gate` and your approval in chat or at your own console for L4/L5 actions. The approval center shows the `ccx approve` command for pending ccx approvals so you can run it yourself.

## Verification (2026-11-09, Windows 11, Node v24.21.0)

| Check | Result |
|---|---|
| `cd tools/crucible-cockpit && node --test` | 16 tests pass, 0 fail (the runner also lists `test/helpers.js`): view model, parsers, writes (including junction, symlink, dangling-link and hard-link redirection), and the HTTP API including Host, Origin, token, content-type, size and path-traversal refusals, SSE pushes after `TASK.md`, `COLLAB.md` and `QUEUE.md` edits, and file hashes showing only `APPROVALS.md` and `QUEUE.md` change |
| Browser (Claude desktop app's built-in browser, Chromium) on a temporary copy of the fixtures | page loaded on 127.0.0.1; the network log showed only `/`, `/styles.css`, `/app.js` and `/events` on the same origin; no console messages; a hand edit of `QUEUE.md` appeared without a reload; **Approve** wrote `AP-1` to `APPROVALS.md` and the item showed the decision; at 375 px wide the panes stack with no horizontal overflow |
| Real checkout, read only | rendered the real task, roles, pending ccx approval and upstream distance; hashes and modified times of `.git/ccx/state.json`, `telemetry.jsonl`, `.git/index`, `ccx/policy.json`, `TASK.md` and every `handoffs/*.md` were identical before and after, and no `APPROVALS.md` was created |

Prompt console (2026-11-09):

| Check | Result |
|---|---|
| `cd tools/crucible-cockpit && node --test` | 26 tests pass, 0 fail (27 runner entries). Run tests use `support/fake-agent.js` in place of the real CLIs: read-only argument lists, the Codex MCP pre-flight (all servers disabled; refused when one stays on, has an unsafe name, the listing fails, or a config file changes during the check; exec never starts then), the config fingerprint covering user, managed, project and ancestor-folder config, PATH resolution (`.cmd` shim refused for Claude, `codex.js` via Node on Windows), streaming reply and activity, a prompt full of shell metacharacters arriving byte for byte, one run at a time (409), cancel, timeout, failure, a helper holding the pipes open, input validation, Host/Origin/token guards, and no repo files changed |
| Real Codex from the page | a prompt asking it to create `cockpit-probe.txt` got "Access to the path … is denied" from the read-only sandbox; no file was created; the reply streamed in. With the final flags, a run disabled `higgsfield`, `node_repl` and `rea`. Codex read `TASK.md` (Task ID `crucible-cockpit`), its attempt to create `cockpit-probe.txt` was "blocked by the read-only sandbox" (no file appeared), it reported "MCP tools: none", and the run finished `done`, exit 0 |
| Real Claude from the page | the run failed cleanly with the CLI's own message "Failed to authenticate: OAuth session expired and could not be refreshed". The headless Claude login on this machine needs renewing (run `claude` and sign in); a successful real Claude reply was **not** observed |
| Layout | no horizontal overflow at desktop width or 375 px after fixing the radio inputs and run cards |

Not tested: macOS and Linux (only portable Node APIs are used, but that is not validation); browsers other than the built-in Chromium; a run with networking turned off.

## Limitations

- The prompt console is read-only by design. Edits still go through your normal Claude/Codex sessions and ccx.
- Prompt replies are not saved anywhere; restart the server and they are gone.
- Answering a question in place is not supported; the form adds a new question. Agents answer in `QUEUE.md` as usual.
- Claude's token use is not recorded by any Crucible source, so the budget gauge covers ccx-recorded (Codex) usage only, and only when the TASK.md task is registered in ccx.
- `crucible-monitor` lists `APPROVALS.md` among handoff notes, because its exclusion list predates the file.
