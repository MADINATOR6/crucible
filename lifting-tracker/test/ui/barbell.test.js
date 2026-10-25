import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBarbell, plateSize } from '../../src/ui/barbell.js';

const p = (value, colour = '#d62828', extra = {}) => ({ value, unit: 'kg', colour, ...extra });

test('plate sizes come from the data, else the nearest competition disc', () => {
  assert.deepEqual(plateSize(p(25, '#000', { drawHeightMm: 440, thicknessMm: 30 })), { d: 440, t: 30 });
  assert.deepEqual(plateSize(p(2.5)), { d: 190, t: 16 });
  assert.deepEqual(plateSize({ value: 45, unit: 'lb', colour: '#000' }), { d: 450, t: 22.5 }); // 20.4 kg: nearest is 20
});

test('side view draws one removable plate per entry, prints visible faces and escapes nothing unsafe', () => {
  const svg = renderBarbell({ plates: [p(25), p(25), p(10, '#16a34a'), p(2.5, '#111827')], collar: true });
  assert.equal(svg.match(/class="bb-plate/g).length, 4);
  assert.match(svg, /data-index="3"[^>]*aria-label="Remove 2.5 kg plate"/);
  assert.match(svg, />10<\/text>/, 'the 10 kg face shows behind the small 2.5 kg plate');
  assert.doesNotMatch(svg, />25<\/text>/, 'a 25 kg face covered by another 450 mm plate is not printed');
  assert.match(svg, />2\.5<\/text>/);
});

test('a stack longer than the sleeve is squeezed to fit, never past the sleeve end', () => {
  const svg = renderBarbell({ plates: Array.from({ length: 20 }, () => p(25)), collar: true });
  const xs = [...svg.matchAll(/class="bb-plate[^"]*" data-index="\d+"[\s\S]*?<path d="M([-\d.]+) /g)].map((m) => Number(m[1]));
  assert.equal(xs.length, 20);
  assert.ok(Math.max(...xs) < 415 * Math.cos((28 * Math.PI) / 180), 'last plate starts inside the sleeve');
});
