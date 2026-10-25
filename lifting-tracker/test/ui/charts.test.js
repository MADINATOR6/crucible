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
  const dots = html.match(/<path class="dot" d="([^"]+)"/);
  assert.equal((dots[1].match(/M/g) || []).length, 2, 'one dot per point, drawn as one path');
  for (const shape of html.matchAll(/<(?:line|path)\b[^>]*class="(?:grid-line|line|dot)"[^>]*>/g)) {
    assert.ok(shape[0].includes('vector-effect="non-scaling-stroke"'));
  }
  assert.doesNotMatch(html, /<div class="legend">/, 'a single series needs no legend; the title names it');
  assert.match(lineChart({ series: [{ id: 'squat', label: 'A', points: [{ x: '2026-01-01', y: 1 }] }, { id: 'bench', label: 'B', points: [{ x: '2026-01-09', y: 2 }] }], title: 't' }), /<div class="legend">/);
});

test('chart escapes plot names, legend labels and tooltips', () => {
  const series = [{ id: 'bench', label: '<script>"&', points: [{ x: '2026-01-01', y: 100 }] }, { id: 'squat', label: 'x', points: [{ x: '2026-01-02', y: 90 }] }];
  const html = lineChart({ series, unit: '<kg&', title: '"<trend>&', tips: [{ x: '2026-01-01', lines: ['<b>"&', '100<kg&'] }] });
  assert.doesNotMatch(html, /<script>|<kg&|<trend>|<b>"/);
  assert.match(html, /aria-label="&quot;&lt;trend&gt;&amp;"/);
  assert.match(html, /<span class="s-bench"><i><\/i>&lt;script&gt;&quot;&amp;<\/span>/);
  const tips = JSON.parse(html.match(/data-tips="([^"]+)"/)[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  assert.deepEqual(tips[0].l, ['<b>"&', '100<kg&']);
});

test('chart draws bands, meet and PR markers, and a projection range inside its domain', () => {
  const html = lineChart({
    series: [{ id: 'squat', label: '', kind: 'line', points: [{ x: '2026-01-01', y: 100 }, { x: '2026-02-01', y: 110 }], range: [{ x: '2026-02-01', lo: 110, hi: 110 }, { x: '2026-03-01', lo: 108, hi: 120 }] }],
    title: 't', domain: ['2026-01-01', '2026-03-01'],
    bands: [{ from: '2025-12-29', to: '2026-01-25', label: 'B1' }, { from: '2026-01-26', to: '2026-02-22', label: 'B2' }],
    markers: [{ x: '2026-03-01', label: 'Meet', kind: 'meet' }, { x: '2026-02-01', y: 110, label: 'PR', kind: 'pr' }],
  });
  assert.equal((html.match(/<rect class="band/g) || []).length, 2);
  assert.match(html, /class="band-label"[^>]*>B1</);
  assert.match(html, /class="mark-meet" style="left:100%"/);
  assert.match(html, /class="mark-pr"/);
  assert.match(html, /<path class="range" d="M/);
  assert.doesNotMatch(html, /class="dot"|NaN|Infinity/);
});

test('chart preserves empty and dense-series behaviour', () => {
  assert.match(lineChart({ series: [], title: 'Empty' }), /No data yet/);
  const points = Array.from({ length: 401 }, (_, i) => ({ x: '2026-01-01', y: i }));
  const html = lineChart({ series: [{ id: 'bw', label: 'Bodyweight', points }], title: 'Dense' });
  assert.match(html, /class="line"/);
  assert.doesNotMatch(html, /class="dot"|NaN|Infinity/);
});
