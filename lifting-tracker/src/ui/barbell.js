// Barbell drawing. Pure string rendering. Plates are drawn to scale in height (relative to the largest
// disc), heaviest innermost, as the IPF rulebook requires. Thickness is exaggerated for legibility.
import { convert } from '../core/units.js';

const W = 1000, H = 330, CY = 165, SCALE_MM = 0.5; // px per mm of plate diameter

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
 * @param {{ plates: Array<{value:number, unit:string, colour:string, drawHeightMm?:number}>, collar: boolean, label?: string }} opts
 * `plates` is one side, innermost (heaviest) first, one entry per physical plate.
 */
export function renderBarbell({ plates = [], collar = false } = {}) {
  // Left side runs from the bar centre outwards (to the left); the right side is its mirror image.
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
    return `<g class="bb-plate" data-index="${i}" data-side="${side}" tabindex="0" role="button" aria-label="Remove ${label} ${p.unit} plate" style="cursor:pointer">
      <rect x="${xx}" y="${y}" width="${t}" height="${h}" rx="5" fill="${p.colour}" stroke="rgba(0,0,0,.45)" stroke-width="1.5"/>
      <rect x="${xx + 2}" y="${y + 3}" width="${Math.max(2, t * 0.28)}" height="${h - 6}" rx="3" fill="rgba(255,255,255,.18)"/>
      ${h > 70 ? `<text transform="translate(${xx + t / 2} ${CY}) rotate(-90)" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="700" fill="${txt}" font-family="Bahnschrift, 'Arial Narrow', system-ui, sans-serif">${label}</text>` : ''}
    </g>`;
  };

  const collarSvg = (side) => {
    const cw = 14;
    const xx = side === 'L' ? collarX : W - collarX - cw;
    return `<g aria-hidden="true"><rect x="${xx}" y="${CY - 30}" width="${cw}" height="60" rx="3" fill="#8e96a3" stroke="rgba(0,0,0,.5)"/><rect x="${xx + 3}" y="${CY - 27}" width="3" height="54" fill="rgba(255,255,255,.35)"/></g>`;
  };

  return `<svg class="bb-svg" viewBox="150 18 ${W - 300} ${H - 36}" role="img" aria-label="Barbell with ${plates.length} plate${plates.length === 1 ? '' : 's'} each side">
    <defs>
      <linearGradient id="bbSteel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8ecf2"/><stop offset=".45" stop-color="#9aa3b2"/><stop offset="1" stop-color="#5f6877"/></linearGradient>
      <linearGradient id="bbSleeve" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6fa"/><stop offset=".5" stop-color="#aab2c0"/><stop offset="1" stop-color="#6b7484"/></linearGradient>
    </defs>
    <!-- shaft + sleeves -->
    <rect x="40" y="${CY - 9}" width="${W - 80}" height="18" rx="9" fill="url(#bbSteel)" stroke="rgba(0,0,0,.4)"/>
    <rect x="20" y="${CY - 15}" width="${innerEdge - 20}" height="30" rx="6" fill="url(#bbSleeve)" stroke="rgba(0,0,0,.4)"/>
    <rect x="${W - innerEdge}" y="${CY - 15}" width="${innerEdge - 20}" height="30" rx="6" fill="url(#bbSleeve)" stroke="rgba(0,0,0,.4)"/>
    <rect x="${innerEdge - 6}" y="${CY - 22}" width="12" height="44" rx="3" fill="#7d8696" stroke="rgba(0,0,0,.45)"/>
    <rect x="${W - innerEdge - 6}" y="${CY - 22}" width="12" height="44" rx="3" fill="#7d8696" stroke="rgba(0,0,0,.45)"/>
    ${left.map((it) => plateSvg(it, 'L')).join('')}
    ${left.map((it) => plateSvg(it, 'R')).join('')}
    ${collar ? collarSvg('L') + collarSvg('R') : ''}
  </svg>`;
}
