import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { startServer } from '../server.js';
import { fixtureCopy, fileHashes, changedFiles, request, waitForEvent } from './helpers.js';

async function boot(t) {
  const repo = fixtureCopy(t);
  const app = await startServer({ repo, port: 0, stateDir: 'state', pollMs: 100, gitEveryMs: 60000, env: {} });
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.port}`;
  const write = (p, body, extra = {}) => request(app.port, { method: 'POST', path: p, body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Cockpit-Token': app.token, ...extra } });
  return { repo, app, origin, write };
}

test('serves the page with a token and strict headers; reads change nothing', async (t) => {
  const { repo, app } = await boot(t);
  const before = fileHashes(repo);
  const page = await request(app.port);
  assert.equal(page.status, 200);
  assert.ok(page.text.includes(`content="${app.token}"`));
  assert.match(page.headers['content-security-policy'], /default-src 'none'/);
  assert.match(page.headers['content-security-policy'], /connect-src 'self'/);
  for (const p of ['/app.js', '/styles.css', '/favicon.svg']) assert.equal((await request(app.port, { path: p })).status, 200, p);
  const snap = await request(app.port, { path: '/api/snapshot' });
  assert.equal(snap.status, 200);
  assert.equal(snap.json.task.id, 'FIX-COCKPIT');
  for (const p of ['/server.js', '/../server.js', '/public/app.js', '/src/model.js', '/%2e%2e/server.js']) assert.equal((await request(app.port, { path: p })).status, 404, p);
  assert.equal((await request(app.port, { method: 'PUT', path: '/' })).status, 405);
  assert.equal(app.url.startsWith('http://127.0.0.1:'), true, 'loopback only');
  assert.deepEqual(changedFiles(before, fileHashes(repo)), []);
});

test('rejects foreign Host headers (DNS rebinding) and cross-site or tokenless writes', async (t) => {
  const { repo, app, write } = await boot(t);
  const before = fileHashes(repo);
  assert.equal((await request(app.port, { headers: { Host: 'evil.example:80' } })).status, 421);
  assert.equal((await request(app.port, { path: '/api/snapshot', headers: { Host: `attacker.test:${app.port}` } })).status, 421);
  const body = { key: 'ccx:A-0007', decision: 'approved' };
  assert.equal((await write('/api/approvals', body, { 'X-Cockpit-Token': '' })).status, 403);
  assert.equal((await write('/api/approvals', body, { 'X-Cockpit-Token': 'x'.repeat(48) })).status, 403);
  assert.equal((await write('/api/approvals', body, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await write('/api/approvals', body, { Origin: '' })).status, 403);
  assert.equal((await write('/api/approvals', body, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await write('/api/approvals', 'x'.repeat(20000))).status, 413);
  assert.equal((await write('/api/approvals', '{not json')).status, 400);
  assert.equal((await write('/api/approvals', { key: 'ccx:A-0001', decision: 'approved' })).status, 400, 'key not on the review list');
  assert.deepEqual(changedFiles(before, fileHashes(repo)), []);
});

test('approval and question writes touch only APPROVALS.md and QUEUE.md', async (t) => {
  const { repo, write } = await boot(t);
  const before = fileHashes(repo);
  const approval = await write('/api/approvals', { key: 'ccx:A-0007', decision: 'approved', item: 'push abc1234', note: 'ok from test' });
  assert.equal(approval.status, 201, approval.text);
  assert.equal(approval.json.id, 'AP-1');
  const question = await write('/api/questions', { to: 'Claude', title: 'From the test', body: 'hello' });
  assert.equal(question.status, 201, question.text);
  assert.equal(question.json.id, 'Q-5');
  assert.deepEqual(changedFiles(before, fileHashes(repo)), ['handoffs/APPROVALS.md', 'handoffs/QUEUE.md']);
  assert.match(readFileSync(path.join(repo, 'handoffs', 'APPROVALS.md'), 'utf8'), /### AP-1 \[approved\] ccx:A-0007/);
});

test('SSE pushes a new snapshot when TASK.md, COLLAB.md or QUEUE.md change on disk', async (t) => {
  const { repo, app } = await boot(t);
  const first = await waitForEvent(app.port, () => true);
  assert.equal(first.task.title, 'Synthetic cockpit fixture');

  let pending = waitForEvent(app.port, (v) => v.task?.title === 'Edited on disk');
  const taskFile = path.join(repo, 'TASK.md');
  writeFileSync(taskFile, readFileSync(taskFile, 'utf8').replace('Synthetic cockpit fixture', 'Edited on disk'));
  assert.equal((await pending).task.title, 'Edited on disk');

  pending = waitForEvent(app.port, (v) => v.loop.current?.agent === 'Codex');
  const collab = path.join(repo, 'handoffs', 'COLLAB.md');
  writeFileSync(collab, readFileSync(collab, 'utf8').replace('Claude [IMPLEMENT] (active)', 'Claude [IMPLEMENT] (done)').replace('Codex [REVIEW] (pending)', 'Codex [REVIEW] (active)'));
  assert.equal((await pending).loop.summary, 'Claude implemented → Codex reviewing');

  pending = waitForEvent(app.port, (v) => v.queue.entries.some((e) => e.id === 'Q-9'));
  appendFileSync(path.join(repo, 'handoffs', 'QUEUE.md'), '\n### Q-9 [open] Codex -> Claude: Added by hand\n');
  assert.ok((await pending).queue.entries[0].id === 'Q-9', 'newest first');
});
