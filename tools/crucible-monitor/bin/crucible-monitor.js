#!/usr/bin/env node
// crucible-monitor: read-only terminal dashboard for the Crucible workflow.
import { parseArgs } from 'node:util';
import { statSync } from 'node:fs';
import path from 'node:path';
import { collect } from '../src/collect.js';
import { renderLines } from '../src/panels.js';
import { snapshot, startLive, LEAVE } from '../src/live.js';

const HELP = `crucible-monitor — read-only dashboard for the Crucible workflow

Usage: node tools/crucible-monitor/bin/crucible-monitor.js [options]

  --repo <path>         repository to read (default: current directory)
  --interval <seconds>  live refresh interval, 1-3600 (default: 5)
  --once                print one plain-text snapshot and exit (automatic when
                        stdout is not a terminal or TERM=dumb)
  --task-file <path>    task file for the Task panel, inside the repo (default: TASK.md)
  --state-dir <path>    ccx state directory (default: CCX_STATE_DIR, else <git common dir>/ccx)
  --no-color            no colour (NO_COLOR is honoured too)
  -h, --help            this help

Keys: up/down or j/k scroll, PgUp/PgDn/space page, Home/End, 1-8 jump to a panel,
r refresh now, q or Ctrl+C quit.

Reads local files and runs read-only git commands only. No network, no writes.`;

function fail(message) {
  process.stderr.write(`crucible-monitor: ${message}\nRun with --help for usage.\n`);
  process.exit(2);
}

let args;
try {
  args = parseArgs({
    options: {
      repo: { type: 'string', default: '.' },
      interval: { type: 'string', default: '5' },
      once: { type: 'boolean', default: false },
      'task-file': { type: 'string' },
      'state-dir': { type: 'string' },
      'no-color': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  }).values;
} catch (error) {
  fail(error.message);
}
if (args.help) { process.stdout.write(HELP + '\n'); process.exit(0); }

const interval = Number(args.interval);
if (!Number.isFinite(interval) || interval < 1 || interval > 3600) fail('--interval must be a number of seconds from 1 to 3600');
const repo = path.resolve(args.repo);
let isDir = false;
try { isDir = statSync(repo).isDirectory(); } catch { fail(`--repo not found: ${repo}`); }
if (!isDir) fail(`--repo is not a directory: ${repo}`);

const options = { repo, taskFile: args['task-file'], stateDir: args['state-dir'], env: { CCX_STATE_DIR: process.env.CCX_STATE_DIR } };
const out = process.stdout;
const stdin = process.stdin;
const live = !args.once && out.isTTY && stdin.isTTY && typeof stdin.setRawMode === 'function' && process.env.TERM !== 'dumb';

if (!live) {
  const panels = await snapshot(collect, options, { count: 0, interval: 0 });
  if (!panels) { process.stderr.write('crucible-monitor: collection failed\n'); process.exit(1); }
  out.write(`crucible-monitor snapshot · ${repo} · ${new Date().toISOString()}\n\n` + renderLines(panels).lines.join('\n') + '\n');
  process.exit(0);
}

const color = !args['no-color'] && !process.env.NO_COLOR;
let view = null;
const quit = (code) => { view?.stop(); process.exit(code); };
// Last resort: whatever happens, leave the alternate screen and show the cursor.
process.on('exit', () => { if (view) view.stop(); });
process.on('SIGINT', () => quit(0));
process.on('SIGTERM', () => quit(0));
process.on('SIGHUP', () => quit(0));
for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, (error) => {
    try { view?.stop(); } catch { out.write(LEAVE); }
    process.stderr.write(`crucible-monitor: ${error?.stack || error}\n`);
    process.exit(1);
  });
}
view = startLive({ out, stdin, collectFn: collect, options, interval, color, onExit: (code) => process.exit(code) });
