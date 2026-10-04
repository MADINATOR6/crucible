import test from 'node:test';
import assert from 'node:assert/strict';
import { pctOfE1rm, pctSmooth, loadFor, e1rmFrom } from '../../src/core/rpe-chart.js';

// Spot values read straight off the chart image in the coaching workbook.
const CHART = {
  10: [100.0, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 70.7, 68.0],
  9.5: [97.8, 93.9, 90.7, 87.8, 85.0, 82.4, 79.9, 77.4, 75.1, 72.3, 69.4, 66.7],
  9: [95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 70.7, 68.0, 65.3],
  8.5: [93.9, 90.7, 87.8, 85.0, 82.4, 79.9, 77.4, 75.1, 72.3, 69.4, 66.7, 64.0],
  8: [92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 70.7, 68.0, 65.3, 62.6],
  7.5: [90.7, 87.8, 85.0, 82.4, 79.9, 77.4, 75.1, 72.3, 69.4, 66.7, 64.0, 61.3],
  7: [89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 70.7, 68.0, 65.3, 62.6, 59.9],
  6.5: [87.8, 85.0, 82.4, 79.9, 77.4, 75.1, 72.3, 69.4, 66.7, 64.0, 61.3, 58.6],
};

test('every cell of the printed chart is reproduced', () => {
  for (const [rpe, row] of Object.entries(CHART)) {
    row.forEach((pct, i) => assert.ok(Math.abs(pctOfE1rm(i + 1, Number(rpe)) - pct / 100) < 1e-12, `${i + 1} @ ${rpe}`));
  }
});

test('structure: x reps at RPE r equals x+1 reps at RPE r+1', () => {
  for (let reps = 1; reps <= 11; reps++) for (const rpe of [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5]) {
    assert.equal(pctOfE1rm(reps, rpe), pctOfE1rm(reps + 1, rpe + 1) ?? pctOfE1rm(reps, rpe), `${reps} @ ${rpe}`);
  }
});

test('RPE 6 is supported and lighter than RPE 6.5', () => {
  assert.ok(pctOfE1rm(5, 6) < pctOfE1rm(5, 6.5));
  assert.equal(pctOfE1rm(12, 6), 0.573); // 16 reps to failure
});

test('outside the chart returns null', () => {
  for (const [r, e] of [[0, 8], [13, 8], [1.5, 8], [5, 5.5], [5, 10.5], [5, 8.25], [5, NaN], [5, 11]]) assert.equal(pctOfE1rm(r, e), null, `${r} @ ${e}`);
});

test('load and e1RM are inverses, with hand-checked values', () => {
  assert.ok(Math.abs(loadFor(200, 4, 8) - 167.4) < 1e-9); // 200 x 0.837
  assert.ok(Math.abs(e1rmFrom(167.4, 4, 8) - 200) < 1e-9);
  assert.ok(Math.abs(loadFor(140, 1, 9.5) - 136.92) < 1e-9);
  assert.equal(loadFor(0, 5, 8), null); assert.equal(loadFor(100, 20, 8), null); assert.equal(e1rmFrom(-1, 5, 8), null);
});

test('pctSmooth equals the chart at half steps and interpolates between them', () => {
  // The printed chart rounds midpoints to 0.1%, so allow half of that.
  for (const rpe of [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]) assert.ok(Math.abs(pctSmooth(5, rpe) - pctOfE1rm(5, rpe)) <= 5.1e-4, String(rpe));
  // 3 reps at RPE 7.25 is halfway between RPE 7.5 (85.0%) and RPE 7 (83.7%): 84.35%
  assert.ok(Math.abs(pctSmooth(3, 7.25) - 0.8435) < 1e-9);
  // 3 reps at RPE 7.75 is halfway between RPE 8 (86.3%) and RPE 7.5 (85.0%): 85.65%
  assert.ok(Math.abs(pctSmooth(3, 7.75) - 0.8565) < 1e-9);
  assert.equal(pctSmooth(3, 5.9), null); assert.equal(pctSmooth(13, 8), null);
});