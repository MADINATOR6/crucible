import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { coachReview, applyExtras, blockVolume } from '../../src/core/coach.js';
import { addDays } from '../../src/core/weeks.js';

const catalogue = JSON.parse(await readFile(new URL('../../data/exercises.json', import.meta.url), 'utf8'));
const START = '2026-07-13'; // a Monday
const date = (k, day = 1) => addDays(START, 7 * k + day);
let order = 0;
const ev = (k, exerciseId, weightKg, reps, rpe, over = {}) => ({ date: date(k), exerciseId, weightKg, reps, rpe, isWarmup: false, order: order++, source: 'logged', ...over });

// 12 weekly top sets of 5 @ RPE 8 for each lift.
function history({ squat = (k) => 140 + 2.5 * k, bench = () => 100, deadlift = (k) => 200 - 2.5 * k } = {}) {
  const out = [];
  for (let k = 0; k < 12; k++) {
    out.push(ev(k, 'low_bar_squat', squat(k), 5, 8), ev(k, 'comp_bench', bench(k), 5, 8), ev(k, 'conventional_deadlift', deadlift(k), 5, 8));
    for (let j = 0; j < 3; j++) out.push(ev(k, 'low_bar_squat', squat(k) - 10, 5, 7, { order: order++ }));
  }
  return out;
}
const ids = (r) => r.findings.map((f) => f.id);

test('trends: a rising lift is good, a flat one stalled, a falling one high priority', () => {
  const r = coachReview({ events: history(), catalogue });
  assert.ok(ids(r).includes('progress-squat'));
  assert.ok(ids(r).includes('plateau-bench'));
  assert.ok(ids(r).includes('regress-deadlift'));
  const reg = r.findings.find((f) => f.id === 'regress-deadlift');
  assert.equal(reg.severity, 'high');
  assert.equal(reg.action.type, 'progression');
  assert.equal(r.findings.find((f) => f.id === 'progress-squat').severity, 'good');
  assert.equal(r.priorities[0].id, 'regress-deadlift'); // high severity first
  assert.match(r.headline, /^Top priority: deadlift is trending down\./);
  assert.ok(r.apply.some((a) => a.action.type === 'emphasis' && a.action.lift === 'bench'));
});

test('too little data gives a plain data note instead of invented findings', () => {
  const few = [ev(0, 'low_bar_squat', 150, 5, 8), ev(1, 'low_bar_squat', 152.5, 5, 8)];
  const r = coachReview({ events: few, catalogue });
  assert.ok(ids(r).includes('data-thin'));
  assert.ok(!ids(r).some((id) => id.startsWith('plateau') || id.startsWith('regress')));
  const none = coachReview({ events: [], catalogue });
  assert.equal(none.asOf, null); assert.deepEqual(none.findings, []); assert.match(none.headline, /no training history/i);
});

test('lift balance uses the weekly-best numbers and quotes them', () => {
  // squat 140/0.811 = 172.6 e1RM; bench 90/0.811 = 111.0 (64% of squat); deadlift 160/0.811 = 197.3 (114%): all in range -> balanced
  let r = coachReview({ events: history({ squat: () => 140, bench: () => 90, deadlift: () => 160 }), catalogue });
  assert.ok(ids(r).includes('balance-ok'), ids(r).join());
  // bench 70 kg -> 86.3 / 172.6 = 50%: bench lags
  r = coachReview({ events: history({ squat: () => 140, bench: () => 70, deadlift: () => 190 }), catalogue });
  const f = r.findings.find((x) => x.id === 'balance-bench');
  assert.ok(f); assert.deepEqual(f.action, { type: 'emphasis', lift: 'bench', label: 'Bring up bench' });
  assert.match(f.because[0], /Bench is 5\d% of squat/);
});

function programmeWith(setsPerWeek, { blocks = 1, weeks = 6, completedFraction = 1, actualMinusTarget = 0, comment = null } = {}) {
  const mk = (n) => ({ number: n, name: `B${n}`, weeks: Array.from({ length: weeks }, (_, w) => ({ number: w + 1, label: `Week ${w + 1}`, days: [
    { number: 1, entries: [{ exerciseId: 'low_bar_squat', name: 'Low Bar Squat', sets: Array.from({ length: setsPerWeek }, (_, i) => ({ index: i + 1, repsMin: 5, repsMax: 5, targetRpe: 7, actualRpe: i / setsPerWeek < completedFraction ? 7 + actualMinusTarget : null, completed: i / setsPerWeek < completedFraction, coachComment: comment })) }] },
    { number: 2, entries: [{ exerciseId: 'comp_bench', name: 'Bench', sets: Array.from({ length: setsPerWeek }, (_, i) => ({ index: i + 1, repsMin: 5, repsMax: 5, targetRpe: 7, actualRpe: i / setsPerWeek < completedFraction ? 7 + actualMinusTarget : null, completed: i / setsPerWeek < completedFraction, coachComment: null })) }] },
  ] })) });
  return { blocks: Array.from({ length: blocks }, (_, b) => mk(b + 1)) };
}

test('effort: finishing sets harder than planned is flagged per lift', () => {
  const r = coachReview({ events: history(), programme: programmeWith(4, { actualMinusTarget: 0.75 }), catalogue });
  const f = r.findings.find((x) => x.id === 'effort-high-squat');
  assert.ok(f, ids(r).join());
  assert.match(f.because[0], /\+0\.75 RPE/);
  assert.equal(f.action.value, 'conservative');
  const easy = coachReview({ events: history(), programme: programmeWith(4, { actualMinusTarget: -0.5 }), catalogue });
  assert.ok(ids(easy).includes('effort-low-squat'));
});

test('adherence: 60% of planned sets done is a high-severity finding with a 3-day action; full completion is a strength', () => {
  const low = coachReview({ events: history(), programme: programmeWith(5, { completedFraction: 0.6 }), catalogue });
  const f = low.findings.find((x) => x.id === 'adherence-low');
  assert.ok(f); assert.equal(f.severity, 'high'); assert.deepEqual(f.action, { type: 'days', value: 3, label: 'Plan 3 days a week' });
  const good = coachReview({ events: history(), programme: programmeWith(5, { completedFraction: 1 }), catalogue });
  assert.ok(ids(good).includes('adherence-good'));
});

test('recurring technique cues are surfaced only when they appear in 3 or more blocks', () => {
  const p = programmeWith(2, { blocks: 3, comment: 'Stay on the NECK' });
  let r = coachReview({ events: history(), programme: p, catalogue });
  const f = r.findings.find((x) => x.id === 'cues');
  assert.ok(f); assert.match(f.because[0], /"Stay on the NECK" \(in 3 blocks\)/);
  r = coachReview({ events: history(), programme: programmeWith(2, { blocks: 2, comment: 'Stay on the NECK' }), catalogue });
  assert.ok(!ids(r).includes('cues'));
});

test('coverage gaps suggest a specific exercise the generator can add', () => {
  const r = coachReview({ events: history(), catalogue });
  const calves = r.findings.find((x) => x.id === 'gap-calves');
  assert.ok(calves);
  assert.deepEqual(calves.action, { type: 'addExercise', exerciseId: 'standing_calf_raise', sets: 2, reps: [10, 15], rpe: 9, label: 'Add calf raises' });
  assert.match(calves.because[0], /^0 hard sets a week\.$/);
});

test('findings are ordered by severity and never mutate their inputs', () => {
  const events = Object.freeze(history().map((e) => Object.freeze(e)));
  const r = coachReview({ events, catalogue: Object.freeze(catalogue), programme: Object.freeze(programmeWith(3)) });
  const sev = { high: 3, medium: 2, low: 1, good: 0 };
  for (let i = 1; i < r.findings.length; i++) assert.ok(sev[r.findings[i - 1].severity] >= sev[r.findings[i].severity]);
  assert.ok(r.priorities.every((f) => f.severity === 'high' || f.severity === 'medium'));
  assert.throws(() => coachReview({ events: [], catalogue: null }), RangeError);
});

test('units: evidence is shown in the athlete\'s unit', () => {
  const r = coachReview({ events: history(), catalogue, unit: 'lb' });
  assert.match(r.findings.find((f) => f.id === 'progress-squat').because[0], / lb/);
});

test('applyExtras puts an added exercise on the lightest day in every non-deload week, without mutating the block', () => {
  const day = (n, k) => ({ number: n, entries: Array.from({ length: k }, (_, i) => ({ exerciseId: 'lat_pulldown', name: 'Lat Pulldown', sets: [], cues: [] })) });
  const block = Object.freeze({ number: 14, weeks: [
    { number: 1, label: 'Week 1', days: [day(1, 4), day(2, 2)] },
    { number: 2, label: 'Week 2 - Deload', days: [day(1, 4), day(2, 2)] },
  ] });
  const { block: out, rationale } = applyExtras(block, [{ exerciseId: 'standing_calf_raise', sets: 2, reps: [10, 15], rpe: 9 }], catalogue);
  assert.equal(out.weeks[0].days[1].entries.at(-1).exerciseId, 'standing_calf_raise');
  assert.equal(out.weeks[0].days[1].entries.at(-1).sets.length, 2);
  assert.equal(out.weeks[0].days[1].entries.at(-1).sets[0].repsRaw, '10-15');
  assert.equal(out.weeks[1].days[1].entries.length, 2, 'deload week untouched');
  assert.equal(block.weeks[0].days[1].entries.length, 2, 'input untouched');
  assert.match(rationale[0].text, /Standing Calf Raise/);
  // unknown exercise ids are ignored; a variation prefers the day that trains its lift
  const lift = { number: 15, weeks: [{ number: 1, label: 'Week 1', days: [{ number: 1, entries: [{ exerciseId: 'comp_bench', name: 'Bench', sets: [], cues: [] }, { exerciseId: 'x', name: 'x', sets: [], cues: [] }] }, { number: 2, entries: [] }] }] };
  const r2 = applyExtras(lift, [{ exerciseId: 'nope', sets: 1, reps: 5 }, { exerciseId: 'long_pause_bench', sets: 3, reps: 3, rpe: 7 }], catalogue);
  assert.equal(r2.block.weeks[0].days[0].entries.at(-1).exerciseId, 'long_pause_bench');
  assert.equal(r2.rationale.length, 1);
});

test('thin data gives no lift-balance verdict; a lift that is moving well is never also called lagging', () => {
  const two = [ev(0, 'low_bar_squat', 200, 5, 8), ev(1, 'comp_bench', 100, 5, 8), ev(1, 'conventional_deadlift', 200, 5, 8)];
  assert.ok(!ids(coachReview({ events: two, catalogue })).some((id) => id.startsWith('balance')));
  const r = coachReview({ events: history({ squat: (k) => 120 + 3 * k, bench: () => 130, deadlift: () => 150 }), catalogue });
  assert.ok(ids(r).includes('progress-squat'));
  assert.ok(!ids(r).includes('balance-squat') && !ids(r).includes('balance-squat2'), ids(r).join());
});

test('applyExtras never adds the same exercise twice in one week', () => {
  const mk = (n, withCrunch) => ({ number: n, entries: withCrunch ? [{ exerciseId: 'cable_crunch', name: 'Cable Crunch', sets: [], cues: [] }] : [] });
  const block = { number: 3, weeks: [{ number: 1, label: 'Week 1', days: [mk(1, true), mk(2, false)] }] };
  const { block: out, rationale } = applyExtras(block, [{ exerciseId: 'cable_crunch', sets: 2, reps: [10, 15], rpe: 9 }], catalogue);
  assert.equal(out.weeks[0].days.flatMap((d) => d.entries).filter((e) => e.exerciseId === 'cable_crunch').length, 1);
  assert.equal(rationale.length, 0);
});

test('blockVolume counts primary as 1 and secondary as 0.5 per set, per week', () => {
  const set = { index: 1 };
  const block = { weeks: [{ number: 1, days: [{ number: 1, entries: [{ exerciseId: 'low_bar_squat', sets: [set, set, set] }, { exerciseId: 'seated_leg_extension', sets: [set, set] }] }] }] };
  const v = blockVolume(block, catalogue)[0].muscles;
  assert.equal(v.quads, 5); assert.equal(v.glutes, 3); assert.equal(v.adductors, 1.5); assert.equal(v.chest, 0);
});