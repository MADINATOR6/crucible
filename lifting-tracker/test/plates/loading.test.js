import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBar, perSideText, warmupLadder } from '../../src/plates/loading.js';

const catalogue = JSON.parse(readFileSync(new URL('../../data/plates.json', import.meta.url), 'utf8'));
const weight = (value, unit = 'kg') => ({ value, unit });
const plate = (value, count, unit = 'kg') => ({ value, count, unit });
const kg = { bar: weight(20), collar: catalogue.kg.collar, plates: catalogue.kg.plates };
const pairs = result => result.perSide.map(({ plate, count }) => [plate.value, count]);
const close = (actual, expected, tolerance = 1e-9) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected} within ${tolerance}`);

test('100 kg with collars: three plates, heavier combination wins', () => {
  const result = loadBar({ ...kg, target: weight(100) });
  assert.equal(result.loadable, true);
  assert.equal(result.exact, true);
  assert.equal(result.reason, null);
  assert.equal(result.mixedUnits, false);
  assert.deepEqual(pairs(result), [[25, 1], [10, 1], [2.5, 1]]);
  assert.equal(perSideText(result.perSide, 'kg'), '1 × 25, 1 × 10, 1 × 2.5 each side');
  assert.deepEqual(result.loadedTotal, weight(100));
  assert.equal(result.difference, 0);
  assert.deepEqual(result.below, result.above);
  assert.deepEqual(result.below.perSide, result.perSide);
});

test('100 kg without collars: 25 + 15 wins the two-plate tie', () => {
  for (const collar of [null, undefined, false]) {
    const result = loadBar({ ...kg, collar, target: weight(100) });
    assert.deepEqual(pairs(result), [[25, 1], [15, 1]]);
    assert.equal(result.exact, true);
  }
  const disabled = loadBar({ ...kg, collars: false, target: weight(100) });
  assert.deepEqual(pairs(disabled), [[25, 1], [15, 1]]);
});

test('20 and 21 kg with collars are below the 25 kg empty bar', () => {
  for (const value of [20, 21]) {
    const result = loadBar({ ...kg, target: weight(value) });
    assert.equal(result.loadable, false);
    assert.equal(result.exact, false);
    assert.equal(result.reason, 'below-bar');
    assert.equal(result.below, null);
    assert.deepEqual(result.above, { loadedTotal: weight(25), perSide: [] });
    assert.deepEqual(result.perSide, []);
    assert.equal(result.difference, 25 - value);
  }
});

test('unreachable target beyond stock returns the highest possible load', () => {
  const result = loadBar({ target: weight(80), bar: weight(20), plates: [plate(25, 2)] });
  assert.equal(result.loadable, true);
  assert.equal(result.exact, false);
  assert.equal(result.reason, 'unreachable');
  assert.deepEqual(result.below.loadedTotal, weight(70));
  assert.equal(result.above, null);
  assert.deepEqual(pairs(result), [[25, 1]]);
  assert.equal(result.difference, -10);
});

test('stock of one 20 pair and two 10 pairs cannot make 120 kg', () => {
  const result = loadBar({ target: weight(120), bar: weight(20), plates: [plate(20, 2), plate(10, 4)] });
  assert.deepEqual(pairs(result), [[20, 1], [10, 2]]);
  assert.deepEqual(result.below.loadedTotal, weight(100));
  assert.equal(result.above, null);
  assert.equal(result.exact, false);
  assert.equal(result.difference, -20);
});

test('bounded search finds two 10s when greedy would strand a 15', () => {
  const result = loadBar({ target: weight(60), bar: weight(20), plates: [plate(15, 2), plate(10, 4)] });
  assert.equal(result.exact, true);
  assert.deepEqual(pairs(result), [[10, 2]]);
});

test('fractional 102.5 kg without collars uses 25 + 15 + 1.25', () => {
  const result = loadBar({ ...kg, collar: null, target: weight(102.5) });
  assert.equal(result.exact, true);
  assert.deepEqual(result.loadedTotal, weight(102.5));
  assert.deepEqual(pairs(result), [[25, 1], [15, 1], [1.25, 1]]);
});

test('native lb targets keep 45 lb bars and plates exact', () => {
  for (const [value, expected] of [[225, [[45, 2]]], [135, [[45, 1]]], [140, [[45, 1], [2.5, 1]]]]) {
    const result = loadBar({ target: weight(value, 'lb'), bar: weight(45, 'lb'), plates: catalogue.lb.plates });
    assert.equal(result.exact, true);
    assert.equal(result.mixedUnits, false);
    assert.deepEqual(result.loadedTotal, weight(value, 'lb'));
    assert.deepEqual(pairs(result), expected);
  }
});

test('mixed units: 45 lb target with 20 kg bar needs the 0.25 kg pair', () => {
  const result = loadBar({ ...kg, collar: null, target: weight(45, 'lb') });
  assert.equal(result.mixedUnits, true);
  assert.equal(result.exact, false);
  close(result.below.loadedTotal.value, 44.0925, 1e-3);
  close(result.above.loadedTotal.value, 45.1948, 1e-3);
  assert.deepEqual(pairs(result), [[0.25, 1]]);
  close(result.difference, 0.1948, 1e-3);
  close(result.loadedTotal.value, 20.5 / 0.45359237);
  assert.equal(result.loadedTotal.unit, 'lb');
});

test('45 lb bar is 20.41165665 kg, and 45 lb plates are never 20 kg', () => {
  const bare = loadBar({ target: weight(20), bar: weight(45, 'lb'), plates: [] });
  assert.equal(bare.reason, 'below-bar');
  close(bare.loadedTotal.value, 20.41165665);
  const loaded = loadBar({ target: weight(60.8233133), bar: weight(20), plates: [plate(45, 2, 'lb')] });
  assert.equal(loaded.exact, true);
  assert.equal(loaded.mixedUnits, true);
  close(loaded.loadedTotal.value, 60.8233133);
});

test('unused mixed-unit plates do not flag the chosen native loading', () => {
  const result = loadBar({ target: weight(40), bar: weight(20), plates: [plate(45, 2, 'lb'), plate(10, 2)] });
  assert.equal(result.mixedUnits, false);
  assert.deepEqual(pairs(result), [[10, 1]]);
});

test('cent buckets retain distinct physical sums and avoid false mixed-unit substitutions', () => {
  const native = loadBar({ target: weight(4.4, 'lb'), bar: weight(0, 'lb'),
    plates: [plate(1, 2), plate(2.2, 2, 'lb')] });
  // 1 kg = 2.2046226 lb: both sizes round to 2.20, but their pairs differ by > 0.005 lb.
  assert.equal(native.exact, true);
  assert.equal(native.mixedUnits, false);
  assert.deepEqual(pairs(native), [[2.2, 1]]);
  assert.deepEqual(native.loadedTotal, weight(4.4, 'lb'));
  const fractional = loadBar({ target: weight(2.002), bar: weight(0),
    plates: [plate(1.004, 2), plate(1.001, 2)] });
  assert.equal(fractional.exact, true);
  assert.deepEqual(pairs(fractional), [[1.001, 1]]);
});

test('collar multiplicity and mixed collar conversions count toward totals', () => {
  const result = loadBar({ target: weight(24), bar: weight(20),
    collar: { weight: weight(1), perSide: 2 }, plates: [] });
  assert.equal(result.exact, true);
  assert.deepEqual(result.loadedTotal, weight(24));
  const mixed = loadBar({ target: weight(20.90718474), bar: weight(20),
    collar: { weight: weight(1, 'lb'), perSide: 1 }, plates: [] });
  assert.equal(mixed.exact, true);
  assert.equal(mixed.mixedUnits, true);
});

test('nearest total chooses below on ties, above when closer', () => {
  const options = { bar: weight(20), plates: [plate(5, 2)] };
  const tie = loadBar({ ...options, target: weight(25) });
  assert.deepEqual(tie.loadedTotal, weight(20));
  assert.equal(tie.difference, -5);
  assert.deepEqual(tie.below.loadedTotal, weight(20));
  assert.deepEqual(tie.above.loadedTotal, weight(30));
  const higher = loadBar({ ...options, target: weight(26) });
  assert.deepEqual(higher.loadedTotal, weight(30));
  assert.equal(higher.difference, 4);
});

test('0.005 target-unit tolerance applies on both sides of a load', () => {
  for (const unit of ['kg', 'lb']) {
    for (const value of [19.995, 20.005]) {
      const result = loadBar({ target: weight(value, unit), bar: weight(20, unit), plates: [] });
      assert.equal(result.exact, true);
      assert.equal(result.difference, 0);
    }
    assert.equal(loadBar({ target: weight(20.0051, unit), bar: weight(20, unit), plates: [] }).exact, false);
  }
});

test('odd stock counts are floored to matched pairs; empty stock permits bar only', () => {
  const result = loadBar({ target: weight(50), bar: weight(20), plates: [plate(5, 5), plate(10, 1)] });
  assert.deepEqual(pairs(result), [[5, 2]]);
  assert.equal(result.loadedTotal.value, 40);
  assert.equal(result.above, null);
  assert.equal(loadBar({ target: weight(20), bar: weight(20), plates: [] }).exact, true);
  assert.equal(loadBar({ target: weight(22), bar: weight(20),
    plates: Array.from({ length: 13 }, () => plate(1, 2)) }).exact, true);
});

test('all 111 targets from 25 to 300 kg round-trip physical totals and stock', () => {
  for (let value = 25; value <= 300; value += 2.5) {
    const result = loadBar({ ...kg, target: weight(value) });
    const total = 25 + 2 * result.perSide.reduce((sum, item) => sum + item.plate.value * item.count, 0);
    close(result.loadedTotal.value, total);
    assert.equal(result.exact, true, `default stock should reach ${value}`);
    close(total, value, 0.005);
    for (const item of result.perSide) assert.ok(item.count <= Math.floor(item.plate.count / 2));
  }
});

test('text trims trailing zeros and preserves 1.25', () => {
  assert.equal(perSideText([], 'kg'), 'Bar only');
  assert.equal(perSideText([{ plate: plate(25, 4), count: 2 }, { plate: plate(1.25, 2), count: 1 }], 'kg'),
    '2 × 25, 1 × 1.25 each side');
  assert.equal(perSideText([{ plate: plate(10, 2), count: 1 }], 'lb'), '1 × 22.046226 each side');
});

test('140 kg default warm-ups snap to 25, 55, 85, 105, 125', () => {
  const plates = catalogue.kg.plates.filter(p => p.value >= 1.25).map(p => ({ ...p, count: 20 }));
  const steps = warmupLadder({ ...kg, plates, top: weight(140) });
  assert.deepEqual(steps.map(s => s.weight.value), [25, 55, 85, 105, 125]);
  assert.deepEqual(steps.map(s => s.reps), [10, 5, 3, 2, 1]);
  assert.deepEqual(steps[0].perSide, []);
  assert.equal(steps[0].text, 'Bar only');
  assert.deepEqual(steps[1].requested, weight(56));
  assert.deepEqual(pairs(steps[1]), [[15, 1]]);
  for (let i = 0; i < steps.length; i++) {
    assert.ok(steps[i].weight.value < 140);
    if (i) assert.ok(steps[i].weight.value > steps[i - 1].weight.value);
    close(steps[i].weight.value, 25 + 2 * steps[i].perSide.reduce((s, p) => s + p.plate.value * p.count, 0));
  }
});

test('warm-ups drop duplicates, decreasing steps, and steps at or above top', () => {
  const steps = warmupLadder({ top: weight(100), bar: weight(20), plates: [plate(10, 10)],
    scheme: [0, 0.21, 0.4, 0.3, 0.6, 1, 1.2].map(pct => ({ pct, reps: 3 })) });
  assert.deepEqual(steps.map(s => s.weight.value), [20, 40, 60]);
  const tie = warmupLadder({ top: weight(100), bar: weight(20), plates: [plate(5, 20)],
    scheme: [{ pct: 0.35, reps: 2 }] });
  assert.deepEqual(tie.map(s => s.weight.value), [30]);
  assert.deepEqual(warmupLadder({ ...kg, top: weight(24) }), []);
  assert.deepEqual(warmupLadder({ ...kg, top: weight(25) }), []);
});

test('deep-frozen inputs stay unchanged and output objects are fresh', () => {
  function freeze(value) {
    for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
    return Object.freeze(value);
  }
  const options = freeze(structuredClone({ ...kg, target: weight(100),
    plates: kg.plates.map(p => ({ ...p, metadata: { source: 'synthetic' } })) }));
  const before = JSON.stringify(options);
  const first = loadBar(options);
  assert.deepEqual(first, loadBar(options));
  assert.notEqual(first.target, options.target);
  assert.notEqual(first.perSide, first.below.perSide);
  assert.notEqual(first.below.perSide, first.above.perSide);
  first.perSide[0].plate.metadata.source = 'edited';
  assert.equal(options.plates[0].metadata.source, 'synthetic');
  assert.equal(first.below.perSide[0].plate.metadata.source, 'synthetic');
  warmupLadder(freeze({ ...options, top: weight(140), scheme: [{ pct: 0, reps: 10 }, { pct: 0.6, reps: 3 }] }));
  assert.equal(JSON.stringify(options), before);
});

test('invalid weights, inventories, counts and schemes throw RangeError', () => {
  const valid = { ...kg, target: weight(100) };
  const invalid = [undefined, {}, { ...valid, target: weight(NaN) }, { ...valid, target: weight(Infinity) },
    { ...valid, target: weight(100, 'stone') }, { ...valid, bar: weight(-1) },
    { ...valid, bar: weight(Infinity) }, { ...valid, plates: undefined },
    { ...valid, plates: [plate(-1, 2)] }, { ...valid, plates: [plate(0, 2)] },
    { ...valid, plates: [plate(10, -1)] }, { ...valid, plates: [plate(10, 2.5)] },
    { ...valid, plates: [plate(10, Infinity)] }, { ...valid, plates: [plate(10, 2, 'oz')] },
    { ...valid, plates: Array.from({ length: 13 }, (_, i) => plate(i + 1, 2)) },
    { ...valid, collar: { weight: weight(-1), perSide: 1 } },
    { ...valid, collar: { weight: weight(1), perSide: -1 } }];
  for (const input of invalid) assert.throws(() => loadBar(input), RangeError);
  assert.throws(() => perSideText([], 'oz'), RangeError);
  for (const scheme of [null, [{ pct: NaN, reps: 1 }], [{ pct: 0.5, reps: -1 }]]) {
    assert.throws(() => warmupLadder({ ...kg, top: weight(100), scheme }), RangeError);
  }
});

test('independent enumeration verifies nearest loads and ties for bounded non-canonical stock', () => {
  const plates = [plate(6, 4), plate(4, 4), plate(3, 2)];
  const combinations = [];
  for (let a = 0; a <= 2; a++) for (let b = 0; b <= 2; b++) for (let c = 0; c <= 1; c++) {
    combinations.push({ total: 20 + 2 * (6 * a + 4 * b + 3 * c), counts: [a, b, c], number: a + b + c });
  }
  for (let value = 20; value <= 70; value += 0.5) {
    const ordered = [...combinations].sort((a, b) =>
      Math.abs(a.total - value) - Math.abs(b.total - value) || a.total - b.total ||
      a.number - b.number || b.counts[0] - a.counts[0] || b.counts[1] - a.counts[1] || b.counts[2] - a.counts[2]);
    const expected = ordered[0];
    const result = loadBar({ target: weight(value), bar: weight(20), plates: [...plates].reverse() });
    assert.equal(result.loadedTotal.value, expected.total, `target ${value}`);
    assert.deepEqual(pairs(result), plates.flatMap((p, i) => expected.counts[i] ? [[p.value, expected.counts[i]]] : []));
    assert.equal(result.below?.loadedTotal.value ?? null,
      combinations.filter(c => c.total <= value).reduce((max, c) => Math.max(max, c.total), -Infinity));
    const higher = combinations.filter(c => c.total >= value);
    assert.equal(result.above?.loadedTotal.value ?? null, higher.length ? Math.min(...higher.map(c => c.total)) : null);
  }
});
