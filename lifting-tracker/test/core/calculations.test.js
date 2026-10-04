import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimate1RM, roundForDisplay } from '../../src/core/e1rm.js';
import { fromLoggedSet, fromProgrammeSets, workingSets, sortEvents } from '../../src/core/sets.js';
import { detectPRs } from '../../src/core/prs.js';
import { mondayOf, weekKey, addDays, daysBetween } from '../../src/core/weeks.js';
import { weeklyHardSets } from '../../src/core/muscles.js';
import { estimateDates } from '../../src/core/schedule.js';
import { runningBests } from '../../src/core/lifts.js';
import { rpeDeltas } from '../../src/core/rpe.js';

const catalogue = JSON.parse(readFileSync(new URL('../../data/exercises.json', import.meta.url), 'utf8'));
const event = (weightKg = 100, reps = 5, date = '2026-01-05', extra = {}) =>
  ({ date, exerciseId: 'low_bar_squat', weightKg, reps, rpe: 8, isWarmup: false, order: 0, source: 'logged', ...extra });
const programme = sets => ({ blocks: [{ number: 1, weeks: [{ number: 1,
  days: [{ number: 1, entries: [{ exerciseId: 'low_bar_squat', sets }] }] }] }] });
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const sequence = () => [event(100, 5), event(100, 5, '2026-01-06'), event(102.5, 5, '2026-01-07'),
  event(100, 6, '2026-01-08'), event(120, 1, '2026-01-09'), event(120, 1, '2026-01-10'), event(122.5, 1, '2026-01-11')];

test('Epley examples, single override, invalid data and display units', () => {
  assert.ok(Math.abs(estimate1RM(100, 5) - 350 / 3) < 1e-9);
  assert.equal(roundForDisplay(estimate1RM(100, 5), 'kg'), 116.7);
  assert.equal(estimate1RM(140, 1), 140);
  assert.equal(estimate1RM(100, 12), 140);
  for (const [w, r] of [[100, 13], [100, 0], [0, 5], [-5, 5], [100, 2.5], [NaN, 3], [Infinity, 3], ['100', 3], [100, '3'], [null, 3]]) {
    assert.equal(estimate1RM(w, r), null);
  }
  assert.equal(roundForDisplay(45.359237, 'lb'), 100);
  assert.throws(() => roundForDisplay(100, 'oz'), RangeError);
});

test('logged sets convert pounds, retain metadata and skip bad sets', () => {
  const set = { exerciseId: 'comp_bench', order: 4, weight: { value: 100, unit: 'lb' }, reps: 8, rpe: 7, isWarmup: true };
  assert.deepEqual(fromLoggedSet(set, { date: '2026-10-05' }), { date: '2026-10-05', exerciseId: 'comp_bench',
    order: 4, weightKg: 45.359237, reps: 8, rpe: 7, isWarmup: true, source: 'logged' });
  for (const bad of [null, { ...set, weight: null }, { ...set, weight: { value: NaN, unit: 'kg' } }, { ...set, reps: 0 }]) {
    assert.equal(fromLoggedSet(bad, { date: '2026-10-05' }), null);
  }
  assert.throws(() => fromLoggedSet({ ...set, weight: { value: 1, unit: 'oz' } }, { date: '2026-10-05' }), RangeError);
  assert.throws(() => fromLoggedSet(set, { date: '2026-02-30' }), RangeError);
});

test('programme completion, actual overrides, range skips, fallback and missing dates', () => {
  const base = { index: 1, completed: true, repsMin: 6, repsMax: 10, actualReps: null,
    load: { value: 100, unit: 'kg' }, actualLoad: null, actualRpe: 8 };
  const input = programme([base, { ...base, actualReps: 8, actualLoad: { value: 140, unit: 'kg' } },
    { ...base, completed: false, actualReps: 8 }, { ...base, repsMin: 5, repsMax: 5, load: { value: 100, unit: 'lb' } },
    { ...base, actualReps: 5, load: null }, { ...base, actualReps: 0 }, { ...base, actualReps: 2.5 }]);
  const refs = [];
  assert.deepEqual(fromProgrammeSets(input, ref => { refs.push(ref); return '2026-10-05'; }), [
    event(140, 8, '2026-10-05', { order: 1, source: 'programme' }),
    event(45.359237, 5, '2026-10-05', { order: 3, source: 'programme' }),
  ]);
  assert.deepEqual(refs, [{ blockNumber: 1, weekNumber: 1, dayNumber: 1 }]);
  assert.deepEqual(fromProgrammeSets(input, () => null), []);
  assert.deepEqual(fromProgrammeSets(null, () => null), []);
  assert.throws(() => fromProgrammeSets(input, () => '2026-13-01'), RangeError);
});

test('working sets require explicit non-warmup and finite positive weight/integer reps', () => {
  const good = event(100, 20);
  assert.deepEqual(workingSets([null, good, event(140, 1, '2026-01-05', { isWarmup: true }),
    event(100, 5, '2026-01-05', { isWarmup: undefined }), event(0), event(-1), event(NaN), event(Infinity),
    event(100, 0), event(100, 2.5), event(100, '5')]), [good]);
});

test('event sorting uses date then order then original position', () => {
  const a = event(100, 5, '2026-01-06');
  const b = event(101, 5, '2026-01-05', { order: 2 });
  const c = event(102, 5, '2026-01-05', { order: 1 });
  const d = event(103, 5, '2026-01-05', { order: 1 });
  assert.deepEqual(sortEvents([a, b, c, d]), [c, d, b, a]);
  assert.throws(() => sortEvents([event(100, 5, 'not-a-date')]), RangeError);
});

test('PR sequence has hand-derived records and no baseline/tie PRs', () => {
  const expected = [
    { date: '2026-01-07', exerciseId: 'low_bar_squat', type: 'e1rm', value: 1435 / 12, weightKg: 102.5, reps: 5, order: 0, previousBest: 350 / 3 },
    { date: '2026-01-08', exerciseId: 'low_bar_squat', type: 'e1rm', value: 120, weightKg: 100, reps: 6, order: 0, previousBest: 1435 / 12 },
    { date: '2026-01-08', exerciseId: 'low_bar_squat', type: 'repsAtWeight', value: 6, weightKg: 100, reps: 6, order: 0, previousBest: 5 },
    { date: '2026-01-11', exerciseId: 'low_bar_squat', type: 'e1rm', value: 122.5, weightKg: 122.5, reps: 1, order: 0, previousBest: 120 },
    { date: '2026-01-11', exerciseId: 'low_bar_squat', type: 'single', value: 122.5, weightKg: 122.5, reps: 1, order: 0, previousBest: 120 },
  ];
  const actual = detectPRs(sequence().reverse());
  assert.equal(actual.length, expected.length);
  actual.forEach((record, i) => {
    assert.ok(Math.abs(record.value - expected[i].value) < 1e-9);
    assert.ok(Math.abs(record.previousBest - expected[i].previousBest) < 1e-9);
    assert.deepEqual({ ...record, value: expected[i].value, previousBest: expected[i].previousBest }, expected[i]);
  });
});

test('PR recomputation after delete/edit moves the PR without retaining state', () => {
  const events = [event(100, 1), event(120, 1, '2026-01-06'), event(110, 1, '2026-01-07')];
  assert.deepEqual(detectPRs(events).filter(p => p.type === 'single').map(p => p.date), ['2026-01-06']);
  assert.deepEqual(detectPRs([events[0], events[2]]).filter(p => p.type === 'single').map(p => p.date), ['2026-01-07']);
  assert.deepEqual(detectPRs([events[0], { ...events[1], weightKg: 90 }, events[2]]).filter(p => p.type === 'single').map(p => p.date), ['2026-01-07']);
  assert.deepEqual(detectPRs(events).filter(p => p.type === 'single').map(p => p.date), ['2026-01-06']);
});

test('PR tolerance, rounded weight keys, exercise independence and reps above 12', () => {
  assert.deepEqual(detectPRs([event(100, 1), event(100 + 5e-10, 1, '2026-01-06')]).map(p => p.type), ['single']);
  assert.deepEqual(detectPRs([event(100.001, 13), event(100.004, 14, '2026-01-06')]).map(p => p.type), ['repsAtWeight']);
  assert.deepEqual(detectPRs([event(100, 1), event(200, 1, '2026-01-06', { exerciseId: 'comp_bench' })]), []);
  assert.deepEqual(detectPRs([event(100, 1), event(140, 1, '2026-01-06', { isWarmup: true })]), []);
});

test('UTC Monday weeks, leap days, year boundaries and signed day differences', () => {
  assert.equal(mondayOf('2026-10-04'), '2026-09-28');
  assert.equal(mondayOf('2026-10-05'), '2026-10-05');
  assert.equal(mondayOf('2026-01-01'), '2025-12-29');
  assert.equal(weekKey('2026-10-04'), '2026-09-28');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2024-02-29', 1), '2024-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('0000-02-28', 1), '0000-02-29');
  assert.equal(daysBetween('2026-10-04', '2026-10-05'), 1);
  assert.equal(daysBetween('2026-10-05', '2026-10-04'), -1);
  for (const bad of ['2026-02-29', '2026-04-31', '2026-00-01', '2026-1-01', '2026-01-01T00:00:00Z', null]) {
    for (const fn of [mondayOf, weekKey, date => addDays(date, 0), date => daysBetween(date, '2026-01-01')]) assert.throws(() => fn(bad), RangeError);
  }
  assert.throws(() => addDays('2026-01-01', 0.5), RangeError);
  assert.throws(() => addDays('9999-12-31', 1), RangeError);
});

test('weekly muscles include all 17 muscles and hand-derived weighted contributors', () => {
  const events = [event(), event(), event(), event(100, 5, '2026-01-11', { exerciseId: 'hack_squat' }),
    event(100, 5, '2026-01-05', { exerciseId: 'hack_squat' }), event(100, 5, '2026-01-12'),
    event(140, 1, '2026-01-05', { isWarmup: true }), event(100, 5, '2026-01-04'),
    event(100, 5, '2026-01-05', { exerciseId: 'unknown_z' }), event(100, 5, '2026-01-05', { exerciseId: 'unknown_a' }),
    event(100, 5, '2026-01-05', { exerciseId: 'unknown_z' })];
  const result = weeklyHardSets(events, catalogue, '2026-01-05');
  assert.equal(result.weekStart, '2026-01-05');
  assert.equal(Object.keys(result.muscles).length, 17);
  const totals = { quads: 5, glutes: 4, adductors: 2.5, hamstrings: 1.5, lower_back: 1.5, abs: 1.5 };
  for (const [muscle, bucket] of Object.entries(result.muscles)) assert.equal(bucket.sets, totals[muscle] ?? 0);
  assert.deepEqual(result.muscles.quads.contributors, [{ exerciseId: 'low_bar_squat', sets: 3, contribution: 3 }, { exerciseId: 'hack_squat', sets: 2, contribution: 2 }]);
  assert.deepEqual(result.muscles.glutes.contributors, [{ exerciseId: 'low_bar_squat', sets: 3, contribution: 3 }, { exerciseId: 'hack_squat', sets: 2, contribution: 1 }]);
  assert.deepEqual(result.unknownExerciseIds, ['unknown_a', 'unknown_z']);
  assert.throws(() => weeklyHardSets([], catalogue, '2026-01-06'), RangeError);
  assert.ok(Object.values(weeklyHardSets([], catalogue, '2026-01-05').muscles).every(m => m.sets === 0 && m.contributors.length === 0));
});

test('muscle contributor ties sort by exercise id and editable weights are respected', () => {
  const custom = { muscles: ['m'], weights: { primary: 2, secondary: 1 }, exercises: [
    { id: 'z', primary: ['m'] }, { id: 'a', secondary: ['m'] }] };
  assert.deepEqual(weeklyHardSets([event(100, 5, '2026-01-05', { exerciseId: 'z' }),
    event(100, 5, '2026-01-05', { exerciseId: 'a' }), event(100, 5, '2026-01-05', { exerciseId: 'a' })], custom, '2026-01-05').muscles.m,
  { sets: 4, contributors: [{ exerciseId: 'a', sets: 2, contribution: 2 }, { exerciseId: 'z', sets: 1, contribution: 2 }] });
});

test('schedule default and custom weekdays, sorting and argument errors', () => {
  assert.deepEqual([...estimateDates({ startDate: '2026-10-05', weeks: [2, 1] })], [
    ['1:1', '2026-10-05'], ['1:2', '2026-10-06'], ['1:3', '2026-10-08'], ['1:4', '2026-10-09'],
    ['2:1', '2026-10-12'], ['2:2', '2026-10-13'], ['2:3', '2026-10-15'], ['2:4', '2026-10-16']]);
  assert.deepEqual([...estimateDates({ startDate: '2026-10-05', weeks: [1, 1], dayWeekdays: { 2: 7, 1: 3 } })], [['1:1', '2026-10-07'], ['1:2', '2026-10-11']]);
  assert.equal(estimateDates({ startDate: '2026-10-05', weeks: [] }).size, 0);
  for (const override of [{ startDate: '2026-10-04' }, { weeks: [0] }, { weeks: [1.5] }, { dayWeekdays: { 1: 8 } }, { dayWeekdays: { 0: 1 } }, { dayWeekdays: { 1: 2.5 } }]) {
    assert.throws(() => estimateDates({ startDate: '2026-10-05', weeks: [1], ...override }), RangeError);
  }
});

test('main-lift running bests, totals, competition filtering, ties and same-day consolidation', () => {
  const events = [event(150, 1), event(100, 1, '2026-01-06', { exerciseId: 'comp_bench' }),
    event(180, 1, '2026-01-07', { exerciseId: 'conventional_deadlift' }), event(155, 1, '2026-01-08'),
    event(110, 1, '2026-01-09', { exerciseId: 'paused_bench' }), event(140, 1, '2026-01-10', { isWarmup: true }),
    event(150, 1, '2026-01-08', { order: 1 })];
  const expected = [
    { date: '2026-01-05', squat: 150, bench: null, deadlift: null, total: null },
    { date: '2026-01-06', squat: 150, bench: 100, deadlift: null, total: null },
    { date: '2026-01-07', squat: 150, bench: 100, deadlift: 180, total: 430 },
    { date: '2026-01-08', squat: 155, bench: 100, deadlift: 180, total: 435 },
  ];
  assert.deepEqual(runningBests(events.reverse(), catalogue), expected);
  assert.deepEqual(runningBests(events, catalogue, { basis: 'single' }), expected);
  assert.deepEqual(runningBests([event(140, 1, '2026-01-05', { isWarmup: true })], catalogue), []);
  assert.throws(() => runningBests([], catalogue, { basis: 'unknown' }), RangeError);
});

test('bests retain rows for competition dates even when the basis cannot estimate', () => {
  assert.deepEqual(runningBests([event(100, 13)], catalogue), [{ date: '2026-01-05', squat: null, bench: null, deadlift: null, total: null }]);
  assert.deepEqual(runningBests([event(100, 5)], catalogue, { basis: 'single' }), [{ date: '2026-01-05', squat: null, bench: null, deadlift: null, total: null }]);
  assert.ok(Math.abs(runningBests([event(100, 5)], catalogue)[0].squat - 350 / 3) < 1e-9);
});

test('RPE deltas exclude failure markers and non-numbers; average rounds to two decimals', () => {
  const input = programme([{ index: 1, targetRpe: 8, actualRpe: 9, completed: false },
    { index: 2, targetRpe: 8, actualRpe: 7.5 }, { index: 3, targetRpe: 8, actualRpe: 8.5 },
    { index: 4, targetRpe: 11, actualRpe: 9 }, { index: 5, targetRpe: 9, actualRpe: 11 },
    { index: 6, targetRpe: '8', actualRpe: 9 }, { index: 7, targetRpe: 8, actualRpe: null },
    { index: 8, targetRpe: NaN, actualRpe: 9 }, { index: 9, targetRpe: 8, actualRpe: Infinity }]);
  assert.deepEqual(rpeDeltas(input), { perSet: [
    { blockNumber: 1, weekNumber: 1, dayNumber: 1, exerciseId: 'low_bar_squat', setIndex: 1, target: 8, actual: 9, delta: 1 },
    { blockNumber: 1, weekNumber: 1, dayNumber: 1, exerciseId: 'low_bar_squat', setIndex: 2, target: 8, actual: 7.5, delta: -0.5 },
    { blockNumber: 1, weekNumber: 1, dayNumber: 1, exerciseId: 'low_bar_squat', setIndex: 3, target: 8, actual: 8.5, delta: 0.5 },
  ], perExercise: { low_bar_squat: { sets: 3, meanDelta: 0.33 } } });
  assert.deepEqual(rpeDeltas(null), { perSet: [], perExercise: {} });
});

test('every API accepts deeply frozen inputs without mutation', () => {
  const events = freeze(sequence());
  const cat = freeze(catalogue);
  const input = freeze(programme([{ index: 1, completed: true, repsMin: 5, repsMax: 5,
    load: { value: 100, unit: 'kg' }, targetRpe: 8, actualRpe: 9 }]));
  const before = JSON.stringify({ events, cat, input });
  estimate1RM(100, 5); roundForDisplay(100, 'lb');
  fromLoggedSet(freeze({ exerciseId: 'low_bar_squat', order: 1, weight: { value: 100, unit: 'kg' }, reps: 5, isWarmup: false }), freeze({ date: '2026-01-05' }));
  fromProgrammeSets(input, () => '2026-01-05'); workingSets(events); sortEvents(events); detectPRs(events);
  mondayOf('2026-01-05'); weekKey('2026-01-05'); addDays('2026-01-05', 1); daysBetween('2026-01-05', '2026-01-06');
  weeklyHardSets(events, cat, '2026-01-05'); estimateDates(freeze({ startDate: '2026-01-05', weeks: [2, 1], dayWeekdays: { 1: 1 } }));
  runningBests(events, cat); rpeDeltas(input);
  assert.equal(JSON.stringify({ events, cat, input }), before);
});

test('programme traversal handles multiple blocks and indices restarting for each exercise', () => {
  const set = { index: 1, completed: true, repsMin: 1, repsMax: 1, load: { value: 100, unit: 'kg' } };
  const input = freeze({ blocks: [
    { number: 2, weeks: [{ number: 1, days: [{ number: 2, entries: [{ exerciseId: 'comp_bench', sets: [set] }] }] }] },
    { number: 1, weeks: [{ number: 1, days: [{ number: 1, entries: [
      { exerciseId: 'low_bar_squat', sets: [set] }, { exerciseId: 'comp_bench', sets: [set] }] }] }] },
  ] });
  const result = fromProgrammeSets(input, ({ blockNumber }) => blockNumber === 1 ? '2026-01-05' : '2026-01-06');
  assert.deepEqual(result.map(({ date, exerciseId, order, rpe }) => [date, exerciseId, order, rpe]), [
    ['2026-01-05', 'low_bar_squat', 1, null], ['2026-01-05', 'comp_bench', 2, null], ['2026-01-06', 'comp_bench', 0, null],
  ]);
});

test('RPE groups exercises separately and orders block/week/day/exercise/set explicitly', () => {
  const input = freeze({ blocks: [
    { number: 2, weeks: [{ number: 1, days: [{ number: 1, entries: [
      { exerciseId: 'z', sets: [{ index: 1, targetRpe: 8, actualRpe: 7 }] }] }] }] },
    { number: 1, weeks: [{ number: 1, days: [{ number: 1, entries: [
      { exerciseId: 'z', sets: [{ index: 1, targetRpe: 8, actualRpe: 9 }] },
      { exerciseId: 'a', sets: [{ index: 2, targetRpe: 8, actualRpe: 8 }, { index: 1, targetRpe: 8, actualRpe: 7.5 }] },
    ] }] }] },
  ] });
  const result = rpeDeltas(input);
  assert.deepEqual(result.perSet.map(({ blockNumber, exerciseId, setIndex }) => [blockNumber, exerciseId, setIndex]), [
    [1, 'a', 1], [1, 'a', 2], [1, 'z', 1], [2, 'z', 1],
  ]);
  assert.deepEqual(result.perExercise, { a: { sets: 2, meanDelta: -0.25 }, z: { sets: 2, meanDelta: 0 } });
});
