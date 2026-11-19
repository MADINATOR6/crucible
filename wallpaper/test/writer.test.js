'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { normalizeStatus } = require('../scene.js');

test('PowerShell snapshots: missing/malformed state, provider lanes, privacy, atomic replacement', { skip: process.platform !== 'win32' }, () => {
  const fixtures = path.join(__dirname, 'fixtures');
  fs.mkdirSync(fixtures, { recursive: true });
  const dir = fs.mkdtempSync(path.join(fixtures, 'runtime-'));
  const script = path.join(dir, 'status-writer.ps1');
  fs.copyFileSync(path.join(__dirname, '../status-writer.ps1'), script);
  const statePath = path.join(dir, '.git/ccx/state.json');
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  function run() {
    const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Repo', dir, '-Once'], { encoding: 'utf8', timeout: 20000 });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    const js = fs.readFileSync(path.join(dir, 'status.js'), 'utf8');
    assert.match(js, /^window\.PALS_STATUS = \{.*\};$/);
    assert.doesNotMatch(js, /title|quote|[A-Za-z]:[\\/]|claude\//i);
    const snapshot = JSON.parse(js.slice('window.PALS_STATUS = '.length, -1));
    const required = ['live', 'updated', 'codex', 'gemini', 'claude', 'stage', 'activeIds', 'done', 'open', 'approvals'];
    assert.ok(required.every(key => key in snapshot));
    assert.ok(Object.keys(snapshot).every(key => [...required, 'codexUntil', 'geminiUntil'].includes(key)));
    assert.ok(!fs.readdirSync(dir).some(file => /^\.status-.*\.tmp$/.test(file)));
    return snapshot;
  }
  try {
    assert.equal(run().live, false);
    fs.writeFileSync(statePath, '{bad'); assert.equal(run().live, false);
    const now = new Date().toISOString(), future = new Date(Date.now() + 3600000).toISOString();
    const state = {
      tasks: {
        a: { id: 'WP-1', status: 'active', updated: now, owner: 'claude', title: 'PRIVATE title', notes: 'C:\\private', branch: 'claude/private', lastDispatch: { startedAt: now } },
        b: { id: 'G-1', status: 'verifying', updated: future, lastDispatch: { provider: 'gemini', startedAt: now } },
        c: { id: 'DONE-1', status: 'done', lastDispatch: { provider: 'codex', startedAt: now } },
        d: { id: '<script>evil</script>', status: 'active' }
      }, agents: { codex: {} }, providerLimits: {}, approvals: { a: { status: 'pending', quote: 'PRIVATE quote' }, b: { status: 'approved' } }
    };
    fs.writeFileSync(statePath, JSON.stringify(state));
    let snapshot = run();
    assert.equal(snapshot.live, true);
    assert.equal(snapshot.codex, 'working'); assert.equal(snapshot.gemini, 'working'); assert.equal(snapshot.claude, 'working');
    assert.equal(snapshot.stage, 'verifying'); assert.equal(snapshot.done, 1); assert.equal(snapshot.open, 3); assert.equal(snapshot.approvals, 1);
    assert.deepEqual(snapshot.activeIds, ['WP-1', 'G-1']);
    assert.equal(normalizeStatus(snapshot, Date.now()).live, true);
    state.tasks.a.lastDispatch.provider = 'openai';
    fs.writeFileSync(statePath, JSON.stringify(state)); snapshot = run();
    assert.equal(snapshot.codex, 'working');
    state.agents.codex.unavailableUntil = future; state.providerLimits.gemini = future;
    fs.writeFileSync(statePath, JSON.stringify(state)); snapshot = run();
    assert.equal(snapshot.codex, 'limit'); assert.equal(snapshot.gemini, 'limit');
    assert.match(snapshot.codexUntil, /^\d{2}:\d{2} UTC$/); assert.match(snapshot.geminiUntil, /^\d{2}:\d{2} UTC$/);
    state.agents.codex.unavailableUntil = 'bad'; state.providerLimits.gemini = '2000-01-01T00:00:00Z';
    state.tasks.a.lastDispatch.endedAt = now; state.tasks.b.lastDispatch.endedAt = now;
    fs.writeFileSync(statePath, JSON.stringify(state)); snapshot = run();
    assert.equal(snapshot.codex, 'idle'); assert.equal(snapshot.gemini, 'idle');
  } finally {
    // Only the unique directory this test created, beneath the allowed fixtures root.
    assert.ok(path.resolve(dir).startsWith(path.resolve(fixtures) + path.sep));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
