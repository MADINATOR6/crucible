import test from 'node:test';
import assert from 'node:assert/strict';
import { LB_TO_KG, UNITS, isUnit, convert, toKg, round1, formatWeight } from '../../src/core/units.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('constants and unit validation', () => {
  assert.equal(LB_TO_KG, 0.45359237);
  assert.deepEqual(UNITS, ['kg', 'lb']);
  assert.ok(Object.isFrozen(UNITS));
  assert.ok(isUnit('kg') && isUnit('lb'));
  for (const u of ['KG', 'lbs', 'g', '', null, undefined, 1]) assert.equal(isUnit(u), false);
});

test('convert: both directions, identity, zero and negatives', () => {
  close(convert(100, 'lb', 'kg'), 45.359237);
  close(convert(45.359237, 'kg', 'lb'), 100);
  close(convert(-10, 'lb', 'kg'), -4.5359237);
  assert.equal(convert(0, 'kg', 'lb'), 0);
  assert.equal(convert(102.5, 'kg', 'kg'), 102.5);
  close(convert(convert(137.5, 'kg', 'lb'), 'lb', 'kg'), 137.5);
});

test('convert rejects non-finite values and unknown units', () => {
  for (const v of [NaN, Infinity, -Infinity, '100', null, undefined]) {
    assert.throws(() => convert(v, 'kg', 'lb'), RangeError);
  }
  assert.throws(() => convert(1, 'kg', 'g'), RangeError);
  assert.throws(() => convert(1, 'lbs', 'kg'), RangeError);
  assert.throws(() => convert(1, 'x', 'x'), RangeError);
});

test('toKg reads a stored weight and propagates errors', () => {
  assert.equal(toKg({ value: 60, unit: 'kg' }), 60);
  close(toKg({ value: 225, unit: 'lb' }), 102.05828325);
  assert.throws(() => toKg({ value: 60, unit: 'stone' }), RangeError);
  assert.throws(() => toKg({ value: NaN, unit: 'kg' }), RangeError);
});

test('round1 rounds to one decimal without binary artefacts', () => {
  assert.equal(round1(1.24), 1.2);
  assert.equal(round1(1.25), 1.3);
  assert.equal(round1(116.666), 116.7);
  assert.equal(round1(100), 100);
});

test('formatWeight converts, rounds, trims ".0" and labels the unit', () => {
  assert.equal(formatWeight({ value: 100, unit: 'kg' }, 'kg'), '100 kg');
  assert.equal(formatWeight({ value: 102.5, unit: 'kg' }, 'kg'), '102.5 kg');
  assert.equal(formatWeight({ value: 100, unit: 'kg' }, 'lb'), '220.5 lb');
  assert.equal(formatWeight({ value: 225, unit: 'lb' }, 'kg'), '102.1 kg');
  assert.equal(formatWeight({ value: 99.96, unit: 'kg' }, 'kg'), '100 kg');
  assert.equal(formatWeight({ value: -0.01, unit: 'kg' }, 'kg'), '0 kg');
  assert.throws(() => formatWeight({ value: 1, unit: 'kg' }, 'st'), RangeError);
});
