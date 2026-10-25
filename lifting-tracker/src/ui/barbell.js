// Barbell drawing. Pure string rendering. The side view is one end of a power bar seen from a three-quarter angle,
// drawn to scale in millimetres: plates use their real diameter and thickness, heaviest innermost, as the IPF
// rulebook requires. Plate faces are ellipses because of the angle; the outermost face shows its printed weight.
import { convert } from '../core/units.js';

let uid = 0;

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

const fmt = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

// Typical competition discs: [kg, diameter mm, thickness mm]. Used when a plate has no drawHeightMm/thicknessMm.
const SIZES = [[25, 450, 27], [20, 450, 22.5], [15, 450, 21], [10, 450, 21], [5, 230, 21.5], [2.5, 190, 16], [1.25, 160, 12], [1, 145, 10], [0.5, 130, 8], [0.25, 110, 6]];

export function plateSize(p) {
  const kg = Math.abs(convert(p.value, p.unit, 'kg'));
  const row = SIZES.reduce((a, r) => (Math.abs(r[0] - kg) < Math.abs(a[0] - kg) ? r : a));
  return { d: p.drawHeightMm || row[1], t: p.thicknessMm || row[2] };
}

// Power bar, mm, with x = 0 where the sleeve starts: sleeve 50 across and 415 loadable, sleeve stop 75 × 30, shaft 29.
// The stops' inner faces are 1310 apart, so the middle is at x = -685; the IPF ring mark is 405 from the middle
// (marks 810 apart) and the outer knurl ends 620 from it.
const BAR = { sleeveR: 25, sleeveL: 415, stopR: 37.5, stopW: 30, shaftR: 14.5, mark: -280, knurlEnd: -65, collarR: 40, collarW: 70 };
const TILT = (28 * Math.PI) / 180, SX = Math.sin(TILT), CX = Math.cos(TILT); // faces show at sin(28°) of their width
const X0 = -300, X1 = 480, Y0 = -252, Y1 = 266;                               // fixed frame, so adding plates never zooms

// Side silhouette of a cylinder on the bar axis from x1 to x2 (bar mm), radius r, in screen units.
const cyl = (x1, x2, r) => {
  const a = x1 * CX, b = x2 * CX, rx = r * SX;
  return `M${a} ${-r}L${b} ${-r}A${rx} ${r} 0 0 1 ${b} ${r}L${a} ${r}A${rx} ${r} 0 0 1 ${a} ${-r}Z`;
};
const face = (x, r, attrs) => `<ellipse cx="${x * CX}" cy="0" rx="${r * SX}" ry="${r}" ${attrs}/>`;

/**
 * Side view of the bar.
 * @param {{ plates: Array<{value:number, unit:string, colour:string, drawHeightMm?:number, thicknessMm?:number}>, collar: boolean, justAdded?: number }} opts
 * `plates` is one side, innermost (heaviest) first, one entry per physical plate. `justAdded` is the index of a
 * plate to animate in (the one the user just added).
 */
export function renderBarbell({ plates = [], collar = false, justAdded = -1 } = {}) {
  const id = `bb${++uid}`;
  const sizes = plates.map(plateSize);
  // Squeeze thickness (never diameter) if the stack would run past the end of the sleeve.
  const need = sizes.reduce((a, s) => a + s.t + 1, 0) + (collar ? BAR.collarW + 1 : 0);
  const fit = Math.min(1, BAR.sleeveL / Math.max(1, need));
  let x = 0;
  const items = plates.map((p, i) => {
    const { d, t: t0 } = sizes[i];
    const it = { p, i, r: d / 2, x, t: t0 * fit };
    x += it.t + fit;
    return it;
  });
  const outer = x;
  const collarX = outer + (collar ? 1 : 0);
  const sleeveFrom = collar ? collarX + BAR.collarW * fit : outer;

  // `shown`: the face is the outermost, or the next plate is small enough to leave its printing visible.
  const plateSvg = ({ p, i, r, x: px, t }, shown) => {
    const dark = luminance(p.colour) < 0.35;
    const ink = dark ? '#ffffff' : '#111214';
    const rim = Math.min(12, r * 0.09), hub = Math.min(45, r * 0.3);
    const fx = (px + t) * CX;
    const label = fmt(p.value);
    const print = shown && r >= 70
      ? `<g transform="translate(${fx} 0) scale(${SX} 1)" fill="${ink}" font-family="Bahnschrift, 'Arial Narrow', system-ui, sans-serif" font-weight="800" text-anchor="middle" dominant-baseline="central">
          <text y="${-r * 0.56}" font-size="${r * 0.34}">${label}</text><text y="${r * 0.6}" font-size="${r * 0.15}" letter-spacing="${r * 0.02}">${p.unit.toUpperCase()}</text></g>`
      : '';
    const anim = i === justAdded ? ' bb-pop' : '';
    return `<g class="bb-plate${anim}" data-index="${i}" tabindex="0" role="button" aria-label="Remove ${label} ${p.unit} plate" style="cursor:pointer;transform-origin:${(px + t / 2) * CX}px 0px">
      <path d="${cyl(px, px + t, r)}" fill="${p.colour}"/>
      <path d="${cyl(px, px + t, r)}" fill="url(#${id}-band)"/>
      ${face(px + t, r, `fill="${p.colour}"`)}
      ${face(px + t, r, `fill="url(#${id}-face)"`)}
      ${face(px + t, r - rim, `fill="none" stroke="rgba(0,0,0,.28)" stroke-width="${Math.max(1, rim * 0.18)}"`)}
      ${face(px + t, r - rim * 0.45, `fill="none" stroke="rgba(255,255,255,.22)" stroke-width="${Math.max(0.8, rim * 0.12)}"`)}
      ${face(px + t, hub, `fill="url(#${id}-chrome)" stroke="rgba(0,0,0,.45)" stroke-width="1"`)}
      ${print}
      <path d="${cyl(px, px + t, r)}" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="1.2"/>
    </g>`;
  };

  const collarSvg = () => {
    const a = collarX, b = collarX + BAR.collarW * fit, cx = ((a + b) / 2) * CX;
    return `<g aria-hidden="true">
      <path d="${cyl(a, b, BAR.collarR)}" fill="url(#${id}-chrome)" stroke="rgba(0,0,0,.5)"/>
      ${face(b, BAR.collarR, `fill="url(#${id}-chromeFace)" stroke="rgba(0,0,0,.5)"`)}
      <rect x="${cx - 7}" y="${-BAR.collarR - 22}" width="14" height="24" rx="3" fill="url(#${id}-chrome)" stroke="rgba(0,0,0,.5)"/>
      <rect x="${cx - 16}" y="${-BAR.collarR - 30}" width="32" height="10" rx="5" fill="url(#${id}-chrome)" stroke="rgba(0,0,0,.5)"/>
    </g>`;
  };

  const knurl = `<path d="${cyl(-340, BAR.knurlEnd, BAR.shaftR)}" fill="url(#${id}-knurl)" clip-path="url(#${id}-shaftclip)" opacity=".85"/>`;
  return `<svg class="bb-svg" viewBox="${X0} ${Y0} ${X1 - X0} ${Y1 - Y0}" role="img" aria-label="One end of the bar with ${plates.length} plate${plates.length === 1 ? '' : 's'}, drawn to scale">
    <defs>
      <linearGradient id="${id}-chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5c6474"/><stop offset=".18" stop-color="#f6f8fb"/><stop offset=".42" stop-color="#b7bfcc"/><stop offset=".62" stop-color="#e9edf3"/><stop offset="1" stop-color="#4a5160"/></linearGradient>
      <radialGradient id="${id}-chromeFace" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#bcc4d0"/><stop offset="1" stop-color="#5a6272"/></radialGradient>
      <linearGradient id="${id}-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b7383"/><stop offset=".3" stop-color="#dfe4eb"/><stop offset=".6" stop-color="#9aa3b2"/><stop offset="1" stop-color="#4b5262"/></linearGradient>
      <linearGradient id="${id}-band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".12" stop-color="#fff" stop-opacity=".22"/><stop offset=".4" stop-color="#fff" stop-opacity=".04"/><stop offset=".8" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
      <radialGradient id="${id}-face" cx=".3" cy=".28" r=".95"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>
      <pattern id="${id}-knurl" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#a3abb9"/><path d="M0 0V4M0 0H4" stroke="#4e5666" stroke-width="1.1"/></pattern>
      <clipPath id="${id}-shaftclip"><path d="${cyl(-340, BAR.mark - 2.5, BAR.shaftR)}"/><path d="${cyl(BAR.mark + 2.5, BAR.knurlEnd, BAR.shaftR)}"/></clipPath>
      <linearGradient id="${id}-fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".1" stop-color="#fff" stop-opacity="1"/></linearGradient>
      <mask id="${id}-mask" maskUnits="userSpaceOnUse" x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}"><rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" fill="url(#${id}-fade)"/></mask>
      <radialGradient id="${id}-floor" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="${(outer / 2) * CX}" cy="${Math.max(BAR.stopR, ...items.map((it) => it.r)) + 12}" rx="${180 + outer * 0.4}" ry="12" fill="url(#${id}-floor)"/>
    <g mask="url(#${id}-mask)">
      <path d="${cyl(-340, -BAR.stopW, BAR.shaftR)}" fill="url(#${id}-steel)" stroke="rgba(0,0,0,.4)"/>
      ${knurl}
    </g>
    <path d="${cyl(-BAR.stopW, 0, BAR.stopR)}" fill="url(#${id}-chrome)" stroke="rgba(0,0,0,.5)"/>
    ${face(0, BAR.stopR, `fill="url(#${id}-chromeFace)" stroke="rgba(0,0,0,.5)"`)}
    <path d="${cyl(0, BAR.sleeveL, BAR.sleeveR)}" fill="url(#${id}-chrome)" stroke="rgba(0,0,0,.45)"/>
    ${items.map((it, k) => plateSvg(it, k === items.length - 1 || items[k + 1].r < it.r * 0.5)).join('')}
    ${collar ? collarSvg() : ''}
    ${plates.length || collar ? `<path d="${cyl(sleeveFrom, BAR.sleeveL, BAR.sleeveR)}" fill="url(#${id}-chrome)" stroke="rgba(0,0,0,.45)"/>` : ''}
    ${face(BAR.sleeveL, BAR.sleeveR, `fill="url(#${id}-chromeFace)" stroke="rgba(0,0,0,.5)"`)}
    ${face(BAR.sleeveL, BAR.sleeveR * 0.45, 'fill="rgba(0,0,0,.35)"')}
  </svg>`;
}

/**
 * End-on view: the plates as concentric discs as seen down the bar (stylised: outer plates are drawn slightly smaller so each shows as a ring). `plates` is one side, innermost first.
 */
export function renderEndView({ plates = [], collar = false } = {}) {
  const id = `be${++uid}`;
  const R = 150, cx = 170, cy = 170; // outer radius used for the largest standard disc (450 mm)
  const maxMm = Math.max(450, ...plates.map((p) => plateSize(p).d));
  const scale = R / (maxMm / 2);
  // Looking down the bar, the outermost plate is nearest. Each plate outward is drawn a little smaller than the
  // one inside it so every plate shows as a ring; the order and colours are right, the exact diameters are not.
  const discs = plates.map((p, i) => {
    const base = (plateSize(p).d / 2) * scale;
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
