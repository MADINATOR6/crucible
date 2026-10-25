import test from 'node:test';
import assert from 'node:assert/strict';
import { setE1rm, sessionPoints, theilSen, trend, smoothLine, weeksSinceBest, valueAt, ipfGl, weeklyLoad, rpeAtLoad, mondayIso, isoOf, dayNum } from '../../src/core/progress.js';

const day = (n) => isoOf(dayNum('2026-01-05') + n);

test('set estimate uses the RPE chart when there is an RPE, Epley otherwise', () => {
  const easy = setE1rm(150, 3, 6), hard = setE1rm(150, 3, 9.5);
  assert.equal(easy.method, 'rpe');
  assert.ok(easy.value > hard.value + 10, 'more reps in reserve means a higher max');
  assert.equal(Math.round(setE1rm(200, 1, 10).value), 200);
  assert.deepEqual(setE1rm(100, 5, null), { value: 100 * (1 + 5 / 30), method: 'epley' });
  assert.equal(setE1rm(0, 5, 8), null);
});

test('session points take the best set and mark light days', () => {
  const pts = sessionPoints([
    { date: day(0), weightKg: 180, reps: 1, rpe: 8 }, { date: day(0), weightKg: 150, reps: 5, rpe: 7 },
    { date: day(2), weightKg: 120, reps: 5, rpe: 6 },          // light: top set under RPE 7
    { date: day(4), weightKg: 170, reps: 2, rpe: null },       // no RPE, close to form: hard
    { date: day(6), weightKg: 120, reps: 3, rpe: null },       // no RPE, far under form: light
  ]);
  assert.deepEqual(pts.map((p) => p.hard), [true, false, true, false]);
  assert.equal(pts[0].weightKg, 180);
});

test('Theil-Sen ignores one outlier', () => {
  const pts = [0, 7, 14, 21, 28].map((t) => ({ t, y: 100 + t / 7 }));
  pts[2].y = 60;
  const fit = theilSen(pts);
  assert.ok(Math.abs(fit.slope * 7 - 1) < 1e-9);
});

test('trend gives kg per week, needs enough data, and widens its range further out', () => {
  const pts = Array.from({ length: 9 }, (_, i) => ({ x: day(i * 7), y: 150 + i * 1.5 + (i % 2 ? 1 : -1), hard: true }));
  pts.push({ x: day(60), y: 100, hard: false }); // light days never move the trend
  const t = trend(pts, { weeks: 8 });
  assert.ok(Math.abs(t.slopePerWeek - 1.5) < 0.3, String(t.slopePerWeek));
  const near = t.interval(day(63)), far = t.interval(day(140));
  assert.ok(near.lo < near.mid && near.mid < near.hi && far.hi - far.lo > near.hi - near.lo);
  assert.equal(trend(pts.slice(0, 2)), null);
});

test('smooth line follows a straight series, skips light days and shrugs off one outlier', () => {
  const pts = Array.from({ length: 10 }, (_, i) => ({ x: day(i * 4), y: 100 + i, hard: i !== 3 }));
  pts[6].y = 60; // one bad day
  const line = smoothLine(pts);
  assert.equal(line.length, 9);
  for (const p of line.filter((q) => q.x !== pts[6].x)) assert.ok(Math.abs(p.y - (100 + (dayNum(p.x) - dayNum(day(0))) / 4)) < 0.01);
});

test('weeks since best and value at a date', () => {
  const pts = [{ x: day(0), y: 150, hard: true }, { x: day(7), y: 160, hard: true }, { x: day(35), y: 158, hard: true }, { x: day(36), y: 120, hard: false }];
  assert.equal(weeksSinceBest(pts), 4);
  assert.equal(valueAt(pts, day(10)).y, 160);
  assert.equal(valueAt(pts, day(-1)), null);
});

test('IPF GL points match the published formula', () => {
  // 600 kg at 83 kg bodyweight, men's classic: 600 * 100 / (1199.72839 - 1025.18162 * e^(-0.00921 * 83)).
  assert.ok(Math.abs(ipfGl(600, 83, 'male') - 600 * 100 / (1199.72839 - 1025.18162 * Math.exp(-0.00921 * 83))) < 1e-9);
  assert.ok(ipfGl(400, 63, 'female') > 80);
  assert.equal(ipfGl(600, 83, null), null);
});

test('weekly load counts sets, tonnage and intensity per Monday week', () => {
  const sets = [{ date: '2026-01-05', weightKg: 100, reps: 5 }, { date: '2026-01-07', weightKg: 150, reps: 2 }, { date: '2026-01-12', weightKg: 120, reps: 3 }];
  const pts = [{ x: '2026-01-05', y: 200, hard: true }];
  const w = weeklyLoad(sets, pts);
  assert.deepEqual(w.map((r) => [r.week, r.sets, r.tonnage]), [['2026-01-05', 2, 800], ['2026-01-12', 1, 360]]);
  assert.equal(w[0].intensity, 0.625);
  assert.equal(mondayIso('2026-01-11'), '2026-01-05');
});

test('same weight at a lower RPE is reported, biggest drop first', () => {
  const sets = [
    { date: day(0), weightKg: 140, reps: 3, rpe: 8.5 }, { date: day(30), weightKg: 140, reps: 3, rpe: 7 },
    { date: day(0), weightKg: 100, reps: 5, rpe: 7 }, { date: day(28), weightKg: 100, reps: 5, rpe: 6.5 },
    { date: day(0), weightKg: 160, reps: 1, rpe: 8 }, { date: day(5), weightKg: 160, reps: 1, rpe: 7 }, // too close together
  ];
  const r = rpeAtLoad(sets);
  assert.deepEqual(r.map((x) => [x.weightKg, x.drop]), [[140, 1.5], [100, 0.5]]);
});
