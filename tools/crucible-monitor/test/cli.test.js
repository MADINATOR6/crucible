import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PANEL_TITLES } from '../src/panels.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(HERE, '..', 'bin', 'crucible-monitor.js');
const FIXTURE = path.join(HERE, 'fixtures', 'repo');

function run(args, { node = [], env = {} } = {}) {
  return spawnSync(process.execPath, [...node, BIN, ...args], { encoding: 'utf8', timeout: 30000, env: { ...process.env, NO_COLOR: '', ...env } });
}

function treeHash(dir) {
  const hash = createHash('sha256');
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const full = path.join(d, name);
      const info = statSync(full);
      hash.update(`${path.relative(dir, full)}|${info.size}|${info.mtimeMs}\n`);
      if (info.isDirectory()) walk(full); else hash.update(readFileSync(full));
    }
  };
  walk(dir);
  return hash.digest('hex');
}

function fixtureCopy(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'crucible-monitor-cli-'));
  cpSync(FIXTURE, dir, { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('--once prints a plain snapshot with all eight panels and no escape codes', (t) => {
  const repo = fixtureCopy(t);
  const result = run(['--once', '--repo', repo, '--state-dir', 'state']);
  assert.equal(result.status, 0, result.stderr);
  PANEL_TITLES.forEach((title, i) => assert.ok(result.stdout.includes(`[${i + 1}] ${title}`), title));
  assert.doesNotMatch(result.stdout, /\u001b/);
  assert.match(result.stdout, /T-1\s+normal\s+dispatches 1\/2/);
});

test('without a terminal the snapshot is automatic (piped stdout)', (t) => {
  const repo = fixtureCopy(t);
  const result = run(['--repo', repo, '--state-dir', 'state']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[8\] Health/);
});

test('the run writes nothing: tree unchanged and the permission model forbids writes', (t) => {
  const repo = fixtureCopy(t);
  const before = treeHash(repo);
  // Node's permission model: any fs write or worker/addon use by the monitor would throw ERR_ACCESS_DENIED.
  const result = run(['--once', '--repo', repo, '--state-dir', 'state'], { node: ['--permission', '--allow-fs-read=*', '--allow-child-process'] });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[1\] Agents & Models/);
  assert.equal(treeHash(repo), before);
});

test('CCX_STATE_DIR is honoured like ccx does', (t) => {
  const repo = fixtureCopy(t);
  const result = run(['--once', '--repo', repo], { env: { CCX_STATE_DIR: path.join(repo, 'state') } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ccx state dir: via CCX_STATE_DIR/);
  assert.match(result.stdout, /A-0001\s+pending/);
});

test('help and usage errors', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--interval <seconds>/);
  assert.equal(run(['--interval', '0']).status, 2);
  assert.equal(run(['--interval', 'abc']).status, 2);
  assert.equal(run(['--repo', path.join(tmpdir(), 'no-such-dir-crucible-monitor')]).status, 2);
  assert.equal(run(['--bogus']).status, 2);
});
