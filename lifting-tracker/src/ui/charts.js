// Small dependency-free SVG line chart. Pure string rendering.
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
 * @param {{ series: Array<{ id: string, label: string, points: Array<{ x: string, y: number }>, area?: boolean, dashed?: boolean }>,
 *           unit?: string, height?: number, title: string, zeroBased?: boolean }} o
 * x values are 'YYYY-MM-DD'. Series ids map to CSS classes (s-squat, s-bench, ...).
 */
export function lineChart({ series, unit = '', height = 220, title, zeroBased = false }) {
  const pts = series.flatMap((s) => s.points);
  if (pts.length === 0) return `<p class="muted small">No data yet.</p>`;
  const xs = pts.map((p) => dayNum(p.x));
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x1 - x0 < 6) { x0 -= 3; x1 += 3; }
  const ys = pts.map((p) => p.y);
  let y0 = zeroBased ? 0 : Math.min(...ys), y1 = Math.max(...ys);
  if (y1 === y0) { y0 -= 1; y1 += 1; }
  const step = niceStep(y1 - y0, 4);
  y0 = Math.floor(y0 / step) * step; y1 = Math.ceil(y1 / step) * step;
  const X = (d) => ((d - x0) / (x1 - x0)) * 100;
  const Y = (v) => 96 - ((v - y0) / (y1 - y0)) * 92;
  const grid = [];
  const yLabels = [];
  for (let v = y0; v <= y1 + 1e-9; v += step) {
    grid.push(`<line class="grid-line" x1="0" x2="100" y1="${Y(v)}" y2="${Y(v)}" vector-effect="non-scaling-stroke"/>`);
    yLabels.push(`<span style="top:${Y(v)}%">${Math.round(v * 10) / 10}</span>`);
  }
  const ticks = [];
  const nt = 5;
  for (let i = 0; i < nt; i++) {
    const d = x0 + ((x1 - x0) * i) / (nt - 1);
    const iso = new Date(d * 86400000).toISOString().slice(0, 10);
    ticks.push(`<span${i === 0 ? ' class="start"' : i === nt - 1 ? ' class="end"' : ''} style="left:${X(d)}%">${shortDate(iso)}</span>`);
  }
  const lines = series.map((s) => {
    const sorted = [...s.points].sort((a, b) => (a.x < b.x ? -1 : 1));
    if (sorted.length === 0) return '';
    const d = sorted.map((p, i) => `${i ? 'L' : 'M'}${X(dayNum(p.x)).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
    const area = s.area ? `<path class="area" d="${d} L${X(dayNum(sorted.at(-1).x)).toFixed(1)} ${Y(y0)} L${X(dayNum(sorted[0].x)).toFixed(1)} ${Y(y0)} Z"/>` : '';
    const dots = sorted.length <= 60 ? sorted.map((p) => `<path class="dot" d="M ${X(dayNum(p.x)).toFixed(1)} ${Y(p.y).toFixed(1)} h0" vector-effect="non-scaling-stroke"><title>${esc(s.label)} ${esc(longDate(p.x))}: ${Math.round(p.y * 10) / 10}${esc(unit)}</title></path>`).join('') : '';
    return `<g class="s-${s.id}">${area}<path class="line" ${s.dashed ? 'stroke-dasharray="5 5"' : ''} d="${d}" vector-effect="non-scaling-stroke"/>${dots}</g>`;
  }).join('');
  const legend = series.length > 1 || series[0]?.label ? `<div class="legend">${series.map((s) => `<span class="s-${s.id}"><i></i>${esc(s.label)}</span>`).join('')}</div>` : '';
  return `<figure class="chart-wrap" style="--chart-h:${height}px"><div class="chart-y">${yLabels.join('')}</div><svg class="chart-plot" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${grid.join('')}${lines}</svg><div class="chart-x">${ticks.join('')}</div>${legend}</figure>`;
}

/** Simple moving average over the previous `window` points (by position). */
export function movingAverage(points, window = 7) {
  const sorted = [...points].sort((a, b) => (a.x < b.x ? -1 : 1));
  return sorted.map((p, i) => {
    const slice = sorted.slice(Math.max(0, i - window + 1), i + 1);
    return { x: p.x, y: slice.reduce((a, q) => a + q.y, 0) / slice.length };
  });
}
