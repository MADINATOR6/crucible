import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

function offendingStyles(source) {
  return [...source.matchAll(/style="([^"]*)"/g)].filter((m) => {
    const tag = source.slice(source.lastIndexOf('<', m.index), m.index);
    const disc = /class="[^"\n]*\bdisc\b[^"\n]*"/.test(tag)
      && /^background:[^;]+;color:[^;]+;?$/.test(m[1]);
    const progress = /^<i\s/.test(tag)
      && /<div class="progress-track">\s*$/.test(source.slice(0, source.lastIndexOf('<', m.index)))
      && /^width:(?:\$\{[^}]+\}|[\d.]+)%;?$/.test(m[1]);
    return !disc && !progress;
  }).map((m) => m[0]);
}

test('views use shared classes except data-driven disc colours and progress widths', async () => {
  const views = new URL('../../src/ui/views/', import.meta.url);
  const offenders = [];
  for (const file of (await readdir(views)).filter((name) => name.endsWith('.js')).sort()) {
    for (const snippet of offendingStyles(await readFile(new URL(file, views), 'utf8'))) {
      offenders.push(`${file}: ${snippet}`);
    }
  }
  assert.deepEqual(offenders, [], `Inline styles outside the UI contract:\n${offenders.join('\n')}`);
});

test('the style guard rejects static styling and exceptions on the wrong elements', () => {
  for (const source of [
    '<p style="margin-top:12px">', '<div style="width:50%">',
    '<i style="width:50%">', '<span style="background:red;color:white">',
    '<span class="disc" style="background:red;color:white;padding:2px">',
    '<span style="top:20%">', '<figure style="--chart-h:100px">',
  ]) assert.equal(offendingStyles(source).length, 1, source);
  assert.deepEqual(offendingStyles('<span class="disc" style="background:${p.colour};color:${colour}">'), []);
  assert.deepEqual(offendingStyles('<div class="progress-track"><i style="width:${pct}%">'), []);
});

test('Plan folds settings and findings while retaining the planner controls', async () => {
  const { createApp } = await import('../../src/ui/state.js');
  const { planView } = await import('../../src/ui/views/plan.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (path) => ({ ok: true, json: async () => JSON.parse(await readFile(new URL('../../' + path, import.meta.url), 'utf8')) });
  try {
    const app = await createApp();
    await app.setProgramme({ ...app.programme, isExample: false });
    const ui = {};
    const loading = planView(app, ui);
    await new Promise((resolve, reject) => loading.bind({ set innerHTML(value) { reject(new Error(value)); } }, resolve));
    let html = planView(app, ui).html;
    assert.match(html, /<details class="options mt-3"><summary>Settings · all automatic/);
    assert.match(html, /<th>Confidence<\/th><th>Your e1RM \(kg\)<\/th>/);
    assert.doesNotMatch(html, /<th>From<\/th>/);
    for (const id of ['ask', 'ask-text', 'p-weeks', 'p-days', 'p-prog', 'p-rot', 'p-stance', 'p-deload', 'gen']) {
      assert.ok(html.includes(`id="${id}"`), id);
    }
    const finding = { id: 'test', severity: 'medium', title: '<Title>', because: ['<Evidence>'], suggestion: '<Suggestion>', confidence: 'high', action: { label: 'Apply' } };
    ui.plan._rev.review = { headline: 'Review', priorities: [finding, finding], strengths: [finding], notes: [finding] };
    Object.assign(ui.plan, { weeks: 4, days: 3, progression: 'conservative', rotate: 0, stance: 'sumo', deloadWeek: 'last' });
    html = planView(app, ui).html;
    assert.match(html, /Settings · 4 weeks, 3 days\/week, conservative, keep my exercises, sumo, deload: last/);
    const findings = [...html.matchAll(/<details class="coach-find[^>]+>/g)].map((m) => m[0]);
    assert.equal(findings.length, 4);
    assert.equal(findings.filter((tag) => /\bopen\b/.test(tag)).length, 1);
    assert.match(findings[0], /\bopen\b/);
    assert.match(html, /&lt;Title&gt;/);
    assert.match(html, /data-coach="test"/);
    assert.match(html, /More notes \(1\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
