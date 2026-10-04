// Front/back muscle heat map. Pure string rendering (no DOM access): returns SVG markup.
// Each region is drawn for the left half and mirrored for the right half, so geometry is written once.
// Numbers sit on every region (never colour alone); bands also have a text label for the legend/list.

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

// Left-half geometry (viewBox 0 0 200 430, centre line x = 100). `c` = optional centre-line shapes (not mirrored).
// `label` is where the number pill goes: [x, y] on the left half (centred muscles use x = 100).
const FRONT = {
  traps: { d: 'M97 58 L90 60 L76 68 L66 77 L80 82 L94 72 Z', label: [88, 68], tiny: true },
  front_delts: { d: 'M66 77 L58 79 L53 88 L53 103 L63 101 L71 92 L80 83 Z', label: [62, 90] },
  side_delts: { d: 'M58 79 L50 83 L46 95 L47 108 L53 103 L53 88 Z', label: [48, 96], tiny: true },
  chest: { d: 'M97 86 L80 83 L71 92 L67 103 L72 115 L86 121 L97 117 Z', label: [84, 102] },
  biceps: { d: 'M47 108 L53 103 L63 101 L63 114 L61 134 L57 150 L47 148 L44 128 Z', label: [53, 126] },
  forearms: { d: 'M46 151 L57 153 L55 180 L51 208 L41 206 L40 178 Z', label: [48, 180] },
  abs: { d: 'M97 122 L86 123 L74 120 L73 136 L77 172 L83 192 L97 198 Z', label: [86, 158] },
  adductors: { d: 'M97 220 L97 292 L92 304 L87 274 L89 238 Z', label: [93, 258], tiny: true },
  quads: { d: 'M79 212 L89 226 L87 274 L92 304 L88 328 L70 328 L64 296 L66 242 Z', label: [77, 272] },
};
const FRONT_NEUTRAL = [
  'M97 80 L97 60 L90 60 L90 48 L110 48 L110 60 L103 60 L103 80',
  'M97 198 L83 192 L79 212 L97 222 Z',
  'M70 334 L88 334 L86 372 L84 412 L72 412 L70 372 Z',
  'M41 208 L51 210 L50 224 L40 224 Z',
];

const BACK = {
  traps: { d: 'M97 58 L90 60 L76 68 L66 77 L74 92 L97 110 Z', label: [88, 84] },
  rear_delts: { d: 'M66 77 L58 79 L53 88 L53 103 L63 101 L72 93 L74 92 Z', label: [60, 91] },
  side_delts: { d: 'M58 79 L50 83 L46 95 L47 108 L53 103 L53 88 Z', label: [48, 96], tiny: true },
  upper_back: { d: 'M74 92 L97 110 L97 130 L84 130 L74 116 L70 102 Z', label: [86, 116] },
  lats: { d: 'M70 104 L74 118 L84 132 L97 134 L97 152 L86 170 L77 150 L68 126 Z', label: [80, 142] },
  lower_back: { d: 'M97 137 L88 139 L84 160 L86 184 L97 190 Z', label: [92, 164] },
  triceps: { d: 'M47 108 L53 103 L63 101 L63 114 L61 134 L57 150 L47 148 L44 128 Z', label: [53, 126] },
  forearms: { d: 'M46 151 L57 153 L55 180 L51 208 L41 206 L40 178 Z', label: [48, 180] },
  glutes: { d: 'M97 192 L84 190 L74 198 L72 216 L80 234 L97 236 Z', label: [84, 214] },
  hamstrings: { d: 'M97 240 L80 240 L70 246 L68 296 L76 322 L92 322 L96 298 Z', label: [82, 282] },
  calves: { d: 'M70 328 L88 328 L90 352 L86 384 L78 388 L72 374 L70 350 Z', label: [79, 356] },
};
const BACK_NEUTRAL = [
  'M97 80 L97 60 L90 60 L90 48 L110 48 L110 60 L103 60 L103 80',
  'M41 208 L51 210 L50 224 L40 224 Z',
  'M72 392 L86 392 L84 412 L74 412 Z',
];

const mirror = 'translate(200 0) scale(-1 1)';

function figure(view, geo, neutral, data, selected) {
  const regions = Object.entries(geo);
  const paths = regions.map(([id, g]) => {
    const n = data[id] ?? 0;
    const band = bandFor(n);
    const sel = selected === id ? ' is-selected' : '';
    const aria = `${MUSCLE_LABELS[id]}: ${fmtSets(n)} hard sets, ${band.label}`;
    const common = `class="hm-region band-${band.id}${sel}" data-muscle="${id}" tabindex="0" role="button" aria-label="${esc(aria)}"`;
    return `<path ${common} d="${g.d}"/><path ${common} d="${g.d}" transform="${mirror}"/>`;
  }).join('');
  const base = neutral.map((d) => `<path class="hm-neutral" d="${d}"/><path class="hm-neutral" d="${d}" transform="${mirror}"/>`).join('');
  const head = '<circle class="hm-neutral" cx="100" cy="29" r="17"/>';
  const labels = regions.map(([id, g]) => {
    const n = data[id] ?? 0;
    const [x, y] = g.label;
    const r = g.tiny ? 6.2 : 7.4;
    const t = fmtSets(n);
    const fs = t.length > 3 ? 6.4 : (g.tiny ? 7.2 : 8.4);
    const one = (cx) => `<g class="hm-pill" data-muscle="${id}" pointer-events="none"><circle cx="${cx}" cy="${y}" r="${r}"/><text x="${cx}" y="${y}" font-size="${fs}">${t}</text></g>`;
    return one(x >= 95 ? 100 : x); // one number per muscle: centred muscles on the midline, paired ones on the left half
  }).join('');
  return `<svg class="hm-svg" viewBox="0 0 200 430" role="group" aria-label="${view} view muscle heat map" data-view="${view}">${base}${head}${paths}${labels}</svg>`;
}

/**
 * @param {Record<string, number>} data  weekly hard sets per muscle id (missing = 0)
 * @param {{ selected?: string|null, view?: 'front'|'back' }} opts
 */
export function renderHeatmap(data, { selected = null, view = 'front' } = {}) {
  return `<div class="hm" data-active-view="${view}">
    <div class="hm-figures">
      <figure class="hm-fig" data-view="front"><figcaption>Front</figcaption>${figure('front', FRONT, FRONT_NEUTRAL, data, selected)}</figure>
      <figure class="hm-fig" data-view="back"><figcaption>Back</figcaption>${figure('back', BACK, BACK_NEUTRAL, data, selected)}</figure>
    </div>
  </div>`;
}

export function renderLegend() {
  return `<ul class="hm-legend" aria-label="Heat map scale">${BANDS.map((b) => `<li><i class="sw band-${b.id}"></i><b>${b.label}</b><span>${b.hint}</span></li>`).join('')}</ul>`;
}

/** Sorted list (also the accessible, colour-independent view). */
export function renderMuscleList(data, selected) {
  const ids = Object.keys(MUSCLE_LABELS);
  const rows = ids.map((id) => ({ id, n: data[id] ?? 0 })).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  const max = Math.max(10, ...rows.map((r) => r.n));
  return `<ol class="hm-list">${rows.map(({ id, n }) => {
    const band = bandFor(n);
    return `<li><button class="hm-row${selected === id ? ' is-selected' : ''}" data-muscle="${id}" type="button">
      <span class="hm-row-name">${MUSCLE_LABELS[id]}</span>
      <span class="hm-bar"><i class="band-${band.id}" style="width:${Math.min(100, (n / max) * 100).toFixed(1)}%"></i></span>
      <span class="hm-row-n">${fmtSets(n)}</span><span class="hm-row-band">${band.label}</span>
    </button></li>`;
  }).join('')}</ol>`;
}
