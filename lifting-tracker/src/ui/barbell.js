// Barbell drawing. Pure string rendering. Plates are drawn to scale in height (relative to the largest
// disc), heaviest innermost, as the IPF rulebook requires. Thickness is exaggerated for legibility.
import { convert } from '../core/units.js';

const W = 1000, H = 330, CY = 160, SCALE_MM = 0.5; // px per mm of plate diameter
let uid = 0;

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

function thicknessFor(plate) {
  const kg = Math.abs(convert(plate.value, plate.unit, 'kg'));
  return Math.max(9, Math.min(34, 9 + kg * 1.1));
}

const fmt = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

/**
 * Side view of the bar.
 * @param {{ plates: Array<{value:number, unit:string, colour:string, drawHeightMm?:number}>, collar: boolean, justAdded?: number }} opts
 * `plates` is one side, innermost (heaviest) first, one entry per physical plate. `justAdded` is the index of a
 * plate to animate in (the one the user just added).
 */
export function renderBarbell({ plates = [], collar = false, justAdded = -1 } = {}) {
  const id = `bb${++uid}`;
  const innerEdge = 330; // plate stack starts at the sleeve stop and grows outwards
  let cursor = innerEdge;
  const left = [];
  // Shrink plate thickness (never height) when many plates would run past the visible sleeve.
  const stack = plates.reduce((a, p) => a + thicknessFor(p) + 2, 0);
  const fit = Math.min(1, 168 / Math.max(1, stack));
  plates.forEach((p, i) => {
    const t = thicknessFor(p) * fit;
    const h = Math.max(46, (p.drawHeightMm || 300) * SCALE_MM);
    cursor -= t + 2;
    left.push({ p, t, h, x: cursor, i });
  });
  const collarX = cursor - 16;

  const plateSvg = (item, side) => {
    const { p, t, h, x: px, i } = item;
    const xx = side === 'L' ? px : W - px - t;
    const y = CY - h / 2;
    const dark = luminance(p.colour) < 0.35;
    const txt = dark ? '#ffffff' : '#101114';
    const label = fmt(p.value);
    const fs = Math.max(9, Math.min(15, t - 2));
    const anim = i === justAdded ? ' bb-pop' : '';
    return `<g class="bb-plate${anim}" data-index="${i}" data-side="${side}" tabindex="0" role="button" aria-label="Remove ${label} ${p.unit} plate" style="cursor:pointer;transform-origin:${xx + t / 2}px ${CY}px">
      <rect x="${xx}" y="${y}" width="${t}" height="${h}" rx="5" fill="${p.colour}"/>
      <rect x="${xx}" y="${y}" width="${t}" height="${h}" rx="5" fill="url(#${id}-shade)"/>
      <rect x="${xx + 0.75}" y="${y + 0.75}" width="${t - 1.5}" height="${h - 1.5}" rx="4.5" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1"/>
      <line x1="${xx + 1.5}" y1="${y + 7}" x2="${xx + t - 1.5}" y2="${y + 7}" stroke="rgba(0,0,0,.28)"/>
      <line x1="${xx + 1.5}" y1="${y + h - 7}" x2="${xx + t - 1.5}" y2="${y + h - 7}" stroke="rgba(0,0,0,.28)"/>
      <rect x="${xx}" y="${y}" width="${t}" height="${h}" rx="5" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="1.4"/>
      ${h > 70 ? `<text transform="translate(${xx + t / 2} ${CY}) rotate(-90)" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="700" fill="${txt}" stroke="${dark ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.35)'}" stroke-width=".6" paint-order="stroke" font-family="Bahnschrift, 'Arial Narrow', system-ui, sans-serif">${label}</text>` : ''}
    </g>`;
  };

  const collarSvg = (side) => {
    const cw = 14;
    const xx = side === 'L' ? collarX : W - collarX - cw;
    return `<g aria-hidden="true"><rect x="${xx}" y="${CY - 30}" width="${cw}" height="60" rx="3" fill="url(#${id}-steel)" stroke="rgba(0,0,0,.55)"/><rect x="${xx + 3}" y="${CY - 27}" width="3" height="54" fill="rgba(255,255,255,.4)"/><circle cx="${xx + cw / 2}" cy="${CY}" r="3" fill="rgba(0,0,0,.35)"/></g>`;
  };

  return `<svg class="bb-svg" viewBox="150 14 ${W - 300} ${H - 22}" role="img" aria-label="Barbell with ${plates.length} plate${plates.length === 1 ? '' : 's'} each side">
    <defs>
      <linearGradient id="${id}-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6fa"/><stop offset=".25" stop-color="#cfd5df"/><stop offset=".55" stop-color="#8f98a8"/><stop offset="1" stop-color="#586071"/></linearGradient>
      <linearGradient id="${id}-shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset=".35" stop-color="#fff" stop-opacity=".06"/><stop offset=".7" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient>
      <pattern id="${id}-knurl" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#9aa3b2"/><line x1="0" y1="0" x2="0" y2="5" stroke="#5b6475" stroke-width="1.4"/><line x1="2.5" y1="0" x2="2.5" y2="5" stroke="#d7dce5" stroke-width=".8"/></pattern>
      <radialGradient id="${id}-floor" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="500" cy="${CY + 120}" rx="${plates.length ? 330 : 280}" ry="14" fill="url(#${id}-floor)" opacity=".7"/>
    <!-- shaft (knurled in the middle) and sleeves -->
    <rect x="40" y="${CY - 8}" width="${W - 80}" height="16" rx="8" fill="url(#${id}-steel)" stroke="rgba(0,0,0,.4)"/>
    <rect x="${innerEdge + 24}" y="${CY - 8}" width="${W - 2 * innerEdge - 48}" height="16" fill="url(#${id}-knurl)" opacity=".9"/>
    <rect x="20" y="${CY - 15}" width="${innerEdge - 20}" height="30" rx="7" fill="url(#${id}-steel)" stroke="rgba(0,0,0,.45)"/>
    <rect x="${W - innerEdge}" y="${CY - 15}" width="${innerEdge - 20}" height="30" rx="7" fill="url(#${id}-steel)" stroke="rgba(0,0,0,.45)"/>
    <rect x="${innerEdge - 8}" y="${CY - 24}" width="14" height="48" rx="3" fill="url(#${id}-steel)" stroke="rgba(0,0,0,.5)"/>
    <rect x="${W - innerEdge - 6}" y="${CY - 24}" width="14" height="48" rx="3" fill="url(#${id}-steel)" stroke="rgba(0,0,0,.5)"/>
    ${left.map((it) => plateSvg(it, 'L')).join('')}
    ${left.map((it) => plateSvg(it, 'R')).join('')}
    ${collar ? collarSvg('L') + collarSvg('R') : ''}
  </svg>`;
}

/**
 * End-on view: the plates as concentric discs as seen down the bar (stylised: outer plates are drawn slightly smaller so each shows as a ring). `plates` is one side, innermost first.
 */
export function renderEndView({ plates = [], collar = false } = {}) {
  const id = `be${++uid}`;
  const R = 150, cx = 170, cy = 170; // outer radius used for the largest standard disc (450 mm)
  const maxMm = Math.max(450, ...plates.map((p) => p.drawHeightMm || 0));
  const scale = R / (maxMm / 2);
  // Looking down the bar, the outermost plate is nearest. Each plate outward is drawn a little smaller than the
  // one inside it so every plate shows as a ring; the order and colours are right, the exact diameters are not.
  const discs = plates.map((p, i) => {
    const base = ((p.drawHeightMm || 300) / 2) * scale;
    const r = Math.max(22, base - i * Math.min(9, 90 / Math.max(1, plates.length)));
    const dark = luminance(p.colour) < 0.35;
    const txt = dark ? '#fff' : '#101114';
    const ringW = Math.min(16, Math.max(9, r * 0.14));
    return `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="${p.colour}" stroke="rgba(0,0,0,.55)" stroke-width="1.6"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-rim)"/>
      <circle cx="${cx}" cy="${cy}" r="${Math.max(6, r - ringW)}" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="1"/>
      <text x="${cx}" y="${cy - r + ringW / 2 + 0.5}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(12, ringW)}" font-weight="700" fill="${txt}" font-family="Bahnschrift, 'Arial Narrow', system-ui, sans-serif">${fmt(p.value)}</text></g>`;
  }).join('');  return `<svg class="bb-svg" viewBox="0 0 340 340" role="img" aria-label="End view of the loaded bar">
    <defs><radialGradient id="${id}-rim" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>
      <radialGradient id="${id}-hub" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#f4f6fa"/><stop offset=".6" stop-color="#8f98a8"/><stop offset="1" stop-color="#4b5363"/></radialGradient></defs>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(150,160,175,.35)" stroke-width="1" stroke-dasharray="3 5"/>
    ${discs}
    ${collar ? `<circle cx="${cx}" cy="${cy}" r="17" fill="url(#${id}-hub)" stroke="rgba(0,0,0,.6)"/>` : ''}
    <circle cx="${cx}" cy="${cy}" r="${collar ? 8 : 12}" fill="url(#${id}-hub)" stroke="rgba(0,0,0,.6)"/>
    <circle cx="${cx}" cy="${cy}" r="3" fill="rgba(0,0,0,.45)"/>
  </svg>`;
}
