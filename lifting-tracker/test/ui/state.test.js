import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../../src/ui/state.js';
import { buildBackup } from '../../src/store/backup.js';

// The app state runs against the in-memory store here (no IndexedDB in Node), with the data catalogues
// read from disk through a stubbed fetch.
globalThis.fetch = async (path) => {
  const text = await readFile(new URL('../../' + path, import.meta.url), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(text) };
};

const ref = { blockNumber: 1, weekNumber: 1, dayNumber: 1 };
const planned = { entryIndex: 0, setIndex: 0 };
const log = (app, over = {}) => app.logSet({ date: '2026-10-01', programmeRef: ref, plannedRef: planned, exerciseId: 'low_bar_squat', weight: { value: 140, unit: 'kg' }, reps: 5, rpe: 7, ...over });

test('a double tap on Save logs one set, not two', async () => {
  const app = await createApp();
  await Promise.all([log(app), log(app)]);
  assert.equal(app.sets.length, 1);
  assert.equal(app.sessions.length, 1);
  assert.equal((await app.store.getAll('sets')).length, 1);
});

test('log, delete, re-log: one set each time, and an emptied session is removed', async () => {
  const app = await createApp();
  const a = await log(app);
  await app.deleteSet(a.id);
  assert.equal(app.sets.length, 0); assert.equal(app.sessions.length, 0);
  assert.equal((await app.store.getAll('sessions')).length, 0);
  await log(app, { reps: 3 });
  assert.equal(app.sets.length, 1); assert.equal(app.loggedFor({ ...ref, ...planned }).reps, 3);
});

test('re-logging a planned set on another date moves it and cleans the old session', async () => {
  const app = await createApp();
  await log(app); await log(app, { exerciseId: 'low_bar_squat', plannedRef: { entryIndex: 0, setIndex: 1 } });
  await log(app, { date: '2026-10-02' });
  assert.equal(app.sets.length, 2);
  assert.deepEqual(app.sessions.map((s) => s.date).sort(), ['2026-10-01', '2026-10-02']);
  const moved = app.loggedFor({ ...ref, ...planned });
  assert.equal(app.sessions.find((s) => s.id === moved.sessionId).date, '2026-10-02');
  // Move the second one too: the 2026-10-01 session is now empty and must go.
  await log(app, { date: '2026-10-02', plannedRef: { entryIndex: 0, setIndex: 1 } });
  assert.deepEqual(app.sessions.map((s) => s.date), ['2026-10-02']);
  assert.deepEqual(app.sets.map((s) => s.order).sort(), [0, 1]);
});

test('rejects impossible input and stores nothing', async () => {
  const app = await createApp();
  const bad = [{ weight: { value: Infinity, unit: 'kg' } }, { weight: { value: 1e9, unit: 'kg' } }, { weight: { value: 100, unit: 'st' } }, { reps: 2.5 }, { reps: -1 }, { rpe: 12 }, { date: '2026-02-30' }, { exerciseId: '' }];
  for (const b of bad) await assert.rejects(() => log(app, b), RangeError, JSON.stringify(b));
  assert.equal(app.sets.length, 0); assert.equal(app.sessions.length, 0);
  assert.equal((await app.store.getAll('sessions')).length, 0);
});

test('a storage failure leaves memory and storage consistent (no empty session)', async () => {
  const app = await createApp();
  const real = app.store.deleteAndPut.bind(app.store);
  app.store.deleteAndPut = async () => { throw new Error('quota'); };
  await assert.rejects(() => log(app), /quota/);
  assert.equal(app.sessions.length, 0); assert.equal(app.sets.length, 0);
  app.store.deleteAndPut = real;
  await log(app);
  assert.equal(app.sets.length, 1);
});

test('a restored session with its programmeRef keys in another order still matches', async () => {
  const app = await createApp();
  const backup = await buildBackup(app.store);
  backup.sessions = [{ id: 's1', date: '2026-10-01', programmeRef: { dayNumber: 1, weekNumber: 1, blockNumber: 1 }, note: '' }];
  backup.sets = [];
  const r = await app.importBackup(JSON.stringify(backup));
  assert.equal(r.ok, true);
  await log(app);
  assert.equal(app.sessions.length, 1, 'reused the restored session');
});

test('a corrupt but well-formed restore cannot break the app', async () => {
  const app = await createApp();
  const backup = await buildBackup(app.store);
  backup.settings = { blockStarts: { 1: 'bad' }, dayWeekdays: { 1: 1.5 }, unit: '<b>', programmeStart: '2026-02-30' };
  backup.programme = { blocks: [{}, { number: 3, weeks: [{ number: 1, days: [{ number: 1, entries: [{ sets: [{ repsMin: 'x' }] }] }] }] }] };
  const r = await app.importBackup(JSON.stringify(backup));
  assert.equal(r.ok, true);
  assert.equal(app.settings.unit, 'kg');
  assert.doesNotThrow(() => { app.events(); app.prs(); app.blockStarts(); app.bodyweightPoints(); app.programmeForEvents(); });
  assert.equal(app.programme.blocks.length, 1);
});

test('a malformed record in storage is skipped, not fatal', async () => {
  const app = await createApp();
  await log(app);
  app.sets.push({ id: 'bad', sessionId: app.sessions[0].id, exerciseId: 'x', weight: { value: 5, unit: 'stone' }, reps: 5, isWarmup: false, order: 0 });
  app.changed();
  assert.doesNotThrow(() => app.events());
  assert.equal(app.events().filter((e) => e.source === 'logged').length, 1);
});

test('a hostile unit or text in storage is neutralised on load', async () => {
  const app = await createApp();
  await app.store.put('meta', { key: 'settings', value: { unit: '"><script>', theme: 'x' } });
  await app.store.put('meta', { key: 'programme', value: { blocks: [{ number: 1, name: '<img onerror=1>', weeks: [{ number: '<b>', days: [] }] }] } });
  await app.reload();
  assert.equal(app.settings.unit, 'kg');
  assert.equal(app.settings.theme, 'system');
  assert.equal(app.programme.blocks.length, 1);
  assert.equal(app.programme.blocks[0].weeks.length, 0, 'a week without a numeric number is dropped');
  assert.equal(typeof app.programme.blocks[0].name, 'string');
});
