import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateBlock, reviseBlock, fnv1a, projectedE1rm } from '../../src/core/generator.js';

// Every expected number below is worked out by hand from GENERATOR.md / tasks/LT-9b.md (comments show the sums).
// Chart values used (pctSmooth = printed chart at half steps): 3@6 .811, 3@6.5 .824, 3@7 .837, 3@7.5 .85, 3@8 .863,
// 4@7 .811, 4@7.5 .824, 4@8 .837, 4@8.5 .85, 4@9 .863, 5@7 .786, 5@8 .811, 1@8 .922. Loads round to 2.5 kg, ties up.

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}

const catalogue = deepFreeze(JSON.parse(readFileSync(new URL('../../data/exercises.json', import.meta.url), 'utf8')));
const byId = new Map(catalogue.exercises.map((e) => [e.id, e]));
const NOW = () => new Date('2026-10-04T00:00:00Z');
const FIND_LOAD = 'Find a load that reaches the target effort inside the rep range.';
const TOP_OF_RANGE = 'When every set reaches the top of the rep range, go up one step next week.';

// Template fixtures in the Slot shape of GENERATOR.md (built by hand; template.js is not imported).
function slot(slotId, exerciseId, role, o = {}) {
  const ex = byId.get(exerciseId);
  return {
    slotId, exerciseId, name: ex?.name ?? String(exerciseId), supersetGroup: null, tempo: null, cues: o.cues ?? [],
    role, family: role === 'accessory' ? null : ex?.lift ?? null,
    scheme: role === 'accessory' ? 'accessory' : o.scheme ?? (role === 'main' ? 'top-backoff' : 'straight'),
    sets: o.sets ?? 3, reps: o.reps ?? 3, rpe: o.rpe === undefined ? 7 : o.rpe, loadKg: o.loadKg ?? null,
    k: role === 'accessory' ? null : o.k ?? (role === 'main' ? 1 : null),
  };
}
const main = (id, ex, o) => slot(id, ex, 'main', o);
const variation = (id, ex, o) => slot(id, ex, 'variation', o);
const acc = (id, ex, o) => slot(id, ex, 'accessory', { reps: [8, 12], rpe: 9, ...o });
const template = (days, extra = {}) => deepFreeze({ fromBlock: 13, blockName: 'Priming', weeksInBlock: 5, daysPerWeek: days.length,
  days: days.map((slots, i) => ({ number: i + 1, slots })), ...extra });

// AthleteModel fixture (athlete.js is not imported).
function athlete({ squat = 180, bench = 130, deadlift = 220, bias = {}, exercises = {}, confidence = 'high', stance = null } = {}) {
  const lift = (f, e1rmKg) => ({ e1rmKg, n: e1rmKg == null ? 0 : 9, confidence: e1rmKg == null ? 'none' : confidence,
    basis: `top 3 of 9 sets at RPE 6-10 in the last 8 weeks (${f})`, sources: [] });
  return deepFreeze({ asOf: '2026-09-30',
    lifts: { squat: lift('squat', squat), bench: lift('bench', bench), deadlift: { ...lift('deadlift', deadlift), stance } },
    rpeBias: { squat: 0, bench: 0, deadlift: 0, ...bias }, exercises });
}

const ATHLETE = athlete();
const FIXTURE_A = template([[main('d1s1', 'low_bar_squat', { sets: 3, reps: 3, rpe: 7 })]]);
const A_OPTS = { template: FIXTURE_A, weeks: 5, focus: 'strength', progression: 'standard', deloadWeek: 'none' };
const run = (o) => generateBlock({ catalogue, blockNumber: 14, now: NOW, athlete: ATHLETE, ...o });
const entry = (r, w, d = 1, e = 0) => r.block.weeks[w - 1].days[d - 1].entries[e];
const loads = (r, w, d, e) => entry(r, w, d, e).sets.map((s) => (s.load ? s.load.value : null));
const field = (r, w, key, d, e) => entry(r, w, d, e).sets.map((s) => s[key]);
const kinds = (r, w, d, e) => entry(r, w, d, e).sets.map((s) => s.gen.kind);
const ids = (r, w = 1, d = 1) => r.block.weeks[w - 1].days[d - 1].entries.map((e) => e.exerciseId);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('examples 1-3: the primary squat slot follows the strength wave', () => {
  const r = run(A_OPTS);
  // w1 RPE 7: 180 x .837 = 150.66 -> 150; x .97 = 146.14 -> 145; x .94 = 141.62 -> 142.5
  assert.deepEqual(loads(r, 1), [150, 145, 142.5]);
  assert.deepEqual(field(r, 1, 'targetRpe'), [7, 7, 7]);
  assert.deepEqual(kinds(r, 1), ['top', 'backoff', 'backoff']);
  // w2 RPE 7.5: E 180.72 x .85 = 153.61 -> 152.5; 149.00 -> 150; 144.40 -> 145
  assert.deepEqual(loads(r, 2), [152.5, 150, 145]);
  assert.deepEqual(field(r, 2, 'targetRpe'), [7.5, 7.5, 7.5]);
  // w3 RPE 8: E 181.4429 x .863 = 156.59 -> 157.5; 151.89 -> 152.5; 147.19 -> 147.5
  // w4/w5 RPE stays 8 (r0 + 1): 182.1687 x .863 = 157.21, 182.897 x .863 = 157.84 -> 157.5; back-offs 152.5 / 147.5
  for (const w of [3, 4, 5]) {
    assert.deepEqual(loads(r, w), [157.5, 152.5, 147.5], `week ${w}`);
    assert.deepEqual(field(r, w, 'targetRpe'), [8, 8, 8], `week ${w}`);
  }
  assert.deepEqual(entry(r, 2).sets[0].gen,
    { slotId: 'd1s1', kind: 'top', family: 'squat', reps: 3, rpe: 7.5, e1rmRef: 180.7, k: 1, week: 2, exposure: 'primary' });
  assert.deepEqual(field(r, 1, 'repsRaw'), ['3', '3', '3']);
});

test('example 4: week labels and targets use E(f, w) rounded to 2.5 kg', () => {
  const wk = (w) => run(A_OPTS).block.weeks[w - 1];
  assert.equal(wk(1).label, 'Week 1 - 180/130/220 [530kg]');
  // E(squat, 2) 180.72 -> 180, bench 130.52 -> 130, deadlift 220.88 -> 220
  assert.equal(wk(2).label, 'Week 2 - 180/130/220 [530kg]');
  // 181.44 -> 182.5, 131.04 -> 130, 221.76 -> 222.5
  assert.equal(wk(3).label, 'Week 3 - 182.5/130/222.5 [535kg]');
  assert.deepEqual(wk(1).target, { squat: 180, bench: 130, deadlift: 220, total: 530 });
  assert.deepEqual(wk(3).target, { squat: 182.5, bench: 130, deadlift: 222.5, total: 535 });
});

test('example 5: a secondary squat slot holds RPE 7 at E(f, 1) all block', () => {
  const t = template([[main('d1s1', 'low_bar_squat', { sets: 3, reps: 3, rpe: 7 })],
    [main('d2s1', 'low_bar_squat', { scheme: 'straight', sets: 2, reps: 4, rpe: 7 })]]);
  const r = run({ ...A_OPTS, template: t });
  for (let w = 1; w <= 5; w++) {
    // 180 x pctSmooth(4, 7) = 180 x .811 = 145.98 -> 145
    assert.deepEqual(loads(r, w, 2), [145, 145], `week ${w}`);
    assert.deepEqual(kinds(r, w, 2), ['straight', 'straight']);
    assert.deepEqual(field(r, w, 'targetRpe', 2), [7, 7]);
    assert.equal(entry(r, w, 2).sets[0].gen.exposure, 'secondary');
  }
  assert.equal(loads(r, 3, 1)[0], 157.5); // the 3-rep slot is primary (3 < 4) and keeps the wave
});

test('example 6: a last-week deload cuts sets, drops 1 RPE and uses E(f, w-1)', () => {
  const r = run({ ...A_OPTS, weeks: 6, deloadWeek: 'last' });
  assert.equal(r.block.weeks[5].label, 'Week 6 - Deload');
  // sets max(1, round(3 x .6)) = 2; rpe max(6, 8 - 1) = 7; E(5) = 182.897 x .837 = 153.09 -> 152.5; x .97 = 148.49 -> 147.5
  assert.deepEqual(loads(r, 6), [152.5, 147.5]);
  assert.deepEqual(kinds(r, 6), ['top', 'backoff']);
  assert.deepEqual(field(r, 6, 'targetRpe'), [7, 7]);
  assert.equal(entry(r, 6).sets[0].gen.e1rmRef, 182.9);
  assert.deepEqual(loads(r, 5), [157.5, 152.5, 147.5]);
  assert.ok(r.rationale.some((l) => /Week 6 is a deload/.test(l.text)));
});

test('example 7: RPE bias shifts the chart RPE, clamped to +-0.5', () => {
  const t = template([[main('d1s1', 'comp_bench', { sets: 3, reps: 4, rpe: 8 })]]);
  // -0.5: RPE 8.5 -> 130 x .85 = 110.5 -> 110; 0: .837 -> 108.81 -> 110; +0.5: RPE 7.5 -> .824 -> 107.12 -> 107.5
  // -1 is clamped to -0.5 (unclamped would be RPE 9: 130 x .863 = 112.19 -> 112.5)
  for (const [bias, top] of [[-0.5, 110], [0, 110], [0.5, 107.5], [-1, 110]]) {
    const r = run({ ...A_OPTS, template: t, athlete: athlete({ bias: { bench: bias } }) });
    assert.equal(loads(r, 1)[0], top, `bias ${bias}`);
    assert.equal(entry(r, 1).sets[0].targetRpe, 8);
  }
  const biased = run({ ...A_OPTS, template: t, athlete: athlete({ bias: { bench: -0.5 } }) });
  assert.ok(biased.rationale.some((l) => /Bench: you usually rate sets 0.5 RPE below/.test(l.text)));
});

test('example 8: a variation uses its own k with the family wave', () => {
  const t = template([[main('d1s1', 'comp_bench', { sets: 3, reps: 4, rpe: 8 }),
    variation('d1s2', 'paused_bench', { sets: 3, reps: 5, rpe: 8, k: 0.95 })]]);
  const r = run({ ...A_OPTS, template: t });
  // 130 x .811 x .95 = 100.16 -> 100
  assert.deepEqual(loads(r, 1, 1, 1), [100, 100, 100]);
  assert.deepEqual(kinds(r, 1, 1, 1), ['straight', 'straight', 'straight']);
  assert.equal(entry(r, 1, 1, 1).sets[0].gen.k, 0.95);
  // Reading taken: with no bench main slot the variation follows the secondary rule (RPE 7, E(f, 1)):
  // 130 x pctSmooth(5, 7) x .95 = 130 x .786 x .95 = 97.07 -> 97.5
  const alone = run({ ...A_OPTS, template: template([[variation('d1s1', 'paused_bench', { sets: 3, reps: 5, rpe: 8, k: 0.95 })]]) });
  assert.deepEqual(loads(alone, 3), [97.5, 97.5, 97.5]);
  assert.deepEqual(field(alone, 3, 'targetRpe'), [7, 7, 7]);
});

test('example 9: a missing e1RM leaves that family blank, warns, and keeps other loads', () => {
  const t = template([[main('d1s1', 'low_bar_squat'), main('d1s2', 'comp_bench', { reps: 4, rpe: 8 }), main('d1s3', 'conventional_deadlift'),
    acc('d1s4', 'seated_leg_extension', { sets: 2, reps: [10, 15], loadKg: 50 })]]);
  const r = run({ ...A_OPTS, template: t, athlete: athlete({ bench: null }), rotate: 0 });
  for (let w = 1; w <= 5; w++) {
    assert.deepEqual(loads(r, w, 1, 1), [null, null, null], `week ${w}`);
    assert.deepEqual(loads(r, w, 1, 3), [50, 50]);
  }
  assert.equal(loads(r, 1, 1, 0)[0], 150);
  assert.ok(r.warnings.some((x) => /bench/.test(x) && /e1RM/.test(x)));
  assert.equal(r.block.weeks[0].label, 'Week 1 - 180/-/220 [400kg]');
  assert.deepEqual(r.block.weeks[0].target, { squat: 180, bench: null, deadlift: 220, total: 400 });
  const none = run({ ...A_OPTS, template: t, athlete: athlete({ squat: null, bench: null, deadlift: null }), rotate: 0 });
  assert.equal(none.block.weeks[0].label, 'Week 1');
  assert.deepEqual(none.block.weeks[0].target, { squat: null, bench: null, deadlift: null, total: null });
  assert.deepEqual(loads(none, 1, 1, 3), [50, 50]);
  assert.equal(none.warnings.filter((x) => /e1RM/.test(x)).length, 3);
});

test('example 10: accessory loads come from history, then the template, else blank with a cue', () => {
  const t = template([[acc('d1s1', 'seated_hamstring_curl', { sets: 2, reps: [6, 10], rpe: 11, loadKg: 60 })]]);
  const hist = { seated_hamstring_curl: { lastDate: '2026-09-28', lastWeightKg: 65, lastReps: 8, lastRpe: 10, count: 12, bestE1rmKg: 80 } };
  const r = run({ ...A_OPTS, template: t, athlete: athlete({ exercises: hist }), rotate: 0 });
  for (let w = 1; w <= 5; w++) {
    assert.deepEqual(loads(r, w), [65, 65]);
    assert.deepEqual(field(r, w, 'repsMin'), [6, 6]);
    assert.deepEqual(field(r, w, 'repsMax'), [10, 10]);
    assert.deepEqual(field(r, w, 'repsRaw'), ['6-10', '6-10']);
    assert.deepEqual(field(r, w, 'targetRpe'), [11, 11]);
    assert.deepEqual(kinds(r, w), ['accessory', 'accessory']);
  }
  assert.ok(entry(r, 1).cues.includes(TOP_OF_RANGE));
  assert.ok(!entry(r, 1).cues.includes(FIND_LOAD));
  assert.deepEqual(loads(run({ ...A_OPTS, template: t, rotate: 0 }), 3), [60, 60]);
  const blank = run({ ...A_OPTS, template: template([[acc('d1s1', 'seated_hamstring_curl', { sets: 2, reps: [6, 10], rpe: 11 })]]), rotate: 0 });
  assert.deepEqual(loads(blank, 1), [null, null]);
  assert.ok(entry(blank, 1).cues.includes(FIND_LOAD));
});

test('example 11: accessory rotation and the FNV-1a hash', () => {
  assert.equal(fnv1a(''), 0x811c9dc5);
  assert.equal(fnv1a(''), 2166136261);
  assert.equal(fnv1a('a'), 0xe40c292c);
  assert.equal(fnv1a('a'), 3826002220);

  const t = template([[acc('d1s1', 'seated_leg_extension'), acc('d1s2', 'seated_hamstring_curl'), acc('d1s3', 'cable_tricep_pushdown')]]);
  const full = run({ ...A_OPTS, template: t, rotate: 1 });
  // leg extension: only member of quad-isolation; curl -> lying_leg_curl; triceps -> first never-done alternative in catalogue order
  assert.deepEqual(ids(full), ['seated_leg_extension', 'lying_leg_curl', 'overhead_cable_tricep_extension']);
  assert.equal(entry(full, 1, 1, 1).name, 'Lying Leg Curl');
  assert.ok(full.rationale.some((l) => l.scope === 'slot' && /Lying Leg Curl/.test(l.text)));

  const h = (id, lastDate, lastWeightKg) => ({ [id]: { lastDate, lastWeightKg, lastReps: 10, lastRpe: 9, count: 6, bestE1rmKg: null } });
  // A recently done alternative is chosen only when no never-done one exists
  const doneOne = run({ ...A_OPTS, template: t, rotate: 1, athlete: athlete({ exercises: h('overhead_cable_tricep_extension', '2026-09-01', 25) }) });
  assert.equal(ids(doneOne)[2], 'skullcrusher');
  assert.deepEqual(loads(doneOne, 1, 1, 2), [null, null, null]);
  assert.ok(entry(doneOne, 1, 1, 2).cues.includes(FIND_LOAD));
  // Both done: the oldest lastDate wins; the load is the athlete's last weight for the new exercise
  const both = (a, b) => athlete({ exercises: { ...h('overhead_cable_tricep_extension', a, 25), ...h('skullcrusher', b, 30) } });
  const r1 = run({ ...A_OPTS, template: t, rotate: 1, athlete: both('2026-09-20', '2026-08-01') });
  assert.equal(ids(r1)[2], 'skullcrusher');
  assert.deepEqual(loads(r1, 1, 1, 2), [30, 30, 30]);
  const r2 = run({ ...A_OPTS, template: t, rotate: 1, athlete: both('2026-08-01', '2026-09-20') });
  assert.equal(ids(r2)[2], 'overhead_cable_tricep_extension');
  assert.deepEqual(loads(r2, 1, 1, 2), [25, 25, 25]);

  // Never an exercise already in the block
  const two = run({ ...A_OPTS, rotate: 1, template: template([[acc('d1s1', 'cable_tricep_pushdown'), acc('d1s2', 'overhead_cable_tricep_extension')]]) });
  const got = ids(two);
  assert.equal(new Set(got).size, 2);
  assert.ok(got.includes('skullcrusher'));
  assert.equal(got.filter((id) => id === 'cable_tricep_pushdown' || id === 'overhead_cable_tricep_extension').length, 1);

  // Deterministic per seed; another seed changes only which slots rotate, never what a rotated slot becomes
  const original = ids(run({ ...A_OPTS, template: t, rotate: 0 }));
  const target = ids(full);
  const subsets = new Set();
  for (let i = 0; i < 20; i++) {
    const a = run({ ...A_OPTS, template: t, rotate: 0.5, seed: `s${i}` });
    assert.deepEqual(a, run({ ...A_OPTS, template: t, rotate: 0.5, seed: `s${i}` }));
    const got2 = ids(a);
    got2.forEach((id, j) => assert.ok(id === original[j] || id === target[j]));
    subsets.add(got2.map((id, j) => (id === original[j] ? 0 : 1)).join(''));
  }
  assert.ok(subsets.size > 1, 'different seeds should rotate different slots');
});

const T12 = template([
  [main('d1s1', 'low_bar_squat'), variation('d1s2', 'high_bar_squat', { reps: 5, k: 0.85 }), acc('d1s3', 'seated_leg_extension'), acc('d1s4', 'seated_hamstring_curl')],
  [main('d2s1', 'comp_bench', { reps: 4, rpe: 8 }), variation('d2s2', 'paused_bench', { reps: 5, rpe: 8, k: 0.95 }), acc('d2s3', 'cable_tricep_pushdown')],
  [main('d3s1', 'conventional_deadlift'), variation('d3s2', 'tempo_to_knee_deadlift', { k: 0.8 }), acc('d3s3', 'romanian_deadlift'), acc('d3s4', 'chest_supported_row')],
  [main('d4s1', 'comp_bench', { scheme: 'singles', sets: 1, reps: 1, rpe: 8 }), acc('d4s2', 'lat_pulldown')],
], { weeksInBlock: 4 });

test('example 12: dropping a day keeps the highest-priority days and rehomes a lone pattern', () => {
  // scores: D1 3+2+1+1 = 7, D2 3+2+1 = 6, D3 7, D4 3+1 = 4 -> drop D4; lat_pulldown (vertical-pull) goes to D2 (3 slots, the fewest)
  const r = run({ template: T12, weeks: 4, daysPerWeek: 3, rotate: 0, deloadWeek: 'none' });
  const days = r.block.weeks[0].days;
  assert.deepEqual(days.map((d) => d.number), [1, 2, 3]);
  assert.deepEqual(ids(r, 1, 1), ['low_bar_squat', 'high_bar_squat', 'seated_leg_extension', 'seated_hamstring_curl']);
  assert.deepEqual(ids(r, 1, 2), ['comp_bench', 'paused_bench', 'cable_tricep_pushdown', 'lat_pulldown']);
  assert.deepEqual(ids(r, 1, 3), ['conventional_deadlift', 'tempo_to_knee_deadlift', 'romanian_deadlift', 'chest_supported_row']);
  assert.ok(r.rationale.some((l) => l.scope === 'day' && /Dropped template day 4/.test(l.text)));
  assert.ok(r.rationale.some((l) => /Moved Lat Pulldown/.test(l.text)));
  assert.equal(r.block.generated.daysPerWeek, 3);
  // The dropped single was the bench primary; the day-2 bench slot takes over the wave (week 2: min(8.5, 9, 8.5) = 8.5)
  assert.equal(entry(r, 2, 2, 0).sets[0].gen.exposure, 'primary');
  assert.equal(entry(r, 2, 2, 0).sets[0].targetRpe, 8.5);

  const more = run({ template: T12, weeks: 4, daysPerWeek: 5, rotate: 0 });
  assert.equal(more.block.weeks[0].days.length, 4);
  assert.ok(more.warnings.some((x) => /5 days a week/.test(x)));
});

test('example 13: deadlift stance swaps', () => {
  const conv = template([[main('d1s1', 'conventional_deadlift'), variation('d1s2', 'tempo_to_knee_deadlift', { k: 0.8 }),
    variation('d1s3', 'cluster_sumo_deadlift', { k: 0.85 })]]);
  const sumo = run({ ...A_OPTS, template: conv, deadliftStance: 'sumo' });
  assert.deepEqual(ids(sumo), ['sumo_deadlift', 'tempo_to_knee_sumo_deadlift', 'cluster_sumo_deadlift']);
  assert.equal(entry(sumo, 1).name, 'Sumo Deadlift');
  assert.equal(sumo.rationale.filter((l) => /sumo stance/.test(l.text)).length, 2);
  const s = template([[main('d1s1', 'sumo_deadlift'), variation('d1s2', 'tempo_to_knee_sumo_deadlift', { k: 0.8 }),
    variation('d1s3', 'cluster_sumo_deadlift', { k: 0.85 }), main('d1s4', 'deadlift')]]);
  assert.deepEqual(ids(run({ ...A_OPTS, template: s, deadliftStance: 'conventional' })),
    ['conventional_deadlift', 'tempo_to_knee_deadlift', 'cluster_sumo_deadlift', 'conventional_deadlift']);
  const sumoAthlete = athlete({ stance: 'sumo' });
  assert.deepEqual(ids(run({ ...A_OPTS, template: conv, athlete: sumoAthlete, deadliftStance: null })),
    ['conventional_deadlift', 'tempo_to_knee_deadlift', 'cluster_sumo_deadlift']);
  assert.deepEqual(ids(run({ ...A_OPTS, template: conv, athlete: sumoAthlete }))[0], 'sumo_deadlift'); // default from the athlete
});

test('example 14: focus volume adds mid-block sets; focus peak sharpens the final full week', () => {
  const v = run({ ...A_OPTS, focus: 'volume' });
  assert.deepEqual([1, 2, 3, 4, 5].map((w) => entry(v, w).sets.length), [3, 4, 4, 4, 3]);
  for (let w = 1; w <= 5; w++) assert.ok(field(v, w, 'targetRpe').every((x) => x === 7));
  // g = .004 x .75 = .003: E(2) = 180.54 x .837 = 151.11 -> 150; x .97 146.58 -> 147.5; x .94 142.05 -> 142.5; x .91 137.51 -> 137.5
  assert.deepEqual(loads(v, 2), [150, 147.5, 142.5, 137.5]);
  const six = run({ ...A_OPTS, focus: 'volume', template: template([[main('d1s1', 'low_bar_squat', { sets: 6 })]]) });
  assert.equal(entry(six, 2).sets.length, 6);

  const t = template([[main('d1s1', 'low_bar_squat'), main('d1s2', 'comp_bench', { scheme: 'singles', sets: 2, reps: 1, rpe: 8 }),
    variation('d1s3', 'paused_bench', { sets: 3, reps: 5, rpe: 8, k: 0.95 }), acc('d1s4', 'seated_leg_extension', { sets: 3 })]]);
  const p = run({ template: t, weeks: 4, focus: 'peak', deloadWeek: 'none', rotate: 0 });
  // singles: weeks 1-2 RPE 8, week 3 8.5, final full week 9
  assert.deepEqual([1, 2, 3, 4].map((w) => entry(p, w, 1, 1).sets[0].targetRpe), [8, 8, 8.5, 9]);
  assert.deepEqual(kinds(p, 4, 1, 1), ['single', 'single']);
  // squat top: 7, 7.5, 8, then the final full week 8 + .5 = 8.5
  assert.deepEqual([1, 2, 3, 4].map((w) => entry(p, w, 1, 0).sets[0].targetRpe), [7, 7.5, 8, 8.5]);
  assert.deepEqual([1, 2, 3, 4].map((w) => entry(p, w, 1, 2).sets.length), [3, 3, 3, 2]);
  assert.deepEqual([1, 2, 3, 4].map((w) => entry(p, w, 1, 3).sets.length), [3, 3, 3, 2]);
  const p6 = run({ template: t, weeks: 6, focus: 'peak', rotate: 0 });
  assert.equal(p6.block.generated.deloadWeek, 'last');
  assert.deepEqual([4, 5].map((w) => entry(p6, w, 1, 2).sets.length), [3, 2]);
  assert.equal(entry(p6, 5, 1, 1).sets[0].targetRpe, 9);
});

test('example 15: weekly hard sets per muscle and volume warnings', () => {
  const t = template([[main('d1s1', 'low_bar_squat', { sets: 3, reps: 3, rpe: 7 }), acc('d1s2', 'seated_leg_extension', { sets: 2, reps: [10, 15] })]]);
  const r = run({ ...A_OPTS, template: t, rotate: 0 });
  const m = r.volume.perWeek[0].muscles;
  // squat 3 sets: quads/glutes 1 each, adductors/hamstrings/lower_back/abs .5 each; extension 2 sets: quads 1
  assert.equal(m.quads, 5);
  assert.equal(m.glutes, 3);
  for (const k of ['adductors', 'hamstrings', 'lower_back', 'abs']) assert.equal(m[k], 1.5, k);
  assert.equal(m.chest, 0);
  assert.equal(r.volume.perWeek.length, 5);
  assert.deepEqual(r.volume.perWeek.map((p) => p.week), [1, 2, 3, 4, 5]);
  assert.equal(r.volume.typical.quads, 5);
  assert.ok(!r.warnings.some((x) => /volume changes/.test(x)));
  assert.ok(r.warnings.includes('quads is under 6 hard sets per week'));
  assert.ok(r.warnings.includes('upper back is under 6 hard sets per week'));
  // return week 2: squat 2 sets + extension 1 set -> quads 3 vs 5 (-40%); glutes 3 is below 4 so not compared
  const ret = run({ ...A_OPTS, template: t, focus: 'return', rotate: 0 });
  assert.ok(ret.warnings.includes('quads volume changes from 5 to 3 sets per week'));
  assert.ok(!ret.warnings.some((x) => /^glutes volume changes/.test(x)));
});

test('example 16: reviseBlock re-loads the weeks not done yet', () => {
  const t = template([[main('d1s1', 'low_bar_squat', { sets: 3, reps: 3, rpe: 7 }),
    acc('d1s2', 'seated_leg_extension', { sets: 2, reps: [10, 15], loadKg: 50 })]]);
  const generated = structuredClone(run({ ...A_OPTS, template: t, rotate: 0 }).block);
  for (const d of generated.weeks[0].days) for (const e of d.entries) for (const s of e.sets) s.completed = true;
  const input = deepFreeze(generated);
  const { block, changes } = reviseBlock({ block: input, athlete: athlete({ squat: 190 }), catalogue, fromWeek: 2 });
  const top = (w) => block.weeks[w - 1].days[0].entries[0].sets.map((s) => s.load.value);
  // w2: 190 x .85 = 161.5 -> 162.5; 156.66 -> 157.5; 151.81 -> 152.5
  assert.deepEqual(top(2), [162.5, 157.5, 152.5]);
  // w3: 190 x 1.004 x .863 = 164.63 -> 165; 159.69 -> 160; 154.75 -> 155. w4: 191.52 x .863 = 165.28 -> 165; w5: 192.29 x .863 = 165.95 -> 165
  for (const w of [3, 4, 5]) assert.deepEqual(top(w), [165, 160, 155], `week ${w}`);
  assert.deepEqual(block.weeks[0], input.weeks[0]);
  for (let w = 0; w < 5; w++) assert.deepEqual(block.weeks[w].days[0].entries[1], input.weeks[w].days[0].entries[1]);
  assert.equal(block.weeks[1].days[0].entries[0].sets[0].gen.e1rmRef, 190);
  assert.equal(block.weeks[2].days[0].entries[0].sets[0].gen.e1rmRef, 190.8);
  const c = (week, setIndex, from, to) => ({ week, day: 1, exerciseId: 'low_bar_squat', setIndex, from, to });
  assert.deepEqual(changes, [
    c(2, 1, 152.5, 162.5), c(2, 2, 150, 157.5), c(2, 3, 145, 152.5),
    c(3, 1, 157.5, 165), c(3, 2, 152.5, 160), c(3, 3, 147.5, 155),
    c(4, 1, 157.5, 165), c(4, 2, 152.5, 160), c(4, 3, 147.5, 155),
    c(5, 1, 157.5, 165), c(5, 2, 152.5, 160), c(5, 3, 147.5, 155),
  ]);
  const same = reviseBlock({ block: input, athlete: athlete({ squat: null }), catalogue, fromWeek: 2 });
  assert.deepEqual(same.block, input);
  assert.deepEqual(same.changes, []);
  assert.throws(() => reviseBlock({ block: { weeks: [] }, athlete: ATHLETE, fromWeek: 2 }), RangeError);
  assert.throws(() => reviseBlock({ block: input, athlete: ATHLETE, fromWeek: 0 }), RangeError);
});

const SET_KEYS = ['actualLoad', 'actualReps', 'actualRpe', 'athleteComment', 'coachComment', 'completed', 'gen', 'index', 'load',
  'loadRange', 'repsMax', 'repsMin', 'repsRaw', 'source', 'targetRpe', 'warnings'];

function assertProgrammeShape(block) {
  assert.ok(block.weeks.length > 0);
  block.weeks.forEach((wk, wi) => {
    assert.equal(wk.number, wi + 1);
    assert.equal(typeof wk.label, 'string');
    assert.deepEqual(Object.keys(wk.target).sort(), ['bench', 'deadlift', 'squat', 'total']);
    assert.equal(wk.avgCalories, null);
    assert.equal(wk.avgBodyweightKg, null);
    assert.deepEqual(wk.bodyLog, []);
    assert.ok(wk.days.length > 0);
    wk.days.forEach((d, di) => {
      assert.equal(d.number, di + 1);
      assert.ok(d.entries.length > 0);
      for (const e of d.entries) {
        assert.deepEqual(Object.keys(e).sort(), ['cues', 'exerciseId', 'name', 'rawName', 'sets', 'supersetGroup', 'tempo']);
        assert.equal(e.rawName, e.name);
        assert.ok(Array.isArray(e.cues) && e.sets.length > 0);
        e.sets.forEach((s, si) => {
          assert.deepEqual(Object.keys(s).sort(), SET_KEYS);
          assert.equal(s.index, si + 1);
          for (const k of ['loadRange', 'actualRpe', 'actualReps', 'actualLoad', 'coachComment', 'athleteComment']) assert.equal(s[k], null, k);
          assert.equal(s.completed, false);
          assert.deepEqual(s.source, { sheet: 'generated', row: 0, col: 0 });
          assert.deepEqual(s.warnings, []);
          assert.ok(s.load === null || (s.load.unit === 'kg' && s.load.raw === String(s.load.value) && Number.isFinite(s.load.value)));
          assert.equal(s.gen.week, wk.number);
          assert.ok(['top', 'backoff', 'single', 'straight', 'accessory'].includes(s.gen.kind));
        });
      }
    });
  });
}

test('example 17: deterministic, inputs untouched, metadata and Programme-model shape', () => {
  const r = run(A_OPTS);
  assertProgrammeShape(r.block);
  assert.equal(r.block.id, 'b14');
  assert.equal(r.block.number, 14);
  assert.equal(r.block.name, 'Block 14 Strength');
  assert.equal(r.block.instructions, 'Generated by the app from your recent training. Every number is a suggestion: change anything that does not fit.');
  assert.deepEqual(r.block.generated, {
    at: '2026-10-04T00:00:00.000Z', focus: 'strength', weeks: 5, daysPerWeek: 1, progression: 'standard', rotate: 0.3, seed: 'seed',
    deloadWeek: 'none', fromBlock: 13, athleteAsOf: '2026-09-30', e1rmStart: { squat: 180, bench: 130, deadlift: 220 },
    confidence: { squat: 'high', bench: 'high', deadlift: 'high' }, emphasis: null, layoffWeeks: null, checkIn: null, deadliftStance: null,
  });
  assert.ok(r.rationale.some((l) => l.text === 'Squat e1RM 180.0 kg: top 3 of 9 sets at RPE 6-10 in the last 8 weeks (squat)'));
  assert.ok(r.rationale.every((l) => ['block', 'week', 'day', 'slot'].includes(l.scope) && typeof l.text === 'string'));

  // Inputs are deep-frozen: any mutation would throw. Same inputs and seed -> deep-equal output.
  const o = { template: T12, weeks: 6, seed: 'abc' };
  const r1 = run(o);
  assertProgrammeShape(r1.block);
  assert.deepEqual(run(o), r1);
  const later = run({ ...o, now: () => new Date('2027-01-01T00:00:00Z') });
  assert.equal(later.block.generated.at, '2027-01-01T00:00:00.000Z');
  assert.deepEqual({ ...later, block: { ...later.block, generated: { ...later.block.generated, at: r1.block.generated.at } } }, r1);
  // Fresh objects: changing the output does not leak into a later run
  r1.block.weeks[0].days[0].entries[0].sets[0].gen.reps = 99;
  assert.notEqual(run(o).block.weeks[0].days[0].entries[0].sets[0].gen.reps, 99);
});

test('unknown exercise ids are kept as accessories with their own name', () => {
  const extra = { supersetGroup: null, tempo: null, cues: [] };
  const t = template([[main('d1s1', 'low_bar_squat'),
    { ...extra, slotId: 'd1s2', exerciseId: 'mystery_press', name: 'Mystery Press', role: 'main', family: 'bench', scheme: 'top-backoff', sets: 3, reps: 5, rpe: 8, loadKg: 40, k: 1 },
    { ...extra, slotId: 'd1s3', exerciseId: null, name: 'Band Pull Apart', role: 'accessory', family: null, scheme: 'accessory', sets: 2, reps: [15, 20], rpe: null, loadKg: null, k: null }]]);
  const r = run({ ...A_OPTS, template: t, rotate: 1 });
  assert.equal(entry(r, 1, 1, 1).exerciseId, 'mystery_press');
  assert.equal(entry(r, 1, 1, 1).name, 'Mystery Press');
  assert.deepEqual(loads(r, 1, 1, 1), [40, 40, 40]);
  assert.deepEqual(kinds(r, 1, 1, 1), ['accessory', 'accessory', 'accessory']);
  assert.equal(entry(r, 1, 1, 2).name, 'Band Pull Apart');
  assert.deepEqual(loads(r, 1, 1, 2), [null, null]);
  assert.ok(entry(r, 1, 1, 2).cues.includes(FIND_LOAD));
});

test('example 18: impossible arguments throw RangeError with a useful message', () => {
  const bad = [
    [{ catalogue: undefined }, /catalogue/], [{ template: undefined }, /template/], [{ athlete: undefined }, /athlete/],
    [{ weeks: 2.5 }, /weeks/], [{ weeks: 0 }, /weeks/], [{ focus: 'bulk' }, /focus/], [{ progression: 'fast' }, /progression/],
    [{ deloadWeek: 'first' }, /deloadWeek/], [{ daysPerWeek: 0 }, /daysPerWeek/], [{ daysPerWeek: 8 }, /daysPerWeek/],
    [{ daysPerWeek: 2.5 }, /daysPerWeek/], [{ rotate: -0.1 }, /rotate/], [{ rotate: 1.1 }, /rotate/], [{ rotate: NaN }, /rotate/],
    [{ rotate: '0.5' }, /rotate/], [{ blockNumber: 0 }, /blockNumber/], [{ deadliftStance: 'hybrid' }, /deadliftStance/],
  ];
  for (const [o, re] of bad) {
    assert.throws(() => run({ ...A_OPTS, ...o }), (err) => err instanceof RangeError && re.test(err.message), JSON.stringify(o));
  }
  assert.throws(() => projectedE1rm(180, 'fast', 'strength', 1), RangeError);
});

test('projectedE1rm is E(f, w)', () => {
  near(projectedE1rm(180, 'standard', 'strength', 3), 181.44288); // 180 x 1.004^2
  near(projectedE1rm(180, 'aggressive', 'peak', 2), 181.08); // x 1.006
  near(projectedE1rm(180, 'standard', 'volume', 2), 180.54); // g x .75
  near(projectedE1rm(180, 'standard', 'maintenance', 4), 180);
  near(projectedE1rm(180, 'standard', 'return', 1, { weeks: 4, layoffWeeks: 6 }), 169.2);
  near(projectedE1rm(180, 'standard', 'return', 1, { weeks: 4, layoffWeeks: 30 }), 144);
  near(projectedE1rm(180, 'standard', 'return', 1, { weeks: 1, layoffWeeks: 6 }), 169.2); // n = 1 uses s
  assert.equal(projectedE1rm(null, 'standard', 'strength', 1), null);
});

test('example 19: maintenance holds e1RM with fewer sets and a check-in single', () => {
  const r = run({ template: FIXTURE_A, focus: 'maintenance', weeks: 4 });
  for (let w = 1; w <= 4; w++) assert.equal(r.block.weeks[w - 1].label, `Week ${w} - 180/130/220 [530kg]`);
  // 2 sets (max(2, round(3 x .67))), RPE 7.5: 180 x .85 = 153.0 -> 152.5; x .97 = 148.41 -> 147.5
  const strip = (res, w) => JSON.parse(JSON.stringify(res.block.weeks[w - 1].days, (k, v) => (k === 'week' ? undefined : v)));
  for (const w of [1, 2, 3]) {
    assert.deepEqual(loads(r, w), [152.5, 147.5]);
    assert.deepEqual(field(r, w, 'repsMin'), [3, 3]);
    assert.deepEqual(field(r, w, 'targetRpe'), [7.5, 7.5]);
  }
  assert.deepEqual(strip(r, 1), strip(r, 3));
  // week 4 check-in: 180 x pctSmooth(1, 8) = 180 x .922 = 165.96 -> 165; back-off unchanged
  const [topSet, back] = entry(r, 4).sets;
  assert.equal(topSet.load.value, 165);
  assert.equal(topSet.repsMin, 1);
  assert.equal(topSet.targetRpe, 8);
  assert.equal(topSet.gen.kind, 'top');
  assert.equal(topSet.gen.reps, 1);
  assert.deepEqual([back.load.value, back.repsMin, back.targetRpe, back.gen.kind], [147.5, 3, 7.5, 'backoff']);
  const noCheck = run({ template: FIXTURE_A, focus: 'maintenance', weeks: 4, checkIn: false });
  assert.deepEqual(strip(noCheck, 4), strip(noCheck, 3));
  const short = run({ template: FIXTURE_A, focus: 'maintenance', weeks: 2 });
  assert.equal(entry(short, 2).sets[0].repsMin, 3);
  const g = r.block.generated;
  assert.deepEqual([g.rotate, g.deloadWeek, g.checkIn, g.weeks], [0.5, 'none', true, 4]);
  assert.ok(r.rationale.some((l) => /hold your e1RM/.test(l.text) && /a third fewer/.test(l.text)));

  // No volume-change or under-6 warnings for maintenance (this template would trigger both otherwise)
  const vt = template([[main('d1s1', 'low_bar_squat'), acc('d1s2', 'seated_leg_extension', { sets: 2, reps: [10, 15] })]]);
  assert.ok(!run({ template: vt, focus: 'maintenance', rotate: 0 }).warnings.some((x) => /volume changes|under 6/.test(x)));

  // Reductions
  const tm = template([[
    main('d1s1', 'low_bar_squat', { sets: 3, reps: 3, rpe: 7 }),
    main('d1s2', 'low_bar_squat', { scheme: 'straight', sets: 4, reps: 5, rpe: 7 }),
    main('d1s3', 'low_bar_squat', { scheme: 'straight', sets: 3, reps: 6, rpe: 6.5 }),
    variation('d1s4', 'paused_bench', { sets: 4, reps: 5, rpe: 8, k: 0.95 }),
    variation('d1s5', 'long_pause_bench', { sets: 3, reps: 3, rpe: 8, k: 0.9 }),
    acc('d1s6', 'seated_hamstring_curl', { sets: 3, rpe: 11 }),
    acc('d1s7', 'lying_leg_curl', { sets: 3, rpe: 9 }),
    acc('d1s8', 'cable_tricep_pushdown', { sets: 2, reps: [10, 15], rpe: 11 }),
    acc('d1s9', 'skullcrusher', { sets: 3, rpe: 9 }),
    acc('d1s10', 'seated_leg_extension', { sets: 1, reps: [10, 15], rpe: 8 }),
  ]]);
  const m = run({ template: tm, focus: 'maintenance', rotate: 0 });
  assert.deepEqual(ids(m), ['low_bar_squat', 'low_bar_squat', 'paused_bench', 'seated_hamstring_curl', 'cable_tricep_pushdown', 'seated_leg_extension']);
  // primary 2; secondary max(2, round(4 x .67)) = 3; variation max(2, round(4 x .5)) = 2; accessories max(1, sets - 1)
  assert.deepEqual(m.block.weeks[0].days[0].entries.map((e) => e.sets.length), [2, 3, 2, 2, 1, 1]);
  // secondary: reps min(5, 3) = 3 at RPE 7 and E(f, 1): 180 x .837 = 150.66 -> 150
  assert.deepEqual(loads(m, 1, 1, 1), [150, 150, 150]);
  assert.deepEqual(field(m, 1, 'repsMin', 1, 1), [3, 3, 3]);
  assert.deepEqual(field(m, 1, 'targetRpe', 1, 1), [7, 7, 7]);
  assert.deepEqual([3, 4, 5].map((e) => entry(m, 1, 1, e).sets[0].targetRpe), [9, 9, 8]); // 11 -> 9, 11 -> 9, 8 stays
  // Only two distinct patterns: the first of each, then fill in slot order
  const tf = template([[main('d1s1', 'low_bar_squat'), acc('d1s2', 'seated_hamstring_curl'), acc('d1s3', 'lying_leg_curl'),
    acc('d1s4', 'cable_tricep_pushdown'), acc('d1s5', 'skullcrusher')]]);
  assert.deepEqual(ids(run({ template: tf, focus: 'maintenance', rotate: 0 })),
    ['low_bar_squat', 'seated_hamstring_curl', 'lying_leg_curl', 'cable_tricep_pushdown']);
  // Default 3 days: the 4-day template drops a day by the normal rule
  const four = run({ template: T12, focus: 'maintenance', rotate: 0 });
  assert.equal(four.block.weeks[0].days.length, 3);
  assert.equal(four.block.generated.daysPerWeek, 3);
});

test('example 20: return ramps E from s to 100% with easier, shorter early weeks', () => {
  const r = run({ template: FIXTURE_A, focus: 'return', layoffWeeks: 6, weeks: 4 });
  // s = max(.8, 1 - .06) = .94: E = 180 x (.94, .96, .98, 1) = 169.2, 172.8, 176.4, 180
  assert.deepEqual([1, 2, 3, 4].map((w) => entry(r, w).sets[0].gen.e1rmRef), [169.2, 172.8, 176.4, 180]);
  // RPE = min(8, max(6, 7 - 1) + .5(w - 1))
  assert.deepEqual([1, 2, 3, 4].map((w) => entry(r, w).sets[0].targetRpe), [6, 6.5, 7, 7.5]);
  assert.deepEqual([1, 2, 3, 4].map((w) => entry(r, w).sets.length), [2, 2, 3, 3]);
  // w1: 169.2 x .811 = 137.22 -> 137.5; x .97 = 133.10 -> 132.5
  assert.deepEqual(loads(r, 1), [137.5, 132.5]);
  // w2: 172.8 x .824 = 142.39 -> 142.5; x .97 = 138.12 -> 137.5
  assert.deepEqual(loads(r, 2), [142.5, 137.5]);
  // w3: 176.4 x .837 = 147.65 -> 147.5; x .97 = 143.22 -> 142.5; x .94 = 138.79 -> 140
  assert.deepEqual(loads(r, 3), [147.5, 142.5, 140]);
  // w4: 180 x .85 = 153 -> 152.5; 148.41 -> 147.5; 143.82 -> 145
  assert.deepEqual(loads(r, 4), [152.5, 147.5, 145]);
  assert.equal(r.block.generated.layoffWeeks, 6);
  assert.equal(r.block.generated.deloadWeek, 'none');
  assert.ok(r.rationale.some((l) => /94%/.test(l.text)));
  // layoffWeeks 30: s = max(.8, .7) = .8 -> E(1) = 144; 144 x .811 = 116.78 -> 117.5
  const long = run({ template: FIXTURE_A, focus: 'return', layoffWeeks: 30, weeks: 4 });
  assert.equal(entry(long, 1).sets[0].gen.e1rmRef, 144);
  assert.equal(loads(long, 1)[0], 117.5);
  for (const bad of [0, 53, 2.5, '6']) {
    assert.throws(() => run({ template: FIXTURE_A, focus: 'return', layoffWeeks: bad }), (e) => e instanceof RangeError && /layoffWeeks/.test(e.message));
  }
});

test('example 21: specialise adds sets to the emphasised lift and trims the other variations', () => {
  assert.throws(() => run({ ...A_OPTS, focus: 'specialise' }), (e) => e instanceof RangeError && /emphasis/.test(e.message));
  const t = template([
    [main('d1s1', 'low_bar_squat'), variation('d1s2', 'high_bar_squat', { sets: 3, reps: 5, k: 0.85 })],
    [main('d2s1', 'comp_bench', { sets: 3, reps: 4, rpe: 8 }), variation('d2s2', 'paused_bench', { sets: 3, reps: 5, rpe: 8, k: 0.95 })],
    [main('d3s1', 'conventional_deadlift'), variation('d3s2', 'tempo_to_knee_deadlift', { sets: 3, reps: 3, k: 0.8 })],
  ]);
  const r = run({ template: t, focus: 'specialise', emphasis: 'bench', weeks: 5, rotate: 0 });
  const counts = (d, e) => [1, 2, 3, 4, 5].map((w) => entry(r, w, d, e).sets.length);
  assert.deepEqual(counts(2, 0), [3, 4, 4, 4, 3]);
  assert.deepEqual(counts(2, 1), [3, 4, 4, 4, 3]);
  assert.deepEqual(counts(1, 0), [3, 3, 3, 3, 3]);
  assert.deepEqual(counts(1, 1), [2, 2, 2, 2, 2]);
  assert.deepEqual(counts(3, 0), [3, 3, 3, 3, 3]);
  assert.deepEqual(counts(3, 1), [2, 2, 2, 2, 2]);
  assert.equal(r.block.generated.emphasis, 'bench');
  assert.ok(r.rationale.some((l) => /Specialising in bench/.test(l.text)));
  const capped = run({ template: template([[main('d1s1', 'comp_bench', { sets: 6, reps: 4, rpe: 8 })]]), focus: 'specialise', emphasis: 'bench', weeks: 5 });
  assert.equal(entry(capped, 2).sets.length, 6);
});

test('example 22: emphasis is ignored outside specialise; bad emphasis or checkIn types throw', () => {
  assert.deepEqual(run({ ...A_OPTS, emphasis: 'bench' }), run(A_OPTS));
  for (const o of [{ emphasis: 'arms' }, { emphasis: 7 }, { checkIn: 'yes' }, { checkIn: null }]) {
    assert.throws(() => run({ ...A_OPTS, ...o }), RangeError, JSON.stringify(o));
  }
});

test('safety cap: a load never exceeds an all-out (RPE 10) set for its reps, whatever k says', () => {
  const sq = { slotId: 'd1s1', exerciseId: 'low_bar_squat', name: 'Low Bar Squat', supersetGroup: null, tempo: null, cues: [], role: 'main', family: 'squat', scheme: 'singles', sets: 1, reps: 1, rpe: 9, loadKg: null, k: 1.2 };
  const tpl = { fromBlock: 1, blockName: 'T', weeksInBlock: 3, daysPerWeek: 1, days: [{ number: 1, slots: [sq] }] };
  const ath = { asOf: '2026-01-01', lifts: { squat: { e1rmKg: 100, confidence: 'high' }, bench: { e1rmKg: null, confidence: 'none' }, deadlift: { e1rmKg: null, confidence: 'none' } }, rpeBias: { squat: 0, bench: 0, deadlift: 0 }, exercises: {} };
  const r = generateBlock({ catalogue, template: tpl, athlete: ath, blockNumber: 2, weeks: 3, focus: 'peak', seed: 's', now: () => new Date('2026-01-01') });
  for (const w of r.block.weeks) for (const d of w.days) for (const e of d.entries) for (const s of e.sets) if (s.load) assert.ok(s.load.value <= 100 + 1e-9, `load ${s.load.value} above e1RM`);
});