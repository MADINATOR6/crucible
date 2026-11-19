import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../../src/ui/state.js';
import { trainView } from '../../src/ui/views/train.js';
import { sanitizeSettings, MAX_SWAPS } from '../../src/store/programme-schema.js';
import { buildBackup } from '../../src/store/backup.js';
import { fromProgrammeSets } from '../../src/core/sets.js';
import { progressView } from '../../src/ui/views/progress.js';

// Session swaps end to end against the in-memory store: exercise substitutions, skipped days and the next session.
globalThis.fetch = async (path) => {
  const text = await readFile(new URL('../../' + path, import.meta.url), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(text) };
};

const set = (kg, reps = 8) => ({ load: { value: kg, unit: 'kg' }, repsMin: reps, repsMax: reps, targetRpe: 8 });
const days = () => [
  { number: 1, entries: [
    { exerciseId: 'low_bar_squat', name: 'Low Bar Squat', sets: [set(140, 5), set(140, 5)] },
    { exerciseId: 'leg_press', name: 'Leg Press', sets: [set(200), set(200)] },
    { exerciseId: null, name: 'Sled Push', sets: [set(60)] },
  ] },
  { number: 2, entries: [{ exerciseId: 'comp_bench', name: 'Competition Bench Press', sets: [set(100, 4)] }] },
  { number: 3, entries: [{ exerciseId: 'leg_press', name: 'Leg Press', sets: [set(200)] }] },
];
const generated = (at) => ({ at, rev: 0, focus: 'volume', weeks: 1, daysPerWeek: 3 });
async function swapApp({ block = {} } = {}) {
  const app = await createApp();
  await app.setProgramme({ blocks: [{ number: 1, name: 'Synthetic', weeks: [{ number: 1, days: days() }, { number: 2, days: days() }], ...block }] });
  return app;
}
const day1 = { blockNumber: 1, weekNumber: 1, dayNumber: 1 };
const legPress = { ...day1, entryIndex: 1 };
const entryAt = (app, ref) => app.programme.blocks[0].weeks.find((w) => w.number === ref.weekNumber).days.find((d) => d.number === ref.dayNumber).entries[ref.entryIndex];
const exFor = (app, ref) => app.exerciseFor(ref, entryAt(app, ref));
const logPlanned = (app, ref, setIndex, exerciseId, over = {}) => app.logSet({ date: '2026-11-10', programmeRef: { blockNumber: ref.blockNumber, weekNumber: ref.weekNumber, dayNumber: ref.dayNumber },
  plannedRef: { entryIndex: ref.entryIndex, setIndex }, exerciseId, weight: { value: 100, unit: 'kg' }, reps: 8, rpe: 8, ...over });

test('a session swap applies to that planned session only, survives a reload and can be undone', async () => {
  const app = await swapApp();
  assert.deepEqual(exFor(app, legPress), { plannedId: 'leg_press', id: 'leg_press', swapped: false, scope: null });
  const { undo } = await app.swapExercise(legPress, 'hack_squat');
  assert.deepEqual(exFor(app, legPress), { plannedId: 'leg_press', id: 'hack_squat', swapped: true, scope: 'session' });
  assert.equal(exFor(app, { ...day1, dayNumber: 3, entryIndex: 0 }).swapped, false, 'the same exercise on another day is untouched');
  assert.equal(exFor(app, { ...legPress, weekNumber: 2 }).swapped, false, 'and so is next week');
  await app.reload();
  assert.equal(exFor(app, legPress).id, 'hack_squat', 'kept in storage');
  await undo();
  assert.equal(exFor(app, legPress).swapped, false);
  assert.deepEqual(app.settings.sessionSwaps, {});
});

test('a standing swap applies every time, a session can opt out, and both can be removed', async () => {
  const app = await swapApp();
  await app.swapExercise(legPress, 'hack_squat', { always: true });
  assert.deepEqual(app.settings.exerciseSwaps, { leg_press: 'hack_squat' });
  for (const ref of [legPress, { ...legPress, weekNumber: 2 }, { ...day1, dayNumber: 3, entryIndex: 0 }]) assert.deepEqual([exFor(app, ref).id, exFor(app, ref).scope], ['hack_squat', 'always']);
  // Back to the plan for one session only.
  await app.swapExercise(legPress, 'leg_press');
  assert.equal(exFor(app, legPress).swapped, false);
  assert.equal(exFor(app, { ...legPress, weekNumber: 2 }).id, 'hack_squat');
  // Back to the plan for good clears the session record too.
  await app.swapExercise(legPress, 'leg_press', { always: true });
  assert.deepEqual([app.settings.exerciseSwaps, app.settings.sessionSwaps], [{}, {}]);
  assert.equal(exFor(app, { ...legPress, weekNumber: 2 }).swapped, false);
});

test('swaps are validated: unknown targets, missing entries and standing swaps of uncatalogued exercises are refused', async () => {
  const app = await swapApp();
  await assert.rejects(app.swapExercise(legPress, 'not_an_exercise'), /from the list/);
  await assert.rejects(app.swapExercise({ ...legPress, entryIndex: 9 }, 'hack_squat'), /no longer in the programme/);
  const sled = { ...day1, entryIndex: 2 };
  await assert.rejects(app.swapExercise(sled, 'leg_press', { always: true }), /Only catalogue exercises/);
  await app.swapExercise(sled, 'leg_press');
  assert.deepEqual(exFor(app, sled), { plannedId: 'custom:Sled Push', id: 'leg_press', swapped: true, scope: 'session' });
  assert.deepEqual(app.settings.exerciseSwaps, {});
});

test('a set logged with a substitute counts for the substitute, not the planned exercise', async () => {
  const app = await swapApp();
  await app.swapExercise(legPress, 'hack_squat');
  // One tap "done as planned" would log the planned weight under the wrong exercise: it is refused.
  await assert.rejects(app.logAsPlanned({ programmeRef: day1, plannedRef: { entryIndex: 1, setIndex: 0 } }), /swapped/);
  const saved = await logPlanned(app, legPress, 0, 'hack_squat', { weight: { value: 120, unit: 'kg' }, rpe: 9 });
  assert.equal(saved.exerciseId, 'hack_squat');
  assert.deepEqual(saved.plannedRef, { entryIndex: 1, setIndex: 0 });
  assert.ok(app.loggedFor({ ...legPress, setIndex: 0 }), 'the planned set is ticked off');
  const events = app.events().filter((e) => e.source === 'logged');
  assert.deepEqual(events.map((e) => [e.exerciseId, e.weightKg, e.reps]), [['hack_squat', 120, 8]]);
  assert.ok(!app.events().some((e) => e.exerciseId === 'leg_press'), 'nothing is credited to the planned exercise');
  // The merged programme (coach review, re-loading) sees the set as done but carries no numbers for the planned lift.
  const merged = app.programmeMerged().blocks[0].weeks[0].days[0].entries[1].sets[0];
  assert.deepEqual([merged.completed, merged.swappedTo, merged.actualLoad, merged.actualReps, merged.actualRpe], [true, 'hack_squat', null, null, null]);
  assert.deepEqual(merged.swapped, { reps: 8, load: { value: 120, unit: 'kg' }, rpe: 9 });
  assert.equal(app.programme.blocks[0].weeks[0].days[0].entries[1].sets[0].completed, false, 'the stored programme is not changed');
  assert.ok(!JSON.stringify(await app.store.get('meta', 'programme')).includes('swapped'), 'and the marks are never stored');
  // A normal set still overlays its numbers.
  await logPlanned(app, { ...day1, entryIndex: 0 }, 0, 'low_bar_squat', { weight: { value: 142.5, unit: 'kg' }, reps: 5, rpe: 7.5 });
  const squat = app.programmeMerged().blocks[0].weeks[0].days[0].entries[0].sets[0];
  assert.deepEqual([squat.completed, squat.swappedTo, squat.actualLoad, squat.actualReps, squat.actualRpe], [true, undefined, { value: 142.5, unit: 'kg' }, 5, 7.5]);
});

test('editing a logged set can change its exercise; changing the swap later leaves logged sets alone', async () => {
  const app = await swapApp();
  const first = await logPlanned(app, legPress, 0, 'leg_press');
  await app.swapExercise(legPress, 'hack_squat');
  assert.equal(app.loggedFor({ ...legPress, setIndex: 0 }).exerciseId, 'leg_press', 'already logged: unchanged by the swap');
  const edited = await logPlanned(app, legPress, 0, 'hack_squat');
  assert.equal(edited.id, first.id);
  assert.equal(edited.exerciseId, 'hack_squat');
  assert.equal(app.sets.length, 1);
  assert.deepEqual((await app.store.getAll('sets')).map((s) => s.exerciseId), ['hack_squat']);
});

test('skipping a day moves the next session on; un-skipping brings it back', async () => {
  const app = await swapApp();
  assert.deepEqual(app.nextSession(), day1);
  assert.equal(app.skippedDay(day1), null);
  await app.skipDay(day1, '2026-11-10');
  assert.deepEqual(app.skippedDay(day1), { on: '2026-11-10', gen: '' });
  assert.deepEqual(app.nextSession(), { ...day1, dayNumber: 2 });
  await app.reload();
  assert.deepEqual(app.nextSession(), { ...day1, dayNumber: 2 }, 'kept in storage');
  await app.unskipDay(day1);
  assert.deepEqual(app.nextSession(), day1);
  assert.deepEqual(app.settings.skippedDays, {});
  await assert.rejects(app.skipDay({ ...day1, dayNumber: 9 }), /no longer in the programme/);
  await assert.rejects(app.skipDay(day1, '2026-02-30'), /valid date/);
});

test('training days out of order postpones a day instead of dropping it', async () => {
  const app = await swapApp();
  const day3 = { ...day1, dayNumber: 3, entryIndex: 0 };
  await logPlanned(app, day3, 0, 'leg_press');
  assert.deepEqual(app.nextSession(), day1, 'day 1 is still owed after training day 3 first');
  await app.skipDay(day1);
  assert.deepEqual(app.nextSession(), { ...day1, dayNumber: 2 });
  await app.skipDay({ ...day1, dayNumber: 2 });
  assert.deepEqual(app.nextSession(), { ...day1, weekNumber: 2 }, 'the week is closed: on to week 2');
});

test('swaps and skips never follow a replaced block or cross between example data and your own programme', async () => {
  const app = await swapApp({ block: { generated: generated('2026-11-01T00:00:00.000Z') } });
  await app.swapExercise(legPress, 'hack_squat');
  await app.skipDay({ ...day1, dayNumber: 2 }, '2026-11-10');
  assert.equal(exFor(app, legPress).id, 'hack_squat');
  // The same block number, generated again: a different block.
  await app.setProgramme({ blocks: [{ number: 1, name: 'Again', weeks: [{ number: 1, days: days() }], generated: generated('2026-11-09T00:00:00.000Z') }] });
  assert.equal(exFor(app, legPress).swapped, false);
  assert.equal(app.skippedDay({ ...day1, dayNumber: 2 }), null);
  assert.deepEqual(app.nextSession(), day1);
  // Writing a new swap prunes the dead records.
  await app.swapExercise(legPress, 'bulgarian_split_squat');
  assert.deepEqual(Object.values(app.settings.sessionSwaps).map((v) => v.to), ['bulgarian_split_squat']);
  await app.skipDay(day1, '2026-11-10');
  assert.deepEqual(Object.keys(app.settings.skippedDays), ['1:1:1']);

  // Example data has its own identity, so playing with it cannot mark days in a workbook imported afterwards.
  const fresh = await createApp();
  assert.equal(fresh.usingExample, true);
  const exampleDay = fresh.nextSession();
  await fresh.skipDay(exampleDay, '2026-11-10');
  assert.equal(fresh.skippedDay(exampleDay).gen, 'example');
  await fresh.setProgramme({ blocks: [{ number: exampleDay.blockNumber, name: 'Own', weeks: [1, 2, 3, 4].map((number) => ({ number, days: days() })) }] });
  assert.equal(fresh.skippedDay(exampleDay), null);
});

test('swap and skip settings are sanitised and travel in a backup', async () => {
  const dirty = sanitizeSettings({
    exerciseSwaps: { leg_press: 'hack_squat', same: 'same', 'Bad Key': 'hack_squat', leg_extension: 7, __proto__: 'x' },
    sessionSwaps: { '1:1:1:1': { from: 'leg_press', to: 'hack_squat', gen: 5 }, '1:1:1:2': { from: 'custom:Sled Push', to: 'custom:Sled Push' },
      '1:1:1:3': { from: 'leg_press', to: '<img>' }, 'x:1:1:1': { from: 'a', to: 'b' }, '1:1:1': { from: 'a', to: 'b' }, '1:1:1:4': null },
    skippedDays: { '1:1:2': { on: '2026-11-10', gen: 'g' }, '1:1:3': { on: '2026-02-30' }, '1:1': { on: '2026-11-10' }, '1:1:4': 'yes' },
  });
  assert.deepEqual(dirty.exerciseSwaps, { leg_press: 'hack_squat' });
  assert.deepEqual(dirty.sessionSwaps, { '1:1:1:1': { from: 'leg_press', to: 'hack_squat', gen: '' }, '1:1:1:2': { from: 'custom:Sled Push', to: 'custom:Sled Push', gen: '' } });
  assert.deepEqual(dirty.skippedDays, { '1:1:2': { on: '2026-11-10', gen: 'g' } });
  assert.deepEqual([{}, {}, {}], [sanitizeSettings(null).exerciseSwaps, sanitizeSettings({ sessionSwaps: [] }).sessionSwaps, sanitizeSettings({ skippedDays: 'x' }).skippedDays]);
  const many = Object.fromEntries(Array.from({ length: MAX_SWAPS + 50 }, (_, i) => [`1:${i % 200}:1:${Math.floor(i / 200)}`, { from: 'leg_press', to: 'hack_squat', gen: '' }]));
  assert.equal(Object.keys(sanitizeSettings({ sessionSwaps: many }).sessionSwaps).length, MAX_SWAPS);

  const app = await swapApp();
  await app.swapExercise(legPress, 'hack_squat', { always: true });
  await app.swapExercise({ ...day1, dayNumber: 2, entryIndex: 0 }, 'paused_bench');
  await app.skipDay({ ...day1, dayNumber: 3 }, '2026-11-10');
  const backup = JSON.stringify(await buildBackup(app.store));
  const other = await createApp();
  const result = await other.importBackup(backup);
  assert.equal(result.ok, true);
  assert.deepEqual(other.settings.exerciseSwaps, { leg_press: 'hack_squat' });
  assert.equal(exFor(other, { ...day1, dayNumber: 2, entryIndex: 0 }).id, 'paused_bench');
  assert.deepEqual(other.skippedDay({ ...day1, dayNumber: 3 }), { on: '2026-11-10', gen: '' });
});

test('Progress "By block" credits a swapped set to the substitute, not the planned lift at the planned weight', async () => {
  const app = await swapApp();
  const squat = { ...day1, entryIndex: 0 };
  const bestSquat = () => {
    const best = { value: null };
    for (const e of fromProgrammeSets({ blocks: [app.programmeMerged().blocks[0]] }, () => '2026-11-09')) if (e.exerciseId === 'low_bar_squat') best.value = Math.max(best.value ?? 0, e.weightKg);
    return best.value;
  };
  // The planned 140 kg squat was done as a 60 kg high bar squat instead.
  await app.swapExercise(squat, 'high_bar_squat');
  await logPlanned(app, squat, 0, 'high_bar_squat', { weight: { value: 60, unit: 'kg' }, reps: 5, rpe: 6 });
  const merged = fromProgrammeSets(app.programmeMerged(), () => '2026-11-09').map((e) => [e.exerciseId, e.weightKg, e.reps, e.rpe]);
  assert.deepEqual(merged, [['high_bar_squat', 60, 5, 6]]);
  assert.equal(bestSquat(), null, 'no 140 kg squat was lifted');
  const row = progressView(app, { progress: { source: 'all' } }).html.match(/<td><b>1<\/b>[^<]*<\/td><td>\d+<\/td><td>(\d+)<\/td>/);
  assert.equal(row?.[1], '1', 'By block counts the one set that was done');
  // A real squat logged afterwards is credited as itself.
  await app.swapExercise(squat, 'low_bar_squat');
  await logPlanned(app, squat, 1, 'low_bar_squat', { weight: { value: 135, unit: 'kg' }, reps: 5, rpe: 8 });
  assert.equal(bestSquat(), 135);
});

// ---- Train view ----
const view = (app, ref = day1) => trainView(app, { train: { block: ref.blockNumber, week: ref.weekNumber, day: ref.dayNumber } }).html;

test('Train shows a swapped exercise without the planned weight and logs it through the form', async () => {
  const app = await swapApp();
  // Finish the squats so the leg press is the current set.
  for (const setIndex of [0, 1]) await logPlanned(app, { ...day1, entryIndex: 0 }, setIndex, 'low_bar_squat', { reps: 5 });
  let html = view(app);
  assert.match(html, /Leg Press · Set 1/);
  assert.match(html, /200 kg × 8 reps/);
  assert.match(html, /data-swap="1"[^>]*>Swap exercise/);
  assert.match(html, /id="skip-day">Skip the rest/);
  await logPlanned(app, { ...day1, dayNumber: 2, entryIndex: 0 }, 0, 'hack_squat', { weight: { value: 110, unit: 'kg' }, date: '2026-11-03' });
  await app.swapExercise(legPress, 'hack_squat');
  html = view(app);
  assert.match(html, /Hack Squat · Set 1/);
  assert.match(html, /<p class="train-focus-prescription">8 reps<small>RPE 8<\/small><\/p>/, 'no planned weight for the substitute');
  assert.match(html, /Instead of Leg Press\./);
  assert.match(html, /Last logged: 110 kg × 8/);
  assert.match(html, /Hack Squat <span class="pill accent">for Leg Press<\/span>/);
  assert.match(html, /aria-label="Log set 1 of Hack Squat"/);
  assert.doesNotMatch(html, /Mark set 1 of Hack Squat done as planned/);
  assert.match(html, /Log set · Hack Squat/);
  // Once logged, the row names the substitute and the next set stays on it.
  await logPlanned(app, legPress, 0, 'hack_squat', { weight: { value: 115, unit: 'kg' } });
  html = view(app);
  assert.match(html, /8 × 115 kg <small>@8<\/small><small>Hack Squat<\/small>/);
  assert.match(html, /Hack Squat · Set 2/);
  // Going back to the plan restores the prescription; the logged set keeps its exercise.
  await app.swapExercise(legPress, 'leg_press');
  html = view(app);
  assert.match(html, /Leg Press · Set 2/);
  assert.match(html, /200 kg × 8 reps/);
  assert.match(html, /<small>Hack Squat<\/small>/);
});

test('a standing swap does not rename work that is already finished', async () => {
  const app = await swapApp();
  for (const setIndex of [0, 1]) await logPlanned(app, legPress, setIndex, 'leg_press');
  await app.swapExercise({ ...legPress, weekNumber: 2 }, 'hack_squat', { always: true });
  const done = view(app);
  assert.match(done, /<h3>Leg Press<\/h3>/);
  assert.doesNotMatch(done, /class="pill accent">for Leg Press/);
  assert.doesNotMatch(done, /data-swap="1"/, 'nothing left to swap');
  assert.match(view(app, { ...day1, weekNumber: 2 }), /Hack Squat <span class="pill accent">for Leg Press<\/span>/);
});

test('Train marks a skipped day, offers to un-skip it, and labels the skip button by progress', async () => {
  const app = await swapApp();
  assert.match(view(app), /id="skip-day">Skip session/);
  await app.skipDay(day1, '2026-11-10');
  const html = view(app);
  assert.match(html, /Skipped session/);
  assert.match(html, /Skipped on [^<]*10[^<]* · 5 sets not done\. The next session has moved on\./);
  assert.match(html, /id="unskip-day"/);
  assert.doesNotMatch(html, /id="skip-day"/);
  assert.match(html, /data-focus-log="0:0"/, 'a skipped day can still be logged');
  assert.doesNotMatch(view(app, { ...day1, dayNumber: 2 }), /Skipped/);
});

test('a finished session offers the next one', async () => {
  const app = await swapApp();
  await logPlanned(app, { ...day1, dayNumber: 2, entryIndex: 0 }, 0, 'comp_bench', { reps: 4 });
  const html = view(app, { ...day1, dayNumber: 2 });
  assert.match(html, /Session complete/);
  // Day 1 was never started, so it is owed before day 3.
  assert.match(html, /id="go-next-session">Next session · Week 1 Day 1/);
});
