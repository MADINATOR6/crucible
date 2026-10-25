import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryLoad } from '../../src/core/muscles.js';

const catalogue = {
  muscles: ['chest', 'triceps'],
  weights: { primary: 1, secondary: 0.5 },
  exercises: [{ id: 'press', primary: ['chest'], secondary: ['triceps'] },
    { id: 'dip', primary: ['chest'] }],
};
const set = (date, exerciseId = 'press', extra = {}) =>
  ({ date, exerciseId, reps: 5, weightKg: 80, isWarmup: false, ...extra });

test('recovery load decays each of the last seven calendar days and ignores work outside them', () => {
  const events = [set('2026-10-25'), set('2026-10-24'), set('2026-10-22'), set('2026-10-19'),
    set('2026-10-18'), set('2026-10-26'), set('2026-10-25', 'press', { isWarmup: true })];
  const result = recoveryLoad(events, catalogue, '2026-10-25');
  const expected = [0, 1, 3, 6].reduce((sum, day) => sum + Math.exp(-0.25 * day), 0);
  assert.deepEqual([result.asOf, result.days, result.factor, result.unknownExerciseIds], ['2026-10-25', 7, 0.25, []]);
  assert.ok(Math.abs(result.muscles.chest.sets - expected) < 1e-12);
  assert.ok(Math.abs(result.muscles.triceps.sets - expected * 0.5) < 1e-12);
  assert.deepEqual(result.muscles.chest.contributors.map(({ exerciseId, sets }) => [exerciseId, sets]), [['press', 4]]);
  assert.ok(Math.abs(result.muscles.chest.contributors[0].contribution - expected) < 1e-12);
});

test('recovery contributors keep raw counts, weighted sums and ordering; unknown exercises are reported', () => {
  const result = recoveryLoad([set('2026-10-25', 'dip'), set('2026-10-24'),
    set('2026-10-25', 'unknown_z'), set('2026-10-25', 'unknown_a'),
    set('2026-10-25', 'unknown_z')], catalogue, '2026-10-25');
  assert.deepEqual(result.muscles.chest.contributors.map(({ exerciseId, sets }) => [exerciseId, sets]),
    [['dip', 1], ['press', 1]]);
  assert.equal(result.muscles.chest.contributors[0].contribution, 1);
  assert.ok(Math.abs(result.muscles.chest.contributors[1].contribution - Math.exp(-0.25)) < 1e-12);
  assert.deepEqual(result.unknownExerciseIds, ['unknown_a', 'unknown_z']);
  assert.deepEqual(recoveryLoad([], catalogue, '2026-10-25').muscles.chest, { sets: 0, contributors: [] });
});

test('recovery options use the requested window and factor', () => {
  assert.equal(recoveryLoad([set('2026-10-24')], catalogue, '2026-10-25', { days: 1 }).muscles.chest.sets, 0);
  assert.equal(recoveryLoad([set('2026-10-24')], catalogue, '2026-10-25', { days: 2, factor: 0 }).muscles.chest.sets, 1);
  assert.throws(() => recoveryLoad([], catalogue, '2026-10-25', { days: 0 }), RangeError);
  assert.throws(() => recoveryLoad([], catalogue, '2026-10-25', { factor: -1 }), RangeError);
});
