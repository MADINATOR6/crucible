import test from 'node:test';
import assert from 'node:assert/strict';
import { metRange, restingKcal, sessionMinutes, sessionCalories, weightOn } from '../../src/core/calories.js';

const at = (min, day = 26) => new Date(2026, 9, day, 10, min).toISOString(); // local 10:00 on a synthetic date
const sets = (mins, rpe = 8, day = 26) => mins.map((m) => ({ createdAt: at(m, day), rpe, isWarmup: false }));
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} ≈ ${b}`);

test('MET bands follow the Compendium lifting codes', () => {
  assert.deepEqual(metRange(8), [5.0, 6.0]);
  assert.deepEqual(metRange(6.5), [3.5, 5.0]);
  assert.deepEqual(metRange(null), [3.5, 6.0]);
});

test('ten Haaf resting burn: fat-free-mass form with body fat, else weight, height, age and sex', () => {
  near(restingKcal({ weightKg: 85, heightCm: 180, age: 30, sex: 'male' }), 2048.9064);
  near(restingKcal({ weightKg: 60, heightCm: 165, age: 30, sex: 'female' }), 1471.3202);
  near(restingKcal({ weightKg: 85, bodyFatPct: 15 }), 2129.46875);
  assert.equal(restingKcal({ weightKg: 85, heightCm: 180, age: 30, sex: null }), null);
  assert.equal(restingKcal({ weightKg: 85, heightCm: null, age: 30, sex: 'male' }), null);
});

test('session time is the gaps between logged sets plus one typical gap, long pauses capped at 15 minutes', () => {
  assert.equal(sessionMinutes([at(0), at(10), at(20), at(30), at(40), at(50)]), 60);
  assert.equal(sessionMinutes([at(0), at(5), at(125)]), 5 + 15 + 15);
  assert.equal(sessionMinutes([at(0)]), null);
});

test('session calories: total from MET × weight × time, active subtracts the resting burn', () => {
  const r = sessionCalories({ date: '2026-10-26', sets: sets([0, 10, 20, 30, 40, 50]), weightKg: 85, heightCm: 180, age: 30, sex: 'male' });
  assert.equal(r.minutes, 60);
  near(r.total[0], 446.25); near(r.total[1], 535.5);
  near(r.active[0], 446.25 - 2048.9064 / 24); near(r.active[1], 535.5 - 2048.9064 / 24);
  const noBody = sessionCalories({ date: '2026-10-26', sets: sets([0, 10, 20]), weightKg: 85 });
  assert.equal(noBody.active, null, 'active needs height, age and sex');
});

test('no estimate for a backfilled workout, a single set or an unknown bodyweight', () => {
  assert.equal(sessionCalories({ date: '2026-10-20', sets: sets([0, 10, 20]), weightKg: 85 }), null);
  assert.equal(sessionCalories({ date: '2026-10-26', sets: sets([0]), weightKg: 85 }), null);
  assert.equal(sessionCalories({ date: '2026-10-26', sets: sets([0, 10]), weightKg: null }), null);
});

test('bodyweight on a date is the latest weigh-in up to it, else the first after', () => {
  const pts = [{ x: '2026-10-01', y: 84 }, { x: '2026-10-20', y: 85 }];
  assert.equal(weightOn(pts, '2026-10-26'), 85);
  assert.equal(weightOn(pts, '2026-10-10'), 84);
  assert.equal(weightOn(pts, '2026-09-01'), 84);
  assert.equal(weightOn([], '2026-10-26'), null);
});
