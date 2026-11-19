import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from '../src/collect.js';
import { startLive, ENTER, LEAVE } from '../src/live.js';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'repo');

function fakeTerminal(columns, rows) {
  const out = new EventEmitter();
  out.columns = columns;
  out.rows = rows;
  out.chunks = [];
  out.write = (s) => { out.chunks.push(s); return true; };
  out.last = () => out.chunks[out.chunks.length - 1];
  const stdin = new EventEmitter();
  stdin.raw = null;
  stdin.setRawMode = (on) => { stdin.raw = on; };
  stdin.resume = () => {};
  stdin.pause = () => {};
  return { out, stdin };
}

// Visible text of the last frame: strip our own SGR/cursor codes, split rows.
const frameRows = (frame) => frame.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split('\r\n');

function start(columns, rows, extra = {}) {
  const term = fakeTerminal(columns, rows);
  const exits = [];
  const view = startLive({ ...term, collectFn: collect, options: { repo: FIXTURE, stateDir: 'state', env: {} }, interval: 3600, color: false, onExit: (c) => exits.push(c), ...extra });
  return { ...term, view, exits };
}

test('live view: enters the alternate screen, renders, scrolls, jumps and restores the terminal on q', async () => {
  const { out, stdin, view, exits } = start(100, 30);
  await view.ready;
  assert.equal(out.chunks[0], ENTER);
  assert.equal(stdin.raw, true);
  let rows = frameRows(out.last());
  assert.equal(rows.length, 30);
  assert.match(rows[0], /crucible-monitor · repo · refresh #1/);
  assert.match(rows[1], /^\[1\] Agents & Models/);
  assert.match(rows[29], /lines 1-28 of \d+/);
  for (const row of rows) assert.ok(Array.from(row).length <= 100, `row fits: ${row}`);

  stdin.emit('data', Buffer.from('j'));
  assert.match(frameRows(out.last())[29], /lines 2-29/);
  stdin.emit('data', Buffer.from('8'));
  assert.match(frameRows(out.last()).join('\n'), /\[8\] Health/);
  stdin.emit('data', Buffer.from('\x1b[H'));
  assert.match(frameRows(out.last())[1], /^\[1\] Agents & Models/);
  stdin.emit('data', Buffer.from('G'));
  assert.match(frameRows(out.last())[29], /lines \d+-(\d+) of \1/);

  stdin.emit('data', Buffer.from('q'));
  assert.equal(out.last(), LEAVE);
  assert.equal(stdin.raw, false);
  assert.deepEqual(exits, [0]);
  assert.equal(stdin.listenerCount('data'), 0);
});

test('live view: Ctrl+C exits cleanly; a second stop is harmless', async () => {
  const { out, stdin, view, exits } = start(80, 24);
  await view.ready;
  stdin.emit('data', Buffer.from('\x03'));
  view.stop();
  assert.deepEqual(exits, [0]);
  assert.equal(out.chunks.filter((c) => c === LEAVE).length, 1);
});

test('live view: narrow terminals truncate rows and every panel stays reachable', async () => {
  const { out, stdin, view } = start(30, 12);
  await view.ready;
  const seen = new Set();
  for (const key of '12345678') {
    stdin.emit('data', Buffer.from(key));
    const rows = frameRows(out.last());
    assert.equal(rows.length, 12);
    for (const row of rows) assert.ok(Array.from(row).length <= 30, `row fits 30: ${row}`);
    seen.add(rows[1]);
  }
  assert.equal(seen.size, 8, 'each digit shows a different panel title at the top');
  out.columns = 15; out.rows = 4;
  out.emit('resize');
  assert.match(out.last(), /Too small/);
  out.columns = 60; out.rows = 20;
  out.emit('resize');
  assert.equal(frameRows(out.last()).length, 20);
  view.stop();
});

test('live view: a startup failure still restores the terminal', () => {
  const term = fakeTerminal(80, 24);
  term.stdin.setRawMode = () => { throw new Error('raw mode unavailable'); };
  assert.throws(() => startLive({ ...term, collectFn: collect, options: { repo: FIXTURE, stateDir: 'state', env: {} }, interval: 3600, color: false, onExit: () => {} }), /raw mode unavailable/);
  assert.equal(term.out.chunks[0], ENTER);
  assert.equal(term.out.last(), LEAVE);
  assert.equal(term.stdin.listenerCount('data'), 0);
});

test('live view: a failing refresh keeps previous panels and says so', async () => {
  let fail = false;
  const flaky = async (o) => { if (fail) throw new Error('boom \x1b[2J'); return collect(o); };
  const { out, stdin, view } = start(200, 30, { collectFn: flaky });
  await view.ready;
  fail = true;
  stdin.emit('data', Buffer.from('r'));
  await new Promise((r) => setTimeout(r, 50));
  const rows = frameRows(out.last());
  assert.match(rows[0], /REFRESH FAILED: boom \?\[2J \(showing previous data\)/);
  assert.match(rows[1], /^\[1\] Agents & Models/);
  view.stop();
});
