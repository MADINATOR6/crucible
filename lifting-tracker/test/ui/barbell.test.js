import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBarbell, renderEndView, plateSize, plateInk } from '../../src/ui/barbell.js';
import { readFileSync } from 'node:fs';

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

test('plate ink picks the higher contrast and every catalogue colour reaches AA', () => {
  const luminance = (hex) => {
    const [r, g, b] = hex.slice(1).match(/../g).map((v) => {
      const c = parseInt(v, 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const data = JSON.parse(readFileSync(new URL('../../data/plates.json', import.meta.url)));
  for (const plate of [...data.kg.plates, ...data.lb.plates]) {
    const bg = luminance(plate.colour), chosen = contrast(bg, luminance(plateInk(plate.colour)));
    assert.ok(chosen >= 4.5, plate.colour);
    assert.equal(chosen, Math.max(contrast(bg, 1), contrast(bg, luminance('#101114'))));
  }
  assert.equal(plateInk('#16a34a'), '#101114');
});

test('small side print is omitted and end view prints only the nearest plate', () => {
  const plates = [p(25), p(25), p(20), p(10, '#16a34a'), p(2.5, '#111827'), p(1.25, '#aeb8c6')];
  for (const collar of [false, true]) {
    const side = renderBarbell({ plates, collar });
    assert.match(side, />10<\/text>/);
    assert.match(side, />1\.25<\/text>/, 'weight print is still at least 9 px tall');
    assert.doesNotMatch(renderBarbell({ plates: [p(0.25)], collar }), />0\.25<\/text>/);
    assert.doesNotMatch(renderBarbell({ plates: [p(1.25)], collar }), />KG<\/text>/, 'the smaller unit print is below 9 px');
    assert.match(side, /aria-label="Remove 1.25 kg plate"/);
    assert.equal((side.match(/stroke="white" stroke-opacity=/g) || []).length, plates.length);
    const end = renderEndView({ plates, collar });
    assert.match(end, />1\.25<\/text>/);
    assert.doesNotMatch(end, />(25|20|10|2\.5)<\/text>/);
    assert.equal((end.match(/stroke="white" stroke-opacity=/g) || []).length, plates.length);
  }
});

test('a stack longer than the sleeve is squeezed to fit, never past the sleeve end', () => {
  const svg = renderBarbell({ plates: Array.from({ length: 20 }, () => p(25)), collar: true });
  const xs = [...svg.matchAll(/class="bb-plate[^"]*" data-index="\d+"[\s\S]*?<path d="M([-\d.]+) /g)].map((m) => Number(m[1]));
  assert.equal(xs.length, 20);
  assert.ok(Math.max(...xs) < 415 * Math.cos((28 * Math.PI) / 180), 'last plate starts inside the sleeve');
});
