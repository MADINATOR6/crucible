import test from 'node:test';
import assert from 'node:assert/strict';
import { planAttempts, roundToStep } from '../../src/core/attempts.js';

test('rounds to 2.5 kg steps, ties up', () => {
  assert.equal(roundToStep(182), 182.5);   // 72.8 steps -> 73
  assert.equal(roundToStep(181.25), 182.5); // exactly between 180 and 182.5 -> up
  assert.equal(roundToStep(91), 90);        // 36.4 -> 36
  assert.equal(roundToStep(97), 97.5);      // 38.8 -> 39
});

test('200 kg projected -> 182.5 / 195 / 200', () => {
  assert.deepEqual(planAttempts(200), { opener: 182.5, second: 195, third: 200 });
});

test('100 kg projected -> 90 / 97.5 / 100', () => {
  assert.deepEqual(planAttempts(100), { opener: 90, second: 97.5, third: 100 });
});

test('attempts always rise by at least one step', () => {
  const r = planAttempts(20); // 18.2 -> 17.5, 19.4 -> 20, third pushed to 22.5
  assert.deepEqual(r, { opener: 17.5, second: 20, third: 22.5 });
  for (let kg = 30; kg <= 400; kg += 0.5) {
    const a = planAttempts(kg);
    assert.ok(a.second - a.opener >= 2.5 && a.third - a.second >= 2.5, `gap at ${kg}`);
    assert.ok(Number.isInteger(Math.round(a.opener * 1000) / 1000 / 2.5));
  }
});

test('custom percentages and invalid input', () => {
  assert.deepEqual(planAttempts(200, { pcts: { opener: 0.9, second: 0.95, third: 1.02 } }), { opener: 180, second: 190, third: 205 });
  for (const bad of [0, -5, NaN, Infinity, undefined]) assert.equal(planAttempts(bad), null);
});
