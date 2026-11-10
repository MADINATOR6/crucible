import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { substitutes, resolveExercise, dayKey, entryKey, SIMILAR_MIN } from '../../src/core/swaps.js';

const catalogue = JSON.parse(await readFile(new URL('../../data/exercises.json', import.meta.url), 'utf8'));
const ids = (list) => list.map((x) => x.id);

test('substitutes put the same movement first and leave out unrelated exercises', () => {
  const forLegPress = substitutes(catalogue, 'leg_press');
  assert.deepEqual(ids(forLegPress.filter((x) => x.close)).sort(), ['bulgarian_split_squat', 'hack_squat']);
  assert.ok(forLegPress.findIndex((x) => x.id === 'hack_squat') < forLegPress.findIndex((x) => x.id === 'low_bar_squat'), 'same pattern outranks a similar lift');
  assert.ok(ids(forLegPress).includes('low_bar_squat'), 'a squat trains the same muscles');
  for (const unrelated of ['comp_bench', 'db_bicep_curl', 'lat_pulldown', 'leg_press']) assert.ok(!ids(forLegPress).includes(unrelated), unrelated);
  assert.ok(forLegPress.every((x) => x.close || x.score >= SIMILAR_MIN));
  // A competition lift offers its own family first.
  const forBench = substitutes(catalogue, 'comp_bench');
  assert.deepEqual(ids(forBench).slice(0, 3).sort(), ['long_pause_bench', 'paused_bench', 'tempo_bench']);
  assert.ok(ids(forBench).includes('incline_bench_press'));
  // Another lift family is never offered, however many muscles it shares.
  assert.ok(!ids(substitutes(catalogue, 'low_bar_squat')).some((id) => /deadlift/.test(id)));
  assert.deepEqual(ids(substitutes(catalogue, 'low_bar_squat')), ['high_bar_squat', 'tempo_high_bar_squat', 'bulgarian_split_squat', 'leg_press', 'hack_squat']);
  assert.ok(ids(substitutes(catalogue, 'romanian_deadlift')).includes('deadlift'), 'an accessory can still be replaced by a main lift');
});

test('substitutes are deterministic, never mutate the catalogue and tolerate bad input', () => {
  const before = JSON.stringify(catalogue);
  assert.deepEqual(substitutes(catalogue, 'lat_pulldown'), substitutes(catalogue, 'lat_pulldown'));
  assert.equal(JSON.stringify(catalogue), before);
  assert.deepEqual(ids(substitutes(catalogue, 'lat_pulldown')).slice(0, 1), ['neutral_grip_pulldown']);
  for (const bad of [null, undefined, {}, { exercises: null }]) assert.deepEqual(substitutes(bad, 'leg_press'), []);
  assert.deepEqual(substitutes(catalogue, 'custom:Sled push'), []);
  assert.deepEqual(substitutes({ exercises: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }, 'a'), [], 'no muscles, no match');
});

test('a session swap wins over a standing one, and going back to the plan switches the standing swap off', () => {
  const known = (id) => ['leg_press', 'hack_squat', 'high_bar_squat'].includes(id);
  const base = { plannedId: 'leg_press', known };
  assert.deepEqual(resolveExercise(base), { id: 'leg_press', swapped: false, scope: null });
  const always = { leg_press: 'hack_squat' };
  assert.deepEqual(resolveExercise({ ...base, always }), { id: 'hack_squat', swapped: true, scope: 'always' });
  assert.deepEqual(resolveExercise({ ...base, always, session: { from: 'leg_press', to: 'high_bar_squat', gen: '' } }), { id: 'high_bar_squat', swapped: true, scope: 'session' });
  assert.deepEqual(resolveExercise({ ...base, always, session: { from: 'leg_press', to: 'leg_press', gen: '' } }), { id: 'leg_press', swapped: false, scope: null });
});

test('stale swaps are ignored: another exercise sits there, the block was replaced, or the target is unknown', () => {
  const known = (id) => id !== 'gone';
  const session = { from: 'leg_press', to: 'hack_squat', gen: 'A' };
  const planned = (id) => ({ id, swapped: false, scope: null });
  assert.deepEqual(resolveExercise({ plannedId: 'leg_press', session, gen: 'A', known }).id, 'hack_squat');
  assert.deepEqual(resolveExercise({ plannedId: 'lat_pulldown', session, gen: 'A', known }), planned('lat_pulldown'));
  assert.deepEqual(resolveExercise({ plannedId: 'leg_press', session, gen: 'B', known }), planned('leg_press'));
  assert.deepEqual(resolveExercise({ plannedId: 'leg_press', session: { ...session, to: 'gone' }, gen: 'A', known }), planned('leg_press'));
  assert.deepEqual(resolveExercise({ plannedId: 'leg_press', always: { leg_press: 'gone' }, known }), planned('leg_press'));
  assert.deepEqual(resolveExercise({ plannedId: 'leg_press', always: { leg_press: 'leg_press' }, known }), planned('leg_press'));
  // Inherited keys are not swaps, and a missing planned id resolves to itself.
  assert.deepEqual(resolveExercise({ plannedId: 'constructor', always: {}, known }), planned('constructor'));
  assert.deepEqual(resolveExercise({ plannedId: null, always: { a: 'b' } }), planned(null));
});

test('keys name a day and an entry', () => {
  const ref = { blockNumber: 13, weekNumber: 2, dayNumber: 3, entryIndex: 4 };
  assert.equal(dayKey(ref), '13:2:3');
  assert.equal(entryKey(ref), '13:2:3:4');
});
