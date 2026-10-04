import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { learnTemplate } from '../../src/core/template.js';

const catalogue = JSON.parse(readFileSync(new URL('../../data/exercises.json', import.meta.url), 'utf8'));

// Programme model builders (fields from ARCHITECTURE.md).
const kg = value => ({ value, unit: 'kg' });
const pset = (index, o = {}) => ({
  index, repsMin: 5, repsMax: 5, repsRaw: null, targetRpe: null, load: null, loadRange: null, actualRpe: null,
  actualReps: null, actualLoad: null, coachComment: null, athleteComment: null, completed: false,
  source: { sheet: 'S', row: 1, col: 1 }, warnings: [], ...o,
});
const entry = (exerciseId, name, sets, o = {}) => ({ exerciseId, name, rawName: name, supersetGroup: null, tempo: null, cues: [], sets, ...o });
const week = (number, days) => ({ number, label: `Week ${number}`, target: null, avgCalories: null, avgBodyweightKg: null, bodyLog: [], days });
const block = (number, name, weeks) => ({ id: `b${number}`, number, name, goal: '', instructions: '', weeks });

// A week with a squat (3 x 3 @ 7, loads top / top-5 / top-10), a single bench, a paused bench (4 equal sets),
// a leg extension (6-10 reps to failure) and an empty third day. `done` marks every set completed.
function mkWeek(number, top, done) {
  const squatSets = [top, top - 5, top - 10].map((load, i) => pset(i, { repsMin: 3, repsMax: 3, targetRpe: 7, load: kg(load), completed: done }));
  return week(number, [
    { number: 1, entries: [
      entry('low_bar_squat', 'Low Bar Squat', squatSets),
      entry('comp_bench', 'Competition Bench Press', [pset(0, { repsMin: 1, repsMax: 1, load: kg(100), completed: done })]),
    ] },
    { number: 2, entries: [
      entry('paused_bench', 'Paused Bench Press', [0, 1, 2, 3].map(i => pset(i, { repsMin: 5, repsMax: 5, targetRpe: 8, load: kg(80), completed: done }))),
      entry('seated_leg_extension', 'Seated Leg Extension', [0, 1].map(i => pset(i, { repsMin: 6, repsMax: 10, targetRpe: 11, completed: done }))),
    ] },
    { number: 3, entries: [] },
  ]);
}
// Block 1 'Base' (tops 100 / 110 / 120) and block 2 'Peak' (tops 150 / 160 / 170); `d1` and `d2` say which weeks are done.
const programme = (d1 = [true, true, true], d2 = [true, true, true]) => ({
  blocks: [
    block(1, 'Base', d1.map((done, i) => mkWeek(i + 1, 100 + 10 * i, done))),
    block(2, 'Peak', d2.map((done, i) => mkWeek(i + 1, 150 + 10 * i, done))),
  ],
});
const learn = (p, extra = {}) => learnTemplate({ programme: p, catalogue, ...extra });
const near = (actual, expected, tol = 1e-9) => assert.ok(Math.abs(actual - expected) < tol, `${actual} vs ${expected}`);
// A one-slot programme for the slot-level rules: one day, one entry, one week.
const single = (exerciseId, sets, o = {}) => ({ blocks: [block(1, 'B', [week(1, [{ number: 1, entries: [entry(exerciseId, exerciseId, sets, o)] }])])] });
const slotOf = (p, extra) => learn(p, extra).days[0].slots[0];

function deepFreeze(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.freeze(x); Object.values(x).forEach(deepFreeze); }
  return x;
}

test('example 9: the highest-numbered block with at least 2 weeks that have a completed set', () => {
  assert.equal(learn(programme()).fromBlock, 2);
  assert.equal(learn(programme()).blockName, 'Peak');
  assert.equal(learn(programme()).weeksInBlock, 3);
  assert.equal(learn(programme([true, true, true], [true, false, false])).fromBlock, 1); // block 2 has one completed week
  assert.equal(learn(programme([true, true, true], [false, true, true])).fromBlock, 2);
  assert.equal(learn(programme([true, true, false], [true, false, true])).fromBlock, 2); // weeks need not be consecutive
  // blockNumber forces a block, qualified or not
  const forced = learn(programme(), { blockNumber: 1 });
  assert.equal(forced.fromBlock, 1);
  assert.equal(forced.blockName, 'Base');
  assert.equal(learn(programme([true, true, true], [true, false, false]), { blockNumber: 2 }).fromBlock, 2);
  // block order in the array does not matter
  const reversed = programme();
  reversed.blocks.reverse();
  assert.equal(learn(reversed).fromBlock, 2);
  // a week counts once a single set is completed
  const oneSet = programme([false, false, false], [false, false, false]);
  oneSet.blocks[0].weeks[0].days[0].entries[0].sets[2].completed = true;
  oneSet.blocks[0].weeks[2].days[1].entries[1].sets[1].completed = true;
  assert.equal(learn(oneSet).fromBlock, 1);
  // none qualifies: fall back to the highest-numbered block with any week (block 3 has no weeks)
  const fallback = programme([true, false, false], [false, false, false]);
  fallback.blocks.push(block(3, 'Empty', []));
  assert.equal(learn(fallback).fromBlock, 2);
  // forced block without weeks, or missing
  assert.equal(learn(fallback, { blockNumber: 3 }), null);
  assert.equal(learn(programme(), { blockNumber: 99 }), null);
});

test('example 10: representative week is the second, slots in order, slotIds d<day>s<position>', () => {
  const t = learn(programme());
  assert.equal(t.days[0].slots[0].loadKg, 160); // block 2 week 2 (150, 160, 170)
  assert.deepEqual(t.days.map(d => d.number), [1, 2]); // empty day 3 dropped
  assert.equal(t.daysPerWeek, 2);
  assert.deepEqual(t.days.map(d => d.slots.map(s => s.slotId)), [['d1s1', 'd1s2'], ['d2s1', 'd2s2']]);
  assert.deepEqual(t.days.map(d => d.slots.map(s => s.exerciseId)),
    [['low_bar_squat', 'comp_bench'], ['paused_bench', 'seated_leg_extension']]);
  assert.deepEqual(t.days.map(d => d.slots.map(s => s.name)),
    [['Low Bar Squat', 'Competition Bench Press'], ['Paused Bench Press', 'Seated Leg Extension']]);
  assert.deepEqual(Object.keys(t), ['fromBlock', 'blockName', 'weeksInBlock', 'daysPerWeek', 'days']);
  // a block with one week uses it
  const oneWeek = { blocks: [block(7, 'Solo', [mkWeek(1, 130, true)])] };
  const solo = learn(oneWeek);
  assert.equal(solo.weeksInBlock, 1);
  assert.equal(solo.days[0].slots[0].loadKg, 130);
  assert.equal(solo.fromBlock, 7);
  // empty days and entries without sets are dropped, positions stay contiguous
  const sparse = { blocks: [block(1, 'S', [week(1, [
    { number: 2, entries: [entry('low_bar_squat', 'a', []), null, entry('comp_bench', 'b', [pset(0, { repsMin: 1, repsMax: 1 })])] },
    { number: 4, entries: [] },
    null,
    { number: 5, entries: [entry('comp_bench', 'c', [null])] },
  ])])] };
  const t2 = learn(sparse);
  assert.deepEqual(t2.days.map(d => [d.number, d.slots.map(s => s.slotId)]), [[2, ['d2s1']]]);
  assert.equal(t2.daysPerWeek, 1);
});

test('example 11: roles, families and schemes', () => {
  const [squat, bench] = learn(programme()).days[0].slots;
  assert.deepEqual(squat, { slotId: 'd1s1', exerciseId: 'low_bar_squat', name: 'Low Bar Squat', supersetGroup: null, tempo: null, cues: [],
    role: 'main', family: 'squat', scheme: 'top-backoff', sets: 3, reps: 3, rpe: 7, loadKg: 160, k: null });
  assert.equal(bench.role, 'main');
  assert.equal(bench.family, 'bench');
  assert.equal(bench.scheme, 'singles');
  assert.equal(bench.sets, 1);
  assert.equal(bench.reps, 1);
  assert.equal(bench.rpe, null);
  assert.equal(bench.loadKg, 100);
  const [paused, extension] = learn(programme()).days[1].slots;
  assert.equal(paused.role, 'variation');
  assert.equal(paused.family, 'bench');
  assert.equal(paused.scheme, 'straight');
  assert.equal(paused.sets, 4);
  assert.equal(paused.rpe, 8);
  assert.equal(extension.role, 'accessory');
  assert.equal(extension.family, null);
  assert.equal(extension.scheme, 'accessory');
  assert.deepEqual(extension.reps, [6, 10]);
  assert.equal(extension.rpe, 11);
  assert.equal(extension.loadKg, null);
  assert.equal(extension.k, null);
  assert.equal(extension.sets, 2);
});

test('scheme rules: singles, top-backoff, straight', () => {
  const sets = (loads, o = {}) => loads.map((load, i) => pset(i, { repsMin: 3, repsMax: 3, load: kg(load), ...o }));
  const scheme = (loads, o) => slotOf(single('low_bar_squat', sets(loads, o))).scheme;
  assert.equal(scheme([200, 190, 180], { repsMin: 1, repsMax: 1 }), 'singles'); // all reps 1, even though loads fall
  assert.equal(scheme([200], { repsMin: 1, repsMax: 1 }), 'singles');
  assert.equal(scheme([200], {}), 'straight'); // one set of 3
  assert.equal(scheme([160, 155, 150]), 'top-backoff');
  assert.equal(scheme([160, 150]), 'top-backoff');
  assert.equal(scheme([150, 155, 160]), 'straight');
  assert.equal(scheme([150, 150, 150]), 'straight');
  assert.equal(scheme([160, 170, 150]), 'top-backoff'); // compares the first and last load only
  assert.equal(scheme([150, 140, 150]), 'straight');
  // a single-rep top set followed by backoffs of more reps
  const mixed = [pset(0, { repsMin: 1, repsMax: 1, load: kg(180) }), pset(1, { repsMin: 5, repsMax: 5, load: kg(150) })];
  assert.equal(slotOf(single('low_bar_squat', mixed)).scheme, 'top-backoff');
  // missing loads cannot show a drop
  assert.equal(slotOf(single('low_bar_squat', [pset(0), pset(1)])).scheme, 'straight');
  assert.equal(slotOf(single('low_bar_squat', [pset(0, { load: kg(100) }), pset(1)])).scheme, 'straight');
  // accessories are always 'accessory'; a lift without competition flag is a variation with the same rules
  assert.equal(slotOf(single('seated_leg_extension', sets([60, 50]))).scheme, 'accessory');
  assert.equal(slotOf(single('paused_bench', sets([100, 90]))).scheme, 'top-backoff');
  assert.equal(slotOf(single('paused_bench', [pset(0, { repsMin: 1, repsMax: 1 })])).scheme, 'singles');
});

test('roles and families across the catalogue', () => {
  const role = id => { const s = slotOf(single(id, [pset(0)])); return [s.role, s.family]; };
  assert.deepEqual(role('low_bar_squat'), ['main', 'squat']);
  assert.deepEqual(role('high_bar_squat'), ['variation', 'squat']);
  assert.deepEqual(role('deadlift'), ['main', 'deadlift']);
  assert.deepEqual(role('sumo_deadlift'), ['main', 'deadlift']);
  assert.deepEqual(role('tempo_to_knee_deadlift'), ['variation', 'deadlift']);
  assert.deepEqual(role('long_pause_bench'), ['variation', 'bench']);
  assert.deepEqual(role('romanian_deadlift'), ['accessory', null]);
  assert.deepEqual(role('hack_squat'), ['accessory', null]);
  assert.deepEqual(role('face_pull'), ['accessory', null]);
  assert.deepEqual(role('mystery_machine'), ['accessory', null]); // not in the catalogue
  const unknown = slotOf(single('mystery_machine', [pset(0)]));
  assert.equal(unknown.exerciseId, 'mystery_machine');
  assert.equal(unknown.scheme, 'accessory');
  const noId = slotOf(single(null, [pset(0)]));
  assert.equal(noId.exerciseId, null);
  assert.equal(noId.role, 'accessory');
  assert.equal(noId.family, null);
  assert.equal(noId.name, ''); // the entry has neither name nor rawName
});

test('reps, rpe and loadKg come from the first set; ranges stay ranges', () => {
  const s = slotOf(single('paused_bench', [pset(0, { repsMin: 8, repsMax: 10, targetRpe: 8.5, load: kg(90) }), pset(1, { repsMin: 5, repsMax: 5, targetRpe: 9, load: kg(70) })]));
  assert.deepEqual(s.reps, [8, 10]);
  assert.equal(s.rpe, 8.5);
  assert.equal(s.loadKg, 90);
  assert.equal(s.sets, 2);
  const first5 = slotOf(single('low_bar_squat', [pset(0, { repsMin: 5, repsMax: 5 }), pset(1, { repsMin: 3, repsMax: 3 })]));
  assert.equal(first5.reps, 5);
  assert.equal(first5.rpe, null);
  // a missing bound falls back to the other, then to actualReps, then null
  assert.equal(slotOf(single('low_bar_squat', [pset(0, { repsMin: 4, repsMax: null })])).reps, 4);
  assert.equal(slotOf(single('low_bar_squat', [pset(0, { repsMin: null, repsMax: null, actualReps: 6 })])).reps, 6);
  assert.equal(slotOf(single('low_bar_squat', [pset(0, { repsMin: null, repsMax: null })])).reps, null);
});

test('example 12: k relates the planned load to the chart', () => {
  const reference = { squat: 200, bench: 130, deadlift: 250 };
  const squat = slotOf(programme(), { referenceE1rm: reference });
  assert.equal(squat.loadKg, 160); // block 2 week 2 top set
  near(squat.k, 160 / (200 * 0.837)); // 3 reps @ 7 is 83.7%: 0.95579
  near(squat.k, 0.9558, 5e-5);
  // rpe null counts as 7; one rep at 7 is 89.2%
  const bench = learn(programme(), { referenceE1rm: reference }).days[0].slots[1];
  assert.equal(bench.rpe, null);
  near(bench.k, 100 / (130 * 0.892)); // 0.86237
  near(bench.k, 0.8624, 5e-5);
  // rpe 11 (to failure) also counts as 7
  near(slotOf(single('comp_bench', [pset(0, { repsMin: 1, repsMax: 1, targetRpe: 11, load: kg(100) })]), { referenceE1rm: reference }).k, 100 / (130 * 0.892));
  // a rep range uses its lower bound: 8 @ 8 is 73.9%
  near(slotOf(single('paused_bench', [pset(0, { repsMin: 8, repsMax: 10, targetRpe: 8, load: kg(90) })]), { referenceE1rm: reference }).k, 90 / (130 * 0.739));
  // variations use the family reference
  near(slotOf(single('high_bar_squat', [pset(0, { repsMin: 3, repsMax: 3, targetRpe: 7, load: kg(150) })]), { referenceE1rm: reference }).k, 150 / (200 * 0.837));
  // accessories get no k
  assert.equal(learn(programme(), { referenceE1rm: reference }).days[1].slots[1].k, null);
});

test('k clamps to [0.5, 1.05] and is null when anything is missing', () => {
  const at = (load, ref, o = {}) => slotOf(single('low_bar_squat', [pset(0, { repsMin: 3, repsMax: 3, targetRpe: 7, load: kg(load), ...o })]), { referenceE1rm: ref }).k;
  assert.equal(at(1.3 * 167.4, { squat: 200 }), 1.05); // 200 x 0.837 = 167.4; 217.62 / 167.4 = 1.3
  assert.equal(at(0.3 * 167.4, { squat: 200 }), 0.5); // 0.3
  near(at(1.05 * 167.4, { squat: 200 }), 1.05, 1e-9);
  near(at(0.5 * 167.4, { squat: 200 }), 0.5, 1e-9);
  assert.equal(at(160, undefined), null);
  assert.equal(at(160, null), null);
  assert.equal(at(160, {}), null);
  assert.equal(at(160, { bench: 130 }), null); // no squat reference
  assert.equal(at(160, { squat: null }), null);
  assert.equal(at(160, { squat: 0 }), null);
  assert.equal(at(160, { squat: NaN }), null);
  assert.equal(at(160, { squat: '200' }), null);
  assert.equal(slotOf(single('low_bar_squat', [pset(0, { repsMin: 3, repsMax: 3, targetRpe: 7 })]), { referenceE1rm: { squat: 200 } }).k, null); // no load
  assert.equal(at(160, { squat: 200 }, { repsMin: null, repsMax: null }), null); // no reps
  assert.equal(at(160, { squat: 200 }, { repsMin: 15, repsMax: 15 }), null); // off the chart
  assert.equal(at(160, { squat: 200 }, { targetRpe: 5 }), null); // off the chart
  // no referenceE1rm argument at all
  assert.equal(slotOf(programme()).k, null);
});

test('example 13: lb loads convert exactly into loadKg', () => {
  const lb = slotOf(single('low_bar_squat', [pset(0, { load: { value: 225, unit: 'lb' } })]));
  near(lb.loadKg, 102.05828325, 1e-9); // 225 x 0.45359237
  near(lb.loadKg, 102.0582, 1e-4); // the spec's 102.0582 is 102.05828 truncated, not rounded
  assert.equal(slotOf(single('low_bar_squat', [pset(0, { load: kg(140) })])).loadKg, 140);
  // actualLoad wins over the planned load
  const actual = slotOf(single('low_bar_squat', [pset(0, { load: kg(100), actualLoad: { value: 225, unit: 'lb' } })]));
  near(actual.loadKg, 102.05828325, 1e-9);
  // unknown unit, non-finite or non-positive loads give null without throwing
  for (const load of [{ value: 100, unit: 'stone' }, { value: NaN, unit: 'kg' }, { value: 0, unit: 'kg' }, { value: -5, unit: 'kg' }, { value: '100', unit: 'kg' }, { value: 100 }, 'heavy']) {
    assert.equal(slotOf(single('low_bar_squat', [pset(0, { load })])).loadKg, null, JSON.stringify(load));
  }
  // top-backoff across units
  const mixed = slotOf(single('low_bar_squat', [pset(0, { load: { value: 225, unit: 'lb' } }), pset(1, { load: kg(100) })]));
  assert.equal(mixed.scheme, 'top-backoff'); // 102.06 kg > 100 kg
});

test('example 14: cues are the entry cues plus up to 3 distinct coach comments cut to 160 characters', () => {
  const long = 'x'.repeat(200);
  const sets = ['  keep the chest up ', 'keep the chest up', 'brace hard', null, long, 'fourth comment', 5].map((coachComment, i) => pset(i, { coachComment }));
  const s = slotOf(single('low_bar_squat', sets, { cues: ['CHEST UP', 'SUPERSET'], tempo: '030', supersetGroup: 'A1' }));
  assert.deepEqual(s.cues, ['CHEST UP', 'SUPERSET', 'keep the chest up', 'brace hard', 'x'.repeat(160)]);
  assert.equal(s.tempo, '030');
  assert.equal(s.supersetGroup, 'A1');
  assert.deepEqual(slotOf(single('low_bar_squat', [pset(0, { coachComment: '   ' }), pset(1)])).cues, []);
  assert.deepEqual(slotOf(single('low_bar_squat', [pset(0)], { cues: ['A', 7, null] })).cues, ['A']);
  // exactly 160 characters survive, 161 are cut
  assert.equal(slotOf(single('low_bar_squat', [pset(0, { coachComment: 'y'.repeat(160) })])).cues[0].length, 160);
  assert.equal(slotOf(single('low_bar_squat', [pset(0, { coachComment: 'y'.repeat(161) })])).cues[0].length, 160);
  // the cap is on coach comments, not on entry cues
  const many = ['a', 'b', 'c', 'd', 'e'].map((coachComment, i) => pset(i, { coachComment }));
  assert.deepEqual(slotOf(single('low_bar_squat', many, { cues: ['1', '2', '3', '4'] })).cues, ['1', '2', '3', '4', 'a', 'b', 'c']);
  // tempo and supersetGroup default to null
  const bare = slotOf(single('low_bar_squat', [pset(0)], { tempo: undefined, supersetGroup: undefined }));
  assert.equal(bare.tempo, null);
  assert.equal(bare.supersetGroup, null);
});

test('example 15: no usable block gives null', () => {
  assert.equal(learn({ blocks: [] }), null);
  assert.equal(learn({ blocks: [block(1, 'A', []), block(2, 'B', [])] }), null);
  assert.equal(learn({ blocks: [{ number: 1, name: 'x' }] }), null);
  assert.equal(learn({}), null);
  assert.equal(learn(null), null);
  assert.equal(learn(undefined), null);
  assert.equal(learn({ blocks: [null, 5, { weeks: [week(1, [])] }] }), null); // no block number
  assert.equal(learn({ blocks: [block(1, 'A', [null])] }), null);
  // a block whose weeks hold no entries still counts as a block, with no days
  const hollow = learn({ blocks: [block(1, 'Hollow', [week(1, [{ number: 1, entries: [] }])])] });
  assert.equal(hollow.fromBlock, 1);
  assert.deepEqual(hollow.days, []);
  assert.equal(hollow.daysPerWeek, 0);
});

test('impossible arguments throw RangeError', () => {
  assert.throws(() => learnTemplate({ programme: programme() }), RangeError);
  assert.throws(() => learnTemplate({ programme: programme(), catalogue: {} }), RangeError);
  assert.throws(() => learnTemplate({ programme: programme(), catalogue: { exercises: 'x' } }), RangeError);
  assert.throws(() => learnTemplate(), RangeError);
  assert.throws(() => learn(programme(), { blockNumber: NaN }), RangeError);
  assert.throws(() => learn(programme(), { blockNumber: '2' }), RangeError);
});

test('inputs are never mutated and results are deterministic', () => {
  const p = deepFreeze(programme());
  const frozenCatalogue = deepFreeze(JSON.parse(JSON.stringify(catalogue)));
  const reference = deepFreeze({ squat: 200, bench: 130, deadlift: 250 });
  const first = learnTemplate({ programme: p, catalogue: frozenCatalogue, referenceE1rm: reference });
  assert.deepEqual(learnTemplate({ programme: p, catalogue: frozenCatalogue, referenceE1rm: reference }), first);
  assert.equal(first.fromBlock, 2);
  // the template does not alias input objects
  first.days[0].slots[0].cues.push('x');
  first.days[0].slots[0].name = 'changed';
  assert.equal(p.blocks[1].weeks[1].days[0].entries[0].name, 'Low Bar Squat');
  assert.deepEqual(p.blocks[1].weeks[1].days[0].entries[0].cues, []);
});
