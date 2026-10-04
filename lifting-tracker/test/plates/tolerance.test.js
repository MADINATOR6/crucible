import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { platesTolerance, plateBand } from '../../src/plates/tolerance.js';

const data = JSON.parse(await readFile(new URL('../../data/plates.json', import.meta.url), 'utf8'));
const tol = data.kg.calibration.tolerances;
const kg = (v) => ({ value: v, unit: 'kg' });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`); // results are rounded to 6 decimals

test('the shipped table matches the IPF face values and limits', () => {
  const expected = { 25: [24.9375, 25.0625], 20: [19.95, 20.05], 15: [14.9625, 15.0375], 10: [9.975, 10.025], 5: [4.9875, 5.0125], 2.5: [2.49, 2.51], 1.25: [1.24, 1.26], 1: [0.99, 1.01], 0.5: [0.49, 0.51], 0.25: [0.245, 0.255] };
  for (const [face, [min, max]] of Object.entries(expected)) { near(tol[face].min, min, face + ' min'); near(tol[face].max, max, face + ' max'); }
  for (const p of data.kg.plates) assert.ok(plateBand(p.value, tol), `${p.value} kg has a limit`);
});

test('25 + 20 + 5 each side: 100 kg of plates, allowed to read 99.75 to 100.25', () => {
  const r = platesTolerance([kg(25), kg(20), kg(5)], { tolerances: tol });
  near(r.nominalKg, 100, 'nominal'); near(r.minKg, 99.75, 'min'); near(r.maxKg, 100.25, 'max');
  assert.equal(r.bandKnown, true); assert.equal(r.measuredKg, null);
});

test('small plates carry a wider relative tolerance', () => {
  // each side 1.25 + 0.5 + 0.25: nominal 2 x 2 = 4 kg; max = 2 x (1.26 + 0.51 + 0.255) = 4.05; min = 2 x (1.24 + 0.49 + 0.245) = 3.95
  const r = platesTolerance([kg(1.25), kg(0.5), kg(0.25)], { tolerances: tol });
  near(r.nominalKg, 4, 'nominal'); near(r.minKg, 3.95, 'min'); near(r.maxKg, 4.05, 'max');
});

test('gym plates and lb plates have no guaranteed band; the band collapses to the stamped weight', () => {
  const gym = platesTolerance([kg(25), kg(20)], { tolerances: tol, mode: 'gym' });
  near(gym.minKg, 90, 'gym min'); near(gym.maxKg, 90, 'gym max'); assert.equal(gym.bandKnown, false);
  const lb = platesTolerance([{ value: 45, unit: 'lb' }], { tolerances: tol });
  near(lb.nominalKg, 2 * 45 * 0.45359237, 'lb nominal'); assert.equal(lb.bandKnown, false);
  assert.equal(platesTolerance([], { tolerances: tol }).bandKnown, false);
});

test('weighed plates: measured weights replace stamped ones, and the result says if every plate was weighed', () => {
  const r = platesTolerance([kg(25), kg(20)], { tolerances: tol, measured: { 25: 25.3 } });
  near(r.measuredKg, 2 * (25.3 + 20), 'partial'); assert.equal(r.measuredPlates, 1); assert.equal(r.measuredComplete, false);
  const all = platesTolerance([kg(25), kg(20)], { tolerances: tol, measured: { 25: 25.3, 20: 19.9 } });
  near(all.measuredKg, 2 * (25.3 + 19.9), 'all'); assert.equal(all.measuredComplete, true);
  // a measured value in lb is converted exactly
  const lb = platesTolerance([{ value: 45, unit: 'lb' }], { measured: { 45: 45.4 } });
  near(lb.measuredKg, 2 * 45.4 * 0.45359237, 'lb weighed');
  // junk is ignored
  assert.equal(platesTolerance([kg(25)], { tolerances: tol, measured: { 25: 'x' } }).measuredKg, null);
  assert.equal(platesTolerance([kg(25)], { tolerances: tol, measured: { 25: -3 } }).measuredKg, null);
});

test('inputs are not mutated', () => {
  const side = Object.freeze([Object.freeze(kg(25))]);
  const r = platesTolerance(side, { tolerances: Object.freeze(tol), measured: Object.freeze({}) });
  assert.equal(r.nominalKg, 50);
});

test('weighed values apply only to plates of their own unit, and sizes are counted by size not by plate', () => {
  const side = [kg(25), kg(25), { value: 25, unit: 'lb' }];
  const r = platesTolerance(side, { tolerances: tol, measured: { 25: 25.3 }, measuredUnit: 'kg' });
  assert.equal(r.measuredPlates, 2); assert.equal(r.sizes, 2); assert.equal(r.weighedSizes, 1); assert.equal(r.measuredComplete, false);
  near(r.measuredKg, 2 * (25.3 + 25.3 + 25 * 0.45359237), 'kg weighing is not applied to the lb plate');
  const four = platesTolerance([kg(25), kg(25), kg(25), kg(25), kg(20), kg(15), kg(10)], { tolerances: tol, measured: { 25: 25.3 }, measuredUnit: 'kg' });
  assert.equal(four.sizes, 4); assert.equal(four.weighedSizes, 1);
});