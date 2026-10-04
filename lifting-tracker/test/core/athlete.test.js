import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAthleteModel } from '../../src/core/athlete.js';
import { addDays } from '../../src/core/weeks.js';

const catalogue = JSON.parse(readFileSync(new URL('../../data/exercises.json', import.meta.url), 'utf8'));
const ASOF = '2026-09-30';
const ago = n => addDays(ASOF, -n);

// Chart percentages written out by hand (reps @ RPE), so expected values never come from the code under test.
// 5@8 = 81.1%, 3@7 = 83.7%, 5@7 = 78.6%, 8@8 = 73.9%, 3@8 = 86.3% (printed chart); 1@10 = 100%.
const ev = (daysAgo, exerciseId, weightKg, reps, rpe, extra = {}) =>
  ({ date: ago(daysAgo), exerciseId, weightKg, reps, rpe, isWarmup: false, order: 0, source: 'logged', ...extra });
// One rep at RPE 10 is 100% of 1RM, so the load equals the e1RM exactly.
const peak = (daysAgo, e1rm, exerciseId = 'low_bar_squat') => ev(daysAgo, exerciseId, e1rm, 1, 10);
const build = (events, extra = {}) => buildAthleteModel({ events, catalogue, asOf: ASOF, ...extra });
const near = (actual, expected, tol = 1e-9) => assert.ok(Math.abs(actual - expected) < tol, `${actual} vs ${expected}`);

function deepFreeze(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.freeze(x); Object.values(x).forEach(deepFreeze); }
  return x;
}

test('example 1: chart-based e1RM from three squat sets', () => {
  const m = build([ev(10, 'low_bar_squat', 160, 5, 8), ev(10, 'low_bar_squat', 165, 3, 7), ev(10, 'low_bar_squat', 150, 5, 7)]);
  const hand = [160 / 0.811, 165 / 0.837, 150 / 0.786]; // 197.287, 197.133, 190.840
  const squat = m.lifts.squat;
  assert.equal(m.asOf, ASOF);
  near(squat.e1rmKg, (hand[0] + hand[1] + hand[2]) / 3, 0.05); // 195.086
  assert.equal(squat.e1rmKg, 195.1);
  assert.equal(squat.n, 3);
  assert.equal(squat.confidence, 'medium');
  assert.equal(squat.basis, 'all 3 sets at RPE 6-10 in the last 8 weeks (squat)');
  assert.equal(squat.sources.length, 3);
  squat.sources.forEach((s, i) => near(s.e1rmKg, hand[i])); // same date: best e1RM first
  assert.deepEqual(squat.sources.map(s => [s.date, s.exerciseId, s.weightKg, s.reps, s.rpe]),
    [['2026-09-20', 'low_bar_squat', 160, 5, 8], ['2026-09-20', 'low_bar_squat', 165, 3, 7], ['2026-09-20', 'low_bar_squat', 150, 5, 7]]);
  for (const lift of ['bench', 'deadlift']) {
    assert.deepEqual(m.lifts[lift].e1rmKg, null);
    assert.equal(m.lifts[lift].n, 0);
    assert.equal(m.lifts[lift].confidence, 'none');
    assert.deepEqual(m.lifts[lift].sources, []);
  }
  assert.deepEqual(m.rpeBias, { squat: 0, bench: 0, deadlift: 0 });
});

test('asOf defaults to the latest event date, then to null', () => {
  assert.equal(buildAthleteModel({ events: [peak(10, 200), peak(3, 190)], catalogue }).asOf, ago(3));
  const empty = buildAthleteModel({ events: [], catalogue });
  assert.equal(empty.asOf, null);
  assert.deepEqual(empty.exercises, {});
  assert.equal(empty.lifts.squat.e1rmKg, null);
  assert.equal(empty.lifts.deadlift.stance, null);
  assert.equal(buildAthleteModel({ catalogue }).asOf, null);
});

test('example 2: no RPE, RPE above 10 or off the chart gives no source', () => {
  const m = build([
    ev(5, 'low_bar_squat', 140, 5, null), ev(5, 'low_bar_squat', 140, 5, 11), ev(5, 'low_bar_squat', 140, 5, 8.3),
    ev(5, 'low_bar_squat', 140, 5, '8'), ev(5, 'low_bar_squat', 140, 5, 5.5),
  ]);
  assert.equal(m.lifts.squat.e1rmKg, null);
  assert.equal(m.lifts.squat.n, 0);
  assert.equal(m.lifts.squat.confidence, 'none');
  assert.deepEqual(m.lifts.squat.sources, []);
  assert.equal(m.exercises.low_bar_squat.count, 5); // still working sets
});

test('rule 1: only working sets of 1..8 reps inside the window count', () => {
  const none = build([
    ev(5, 'low_bar_squat', 150, 5, 8, { isWarmup: true }), ev(5, 'low_bar_squat', 150, 5, 8, { isWarmup: undefined }),
    ev(5, 'low_bar_squat', 150, 9, 8), ev(-1, 'low_bar_squat', 150, 5, 8), ev(5, 'low_bar_squat', 0, 5, 8),
    ev(5, 'low_bar_squat', 150, 0, 8), ev(5, 'low_bar_squat', 150, 5.5, 8),
  ]);
  assert.equal(none.lifts.squat.n, 0);
  const eight = build([ev(5, 'low_bar_squat', 147.8, 8, 8)]); // 8 reps @ 8 is 73.9%: 147.8 / 0.739 = 200
  assert.equal(eight.lifts.squat.e1rmKg, 200);
});

test('bad rows are skipped, never thrown on', () => {
  const bad = [null, undefined, 5, 'x', {}, { ...peak(5, 200), date: 'yesterday' }, { ...peak(5, 200), date: '2026-02-30' },
    { ...peak(5, 200), weightKg: NaN }, { ...peak(5, 200), weightKg: '200' }, { ...peak(5, 200), exerciseId: null },
    { ...peak(5, 200), reps: Infinity }];
  const m = build([...bad, peak(4, 190)]);
  assert.equal(m.lifts.squat.n, 1);
  assert.equal(m.lifts.squat.e1rmKg, 190);
  assert.doesNotThrow(() => build(bad, { programme: { blocks: [null, { weeks: [null, { days: [null, { entries: [null, { exerciseId: 'low_bar_squat', sets: [null] }] }] }] }] } }));
});

test('lifts are independent: bench and sumo deadlift', () => {
  const m = build([ev(7, 'comp_bench', 100, 5, 8), ev(7, 'sumo_deadlift', 200, 3, 8)]);
  near(m.lifts.bench.e1rmKg, 123.3, 1e-9); // 100 / 0.811 = 123.305 -> 123.3
  near(m.lifts.deadlift.e1rmKg, 231.7, 1e-9); // 200 / 0.863 = 231.75 (3 @ 8 is 5 reps to failure, 86.3%) -> 231.7
  assert.equal(m.lifts.squat.e1rmKg, null);
  assert.equal(m.lifts.deadlift.stance, 'sumo');
  assert.ok(!('stance' in m.lifts.squat) && !('stance' in m.lifts.bench));
});

test('example 3: variants count at 0.95 only while competition sources are scarce', () => {
  // competition 200 (5 @ 8 at 162.2); high bar 210 (3 @ 7 at 175.77) and 205 (5 @ 7 at 161.13)
  const m = build([ev(8, 'low_bar_squat', 162.2, 5, 8), ev(8, 'high_bar_squat', 175.77, 3, 7), ev(8, 'high_bar_squat', 161.13, 5, 7)]);
  const squat = m.lifts.squat;
  assert.equal(squat.n, 3);
  assert.equal(squat.e1rmKg, 198.1); // (200 + 199.5 + 194.75) / 3 = 198.083
  assert.equal(squat.confidence, 'medium');
  assert.deepEqual(squat.sources.map(s => s.exerciseId), ['low_bar_squat', 'high_bar_squat', 'high_bar_squat']);
  [200, 199.5, 194.75].forEach((e, i) => near(squat.sources[i].e1rmKg, e, 1e-6));
  assert.equal(squat.sources[1].weightKg, 175.77); // the logged weight stays as logged

  // three competition sources: variants ignored
  const three = build([peak(3, 200), peak(4, 198), peak(5, 196), peak(3, 220, 'high_bar_squat'), peak(4, 230, 'high_bar_squat')]);
  assert.equal(three.lifts.squat.n, 3);
  assert.equal(three.lifts.squat.e1rmKg, 198); // (200 + 198 + 196) / 3
  assert.ok(three.lifts.squat.sources.every(s => s.exerciseId === 'low_bar_squat'));

  // two competition sources: every variant joins (2 + 3 = 5), top 3 = 200, 190, 190
  const two = build([peak(3, 200), peak(4, 190), peak(3, 200, 'high_bar_squat'), peak(4, 200, 'high_bar_squat'), peak(5, 200, 'high_bar_squat')]);
  assert.equal(two.lifts.squat.n, 5);
  assert.equal(two.lifts.squat.e1rmKg, 193.3); // (200 + 190 + 190) / 3 = 193.33; median 190, cap 197.6
  assert.equal(two.lifts.squat.confidence, 'medium');

  // a variant of another lift never leaks across
  assert.equal(build([peak(3, 200, 'paused_bench')]).lifts.squat.n, 0);
  assert.equal(build([peak(3, 200, 'hack_squat')]).lifts.squat.n, 0); // no lift in the catalogue
  assert.equal(build([peak(3, 200, 'not_in_catalogue')]).lifts.squat.n, 0);
});

test('example 4: the mean of the top 3 is capped at 1.04 x the median', () => {
  const events = [peak(1, 260), peak(2, 260), peak(3, 260), peak(4, 200), peak(5, 200), peak(6, 200)];
  const m = build(events);
  const squat = m.lifts.squat;
  assert.equal(squat.e1rmKg, 239.2); // median 230, cap 239.2 < top-3 mean 260
  assert.equal(squat.n, 6);
  assert.equal(squat.confidence, 'high');
  assert.equal(squat.basis, 'top 3 of 6 sets at RPE 6-10 in the last 8 weeks (squat)');
  // up to 5 best, newest first: three 260s then the two newest 200s
  assert.deepEqual(squat.sources.map(s => [s.date, s.e1rmKg]), [[ago(1), 260], [ago(2), 260], [ago(3), 260], [ago(4), 200], [ago(5), 200]]);
  // input order does not matter
  assert.deepEqual(build([...events].reverse()), m);
});

test('confidence by source count, and the cap is not applied when it does not bind', () => {
  for (const [count, expected] of [[1, 'low'], [2, 'low'], [3, 'medium'], [5, 'medium'], [6, 'high'], [9, 'high']]) {
    const m = build(Array.from({ length: count }, (_, i) => peak(i + 1, 200 + i)));
    assert.equal(m.lifts.squat.confidence, expected, `${count} sources`);
    assert.equal(m.lifts.squat.n, count);
  }
  const nine = build(Array.from({ length: 9 }, (_, i) => peak(i + 1, 200 + i))); // 200..208, median 204, cap 212.16
  assert.equal(nine.lifts.squat.e1rmKg, 207); // (208 + 207 + 206) / 3 = 207
  assert.equal(nine.lifts.squat.basis, 'top 3 of 9 sets at RPE 6-10 in the last 8 weeks (squat)');
  assert.equal(nine.lifts.squat.sources.length, 5);
});

test('example 5: the window is 8 weeks, widened to 16 only when nothing is found, with lower confidence', () => {
  const threeOld = build([peak(60, 200), peak(60, 190), peak(60, 180)]);
  assert.equal(threeOld.lifts.squat.n, 3);
  assert.equal(threeOld.lifts.squat.e1rmKg, 190);
  assert.equal(threeOld.lifts.squat.confidence, 'low'); // three sources say medium, widened window steps down one
  assert.equal(threeOld.lifts.squat.basis, 'all 3 sets at RPE 6-10 in the last 16 weeks (squat)');
  assert.equal(build([peak(60, 200), peak(60, 190), peak(60, 180), peak(60, 170), peak(60, 160), peak(60, 150)]).lifts.squat.confidence, 'medium');
  assert.equal(build([peak(60, 200)]).lifts.squat.confidence, 'low'); // never below low while e1rmKg is set

  // a recent source means the widened window is not used at all
  const recentAndOld = build([peak(5, 200), peak(60, 300)]);
  assert.equal(recentAndOld.lifts.squat.n, 1);
  assert.equal(recentAndOld.lifts.squat.e1rmKg, 200);

  // boundaries: (asOf - 56 days, asOf] for 8 weeks; 2026-08-05 is exactly 56 days before 2026-09-30
  assert.equal(ago(56), '2026-08-05');
  assert.match(build([peak(55, 200)]).lifts.squat.basis, /last 8 weeks/);
  assert.match(build([peak(56, 200)]).lifts.squat.basis, /last 16 weeks/);
  assert.equal(build([peak(111, 200)]).lifts.squat.e1rmKg, 200);
  assert.equal(build([peak(112, 200)]).lifts.squat.e1rmKg, null);
  assert.equal(build([peak(200, 200)]).lifts.squat.e1rmKg, null);
  assert.equal(build([peak(200, 200)]).lifts.squat.basis, 'no sets at RPE 6-10 in the last 16 weeks (squat)');

  // widened variants still count x 0.95
  near(build([peak(60, 200, 'high_bar_squat')]).lifts.squat.e1rmKg, 190);
  // windowWeeks changes the window
  assert.equal(build([peak(30, 200)], { windowWeeks: 4 }).lifts.squat.basis, 'all 1 set at RPE 6-10 in the last 8 weeks (squat)');
  assert.equal(build([peak(20, 200), peak(30, 190)], { windowWeeks: 4 }).lifts.squat.n, 1);
});

test('confidence steps down when the newest source is older than 4 weeks', () => {
  const at = days => build([peak(days, 200), peak(days, 201), peak(days, 202)]).lifts.squat.confidence;
  assert.equal(at(28), 'medium');
  assert.equal(at(29), 'low');
  const six = days => build(Array.from({ length: 6 }, (_, i) => peak(days + i, 200))).lifts.squat.confidence;
  assert.equal(six(25), 'high'); // newest 25 days
  assert.equal(six(30), 'medium'); // newest 30 days, still inside the 8-week window
  // only the newest source counts for staleness
  assert.equal(build([peak(3, 200), peak(45, 201), peak(46, 202)]).lifts.squat.confidence, 'medium');
});

test('example 6: deadlift stance is the more common one in the window', () => {
  const sumoSets = [...Array.from({ length: 6 }, (_, i) => ev(i + 1, 'sumo_deadlift', 200, 5, null)),
    ...Array.from({ length: 3 }, (_, i) => ev(i + 1, 'tempo_to_knee_sumo_deadlift', 150, 5, null)),
    ...Array.from({ length: 3 }, (_, i) => ev(i + 1, 'cluster_sumo_deadlift', 150, 3, null))];
  const conventionalSets = [ev(8, 'conventional_deadlift', 200, 5, null), ev(8, 'deadlift', 200, 5, null), ev(8, 'tempo_to_knee_deadlift', 150, 5, null)];
  assert.equal(build([...sumoSets, ...conventionalSets]).lifts.deadlift.stance, 'sumo'); // 12 vs 3
  assert.equal(build([...conventionalSets, sumoSets[0]]).lifts.deadlift.stance, 'conventional'); // 3 vs 1
  assert.equal(build([...conventionalSets, ...sumoSets.slice(0, 3)]).lifts.deadlift.stance, null); // 3 vs 3
  assert.equal(build([]).lifts.deadlift.stance, null);
  // outside the window or warm-ups do not count
  const old = Array.from({ length: 4 }, () => ev(70, 'conventional_deadlift', 200, 5, null));
  assert.equal(build([sumoSets[0], ...old, ev(2, 'conventional_deadlift', 100, 5, null, { isWarmup: true })]).lifts.deadlift.stance, 'sumo');
  // romanian deadlift is an accessory, not a stance
  assert.equal(build([ev(2, 'romanian_deadlift', 100, 8, null), ev(2, 'romanian_deadlift', 100, 8, null)]).lifts.deadlift.stance, null);
});

// A one-day programme with the given entries, for rpeBias.
const pset = (o = {}) => ({ index: 0, repsMin: 5, repsMax: 5, targetRpe: 7, actualRpe: 7, completed: true, ...o });
const many = (n, o) => Array.from({ length: n }, (_, i) => pset({ index: i, ...o }));
const prog = (entries, weekNumber = 1) => ({ blocks: [{ number: 1, weeks: [{ number: weekNumber, days: [{ number: 1, entries }] }] }] });
const squatEntry = sets => ({ exerciseId: 'low_bar_squat', sets });

test('example 7: rpeBias is the mean actual - target RPE, from 8 sets, clamped and rounded to 0.05', () => {
  const bias = sets => build([], { programme: prog([squatEntry(sets)]) }).rpeBias;
  assert.deepEqual(bias(many(10, { actualRpe: 7.5 })), { squat: 0.5, bench: 0, deadlift: 0 });
  assert.equal(bias(many(7, { actualRpe: 7.5 })).squat, 0); // fewer than 8
  assert.equal(bias(many(8, { actualRpe: 7.5 })).squat, 0.5); // exactly 8
  assert.equal(bias(many(8, { actualRpe: 5.5 })).squat, -1); // -1.5 clamps to -1
  assert.equal(bias(many(8, { actualRpe: 9.5 })).squat, 1); // +2.5 clamps to 1
  assert.equal(bias(many(8, { actualRpe: 6.5 })).squat, -0.5);
  assert.equal(bias([...many(4, { actualRpe: 8 }), ...many(8, { actualRpe: 7 })]).squat, 0.35); // 4/12 = 0.333 -> 0.35
  assert.ok(Object.is(bias(many(8, { actualRpe: 7 })).squat, 0));
  // -0.5 / 40 = -0.0125 rounds to -0.25 steps of 0.05 -> -0; the result must be 0, not -0
  assert.ok(Object.is(bias([...many(1, { actualRpe: 6.5 }), ...many(39, { actualRpe: 7 })]).squat, 0));
  // sets that do not qualify: not completed, a missing or >10 value
  assert.equal(bias([...many(8, { actualRpe: 8.5, completed: false })]).squat, 0);
  assert.equal(bias([...many(8, { actualRpe: 11 })]).squat, 0);
  assert.equal(bias([...many(8, { targetRpe: 11, actualRpe: 8 })]).squat, 0);
  assert.equal(bias([...many(8, { targetRpe: null, actualRpe: 8 })]).squat, 0);
  assert.equal(bias([...many(8, { actualRpe: null })]).squat, 0);
  assert.equal(bias([...many(7, { actualRpe: 8 }), ...many(5, { actualRpe: 11 })]).squat, 0); // only 7 qualify
});

test('rpeBias groups by lift family (variants count, accessories and unknown exercises do not)', () => {
  const programme = prog([
    { exerciseId: 'comp_bench', sets: many(4, { actualRpe: 7.5 }) },
    { exerciseId: 'paused_bench', sets: many(4, { actualRpe: 7.5 }) },
    { exerciseId: 'seated_leg_extension', sets: many(20, { actualRpe: 10 }) },
    { exerciseId: 'mystery', sets: many(20, { actualRpe: 10 }) },
    { exerciseId: null, sets: many(20, { actualRpe: 10 }) },
    { exerciseId: 'sumo_deadlift', sets: many(7, { actualRpe: 10 }) },
  ]);
  assert.deepEqual(build([], { programme }).rpeBias, { squat: 0, bench: 0.5, deadlift: 0 });
});

test('rpeBias with dateFor only counts planned sets whose day falls inside the window', () => {
  const programme = { blocks: [{ number: 1, weeks: [
    { number: 1, days: [{ number: 1, entries: [squatEntry(many(8, { actualRpe: 7.5 }))] }] }, // +0.5, in window
    { number: 2, days: [{ number: 1, entries: [squatEntry(many(8, { actualRpe: 6.5 }))] }] }, // -0.5, 100 days old
    { number: 3, days: [{ number: 1, entries: [squatEntry(many(8, { actualRpe: 9.5 }))] }] }, // no date
  ] }] };
  const dateFor = ({ weekNumber }) => (weekNumber === 1 ? ago(10) : weekNumber === 2 ? ago(100) : null);
  assert.equal(build([], { programme, dateFor }).rpeBias.squat, 0.5);
  assert.equal(build([], { programme }).rpeBias.squat, 0.85); // no dateFor: all 24 sets, mean (0.5 - 0.5 + 2.5) / 3 = 0.833 -> 0.85
});

test('example 8: exercises summary uses the heaviest-e1RM set on the newest date', () => {
  const m = build([
    ev(3, 'comp_bench', 100, 5, 8), ev(3, 'comp_bench', 105, 3, 9), // Epley 116.67 vs 115.5 -> the 100 x 5 set
    ev(10, 'comp_bench', 120, 1, 10), // older but higher e1RM: best only
    ev(3, 'comp_bench', 140, 3, 9, { isWarmup: true }), // warm-up ignored
    ev(2, 'seated_leg_extension', 50, 15, null), // reps over 12: counted, no Epley
    ev(113, 'hack_squat', 100, 5, 8), // older than 16 weeks
    ev(111, 'leg_press', 200, 10, 8),
  ]);
  const bench = m.exercises.comp_bench;
  assert.equal(bench.lastDate, ago(3));
  assert.equal(bench.lastWeightKg, 100);
  assert.equal(bench.lastReps, 5);
  assert.equal(bench.lastRpe, 8);
  assert.equal(bench.count, 3);
  assert.equal(bench.bestE1rmKg, 120); // 120 x 1 beats 116.67
  assert.deepEqual(m.exercises.seated_leg_extension, { lastDate: ago(2), lastWeightKg: 50, lastReps: 15, lastRpe: null, count: 1, bestE1rmKg: null });
  assert.ok(!('hack_squat' in m.exercises));
  near(m.exercises.leg_press.bestE1rmKg, 200 * (1 + 10 / 30), 1e-9); // 266.67
  assert.deepEqual(Object.keys(m.exercises), ['comp_bench', 'leg_press', 'seated_leg_extension']);

  const epley = build([ev(1, 'comp_bench', 100, 5, null)]).exercises.comp_bench.bestE1rmKg;
  near(epley, 116.6667, 1e-4);
  // the order of same-day sets does not matter
  const flipped = build([ev(3, 'comp_bench', 105, 3, 9), ev(3, 'comp_bench', 100, 5, 8)]).exercises.comp_bench;
  assert.equal(flipped.lastWeightKg, 100);
});

test('impossible arguments throw RangeError', () => {
  assert.throws(() => buildAthleteModel({ events: [], asOf: ASOF }), RangeError);
  assert.throws(() => buildAthleteModel({ events: [], catalogue: {}, asOf: ASOF }), RangeError);
  assert.throws(() => buildAthleteModel({ events: [], catalogue: null }), RangeError);
  assert.throws(() => buildAthleteModel(), RangeError);
  for (const asOf of ['2026-13-01', '2026-02-30', 'yesterday', '30/09/2026', 20260930]) {
    assert.throws(() => buildAthleteModel({ events: [], catalogue, asOf }), RangeError, String(asOf));
  }
  for (const windowWeeks of [0, -1, 1.5, NaN, '8']) {
    assert.throws(() => buildAthleteModel({ events: [], catalogue, asOf: ASOF, windowWeeks }), RangeError, String(windowWeeks));
  }
});

test('inputs are never mutated and results are deterministic', () => {
  const events = deepFreeze([peak(1, 260), peak(2, 260), peak(3, 200), ev(4, 'sumo_deadlift', 200, 3, 8), ev(4, 'comp_bench', 100, 5, 8), ev(5, 'comp_bench', 105, 3, 8)]);
  const programme = deepFreeze(prog([squatEntry(many(10, { actualRpe: 7.5 }))]));
  const frozenCatalogue = deepFreeze(JSON.parse(JSON.stringify(catalogue)));
  const options = { events, catalogue: frozenCatalogue, asOf: ASOF, programme, dateFor: deepFreeze(() => ago(1)) };
  const first = buildAthleteModel(options);
  assert.deepEqual(buildAthleteModel(options), first);
  assert.equal(first.rpeBias.squat, 0.5);
  // the result does not alias input objects
  first.lifts.squat.sources[0].weightKg = -1;
  assert.equal(events[0].weightKg, 260);
});
