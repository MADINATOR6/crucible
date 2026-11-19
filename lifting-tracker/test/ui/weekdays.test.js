import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../../src/ui/state.js';
import { dataView } from '../../src/ui/views/data.js';

globalThis.fetch = async (path) => ({ ok: true, json: async () => JSON.parse(await readFile(new URL('../../' + path, import.meta.url), 'utf8')) });

const control = (dataset) => ({ dataset, value: '', addEventListener(type, fn) { (this.handlers ||= {})[type] = fn; } });

test('Data lists one weekday choice per training day, and changing one re-dates that day only', async () => {
  const app = await createApp();
  await app.saveSettings({ programmeStart: '2026-10-05' }); // a Monday
  const ref = { blockNumber: app.programme.blocks[0].number, weekNumber: app.programme.blocks[0].weeks[0].number };
  const days = Math.max(...app.programme.blocks.flatMap((b) => b.weeks.map((w) => w.days.length)));
  const html = dataView(app, {}).html;
  assert.equal((html.match(/data-day-weekday="/g) || []).length, days, 'one choice per training day');
  assert.match(html, /<option value="4" selected>Thursday<\/option>/, 'day 3 shows its current weekday (Thursday by default)');

  const before = [1, 2, 3].map((dayNumber) => app.dateFor({ ...ref, dayNumber }));
  const plus = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
  assert.deepEqual([before[1], before[2]], [plus(before[0], 1), plus(before[0], 3)], 'default Monday, Tuesday, Thursday');

  const view = dataView(app, {});
  const selects = Array.from({ length: days }, (_, i) => control({ dayWeekday: String(i + 1) }));
  const noop = control({});
  view.bind({ querySelector: () => noop, querySelectorAll: (s) => s === '[data-day-weekday]' ? selects : [] }, () => {});
  selects[2].value = '6'; // day 3 -> Saturday
  selects[2].handlers.change();
  await new Promise((resolve) => setImmediate(resolve));
  await app.saveSettings({}); // wait for the queued save
  const after = [1, 2, 3].map((dayNumber) => app.dateFor({ ...ref, dayNumber }));
  assert.deepEqual(after, [before[0], before[1], plus(before[0], 5)], 'only day 3 moved, to Saturday');
  assert.match(dataView(app, {}).html, /<option value="6" selected>Saturday<\/option>/);
});

test('Data offers a choice for each actual training-day number, however sparse or many', async () => {
  const app = await createApp();
  const day = (number) => ({ ...structuredClone(app.programme.blocks[0].weeks[0].days[0]), number });
  app.programme.blocks[0].weeks = [{ ...app.programme.blocks[0].weeks[0], days: [day(1), day(3), day(8)] }];
  app.changed?.();
  const html = dataView(app, {}).html;
  assert.deepEqual([...html.matchAll(/data-day-weekday="(\d+)"/g)].map((m) => Number(m[1])), [1, 3, 8]);
});

test('a weekday outside Monday to Sunday is ignored', async () => {
  const app = await createApp();
  const view = dataView(app, {});
  const selects = [control({ dayWeekday: '1' })];
  const noop = control({});
  view.bind({ querySelector: () => noop, querySelectorAll: (s) => s === '[data-day-weekday]' ? selects : [] }, () => {});
  selects[0].value = '9';
  selects[0].handlers.change();
  await app.saveSettings({});
  assert.equal(app.settings.dayWeekdays[1], 1);
});
