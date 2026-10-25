import test from 'node:test';
import assert from 'node:assert/strict';
import { bandFor, fmtSets, renderHeatmap, renderLegend, BANDS, MUSCLE_LABELS } from '../../src/ui/heatmap.js';
import { lineChart, movingAverage } from '../../src/ui/charts.js';

test('band boundaries', () => {
  const id = (n) => bandFor(n).id;
  assert.deepEqual([0, 0.5, 5.9, 6, 9.5, 10, 15.5, 16, 20.5, 21, 40].map(id), [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  assert.equal(BANDS.length, 6);
});

test('set counts are printed without float noise', () => {
  assert.equal(fmtSets(4), '4'); assert.equal(fmtSets(4.5), '4.5'); assert.equal(fmtSets(0.1 + 0.2), '0.3'); assert.equal(fmtSets(undefined), '0');
});

test('heat map shows a number for every muscle and escapes nothing unsafe', () => {
  const data = Object.fromEntries(Object.keys(MUSCLE_LABELS).map((k, i) => [k, i + 0.5]));
  const svg = renderHeatmap(data);
  for (const id of Object.keys(MUSCLE_LABELS)) {
    assert.ok(svg.includes(`data-muscle="${id}"`), id + ' region present');
    assert.ok(svg.includes(`aria-label="${MUSCLE_LABELS[id]}: ${fmtSets(data[id])} hard sets`), id + ' has an accessible name with its number');
  }
  assert.equal((svg.match(/<svg /g) || []).length, 2); // front and back
});

test('line chart handles empty, single-point and flat series', () => {
  assert.match(lineChart({ series: [{ id: 'squat', label: 'Squat', points: [] }], title: 't' }), /No data yet/);
  assert.match(lineChart({ series: [{ id: 'squat', label: 'Squat', points: [{ x: '2026-01-01', y: 100 }] }], title: 't' }), /<svg/);
  assert.match(lineChart({ series: [{ id: 'bench', label: 'Bench', points: [{ x: '2026-01-01', y: 100 }, { x: '2026-02-01', y: 100 }] }], title: 't' }), /<path class="line"/);
});

test('moving average uses the previous N points', () => {
  const out = movingAverage([{ x: '2026-01-03', y: 30 }, { x: '2026-01-01', y: 10 }, { x: '2026-01-02', y: 20 }], 2);
  assert.deepEqual(out.map((p) => p.y), [10, 15, 25]);
});

test('heat map crops the body and keeps readable, separate pills on both views', () => {
  const data = Object.fromEntries(Object.keys(MUSCLE_LABELS).map((id) => [id, 99.5]));
  const html = renderHeatmap(data);
  for (const svg of html.matchAll(/<svg\b[^>]*viewBox="([\d. ]+)"[^>]*>([\s\S]*?)<\/svg>/g)) {
    const [x, y, width, height] = svg[1].split(' ').map(Number);
    assert.ok(width <= 150 && x >= 38 && x <= 44 && x + width >= 176 && x + width <= 182);
    assert.ok(y >= 2 && y <= 8 && y + height >= 472 && y + height <= 478);
    const pills = [...svg[2].matchAll(/<g class="hm-pill"[\s\S]*?<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[\s\S]*?font-size="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
    assert.ok(pills.length);
    for (const [i, [px, py, w, h, font]] of pills.entries()) {
      assert.ok(font * 560 / height >= 11, 'font at the 560 px minimum figure height (styles/app.css .hm-svg)');
      for (const [qx, qy, qw, qh] of pills.slice(i + 1)) {
        assert.ok(px + w <= qx || qx + qw <= px || py + h <= qy || qy + qh <= py, 'pills do not overlap');
      }
    }
  }
  assert.equal((html.match(/viewBox="38 2 144 476"/g) || []).length, 2);
});

test('legend keeps all six bands and their hints', () => {
  const html = renderLegend();
  assert.equal((html.match(/<li>/g) || []).length, 6);
  for (const b of BANDS) {
    assert.ok(html.includes(`band-${b.id}`));
    assert.ok(html.includes(b.label));
    assert.ok(html.includes(b.hint));
  }
});
