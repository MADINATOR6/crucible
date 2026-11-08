# crucible-cockpit

Local, offline Mission Control for the Crucible peer-mode workflow. A dark three-pane web page shows the active task, each agent's declared role and branches, the handoff loop with silence and deadlock flags, the question queue, and everything waiting for a human. It records your decisions in `handoffs/APPROVALS.md`.

## Start

Requires Node.js 18 or newer (tested on v24.21.0). There are **no dependencies and no build step**: the server is Node's standard library and the page is plain HTML, CSS and JavaScript served from `public/`. Nothing is downloaded at install time or at startup, and the page loads no CDN files or web fonts.

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
| `-h`, `--help` | Help. |

To try it without touching real files, copy `test/fixtures/repo` somewhere outside the repo and run `node tools/crucible-cockpit/server.js --repo <copy> --state-dir state`.

Tests (from `tools/crucible-cockpit`):

```bash
cd tools/crucible-cockpit && node --test
```

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

Not tested: macOS and Linux (only portable Node APIs are used, but that is not validation); browsers other than the built-in Chromium; a run with networking turned off.

## Limitations

- Answering a question in place is not supported; the form adds a new question. Agents answer in `QUEUE.md` as usual.
- Claude's token use is not recorded by any Crucible source, so the budget gauge covers ccx-recorded (Codex) usage only, and only when the TASK.md task is registered in ccx.
- `crucible-monitor` lists `APPROVALS.md` among handoff notes, because its exclusion list predates the file.
