'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const scene = require('../scene.js');
const loader = fs.readFileSync(path.join(__dirname, '../status-loader.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function browser() {
  let now = Date.parse('2026-10-07T12:00:00Z'), interval, writes = 0, markup;
  const scripts = [], handlers = {}, timeouts = new Map();
  const media = { matches: false, addEventListener: (name, fn) => { handlers.motion = fn; } };
  const target = { set innerHTML(value) { writes++; markup = value; } };
  const window = { matchMedia: () => media, addEventListener: (name, fn) => { handlers[name] = fn; } };
  const context = { ...scene, URL, window, location: { hash: '' }, Date: { now: () => now },
    document: { currentScript: { src: 'file:///C:/demo%20folder/scene/status-loader.js' }, getElementById: () => target,
      createElement: () => ({ remove() { this.removed = true; } }), head: { appendChild: script => scripts.push(script) } },
    setInterval: (fn, delay) => { assert.equal(delay, 5000); interval = fn; },
    setTimeout: fn => { const id = {}; timeouts.set(id, fn); return id; }, clearTimeout: id => timeouts.delete(id)
  };
  vm.runInNewContext(loader, context);
  return { context, window, scripts, handlers, media, timeouts, poll: () => interval(),
    advance: ms => { now += ms; }, snapshot: overrides => ({ live: true, updated: new Date(now).toISOString(), stage: 'active', ...overrides }),
    get writes() { return writes; }, get markup() { return markup; } };
}

test('polls with script tags; updated-only snapshots do not rebuild; missing data returns to demo', async () => {
  const b = browser();
  assert.equal(b.writes, 1);
  assert.match(b.scripts[0].src, /^status\.js\?t=/);
  b.window.PALS_STATUS = b.snapshot(); b.scripts[0].onload(); await flush();
  assert.equal(b.writes, 2);
  b.advance(5000); const poll = b.poll();
  b.window.PALS_STATUS = b.snapshot(); b.scripts[1].onload(); await poll;
  assert.equal(b.writes, 2);
  const failed = b.poll(); b.scripts[2].onerror(); await flush();
  assert.match(b.scripts[3].src, /^file:\/\/\/C:\/demo%20folder\/scene\/status\.js\?t=/);
  b.scripts[3].onerror(); await failed;
  assert.match(b.markup, /data-mode="demo"/);
  assert.ok(b.scripts.every(s => s.removed));
  assert.equal(b.timeouts.size, 0);
});

test('absolute fallback, expiration, hash still and reduced motion', async () => {
  const b = browser();
  b.scripts[0].onerror(); await flush();
  b.window.PALS_STATUS = b.snapshot({ stage: 'verifying' }); b.scripts[1].onload(); await flush();
  assert.match(b.markup, /data-step="VERIFY" data-active="true"/);
  b.media.matches = true; b.handlers.motion(); assert.doesNotMatch(b.markup, /<animate/);
  b.media.matches = false; b.handlers.motion(); assert.match(b.markup, /<animate/);
  b.context.location.hash = '#still'; b.handlers.hashchange(); assert.doesNotMatch(b.markup, /<animate/);
  b.advance(60001); const poll = b.poll();
  assert.match(b.markup, /data-mode="demo"/);
  b.scripts[2].onload(); await poll;
});

test('timeouts remove scripts and overlapping polls do not launch more requests', async () => {
  const b = browser();
  await b.poll(); assert.equal(b.scripts.length, 1);
  [...b.timeouts.values()][0](); await flush(); assert.equal(b.scripts.length, 2);
  [...b.timeouts.values()][0](); await flush();
  assert.ok(b.scripts.every(s => s.removed));
  assert.equal(b.timeouts.size, 0);
  assert.match(b.markup, /data-mode="demo"/);
});
