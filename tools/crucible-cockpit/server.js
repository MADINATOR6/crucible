#!/usr/bin/env node
// crucible-cockpit: local Mission Control for the Crucible peer-mode workflow.
// Binds 127.0.0.1 only. Serves bundled files, a JSON snapshot, Server-Sent Events, and two append-only writes.
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { snapshot, signature, gitExtras } from './src/sources.js';
import { appendApproval, appendQuestion, InputError } from './src/writes.js';
import { createRunner, resolveAgents } from './src/runs.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const MAX_BODY = 16 * 1024;
const STATIC = {
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
};
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const HELP = `crucible-cockpit — local Mission Control for Crucible

Usage: node tools/crucible-cockpit/server.js [options]

  --repo <path>             repository to read (default: current directory)
  --port <n>                port on 127.0.0.1 (default 4780; 0 picks a free one)
  --state-dir <path>        ccx state directory (default: CCX_STATE_DIR, else <git common dir>/ccx)
  --silence-minutes <n>     flag silence after this many minutes without handoff-file changes (default 30)
  --run-timeout-minutes <n> stop a prompt run after this long (default 15)
  -h, --help                this help

Writes only handoffs/APPROVALS.md and handoffs/QUEUE.md, append-only, when you submit a form.
The prompt console starts Claude Code or Codex read-only on the repo; those CLIs contact their
model providers and use your Claude/Codex usage. The cockpit itself makes no external calls.`;

export async function startServer({ repo, port = 4780, stateDir, silenceMinutes = 30, pollMs = 1000, gitEveryMs = 5000, env = process.env, agents = null, runTimeoutMs = 15 * 60 * 1000 }) {
  const token = randomBytes(24).toString('hex');
  const files = Object.fromEntries(['index.html', 'app.js', 'styles.css', 'favicon.svg'].map((f) => [f, readFileSync(path.join(HERE, 'public', f), 'utf8')]));
  const options = { repo, stateDir, silenceMinutes, env: { CCX_STATE_DIR: env.CCX_STATE_DIR } };
  let current = null; // { data, extras, view, json }
  let lastSig = null;
  let gitCache = null;
  let gitAt = 0;
  let builtAt = 0;
  let building = null;
  const clients = new Set();
  const broadcast = (event, json) => { for (const res of clients) res.write(`event: ${event}\ndata: ${json}\n\n`); };
  const runner = createRunner({ repo: path.resolve(repo), agents: agents || resolveAgents(env), timeoutMs: runTimeoutMs, onChange: (run) => broadcast('run', JSON.stringify(run)) });
  const runsJson = () => JSON.stringify({ availability: runner.availability(), runs: runner.list() });

  async function rebuild(force = false) {
    if (building) return building;
    building = (async () => {
      try {
        const now = Date.now();
        if (force || !gitCache || now - gitAt >= gitEveryMs) { gitCache = await gitExtras(path.resolve(repo)); gitAt = now; }
        const sig = (await signature(path.resolve(repo), current?.data.stateDir?.dir)) + '\n' + JSON.stringify(gitCache);
        // Unchanged files still get a rebuild every 30 s so ages and the silence flag stay current.
        if (!force && sig === lastSig && current && now - builtAt < 30000) return current;
        builtAt = now;
        const next = await snapshot(options, new Date(), gitCache);
        lastSig = (await signature(path.resolve(repo), next.data.stateDir?.dir)) + '\n' + JSON.stringify(gitCache);
        current = { ...next, json: JSON.stringify(next.view) };
        for (const res of clients) res.write(`event: snapshot\ndata: ${current.json}\n\n`);
        return current;
      } catch (error) {
        for (const res of clients) res.write(`event: problem\ndata: ${JSON.stringify({ error: String(error?.message || error).slice(0, 200) })}\n\n`);
        return current;
      } finally { building = null; }
    })();
    return building;
  }

  const origins = () => [`http://${HOST}:${actualPort}`, `http://localhost:${actualPort}`];
  const hostOk = (req) => [`${HOST}:${actualPort}`, `localhost:${actualPort}`].includes(req.headers.host);
  const tokenOk = (req) => {
    const given = Buffer.from(String(req.headers['x-cockpit-token'] || ''));
    const want = Buffer.from(token);
    return given.length === want.length && timingSafeEqual(given, want);
  };

  function send(res, status, body, type = 'application/json; charset=utf-8') {
    res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type });
    res.end(type.startsWith('application/json') && typeof body !== 'string' ? JSON.stringify(body) : body);
  }

  // Oversized bodies are drained (up to 1 MiB, then the socket is cut) so the 413 reaches the client.
  function readBody(req, max = MAX_BODY) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size <= max) chunks.push(c);
        else if (size > 1024 * 1024) req.destroy();
      });
      req.on('end', () => (size > max ? reject(Object.assign(new Error('body too large'), { status: 413 })) : resolve(Buffer.concat(chunks).toString('utf8'))));
      req.on('error', reject);
    });
  }

  // Every state-changing request: same-origin, carrying the page's token, JSON within the size limit.
  async function guardedJson(req, res, max) {
    if (!origins().includes(req.headers.origin)) { send(res, 403, { error: 'cross-origin write refused' }); return null; }
    if (!tokenOk(req)) { send(res, 403, { error: 'missing or wrong cockpit token; reload the page' }); return null; }
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) { send(res, 415, { error: 'JSON only' }); return null; }
    try { return { input: JSON.parse(await readBody(req, max)) }; } catch (error) { send(res, error.status || 400, { error: error.status ? error.message : 'invalid JSON' }); return null; }
  }

  async function handleRun(req, res, url) {
    const body = await guardedJson(req, res, 64 * 1024);
    if (!body) return;
    const cancel = /^\/api\/runs\/(R-\d{1,6})\/cancel$/.exec(url.pathname);
    const result = cancel ? runner.cancel(cancel[1]) : runner.start(body.input);
    send(res, result.status, result.error ? { error: result.error } : { ok: true, run: result.run });
  }

  async function handleWrite(req, res, url) {
    const body = await guardedJson(req, res, MAX_BODY);
    if (!body) return;
    const { input } = body;
    const state = (await rebuild(true)) || current;
    if (!state) return send(res, 503, { error: 'snapshot unavailable' });
    try {
      const result = url.pathname === '/api/approvals'
        ? await appendApproval(state.data.repo, state.data.policy, input, new Set(state.view.review.items.map((i) => i.key)))
        : await appendQuestion(state.data.repo, state.data.policy, input);
      send(res, 201, { ok: true, ...result });
      rebuild(true);
    } catch (error) {
      if (error instanceof InputError) return send(res, 400, { error: error.message });
      send(res, 500, { error: 'write failed' });
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (!hostOk(req)) return send(res, 421, { error: 'unexpected Host header' });
      const url = new URL(req.url, `http://${HOST}:${actualPort}`);
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        return send(res, 200, files['index.html'].replace('__COCKPIT_TOKEN__', token), 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && STATIC[url.pathname]) {
        const [name, type] = STATIC[url.pathname];
        return send(res, 200, files[name], type);
      }
      if (req.method === 'GET' && url.pathname === '/api/snapshot') {
        const state = await rebuild();
        return state ? send(res, 200, state.json) : send(res, 503, { error: 'snapshot unavailable' });
      }
      if (req.method === 'GET' && url.pathname === '/events') {
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive' });
        res.write('retry: 2000\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        res.write(`event: runs\ndata: ${runsJson()}\n\n`);
        const state = current || (await rebuild());
        if (state) res.write(`event: snapshot\ndata: ${state.json}\n\n`);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/runs') return send(res, 200, runsJson());
      if (req.method === 'POST' && (url.pathname === '/api/approvals' || url.pathname === '/api/questions')) return handleWrite(req, res, url);
      if (req.method === 'POST' && (url.pathname === '/api/runs' || /^\/api\/runs\/R-\d{1,6}\/cancel$/.test(url.pathname))) return handleRun(req, res, url);
      send(res, req.method === 'GET' || req.method === 'POST' ? 404 : 405, { error: 'not found' });
    } catch {
      if (!res.headersSent) send(res, 500, { error: 'server error' });
    }
  });

  let actualPort = port;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, HOST, resolve); });
  actualPort = server.address().port;
  await rebuild(true);
  const poll = setInterval(() => rebuild(), pollMs);
  const heartbeat = setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 15000);
  return {
    port: actualPort,
    url: `http://${HOST}:${actualPort}/`,
    token,
    refresh: () => rebuild(true),
    close: () => new Promise((resolve) => {
      runner.stopAll();
      clearInterval(poll); clearInterval(heartbeat);
      for (const res of clients) res.end();
      server.close(() => resolve());
      server.closeAllConnections?.();
    }),
  };
}

// ---------- CLI ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const fail = (m) => { process.stderr.write(`crucible-cockpit: ${m}\nRun with --help for usage.\n`); process.exit(2); };
  let args;
  try {
    args = parseArgs({ options: { repo: { type: 'string', default: '.' }, port: { type: 'string', default: '4780' }, 'state-dir': { type: 'string' }, 'silence-minutes': { type: 'string', default: '30' }, 'run-timeout-minutes': { type: 'string', default: '15' }, help: { type: 'boolean', short: 'h', default: false } } }).values;
  } catch (error) { fail(error.message); }
  if (args.help) { process.stdout.write(HELP + '\n'); process.exit(0); }
  const port = Number(args.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail('--port must be 0-65535');
  const silenceMinutes = Number(args['silence-minutes']);
  if (!Number.isFinite(silenceMinutes) || silenceMinutes < 1 || silenceMinutes > 10080) fail('--silence-minutes must be 1-10080');
  const runMinutes = Number(args['run-timeout-minutes']);
  if (!Number.isFinite(runMinutes) || runMinutes < 1 || runMinutes > 240) fail('--run-timeout-minutes must be 1-240');
  const repo = path.resolve(args.repo);
  let isDir = false;
  try { isDir = statSync(repo).isDirectory(); } catch { fail(`--repo not found: ${repo}`); }
  if (!isDir) fail(`--repo is not a directory: ${repo}`);
  try {
    const app = await startServer({ repo, port, stateDir: args['state-dir'], silenceMinutes, runTimeoutMs: runMinutes * 60000 });
    process.stdout.write(`crucible-cockpit on ${app.url}  (repo ${repo}; Ctrl+C stops)\n`);
    const stop = () => app.close().then(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } catch (error) {
    fail(error.code === 'EADDRINUSE' ? `port ${port} is in use; pass --port` : error.message);
  }
}
