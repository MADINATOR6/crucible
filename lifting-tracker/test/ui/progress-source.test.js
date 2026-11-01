import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../../src/ui/state.js';
import { progressView } from '../../src/ui/views/progress.js';

globalThis.fetch = async (path) => ({ ok: true, json: async () => JSON.parse(await readFile(new URL('../../' + path, import.meta.url), 'utf8')) });

test('actual-only charts exclude imported history and source buttons change the selected chart data', async () => {
  const app = await createApp(), ui = { progress: { source: 'logged' } };
  let view = progressView(app, ui);
  assert.match(view.html, /No squat sets yet/);
  const controls = [{ dataset: { source: 'all' }, addEventListener(_, fn) { this.click = fn; } }];
  let rendered = 0;
  view.bind({ querySelector: () => null, querySelectorAll: (s) => s === '[data-source]' ? controls : [] }, () => rendered++);
  controls[0].click(); assert.equal(ui.progress.source, 'all'); assert.equal(rendered, 1);
  assert.doesNotMatch(progressView(app, ui).html, /No squat sets yet/);
  await app.logSet({ date: '2026-10-30', exerciseId: 'low_bar_squat', weight: { value: 150, unit: 'kg' }, reps: 3, rpe: 8, isWarmup: false });
  ui.progress.source = 'logged'; view = progressView(app, ui);
  assert.doesNotMatch(view.html, /No squat sets yet/);
  assert.match(view.html, /No bench sets yet/);
  assert.match(view.html, /Coach notes, records and workbook comparisons below use the full history/);
});
