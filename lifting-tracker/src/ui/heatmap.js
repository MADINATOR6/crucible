// Front/back muscle heat map. Pure string rendering (no DOM access): returns SVG/HTML markup.
// Every region carries its number on a pill (never colour alone) and an accessible name.
import { VIEW, FRONT, BACK } from './heatmap-body.js';

export const BANDS = [
  { id: 0, min: 0, max: 0, label: 'None', hint: '0 sets' },
  { id: 1, min: 0.1, max: 5.9, label: 'Low', hint: 'under 6 hard sets' },
  { id: 2, min: 6, max: 9.9, label: 'Maintain', hint: '6 to 9 hard sets' },
  { id: 3, min: 10, max: 15.9, label: 'Build', hint: '10 to 15 hard sets' },
  { id: 4, min: 16, max: 20.9, label: 'High', hint: '16 to 20 hard sets' },
  { id: 5, min: 21, max: Infinity, label: 'Very high', hint: '21+ hard sets' },
];

export const RECOVERY_BANDS = [
  { id: 0, min: 0, max: 0, label: 'Fresh', hint: '0 weighted sets' },
  { id: 1, min: 0, max: 2, label: 'Light', hint: 'under 2 weighted sets' },
  { id: 2, min: 2, max: 4, label: 'Some', hint: '2 to 4 weighted sets' },
  { id: 3, min: 4, max: 7, label: 'Worked', hint: '4 to 7 weighted sets' },
  { id: 4, min: 7, max: 10, label: 'Heavy', hint: '7 to 10 weighted sets' },
  { id: 5, min: 10, max: Infinity, label: 'Very heavy', hint: '10+ weighted sets' },
];

export function bandFor(sets, bands = BANDS) {
  const n = Number(sets) || 0;
  if (n <= 0) return bands[0];
  return bands.find((b, i) => n >= b.min && n <= b.max && (i === bands.length - 1 || n < bands[i + 1].min)) || bands[5];
}

export function fmtSets(n) {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const MUSCLE_LABELS = {
  chest: 'Chest', front_delts: 'Front delts', side_delts: 'Side delts', rear_delts: 'Rear delts', traps: 'Traps',
  lats: 'Lats', upper_back: 'Upper back', lower_back: 'Lower back', biceps: 'Biceps', triceps: 'Triceps',
  forearms: 'Forearms', abs: 'Abs', glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings',
  adductors: 'Adductors', calves: 'Calves',
};

// Outlines traced from the 3D body (src/ui/heatmap-body.js, made by assets/build_map2d.py), with the sculpt's
// shading laid over the colours from assets/body-<view>.webp.
function figure(view, geo, data, selected, prev, bands) {
  const regions = Object.entries(geo.regions);
  const defs = bands.map((b) => `<linearGradient id="hmg-${view}-${b.id}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" style="stop-color:color-mix(in srgb, var(--b${b.id}) 78%, #fff)"/><stop offset="0.55" style="stop-color:var(--b${b.id})"/><stop offset="1" style="stop-color:color-mix(in srgb, var(--b${b.id}) 82%, #000)"/></linearGradient>`).join('');
  const paths = regions.map(([id, g]) => {
    const n = data[id] ?? 0;
    const band = bandFor(n, bands);
    const sel = selected === id ? ' is-selected' : '';
    const delta = prev ? n - (prev[id] ?? 0) : null;
    const dtxt = delta == null || delta === 0 ? '' : `, ${delta > 0 ? 'up' : 'down'} ${fmtSets(Math.abs(delta))} on the previous week`;
    const aria = `${MUSCLE_LABELS[id]}: ${fmtSets(n)} ${bands === BANDS ? 'hard sets' : 'weighted sets'}, ${band.label}${dtxt}`;
    return `<g class="hm-muscle" data-muscle="${id}"><title>${esc(aria)}</title><path class="hm-region band-${band.id}${sel}" data-muscle="${id}" style="fill:url(#hmg-${view}-${band.id})" fill-rule="evenodd" tabindex="0" role="button" aria-label="${esc(aria)}" d="${g.d}"/></g>`;
  }).join('');
  const body = `<path class="hm-body" fill-rule="evenodd" d="${geo.outline}"/>`;
  const shade = `<image class="hm-shade" href="assets/body-${view}.webp" width="${VIEW.w}" height="${VIEW.h}" preserveAspectRatio="none" pointer-events="none" aria-hidden="true"/>`;
  const labels = regions.filter(([, g]) => g.label).map(([id, g]) => {
    const t = fmtSets(data[id] ?? 0);
    const [x, y] = g.label;
    // The CSS gives the figure at least 560 px of height for its 476 units, so the smallest number is 9.4 * 560 / 476 = 11.06 px.
    const w = Math.max(g.tiny ? 14.5 : 17, 7 + t.length * 6), h = g.tiny ? 14.5 : 16.5;
    return `<g class="hm-pill" data-muscle="${id}" pointer-events="none"><rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${h / 2}"/><text x="${x}" y="${y + 0.5}" font-size="${g.tiny ? 9.4 : 10.4}">${t}</text></g>`;
  }).join('');
  return `<svg class="hm-svg" viewBox="0 0 ${VIEW.w} ${VIEW.h}" role="group" aria-label="${view} view muscle heat map" data-view="${view}"><defs>${defs}</defs>${body}${paths}${shade}${labels}</svg>`;
}

/**
 * @param {Record<string, number>} data  weekly hard sets per muscle id (missing = 0)
 * @param {{ selected?: string|null, view?: 'front'|'back', prev?: Record<string, number>|null }} opts
 */
export function renderHeatmap(data, { selected = null, view = 'front', prev = null, bands = BANDS } = {}) {
  return `<div class="hm" data-active-view="${view}">
    <div class="hm-figures">
      <figure class="hm-fig" data-view="front"><figcaption>Front</figcaption>${figure('front', FRONT, data, selected, prev, bands)}</figure>
      <figure class="hm-fig" data-view="back"><figcaption>Back</figcaption>${figure('back', BACK, data, selected, prev, bands)}</figure>
    </div>
  </div>`;
}

export function renderLegend(bands = BANDS) {
  return `<ul class="hm-legend" aria-label="Heat map scale">${bands.map((b) => `<li><i class="sw band-${b.id}"></i><b>${b.label}</b><span>${b.hint}</span></li>`).join('')}</ul>`;
}

/** Sorted list (also the accessible, colour-independent view). Bars show a 10-20 set target zone and the change on `prev`. */
export function renderMuscleList(data, selected, prev = null, { bands = BANDS, zone = true } = {}) {
  const ids = Object.keys(MUSCLE_LABELS);
  const rows = ids.map((id) => ({ id, n: data[id] ?? 0 })).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  const max = Math.max(24, ...rows.map((r) => r.n));
  const pct = (v) => `${Math.min(100, (v / max) * 100).toFixed(2)}%`;
  return `<ol class="hm-list">${rows.map(({ id, n }) => {
    const band = bandFor(n, bands);
    const delta = prev ? Math.round((n - (prev[id] ?? 0)) * 10) / 10 : null;
    const dhtml = delta == null ? '' : delta === 0 ? '<span class="hm-delta flat" title="No change on the previous week">·</span>'
      : `<span class="hm-delta ${delta > 0 ? 'up' : 'down'}" title="${delta > 0 ? '+' : ''}${fmtSets(delta)} on the previous week">${delta > 0 ? '▲' : '▼'} ${fmtSets(Math.abs(delta))}</span>`;
    return `<li><button class="hm-row${selected === id ? ' is-selected' : ''}" data-muscle="${id}" type="button">
      <span class="hm-row-name">${MUSCLE_LABELS[id]}</span>
      <span class="hm-bar">${zone ? `<i class="zone" style="left:${pct(10)};width:calc(${pct(20)} - ${pct(10)})"></i>` : ''}<i class="fill band-${band.id}" style="width:${pct(n)}"></i></span>
      <span class="hm-row-n">${fmtSets(n)}</span>${dhtml || '<span></span>'}<span class="hm-row-band">${band.label}</span>
    </button></li>`;
  }).join('')}</ol>`;
}
