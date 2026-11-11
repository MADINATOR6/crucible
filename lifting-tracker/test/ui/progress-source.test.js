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

test('By block counts a set logged against the programme', async () => {
  const app = await createApp(), ui = { progress: { source: 'all' } };
  const blockSets = (n) => Number(progressView(app, ui).html.match(new RegExp(`<td><b>${n}</b>[^<]*</td><td>\\d+</td><td>(\\d+)</td>`))?.[1]);
  const block = app.programme.blocks[0];
  let ref = null;
  for (const w of block.weeks) for (const d of w.days) d.entries.forEach((e, ei) => e.sets.forEach((s, si) => { if (!ref && !s.completed && e.exerciseId) ref = { w, d, e, ei, si }; }));
  assert.ok(ref, 'the example programme has an unlogged set');
  const before = blockSets(block.number);
  await app.logSet({ date: '2026-10-06', programmeRef: { blockNumber: block.number, weekNumber: ref.w.number, dayNumber: ref.d.number }, plannedRef: { entryIndex: ref.ei, setIndex: ref.si }, exerciseId: ref.e.exerciseId, weight: { value: 100, unit: 'kg' }, reps: 3, rpe: 8 });
  assert.equal(blockSets(block.number), before + 1);
});

test('a logged set without an RPE does not keep the replaced set\'s RPE, and a missing programme does not crash Progress', async () => {
  const app = await createApp();
  let ref = null;
  for (const b of app.programme.blocks) for (const w of b.weeks) for (const d of w.days) d.entries.forEach((e, ei) => e.sets.forEach((s, si) => { if (!ref && e.exerciseId) ref = { b, w, d, e, ei, si, s }; }));
  ref.s.actualRpe = 8; ref.s.completed = true;
  await app.logSet({ date: '2026-10-06', programmeRef: { blockNumber: ref.b.number, weekNumber: ref.w.number, dayNumber: ref.d.number }, plannedRef: { entryIndex: ref.ei, setIndex: ref.si }, exerciseId: ref.e.exerciseId, weight: { value: 100, unit: 'kg' }, reps: 3, rpe: null });
  const m = app.programmeMerged().blocks.find((b) => b.number === ref.b.number).weeks.find((w) => w.number === ref.w.number).days.find((d) => d.number === ref.d.number).entries[ref.ei].sets[ref.si];
  assert.equal(m.actualRpe, null);
  app.programme = null; app.changed?.();
  assert.equal(app.programmeMerged(), null);
});
