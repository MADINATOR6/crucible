import test from 'node:test';
import assert from 'node:assert/strict';
import { lineChart } from '../../src/ui/charts.js';

test('chart uses HTML labels aligned with its normalised plot', () => {
  const html = lineChart({
    series: [{ id: 'squat', label: 'Squat', area: true, dashed: true, points: [
      { x: '2026-01-01', y: 100 }, { x: '2026-02-01', y: 150 },
    ] }], title: 'Lift trend', height: 180, zeroBased: true,
  });
  assert.doesNotMatch(html, /<text\b/);
  assert.match(html, /<figure class="chart-wrap" style="--chart-h:180px">/);
  assert.match(html, /<svg class="chart-plot" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Lift trend"><title>Lift trend<\/title>/);
  const x = html.match(/<div class="chart-x">([\s\S]*?)<\/div>/)[1];
  assert.equal((x.match(/<span/g) || []).length, 5);
  assert.match(x, /class="start" style="left:0%"/);
  assert.match(x, /class="end" style="left:100%"/);
  const y = [...html.matchAll(/<span style="top:([\d.]+)%">([^<]+)<\/span>/g)];
  const grid = [...html.matchAll(/<line class="grid-line"[^>]+/g)];
  assert.equal(y.length, grid.length);
  assert.equal(y[0][2], '0');
  y.forEach((label, i) => {
    assert.ok(+label[1] >= 4 && +label[1] <= 96);
    assert.ok(grid[i][0].includes(`y1="${label[1]}"`));
  });
  assert.match(html, /<g class="s-squat"><path class="area"/);
  assert.match(html, /class="line" stroke-dasharray="5 5"/);
  assert.equal((html.match(/class="dot"/g) || []).length, 2);
  for (const shape of html.matchAll(/<(?:line|path)\b[^>]*class="(?:grid-line|line|dot)"[^>]*>/g)) {
    assert.ok(shape[0].includes('vector-effect="non-scaling-stroke"'));
  }
  assert.match(html, /<div class="legend">/);
});

test('chart escapes plot names, legend labels and dot tooltips', () => {
  const html = lineChart({ series: [{ id: 'bench', label: '<script>"&', points: [{ x: '2026-01-01', y: 100 }] }], unit: '<kg&', title: '"<trend>&' });
  assert.doesNotMatch(html, /<script>|<kg&|<trend>/);
  assert.match(html, /aria-label="&quot;&lt;trend&gt;&amp;"/);
  assert.match(html, /<path class="dot" d="M [\d.]+ [\d.]+ h0"[^>]*><title>&lt;script&gt;&quot;&amp; 1 Jan 2026: 100&lt;kg&amp;<\/title>/);
});

test('chart preserves empty and dense-series behaviour', () => {
  assert.match(lineChart({ series: [], title: 'Empty' }), /No data yet/);
  const points = Array.from({ length: 61 }, (_, i) => ({ x: '2026-01-01', y: i }));
  const html = lineChart({ series: [{ id: 'bw', label: 'Bodyweight', points }], title: 'Dense' });
  assert.match(html, /class="line"/);
  assert.doesNotMatch(html, /class="dot"|NaN|Infinity/);
});
