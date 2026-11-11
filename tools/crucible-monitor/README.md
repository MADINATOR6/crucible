# crucible-monitor

A read-only terminal dashboard for the Crucible workflow. Run it from an ordinary shell, outside Claude Code and Codex. It reads local repository artifacts and shows eight panels: Agents & Models, Usage, Task, Handoffs, Collaboration, Budget & Limits, Verification & Approvals, and Health.

It never writes files, never contacts the network, never starts an agent and never runs a mutating ccx command. It cannot grant or resolve approvals.

## Install

Requires Node.js 18 or newer (tested on v24.21.0). There are **no dependencies**: the program uses only Node's standard library (`fs`, `path`, `child_process`, `readline`-free raw stdin, ANSI escape sequences). Nothing is downloaded at install time or at startup, so the tool works offline once this folder and Node are present. There is no lockfile because there is nothing to lock.

No install step is needed. Optionally, to get a `crucible-monitor` command on PATH:

```bash
cd tools/crucible-monitor && npm.cmd link
```

(`npm link` itself downloads nothing for this package; it only creates a link. It was not run during verification, so treat it as untested.)

## Commands

Run from the repository root (or pass `--repo`):

```bash
node tools/crucible-monitor/bin/crucible-monitor.js
```

| Option | Meaning |
|---|---|
| `--repo <path>` | Repository to read. Default: the current directory. |
| `--interval <seconds>` | Refresh interval for the live view. Default 5, minimum 1. |
| `--once` | Print one plain-text snapshot and exit. Used automatically when stdout is not a terminal (redirected or piped) or `TERM=dumb`. |
| `--task-file <path>` | Task file for the Task panel, relative to the repo. Default `TASK.md`. Paths outside the repo or under `privacy.excludePaths` are refused. |
| `--state-dir <path>` | ccx state directory. Default: `CCX_STATE_DIR` if set (the same variable ccx honours), else `<git common dir>/ccx`, else `<repo>/.git/ccx`. |
| `--no-color` | No colour in the live view (also honoured: `NO_COLOR`). |
| `-h`, `--help` | Help. |

Live view keys: `↑`/`↓` or `j`/`k` scroll, `PgUp`/`PgDn`/space page, `Home`/`End`, `1`–`8` jump to a panel, `r` refresh now, `q` or `Ctrl+C` quit. The terminal is restored on quit, `Ctrl+C`, `SIGTERM` and uncaught errors.

Tests (run from `tools/crucible-monitor`):

```bash
cd tools/crucible-monitor && node --test
```

## Data sources

Labels used in the panels:

- **configured**: a policy preference (`ccx/policy.json`). Never shown as what actually ran.
- **routed**: an OMNIROUTE decision ccx explicitly logged (`kind: "route"` in telemetry). It is a selection, not proof that a run happened.
- **observed**: a run ccx recorded after it happened (`kind: "dispatch"` in telemetry, `lastDispatch` in state).
- **n/a**: no source records it; the reason follows.

Nothing is inferred from a branch, worktree, handoff file name, configured model or Git cleanliness.

State is `<state dir>/state.json` (written atomically by `scripts/ccx-core.ps1`, schema 1). Telemetry and history are JSON Lines appended by `Write-CcxLog` (`scripts/ccx-core.ps1:265-282`) and rotated at `policy.telemetry.maxBytes` / `policy.state.historyMaxBytes` into `telemetry.1.jsonl` / `history.1.jsonl`.

### Source map

| Field | Actual source | Parsing rule | Missing/invalid behavior |
|-------|---------------|--------------|-------------------------|
| **Agents & Models** | | | |
| Configured Claude models | `ccx/policy.json` `models.claude.lead/standard/cheap` | strings, shown as configured | n/a: policy missing/invalid or key absent |
| Configured Codex models | `models.codex.default`, `models.codex.fallbacks[]`, `classes.<c>.codexModel` | strings | n/a per key |
| Configured effort | `classes.<c>.effort.codex.base/max`, `.effort.claude.base/max` | strings | n/a per key |
| Fallback providers | `providers.<name>.kind/enabled/model` | shown with enabled flag | provider section absent: n/a |
| Routed selections | telemetry `kind:"route"`: `at, taskId, agent, model, effort, route` | newest 5, labelled routed | none in window: n/a |
| Observed dispatches | telemetry `kind:"dispatch"`: `at, taskId, role, agent, provider, model, effort, exit, status` (`scripts/codex-dispatch.ps1:462-467`) | newest 5; `model` empty or null shown as "not recorded" (the launcher records `""` for an explicit run without `-Model`, when Codex used its own default) | none in window: n/a |
| Usage-limit records | `state.agents.codex.unavailableUntil`, `state.providerLimits.<name>` | timestamp shown with "in future" or "passed" against the clock (the router's own rule, `ccx-core.ps1:591`, `:668`) | absent: "none recorded" |
| **Usage** | | | |
| Tokens by agent/provider/model | telemetry `kind:"dispatch"` `tokens.input/cached/output` | grouped by agent+provider+model; units are tokens as the Codex CLI reports them; `input` includes `cached`; effective = input − cached + output (`ccx-core.ps1:548`) | `tokens: null` counted as "runs without token record" |
| Scope | oldest and newest `at` of retained dispatch records | shown as the reporting window | empty: n/a |
| Duplicates | identical `taskId+role+attempt+at` | counted once, duplicates reported | — |
| Not summed | telemetry `kind:"task-done"` tokens and `state.tasks.<id>.tokens` | per-task aggregates of the same dispatches, so never added to the dispatch total | — |
| Claude usage | no producer records Claude token use | always n/a with that reason | — |
| **Task** | | | |
| Title | task file (default `TASK.md`) first `# ` heading | text after `# ` | n/a: no H1 |
| Task ID | first match of ``Task ID[:]? `?<id>`` | id token | n/a: not stated |
| Mode | first match of `Mode[:]? (Dispatch\|Parallel)` | word | n/a: not stated (never guessed from content) |
| Write allowlist | heading containing "allowlist" | first lines of that section | n/a: no such heading |
| Completion criteria | heading containing "Done When" or "Acceptance" | first lines; `[x]`/`[ ]` counts | n/a: no such heading |
| Stop conditions | heading containing "Stop condition" | first lines | n/a: no such heading |
| ccx open tasks | `state.tasks.<id>` with status not `done`/`abandoned` | `id, status, owner, type, owns, taskFile`; `owns` is the allowlist ccx enforces | state missing: n/a |
| Git position | `git --no-optional-locks rev-parse --abbrev-ref HEAD`, `rev-parse --short HEAD` | text | git missing/failed: n/a, Health shows the error |
| Worktrees | `git --no-optional-locks worktree list --porcelain` | branch per worktree, labelled "structure only; not evidence of activity" | n/a, Health shows the error |
| **Handoffs** | | | |
| Entries | `handoffs/*.md` except `TEMPLATE.md`, `COLLAB.md`, `QUEUE.md` | newest 8 by modified time; first `# ` heading | folder missing: n/a |
| Status | a line starting `Status:` (HANDOFF.md Report format) | value | "not recorded" |
| Branch / commit | `**Branch / commit:**` (handoffs/TEMPLATE.md) | value | "not recorded" |
| Checks / verification | `**Checks run:**` | value | "not recorded" |
| Next owner | `**Next action / owner:**` | value | "not recorded" |
| **Collaboration** | | | |
| Phase, participants | `handoffs/COLLAB.md` lines `Phase:` and `Participants:` | value | n/a: file or line missing |
| Roles, decisions, review | `## Roles`, `## Decisions`, `## Review and sign-off` bullet lists | count plus newest bullets | n/a: heading missing |
| Questions | `handoffs/QUEUE.md` headings `### Q-<n> [open\|answered] <author> -> <to>: <title>` | open ones listed, counts by state | n/a: file missing; malformed headings counted |
| **Budget & Limits** | | | |
| Class limits | `policy.classes.<c>.budget.maxDispatches/maxReviewCycles/maxModelEscalations/tokenTarget/timeoutMinutes` | table | n/a per key |
| Effective class | task `class`, `risk`; `policy.risk.high.minClass` | same rule as `Get-CcxClass` (`ccx-core.ps1:494-503`) | unknown class: n/a |
| Task budget | class budget, then `state.tasks.<id>.budget` overrides (`Get-CcxBudget`, `:512-518`) | merged | — |
| Dispatches left | `maxDispatches − (dispatches − attemptBase)` (`:616`, `:653`) | integer | any value missing: n/a |
| Tokens left | `tokenTarget − (tokens.input − tokens.cached + tokens.output)` (`codex-dispatch.ps1:190-192`) | effective tokens | tokens missing: n/a |
| Review cycles | `reviewCycles` vs `maxReviewCycles` | used/max | n/a |
| Credit cap | `state.tasks.<id>.creditCap` | shown; remaining credits n/a (the ledger is not read) | absent: not shown |
| **Verification & Approvals** | | | |
| Approvals | `state.approvals.<id>`: `id, action, level, target, status, requested, expires` | counts by status; `pending` and `approved` listed. Display only: the monitor cannot change them | state missing: n/a |
| Task verification | `state.tasks.<id>.verification.status/full` | as recorded | "not recorded" |
| Reviews | last of `state.tasks.<id>.reviews[]`: `by, result, kind, at` | as recorded | "no review recorded" |
| Required checks | `policy.classes.<c>.verification` (+ `risk.high.addVerification`, or `taskTypes.<t>.verification`) | list | n/a |
| Notifications | `state.notifications[]` with `ack: false` | count, newest 3 | none |
| Peer sign-off | `handoffs/COLLAB.md` `## Review and sign-off` | bullets as written | n/a |
| **Health** | | | |
| Each source | file stat and read result | ok / missing / unreadable / parse error / unsupported schema (`schema` ≠ 1) / too large / skipped partial or invalid lines | always shown |
| Refresh | in-process clock | last refresh time, duration, count, interval | — |
| Freshness | each source's modified time; `state.updated`, `state.runtime.lastTick` | shown as an age only. No liveness timeout is applied, because no source documents one | — |

### Bounds and safety

- JSON files are read whole up to 16 MiB; larger is reported as too large.
- JSON Lines are read from the last 2 MiB of each file (twice ccx's 1 MiB rotation size). A first line cut by the window and a final line without a newline (a write in progress) are skipped and counted. Invalid lines are skipped and counted. Rotation and deletion simply change what the next refresh reads.
- Markdown files are read up to 256 KiB.
- The task file and `handoffs/` folder are refused when they lie outside the repo or under `privacy.excludePaths`, checked both as written and after resolving symlinks and junctions. Symlinked notes inside `handoffs/` are skipped.
- Only these paths are read: `ccx/policy.json`, the state directory's `state.json`, `telemetry.jsonl`, `telemetry.1.jsonl`, the task file, `handoffs/` (one level, `.md` only). `history.jsonl` is not needed by any panel and is not read. Nothing else is scanned.
- Every string from a source is treated as untrusted: control characters (C0, C1, DEL, ESC sequences) and bidirectional overrides are replaced, and fields are length-capped before display. Embedded instructions are never acted on.
- Git commands are run with `execFile` (no shell), `--no-optional-locks -C <repo>`, a 3 s timeout, and only `rev-parse` and `worktree list` are used. The child's working directory is Node's own install folder, because Windows can resolve a bare `git` from the working directory before PATH and the monitored repo is not trusted to supply binaries.

## Limitations

- Claude's own token use is not recorded by any Crucible source, so Usage shows Claude as n/a.
- Media credit spend lives in `media-out/higgsfield/<project>/` ledgers, which the monitor does not read; credit remaining is n/a.
- Display width counts code points, so wide CJK or emoji characters can misalign columns.
- TASK.md is prose. Only the patterns above are parsed; anything else in it is not shown.

## Verification (2026-11-09)

Commands that ran successfully:

| Command | Result |
|---|---|
| `cd tools/crucible-monitor && node --test` | 20 pass, 0 fail (`test/monitor.test.js`, `test/cli.test.js`, `test/live.test.js`) |
| `node tools/crucible-monitor/bin/crucible-monitor.js --once` from the repo root | exit 0, eight panels, real checkout |
| `node --permission --allow-fs-read=* --allow-child-process tools/crucible-monitor/bin/crucible-monitor.js --once` | exit 0, eight panels. Node's permission model blocks every file write by the monitor's own process (a write probe under the same flags fails with `ERR_ACCESS_DENIED`). It does not cover the git child, whose arguments are read-only. |

What the tests cover: fixture values in all panels; missing, empty, malformed, unreadable (directory in place of a file), unsupported-schema and privacy-refused sources, including junctions that lead outside the repo or into a private path; unknown class or risk values (no budget derived); unknown fields and unknown telemetry kinds; partial, truncated, invalid and tail-cut JSON Lines; duplicate dispatch records and token-less runs; configured versus routed versus observed models (an empty recorded model is "not recorded", never the configured one); handoff fields only when stated (a note named `verified-approved-committed.md` shows "not recorded"); ESC/CSI/OSC/C1/bidi characters in source text; refresh after a source changes or disappears; snapshot output without a terminal; the live view with fake streams (alternate screen in and out, raw mode off, `q`, `Ctrl+C`, a startup error, scrolling, `1`–`8` jumps, 30x12 and too-small terminals, resize, a failing refresh keeping previous data); and a file-tree hash showing a run changes nothing.

Interactive smoke checks (real terminal, Windows, the desktop app's Terminal panel, about 120 columns): live view on a temporary copy of the synthetic fixtures refreshed every 2 s; deleting its telemetry file mid-run switched Usage to n/a on the next refresh without a crash; `Ctrl+C` left the alternate screen and returned the original prompt. Live view on the real checkout rendered; SHA-256 and modified times of `.git/ccx/state.json`, `telemetry.jsonl`, `history.jsonl`, `.git/index`, `ccx/policy.json`, `TASK.md` and every `handoffs/*.md` were identical before and after. Narrow layouts were checked with the fake-terminal tests only; the real terminal's width was not changed.

Network: the code imports only `node:fs`, `node:path`, `node:util` and `node:child_process` (used for the two git commands above), and has no `fetch`, sockets or HTTP. Node 24's permission model has no network switch, and turning networking off would mean changing system settings, so a run with networking disabled was **not** done.

## Tested platforms

Windows 11 Pro (10.0.26200), Node v24.21.0, Windows PowerShell 5.1 and the Claude desktop app's Terminal panel. macOS and Linux were **not** tested; the code uses only portable Node APIs and ANSI sequences, but that is not validation.
