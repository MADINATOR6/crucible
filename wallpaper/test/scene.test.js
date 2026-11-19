'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderScene, normalizeStatus, statusKey, escapeMarkup } = require('../scene.js');
const now = Date.parse('2026-10-07T12:00:00Z');
const live = overrides => ({ live: true, updated: new Date(now).toISOString(), codex: 'idle', gemini: 'idle', claude: 'idle', stage: '', activeIds: ['WP-1'], done: 18, open: 1, approvals: 0, ...overrides });
const render = state => renderScene(state, { now });

test('pure demo render includes names, retained panels, lifecycle and retry story', () => {
  const svg = renderScene({ live: false }, {});
  assert.equal(svg, renderScene({ live: false }, {}));
  for (const label of ['CLAUDE', 'CODEX', 'GEMINI', 'FALLBACK CHAIN', 'EXTERNAL TOOLS', 'ROUTE BY CLASS', 'PERMISSION GATE', 'ADD', 'ROUTE', 'DISPATCH', 'VERIFY', 'REVIEW', 'DONE', 'MIRROR', 'found a bug', 'fixed. tests green', 'approved. LGTM!']) assert.ok(svg.includes(label), label);
  assert.match(svg, /data-mode="demo"/);
  assert.match(svg, /dur="16s"/);
  assert.match(svg, /data-packet="retry"/);
});

for (const lane of ['claude', 'codex', 'gemini']) {
  test(`${lane}: working, idle and limit have distinct visuals`, () => {
    const outputs = ['working', 'idle', 'limit'].map(state => render(live({ [lane]: state })));
    assert.equal(new Set(outputs).size, 3);
    assert.match(outputs[0], new RegExp(`data-lane="${lane}" data-state="working" opacity="1" filter="url\\(#active-glow\\)"`));
    assert.match(outputs[0], /dur=".7s"/);
    assert.match(outputs[0], />\.\.\.<\/text>/);
    assert.match(outputs[2], new RegExp(`data-lane="${lane}" data-state="limit" opacity="0.38"`));
    assert.match(outputs[2], />z<\/text>/);
  });
}

test('hostile status rejects text, objects, invalid IDs and clamps finite numeric counts', () => {
  const hostile = live({ codex: '<script>alert(1)</script>', gemini: {}, claude: ['working'], stage: '" onload="evil',
    activeIds: ['<script>', '" onload="evil', 'claude/branch', 'C:\\private', {}, 'A'.repeat(25), 'ok_ID.2-3'],
    done: 1e200, open: -42, approvals: '99', codexUntil: '"/><script>', geminiUntil: '99:00 UTC' });
  const normalized = normalizeStatus(hostile, now);
  assert.equal(normalized.codex, 'idle');
  assert.equal(normalized.gemini, 'idle');
  assert.equal(normalized.claude, 'idle');
  assert.deepEqual(normalized.activeIds, ['ok_ID.2-3']);
  assert.equal(normalized.done, 999999);
  assert.equal(normalized.open, 0);
  assert.equal(normalized.approvals, 0);
  const svg = render(hostile);
  assert.doesNotMatch(svg, /<script|onload=|evil|private|claude\/branch/);
  assert.match(svg, /ok_ID.2-3/);
  assert.equal(escapeMarkup('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  for (const value of [NaN, Infinity, -Infinity, {}, [], null, true]) assert.equal(normalizeStatus(live({ done: value }), now).done, 0);
});

test('missing, disabled, stale, malformed and future snapshots use demo', () => {
  for (const state of [undefined, null, [], {}, live({ live: 'true' }), live({ live: false }),
    live({ updated: new Date(now - 60001).toISOString() }), live({ updated: 'bad' }),
    live({ updated: now }), live({ updated: new Date(now + 1).toISOString() })]) assert.match(render(state), /data-mode="demo"/);
  assert.equal(normalizeStatus(live({ updated: new Date(now - 60000).toISOString() }), now).live, true);
  assert.equal(normalizeStatus(live(), undefined).live, false);
});

test('stage maps active/unknown to DISPATCH, verifying to VERIFY, empty to cycling', () => {
  for (const [stage, expected] of [['active', 'DISPATCH'], ['verifying', 'VERIFY'], ['unknown', 'DISPATCH'], [null, 'DISPATCH'], [17, 'DISPATCH'], ['', '']]) {
    const state = live({ stage });
    assert.equal(normalizeStatus(state, now).stage, expected);
    const svg = render(state);
    if (expected) assert.match(svg, new RegExp(`data-step="${expected}" data-active="true"`));
    else assert.match(svg, /data-step="DISPATCH" data-active="demo"/);
  }
});

test('fallback provider and valid UTC limits reflect availability', () => {
  for (const [lanes, provider] of [[{}, 'codex'], [{ codex: 'limit' }, 'gemini'], [{ codex: 'limit', gemini: 'limit' }, 'ollama']]) {
    assert.match(render(live(lanes)), new RegExp(`data-provider="${provider}" data-active="true"`));
  }
  const svg = render(live({ codex: 'limit', gemini: 'limit', codexUntil: '13:45 UTC', geminiUntil: '23:59 UTC' }));
  assert.match(svg, /codex until 13:45 UTC/);
  assert.match(svg, /gemini until 23:59 UTC/);
  assert.doesNotMatch(svg, /found a bug/);
  assert.equal(normalizeStatus(live({ codex: 'limit', codexUntil: '24:00 UTC' }), now).codexUntil, '');
});

test('display key ignores timestamp refresh but changes on visible status or expiry', () => {
  const state = live();
  assert.equal(statusKey(state, now), statusKey(live({ updated: new Date(now - 5000).toISOString() }), now));
  assert.notEqual(statusKey(state, now), statusKey(live({ done: 19 }), now));
  assert.notEqual(statusKey(state, now), statusKey(state, now + 60001));
  assert.equal(statusKey(undefined, now), statusKey({ live: false, done: 999 }, now));
});

test('still scene has no animations, includes one approval bubble and stays deterministic', () => {
  const svg = renderScene({}, { now, still: true });
  assert.doesNotMatch(svg, /<animate/);
  assert.match(svg, /opacity="1"><rect x="1400" y="535"/);
  assert.equal(svg, renderScene({}, { now, still: true }));
});
