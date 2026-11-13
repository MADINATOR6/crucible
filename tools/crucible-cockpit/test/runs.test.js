import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server.js';
import { resolveAgents, codexArgs, codexConfigFiles, codexConfigFingerprint, CLAUDE_READ_ONLY, CODEX_EXEC, CODEX_OVERRIDES } from '../src/runs.js';
import { fixtureCopy, fileHashes, changedFiles, request, waitForEvent } from './helpers.js';

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'support', 'fake-agent.js');
const fake = (mode, parse) => ({ command: process.execPath, args: [FAKE, mode], parse });
// A Codex stand-in that goes through the real MCP pre-flight, like resolveAgents' Codex spec.
// codexHome points at a scratch folder so tests never read the real ~/.codex.
const SCRATCH_HOME = mkdtempSync(path.join(tmpdir(), 'crucible-cockpit-codexhome-'));
process.on('exit', () => rmSync(SCRATCH_HOME, { recursive: true, force: true }));
const fakeCodex = (mode = 'codex', extra = [], codexHome = SCRATCH_HOME) => ({ command: process.execPath, prefix: [FAKE, mode, ...extra], parse: 'codex', preflight: 'codex', codexHome });
const WIN = process.platform === 'win32';

async function boot(t, agents, extra = {}) {
  const repo = fixtureCopy(t);
  const app = await startServer({ repo, port: 0, stateDir: 'state', pollMs: 200, gitEveryMs: 60000, env: {}, agents, ...extra });
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.port}`;
  const post = (p, body, headers = {}) => request(app.port, { method: 'POST', path: p, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Cockpit-Token': app.token, ...headers } });
  const until = (pred, ms) => waitForEvent(app.port, pred, ms, 'run');
  return { repo, app, post, until };
}

test('read-only arguments: Claude gets only read tools, no hooks, no MCP; Codex gets the read-only sandbox with extras off; prompts go on stdin', () => {
  for (const flag of ['-p', '--permission-mode', 'dontAsk', '--strict-mcp-config', '--no-session-persistence']) assert.ok(CLAUDE_READ_ONLY.includes(flag), flag);
  const between = (from, to) => CLAUDE_READ_ONLY.slice(CLAUDE_READ_ONLY.indexOf(from) + 1, CLAUDE_READ_ONLY.indexOf(to));
  assert.deepEqual(between('--tools', '--allowedTools'), ['Read', 'Grep', 'Glob'], 'only these tools exist');
  assert.deepEqual(between('--allowedTools', '--disallowedTools'), ['Read', 'Grep', 'Glob']);
  assert.deepEqual(JSON.parse(CLAUDE_READ_ONLY[CLAUDE_READ_ONLY.indexOf('--settings') + 1]), { disableAllHooks: true });
  for (const tool of ['Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell', 'WebFetch', 'WebSearch']) assert.ok(CLAUDE_READ_ONLY.slice(CLAUDE_READ_ONLY.indexOf('--disallowedTools')).includes(tool), tool);
  assert.deepEqual(CODEX_EXEC.slice(0, 3), ['exec', '--sandbox', 'read-only']);
  assert.equal(CODEX_EXEC.at(-1), '-', 'codex reads the prompt from stdin');
  for (const f of ['plugins', 'apps', 'computer_use', 'browser_use', 'browser_use_full_cdp_access', 'hooks', 'memories', 'multi_agent', 'multi_agent_v2', 'image_generation', 'in_app_local_automation']) assert.ok(CODEX_OVERRIDES.includes(`features.${f}=false`), f);
  assert.ok(CODEX_OVERRIDES.includes('web_search="disabled"'));
  assert.ok(![...CODEX_EXEC, ...CODEX_OVERRIDES].some((a) => /danger|bypass|full-access|workspace-write|approve-for-me/.test(a)));
});

test('Codex pre-flight disables every MCP server it lists, and refuses when one stays on or has an unsafe name', async (t) => {
  const repo = fixtureCopy(t);
  const { args, disabled } = await codexArgs(fakeCodex(), repo);
  assert.deepEqual(disabled, ['srv-a', 'srv_b']);
  assert.ok(args.includes('mcp_servers.srv-a.enabled=false') && args.includes('mcp_servers.srv_b.enabled=false'));
  assert.deepEqual(args.slice(-CODEX_EXEC.length), CODEX_EXEC);
  await assert.rejects(codexArgs(fakeCodex('codex-stuck'), repo), /still enabled after disabling: srv-a/);
  await assert.rejects(codexArgs(fakeCodex('codex-badname'), repo), /cannot be disabled safely: bad name/);
  await assert.rejects(codexArgs({ command: process.execPath, prefix: ['-e', 'process.exit(5)'], codexHome: SCRATCH_HOME }, repo), /codex mcp list failed/);
});

test('Codex config fingerprint: an edit during the pre-flight refuses the run; any config source change is detected', async (t) => {
  const repo = fixtureCopy(t);
  const home = mkdtempSync(path.join(tmpdir(), 'crucible-cockpit-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const config = path.join(home, 'config.toml');
  writeFileSync(config, 'model = "x"\n');
  await assert.rejects(codexArgs(fakeCodex('codex-mutate', [config], home), repo), /configuration changed during the check/);

  const spec = fakeCodex('codex', [], home);
  const files = codexConfigFiles(spec, repo);
  assert.deepEqual(files.slice(0, 3), [config, path.join(home, 'managed_config.toml'), path.join(repo, '.codex', 'config.toml')]);
  assert.ok(files.includes(path.join(path.dirname(repo), '.codex', 'config.toml')), 'parent folder config counts');
  assert.ok(files.includes(path.join(path.parse(repo).root, '.codex', 'config.toml')), 'all the way to the drive root');
  const { fingerprint } = await codexArgs(spec, repo);
  assert.equal(codexConfigFingerprint(spec, repo), fingerprint);
  writeFileSync(path.join(home, 'managed_config.toml'), '[mcp_servers.late]\n');
  assert.notEqual(codexConfigFingerprint(spec, repo), fingerprint, 'managed config counts');
  rmSync(path.join(home, 'managed_config.toml'));
  assert.equal(codexConfigFingerprint(spec, repo), fingerprint);
  mkdirSync(path.join(repo, '.codex'));
  writeFileSync(path.join(repo, '.codex', 'config.toml'), '[mcp_servers.project_late]\n');
  assert.notEqual(codexConfigFingerprint(spec, repo), fingerprint, 'project config counts');
});

test('Codex config fingerprint: a server added to an ancestor project config after the pre-flight is caught (R5 reproduction)', async (t) => {
  const parent = mkdtempSync(path.join(tmpdir(), 'crucible-cockpit-ancestor-'));
  t.after(() => rmSync(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  const repo = path.join(parent, 'repo');
  mkdirSync(path.join(parent, '.codex'), { recursive: true });
  mkdirSync(repo);
  writeFileSync(path.join(parent, '.codex', 'config.toml'), '');
  const spec = fakeCodex();
  const { fingerprint } = await codexArgs(spec, repo);
  writeFileSync(path.join(parent, '.codex', 'config.toml'), '[mcp_servers.late_server]\ncommand = "node"\n');
  assert.notEqual(codexConfigFingerprint(spec, repo), fingerprint, 'the launch check now refuses');
});

test('resolveAgents finds real executables, refuses .cmd shims for Claude, and runs codex.js through Node on Windows', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'crucible-cockpit-path-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.match(resolveAgents({ PATH: dir }).Claude.unavailable, /not on PATH/);
  assert.match(resolveAgents({ PATH: dir }).Codex.unavailable, /not on PATH/);
  if (WIN) {
    writeFileSync(path.join(dir, 'claude.cmd'), '@echo off');
    assert.match(resolveAgents({ PATH: dir }).Claude.unavailable, /\.cmd shim/);
    writeFileSync(path.join(dir, 'claude.exe'), '');
    writeFileSync(path.join(dir, 'codex.cmd'), '@echo off');
    assert.match(resolveAgents({ PATH: dir }).Codex.unavailable, /codex\.js was not found/);
    mkdirSync(path.join(dir, 'node_modules', '@openai', 'codex', 'bin'), { recursive: true });
    writeFileSync(path.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'), '');
  } else {
    for (const name of ['claude', 'codex']) { writeFileSync(path.join(dir, name), '#!/bin/sh\n'); chmodSync(path.join(dir, name), 0o755); }
  }
  const agents = resolveAgents({ PATH: dir });
  assert.equal(agents.Claude.command, path.join(dir, WIN ? 'claude.exe' : 'claude'));
  assert.deepEqual(agents.Claude.args, CLAUDE_READ_ONLY);
  assert.equal(agents.Codex.preflight, 'codex', 'Codex never runs without the MCP pre-flight');
  if (WIN) {
    assert.equal(agents.Codex.command, process.execPath);
    assert.deepEqual(agents.Codex.prefix, [path.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')]);
  } else assert.deepEqual(agents.Codex.prefix, []);
  assert.match(resolveAgents({ PATH: `relative-dir${path.delimiter}${dir}` }).Claude.command, /claude/, 'relative PATH entries are skipped, absolute ones still work');
});

test('a Claude run streams its reply, tools and reported cost; a Codex run shows stdout as reply and stderr as activity', async (t) => {
  const { repo, post, until } = await boot(t, { Claude: fake('claude', 'claude'), Codex: fakeCodex() });
  const before = fileHashes(repo);
  const tricky = 'hello "world" & echo pwned | del *.* ; $(whoami) `id` %PATH%\nsecond line';
  let done = until((r) => r.id === 'R-1' && r.status !== 'running');
  const started = await post('/api/runs', { agent: 'Claude', prompt: tricky });
  assert.equal(started.status, 201, started.text);
  let run = await done;
  assert.equal(run.status, 'done');
  assert.equal(run.reply, `echo: ${tricky}`, 'prompt arrives byte-for-byte on stdin; no shell touched it');
  assert.equal(run.meta.model, 'fake-claude-model');
  assert.equal(run.meta.costUsd, 0.0123);
  assert.ok(run.activity.some((l) => /^tool Read .*TASK\.md/.test(l)));

  done = until((r) => r.id === 'R-2' && r.status !== 'running');
  assert.equal((await post('/api/runs', { agent: 'Codex', prompt: 'hi' })).status, 201);
  run = await done;
  assert.equal(run.reply, 'codex says: hi');
  assert.ok(run.activity.includes('model: fake-codex'));
  assert.ok(run.activity.includes('MCP servers disabled: srv-a, srv_b'));
  assert.equal(run.activity.find((l) => l.startsWith('argv: ')), 'argv: plugins-off=true hooks-off=true mcp-off=srv-a,srv_b sandbox=read-only stdin=true', 'what the agent process actually received');
  assert.equal(run.exitCode, 0);

  done = until((r) => r.id === 'R-3' && r.status !== 'running');
  assert.equal((await post('/api/runs', { agent: 'Claude', prompt: 'tools?' })).status, 201);
  run = await done;
  assert.ok(run.activity.some((l) => /tools Glob, Grep, Read · MCP servers 0/.test(l)), 'the init event is shown so the restriction is visible');
  assert.deepEqual(changedFiles(before, fileHashes(repo)), [], 'runs write nothing to the repo');
});

test('one run at a time, cancel, timeout and failure states', async (t) => {
  const { post, until } = await boot(t, { Claude: fake('sleep', 'claude'), Codex: fake('fail', 'codex') }, { runTimeoutMs: 1500 });
  assert.equal((await post('/api/runs', { agent: 'Claude', prompt: 'wait' })).status, 201);
  const busy = await post('/api/runs', { agent: 'Codex', prompt: 'second' });
  assert.equal(busy.status, 409);
  assert.match(busy.json.error, /R-1 is still running/);
  const cancelled = until((r) => r.id === 'R-1' && r.status !== 'running');
  assert.equal((await post('/api/runs/R-1/cancel', {})).status, 202);
  assert.equal((await cancelled).status, 'cancelled');
  assert.equal((await post('/api/runs/R-1/cancel', {})).status, 409);
  assert.equal((await post('/api/runs/R-99/cancel', {})).status, 404);

  const timedOut = until((r) => r.id === 'R-2' && r.status !== 'running', 10000);
  assert.equal((await post('/api/runs', { agent: 'Claude', prompt: 'wait again' })).status, 201);
  const t2 = await timedOut;
  assert.equal(t2.status, 'timeout');
  assert.ok(t2.activity.some((l) => /timed out/.test(l)));

  const failed = until((r) => r.id === 'R-3' && r.status !== 'running');
  assert.equal((await post('/api/runs', { agent: 'Codex', prompt: 'x' })).status, 201);
  const f = await failed;
  assert.equal(f.status, 'failed');
  assert.equal(f.exitCode, 3);
  assert.ok(f.activity.includes('fake failure'));
});

test('a run finishes when the agent exits even if a helper it started keeps the output pipes open', async (t) => {
  const { post, until } = await boot(t, { Claude: fake('claude', 'claude'), Codex: fake('linger', 'codex') });
  const started = Date.now();
  const done = until((r) => r.id === 'R-1' && r.status !== 'running', 8000);
  assert.equal((await post('/api/runs', { agent: 'Codex', prompt: 'q' })).status, 201);
  const run = await done;
  assert.equal(run.status, 'done');
  assert.equal(run.reply, 'answered: q');
  assert.ok(Date.now() - started < 5000, 'did not wait for the 6 s helper');
  const next = until((r) => r.id === 'R-2' && r.status !== 'running', 8000);
  assert.equal((await post('/api/runs', { agent: 'Claude', prompt: 'next' })).status, 201, 'the next run is not blocked');
  assert.equal((await next).status, 'done');
});

test('a Codex run whose pre-flight fails is refused before Codex starts', async (t) => {
  const { post, until } = await boot(t, { Claude: fake('claude', 'claude'), Codex: fakeCodex('codex-stuck') });
  const done = until((r) => r.id === 'R-1' && r.status !== 'running');
  assert.equal((await post('/api/runs', { agent: 'Codex', prompt: 'never runs' })).status, 201);
  const run = await done;
  assert.equal(run.status, 'failed');
  assert.equal(run.reply, '');
  assert.ok(run.activity.some((l) => /^refused: MCP servers still enabled/.test(l)));
  assert.ok(!run.activity.some((l) => l.startsWith('argv: ')), 'exec never ran');
});

test('run requests are validated and guarded like every other write', async (t) => {
  const { app, post } = await boot(t, { Claude: fake('claude', 'claude'), Codex: { unavailable: 'codex is not on PATH' } });
  assert.equal((await post('/api/runs', { agent: 'Claude', prompt: 'x' }, { 'X-Cockpit-Token': 'nope' })).status, 403);
  assert.equal((await post('/api/runs', { agent: 'Claude', prompt: 'x' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request(app.port, { method: 'POST', path: '/api/runs', headers: { Host: `evil.test:${app.port}` } })).status, 421);
  assert.equal((await post('/api/runs', { agent: 'Gemini', prompt: 'x' })).status, 400);
  assert.equal((await post('/api/runs', { agent: 'Claude', prompt: '   ' })).status, 400);
  assert.equal((await post('/api/runs', { agent: 'Claude', prompt: 'x'.repeat(20001) })).status, 400);
  assert.equal((await post('/api/runs', { agent: 'Claude', prompt: 42 })).status, 400);
  const missing = await post('/api/runs', { agent: 'Codex', prompt: 'x' });
  assert.equal(missing.status, 503);
  assert.match(missing.json.error, /not on PATH/);
  const list = await request(app.port, { path: '/api/runs' });
  assert.deepEqual(list.json.availability, { Claude: { available: true }, Codex: { available: false, reason: 'codex is not on PATH' } });
  assert.deepEqual(list.json.runs, []);
});
