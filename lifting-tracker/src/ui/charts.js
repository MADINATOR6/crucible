// Small dependency-free SVG line chart. lineChart is pure string rendering; bindCharts adds the touch/mouse/keyboard
// crosshair and tooltip to rendered charts.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (iso) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
export const longDate = (iso) => `${shortDate(iso)} ${iso.slice(0, 4)}`;

function niceStep(range, target) {
  const raw = range / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/**
 * @param {{ series: Array<{ id: string, label: string, points: Array<{ x: string, y: number }>, area?: boolean, dashed?: boolean,
 *             kind?: 'both'|'line'|'dots', faint?: boolean, range?: Array<{ x: string, lo: number, hi: number }> }>,
 *           unit?: string, height?: number, title: string, zeroBased?: boolean, domain?: [string, string],
 *           bands?: Array<{ from: string, to: string, label: string }>, markers?: Array<{ x: string, y?: number, label: string, kind: 'meet'|'pr' }>,
 *           tips?: Array<{ x: string, lines: string[] }> }} o
 * x values are 'YYYY-MM-DD'. Series ids map to CSS classes (s-squat, s-bench, ...). `range` draws a shaded band
 * (a projection interval). `bands` shade periods (training blocks); `markers` are meet days (a vertical line) and
 * PRs (a star at y). `tips` are the tooltip contents per date (plain text lines).
 */
export function lineChart({ series, unit = '', height = 220, title, zeroBased = false, domain = null, bands = [], markers = [], tips = [] }) {
  const pts = series.flatMap((s) => [...s.points, ...(s.range || []).flatMap((r) => [{ x: r.x, y: r.lo }, { x: r.x, y: r.hi }])]);
  if (pts.length === 0) return `<p class="muted small">No data yet.</p>`;
  const xs = pts.map((p) => dayNum(p.x));
  let x0 = domain ? dayNum(domain[0]) : Math.min(...xs), x1 = domain ? dayNum(domain[1]) : Math.max(...xs);
  if (x1 - x0 < 6) { x0 -= 3; x1 += 3; }
  const ys = pts.filter((p) => dayNum(p.x) >= x0 && dayNum(p.x) <= x1).map((p) => p.y);
  if (!ys.length) return `<p class="muted small">No data in this range.</p>`;
  let y0 = zeroBased ? 0 : Math.min(...ys), y1 = Math.max(...ys);
  if (y1 === y0) { y0 -= 1; y1 += 1; }
  const step = niceStep(y1 - y0, 4);
  y0 = Math.floor(y0 / step) * step; y1 = Math.ceil(y1 / step) * step;
  const X = (d) => ((d - x0) / (x1 - x0)) * 100;
  const Y = (v) => 96 - ((v - y0) / (y1 - y0)) * 92;
  const inX = (iso) => dayNum(iso) >= x0 && dayNum(iso) <= x1;
  const grid = [], yLabels = [];
  for (let v = y0; v <= y1 + 1e-9; v += step) {
    grid.push(`<line class="grid-line" x1="0" x2="100" y1="${Y(v)}" y2="${Y(v)}" vector-effect="non-scaling-stroke"/>`);
    yLabels.push(`<span style="top:${Y(v)}%">${Math.round(v * 10) / 10}</span>`);
  }
  const ticks = [];
  for (let i = 0; i < 5; i++) {
    const d = x0 + ((x1 - x0) * i) / 4;
    const iso = new Date(d * 86400000).toISOString().slice(0, 10);
    ticks.push(`<span${i === 0 ? ' class="start"' : i === 4 ? ' class="end"' : ''} style="left:${X(d)}%">${x1 - x0 > 300 ? `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(2, 4)}` : shortDate(iso)}</span>`);
  }
  const clampX = (iso) => Math.min(100, Math.max(0, X(dayNum(iso))));
  const bandSvg = bands.filter((b) => dayNum(b.to) >= x0 && dayNum(b.from) <= x1).map((b, i) =>
    `<rect class="band${i % 2 ? ' alt' : ''}" x="${clampX(b.from)}" y="0" width="${Math.max(0, clampX(b.to) - clampX(b.from))}" height="100"/>`).join('');
  const bandLabels = bands.filter((b) => dayNum(b.to) >= x0 && dayNum(b.from) <= x1 && clampX(b.to) - clampX(b.from) > 9)
    .map((b) => `<span class="band-label" style="left:${clampX(b.from)}%">${esc(b.label)}</span>`).join('');
  const lines = series.map((s) => {
    const sorted = [...s.points].filter((p) => inX(p.x)).sort((a, b) => (a.x < b.x ? -1 : 1));
    const rg = (s.range || []).filter((r) => inX(r.x)).sort((a, b) => (a.x < b.x ? -1 : 1));
    const range = rg.length > 1 ? `<path class="range" d="${rg.map((r, i) => `${i ? 'L' : 'M'}${X(dayNum(r.x)).toFixed(2)} ${Y(r.hi).toFixed(2)}`).join(' ')} ${[...rg].reverse().map((r) => `L${X(dayNum(r.x)).toFixed(2)} ${Y(r.lo).toFixed(2)}`).join(' ')} Z"/>` : '';
    if (sorted.length === 0) return range ? `<g class="s-${s.id}">${range}</g>` : '';
    const d = sorted.map((p, i) => `${i ? 'L' : 'M'}${X(dayNum(p.x)).toFixed(2)} ${Y(p.y).toFixed(2)}`).join(' ');
    const kind = s.kind || 'both';
    const area = s.area ? `<path class="area" d="${d} L${X(dayNum(sorted.at(-1).x)).toFixed(2)} ${Y(y0)} L${X(dayNum(sorted[0].x)).toFixed(2)} ${Y(y0)} Z"/>` : '';
    const line = kind === 'dots' ? '' : `<path class="line" ${s.dashed ? 'stroke-dasharray="5 5"' : ''} d="${d}" vector-effect="non-scaling-stroke"/>`;
    const dots = kind !== 'line' && sorted.length <= 400 ? `<path class="dot" d="${sorted.map((p) => `M${X(dayNum(p.x)).toFixed(2)} ${Y(p.y).toFixed(2)}h0`).join('')}" vector-effect="non-scaling-stroke"/>` : '';
    return `<g class="s-${s.id}${s.faint ? ' faint' : ''}">${range}${area}${line}${dots}</g>`;
  }).join('');
  const marks = markers.filter((m) => inX(m.x)).map((m) => m.kind === 'meet'
    ? `<span class="mark-meet" style="left:${X(dayNum(m.x))}%"><b>${esc(m.label)}</b></span>`
    : `<span class="mark-pr" style="left:${X(dayNum(m.x))}%;top:${Y(m.y)}%" aria-hidden="true">★</span>`).join('');
  const tipData = tips.filter((t) => inX(t.x)).map((t) => ({ p: +X(dayNum(t.x)).toFixed(2), l: t.lines }));
  const legend = series.filter((s) => s.label).length > 1 ? `<div class="legend">${series.filter((s) => s.label).map((s) => `<span class="s-${s.id}"><i></i>${esc(s.label)}</span>`).join('')}</div>` : '';
  return `<figure class="chart-wrap" style="--chart-h:${height}px"><div class="chart-y">${yLabels.join('')}</div>`
    + `<div class="chart-area"${tipData.length ? ` tabindex="0" data-tips="${esc(JSON.stringify(tipData))}" aria-label="${esc(title)}. Use the arrow keys to read each point."` : ''}>`
    + `<svg class="chart-plot" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${bandSvg}${grid.join('')}${lines}</svg>`
    + `${bandLabels}${marks}<span class="chart-cross" hidden></span><div class="chart-tip" role="status" hidden></div></div>`
    + `<div class="chart-x">${ticks.join('')}</div>${legend}</figure>`;
}

/** Crosshair + tooltip for every chart under `root`: drag a finger or move the mouse; arrow keys step through points. */
export function bindCharts(root) {
  for (const area of root.querySelectorAll('.chart-area[data-tips]')) {
    const tips = JSON.parse(area.dataset.tips);
    const cross = area.querySelector('.chart-cross'), tip = area.querySelector('.chart-tip');
    let idx = -1;
    const show = (i) => {
      idx = Math.max(0, Math.min(tips.length - 1, i));
      const t = tips[idx];
      cross.hidden = tip.hidden = false;
      cross.style.left = `${t.p}%`;
      tip.replaceChildren(...t.l.map((line, k) => Object.assign(document.createElement(k ? 'span' : 'b'), { textContent: line })));
      tip.style.left = `${Math.min(100, Math.max(0, t.p))}%`;
      tip.dataset.side = t.p > 60 ? 'left' : 'right';
    };
    const hide = () => { cross.hidden = tip.hidden = true; idx = -1; };
    const nearest = (e) => {
      const r = area.getBoundingClientRect(), p = ((e.clientX - r.left) / r.width) * 100;
      let best = 0;
      tips.forEach((t, i) => { if (Math.abs(t.p - p) < Math.abs(tips[best].p - p)) best = i; });
      return best;
    };
    area.addEventListener('pointermove', (e) => show(nearest(e)));
    area.addEventListener('pointerdown', (e) => show(nearest(e)));
    area.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    area.addEventListener('blur', hide);
    area.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); show(idx < 0 ? tips.length - 1 : idx + (e.key === 'ArrowRight' ? 1 : -1)); }
      else if (e.key === 'Escape') hide();
    });
  }
}

/** Average over the previous `window` days (inclusive of the point's own day). */
export function movingAverage(points, window = 7) {
  const sorted = [...points].sort((a, b) => (a.x < b.x ? -1 : 1));
  return sorted.map((p) => {
    const t = dayNum(p.x);
    const slice = sorted.filter((q) => dayNum(q.x) <= t && dayNum(q.x) > t - window);
    return { x: p.x, y: slice.reduce((a, q) => a + q.y, 0) / slice.length };
  });
}
