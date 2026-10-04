// Front/back muscle heat map. Pure string rendering (no DOM access): returns SVG/HTML markup.
// Geometry is written for the left half of the body and mirrored for the right half, so each muscle is
// drawn once. Every region carries its number on a pill (never colour alone) and an accessible name.

export const BANDS = [
  { id: 0, min: 0, max: 0, label: 'None', hint: '0 sets' },
  { id: 1, min: 0.1, max: 5.9, label: 'Low', hint: 'under 6 hard sets' },
  { id: 2, min: 6, max: 9.9, label: 'Maintain', hint: '6 to 9 hard sets' },
  { id: 3, min: 10, max: 15.9, label: 'Build', hint: '10 to 15 hard sets' },
  { id: 4, min: 16, max: 20.9, label: 'High', hint: '16 to 20 hard sets' },
  { id: 5, min: 21, max: Infinity, label: 'Very high', hint: '21+ hard sets' },
];

export function bandFor(sets) {
  const n = Number(sets) || 0;
  if (n <= 0) return BANDS[0];
  return BANDS.find((b) => n >= b.min && n <= b.max) || BANDS[5];
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

const rr = (x, y, w, h, r = 3) => `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;

// Left-half geometry in a 220 x 480 box (centre line x = 110). `d` is a list of sub-shapes drawn as one muscle.
// `label` is where the number pill sits ([x, y]); centred muscles use x >= 104 and are drawn once on the midline.
const FRONT = {
  traps: { d: ['M107 58 C100 63 88 69 73 79 C82 84 94 80 102 74 C106 70 108 65 107 58 Z'], label: [92, 72], tiny: true },
  front_delts: { d: ['M74 84 C66 86 60 92 58 102 C57 112 58 122 60 132 C65 126 68 114 70 104 C72 96 76 90 82 87 C79 85 77 84 74 84 Z'], label: [67, 100], tiny: true },
  side_delts: { d: ['M74 84 C62 84 52 91 49 103 C47 113 49 125 54 136 L60 132 C58 122 57 112 58 102 C60 92 66 86 74 84 Z'], label: [47, 116], tiny: true },
  chest: { d: ['M108 92 C100 88 90 88 82 92 C74 96 70 104 70 113 C70 123 76 131 86 133 C96 135 105 131 108 127 Z'], label: [88, 112] },
  biceps: { d: ['M50 138 C54 133 60 133 64 138 C66 150 64 162 62 174 L49 174 C46 162 47 148 50 138 Z'], label: [56, 154] },
  forearms: { d: ['M49 178 L62 178 C64 192 62 214 58 238 L48 240 C44 218 44 192 49 178 Z'], label: [53, 206], tiny: true },
  abs: {
    d: [rr(101, 138, 8, 15), rr(101, 156, 8, 15), rr(101, 174, 8, 15), rr(101, 192, 8, 14),
      'M96 140 C88 144 80 152 78 166 C77 180 80 196 86 208 L96 208 C94 196 93 184 93 172 C93 160 94 150 96 140 Z'],
    label: [105, 172], tiny: true,
  },
  adductors: { d: ['M94 240 C100 243 106 243 108 246 L108 298 C104 302 98 306 95 302 C95 282 94 262 94 240 Z'], label: [101, 272], tiny: true },
  quads: {
    d: ['M76 240 C68 262 64 296 69 324 C73 340 83 346 91 342 C95 330 97 300 95 270 C94 254 93 244 91 238 Z',
      'M92 306 C97 308 99 322 96 336 C91 340 87 334 89 324 C89 316 90 310 92 306 Z'],
    label: [78, 288],
  },
};
const FRONT_BASE = [
  'M108 62 L100 66 C88 72 78 76 72 82 C68 90 68 100 68 112 C68 124 72 134 76 146 C80 160 80 180 80 198 C80 210 78 226 74 240 C66 262 62 296 66 326 C68 340 72 350 72 354 C72 390 74 424 78 448 L92 448 C94 420 94 386 94 356 C96 350 100 346 100 336 C104 300 106 270 108 244 Z',
  'M74 84 C60 84 50 92 47 106 C45 120 46 134 48 150 C46 164 44 178 44 196 C44 216 46 232 48 244 L58 244 C60 232 62 216 64 196 C66 176 68 160 68 146 C70 132 68 118 66 108 C68 98 72 90 76 86 Z',
];
const BACK_BASE = FRONT_BASE;
const FRONT_NEUTRAL = [
  'M99 48 L97 66 L108 74 L108 48 Z',
  'M86 208 C88 220 92 232 96 240 L108 240 L108 208 Z',
  'M71 350 C77 348 89 350 93 353 C95 382 93 422 91 448 L79 448 C75 422 71 382 71 350 Z',
  'M48 242 L58 242 L58 262 C56 272 51 272 48 262 Z',
  'M79 450 L92 450 L97 470 L73 472 Z',
  'M82 336 m-9 0 a9 7 0 1 0 18 0 a9 7 0 1 0 -18 0',
];

const BACK = {
  traps: { d: ['M107 58 C97 63 85 69 73 79 C81 94 95 110 107 130 Z'], label: [94, 92] },
  upper_back: { d: ['M73 82 C80 92 94 108 107 130 L107 144 C97 144 86 140 77 132 C69 122 68 104 73 82 Z'], label: [88, 126], tiny: true },
  rear_delts: { d: ['M74 82 C64 84 55 91 52 101 C51 109 53 116 58 121 C62 112 67 101 71 93 C73 89 75 85 74 82 Z'], label: [60, 104], tiny: true },
  side_delts: { d: ['M52 101 C48 110 47 121 50 132 C54 128 57 124 58 121 C54 116 51 109 52 101 Z'], label: [50, 118], tiny: true },
  lats: { d: ['M77 133 C87 140 96 144 101 148 C95 162 93 186 95 210 C88 202 82 190 78 176 C72 160 72 144 77 133 Z'], label: [84, 168] },
  lower_back: { d: ['M101 148 L107 146 L107 214 C101 216 97 214 94 210 C93 186 95 162 101 148 Z'], label: [102, 184], tiny: true },
  triceps: { d: ['M50 136 C55 130 62 131 66 138 C68 150 66 164 63 176 L49 176 C45 162 46 148 50 136 Z'], label: [57, 154] },
  forearms: { d: ['M49 180 L62 180 C64 194 62 216 58 238 L48 240 C44 218 44 194 49 180 Z'], label: [53, 208], tiny: true },
  glutes: { d: ['M107 210 C97 206 84 208 76 218 C70 228 72 246 82 256 C92 262 102 260 107 254 Z'], label: [88, 234] },
  hamstrings: { d: ['M77 260 C71 278 69 306 73 332 C79 342 89 344 97 340 C103 322 105 290 103 264 C95 264 85 264 77 260 Z'], label: [88, 300] },
  calves: { d: ['M73 348 C67 364 67 390 75 412 C81 418 89 416 93 406 C97 386 97 364 93 348 C87 344 79 344 73 348 Z'], label: [82, 380] },
};
const BACK_NEUTRAL = [
  'M99 48 L97 66 L108 74 L108 48 Z',
  'M48 242 L58 242 L58 262 C56 272 51 272 48 262 Z',
  'M75 420 C79 424 89 424 93 420 L91 448 L79 448 Z',
  'M79 450 L92 450 L97 470 L73 472 Z',
];

const mirror = 'translate(220 0) scale(-1 1)';

function figure(view, geo, neutral, data, selected, prev, baseShapes) {
  const regions = Object.entries(geo);
  const defs = BANDS.map((b) => `<linearGradient id="hmg-${view}-${b.id}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" style="stop-color:color-mix(in srgb, var(--b${b.id}) 78%, #fff)"/><stop offset="0.55" style="stop-color:var(--b${b.id})"/><stop offset="1" style="stop-color:color-mix(in srgb, var(--b${b.id}) 82%, #000)"/></linearGradient>`).join('');
  const paths = regions.map(([id, g]) => {
    const n = data[id] ?? 0;
    const band = bandFor(n);
    const sel = selected === id ? ' is-selected' : '';
    const delta = prev ? n - (prev[id] ?? 0) : null;
    const dtxt = delta == null || delta === 0 ? '' : `, ${delta > 0 ? 'up' : 'down'} ${fmtSets(Math.abs(delta))} on the previous week`;
    const aria = `${MUSCLE_LABELS[id]}: ${fmtSets(n)} hard sets, ${band.label}${dtxt}`;
    const common = `class="hm-region band-${band.id}${sel}" data-muscle="${id}" style="fill:url(#hmg-${view}-${band.id})" tabindex="0" role="button" aria-label="${esc(aria)}"`;
    return `<g class="hm-muscle" data-muscle="${id}"><title>${esc(aria)}</title>${g.d.map((d) => `<path ${common} d="${d}"/><path ${common} d="${d}" transform="${mirror}"/>`).join('')}</g>`;
  }).join('');
  const body = baseShapes.map((d) => `<path class="hm-body" d="${d}"/><path class="hm-body" d="${d}" transform="${mirror}"/>`).join('');
  const base = body + neutral.map((d) => `<path class="hm-neutral" d="${d}"/><path class="hm-neutral" d="${d}" transform="${mirror}"/>`).join('');
  const head = '<ellipse class="hm-neutral" cx="110" cy="29" rx="17" ry="21"/>';
  const labels = regions.map(([id, g]) => {
    const n = data[id] ?? 0;
    const [x, y] = g.label;
    const t = fmtSets(n);
    const w = Math.max(g.tiny ? 13 : 16, 7 + t.length * 5.4), h = g.tiny ? 13 : 15;
    const cx = x >= 104 ? 110 : x;
    return `<g class="hm-pill" data-muscle="${id}" pointer-events="none"><rect x="${cx - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${h / 2}"/><text x="${cx}" y="${y + 0.5}" font-size="${g.tiny ? 8 : 9.2}">${t}</text></g>`;
  }).join('');
  return `<svg class="hm-svg" viewBox="0 0 220 480" role="group" aria-label="${view} view muscle heat map" data-view="${view}"><defs>${defs}</defs>${base}${head}${paths}${labels}</svg>`;
}

/**
 * @param {Record<string, number>} data  weekly hard sets per muscle id (missing = 0)
 * @param {{ selected?: string|null, view?: 'front'|'back', prev?: Record<string, number>|null }} opts
 */
export function renderHeatmap(data, { selected = null, view = 'front', prev = null } = {}) {
  return `<div class="hm" data-active-view="${view}">
    <div class="hm-figures">
      <figure class="hm-fig" data-view="front"><figcaption>Front</figcaption>${figure('front', FRONT, FRONT_NEUTRAL, data, selected, prev, FRONT_BASE)}</figure>
      <figure class="hm-fig" data-view="back"><figcaption>Back</figcaption>${figure('back', BACK, BACK_NEUTRAL, data, selected, prev, BACK_BASE)}</figure>
    </div>
  </div>`;
}

export function renderLegend() {
  return `<ul class="hm-legend" aria-label="Heat map scale">${BANDS.map((b) => `<li><i class="sw band-${b.id}"></i><b>${b.label}</b><span>${b.hint}</span></li>`).join('')}</ul>`;
}

/** Sorted list (also the accessible, colour-independent view). Bars show a 10-20 set target zone and the change on `prev`. */
export function renderMuscleList(data, selected, prev = null) {
  const ids = Object.keys(MUSCLE_LABELS);
  const rows = ids.map((id) => ({ id, n: data[id] ?? 0 })).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  const max = Math.max(24, ...rows.map((r) => r.n));
  const pct = (v) => `${Math.min(100, (v / max) * 100).toFixed(2)}%`;
  return `<ol class="hm-list">${rows.map(({ id, n }) => {
    const band = bandFor(n);
    const delta = prev ? Math.round((n - (prev[id] ?? 0)) * 10) / 10 : null;
    const dhtml = delta == null ? '' : delta === 0 ? '<span class="hm-delta flat" title="No change on the previous week">·</span>'
      : `<span class="hm-delta ${delta > 0 ? 'up' : 'down'}" title="${delta > 0 ? '+' : ''}${fmtSets(delta)} on the previous week">${delta > 0 ? '▲' : '▼'} ${fmtSets(Math.abs(delta))}</span>`;
    return `<li><button class="hm-row${selected === id ? ' is-selected' : ''}" data-muscle="${id}" type="button">
      <span class="hm-row-name">${MUSCLE_LABELS[id]}</span>
      <span class="hm-bar"><i class="zone" style="left:${pct(10)};width:calc(${pct(20)} - ${pct(10)})"></i><i class="fill band-${band.id}" style="width:${pct(n)}"></i></span>
      <span class="hm-row-n">${fmtSets(n)}</span>${dhtml || '<span></span>'}<span class="hm-row-band">${band.label}</span>
    </button></li>`;
  }).join('')}</ol>`;
}
