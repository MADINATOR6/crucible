// A 1080 x 1350 PNG of one lift's progress for an Instagram story: lift name, current estimated max, kg per week,
// and the chart (light days faded, trend line, PR stars), drawn straight onto a canvas from the same points as the
// on-screen chart. Background as chosen in the picker (transparent by default).
import { shareCanvas, shareFont, drawBrand, shareOut } from './share-image.js';
import { shortDate } from './charts.js';

// Same validated lift colours as styles/app.css, per background.
const COLOURS = { dark: { squat: '#f0522e', bench: '#3a93d8', deadlift: '#b88b08' }, light: { squat: '#d6401f', bench: '#1f7fd1', deadlift: '#a77a00' } };
const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

/**
 * @param {{ lift: string, name: string, points: Array<{x: string, y: number, hard: boolean}>, line: Array<{x: string, y: number}>,
 *           prs: Array<{x: string, y: number}>, now: number, rate: string, rateDown: boolean, unit: string, bg: string }} o
 * All values are already in the display unit.
 */
export async function shareLiftImage({ lift, name, points, line, prs, now, rate, rateDown, unit, bg, save }) {
  const W = 1080, H = 1350, { c, g, ink, glow, dark } = shareCanvas(W, H, bg);
  const colour = COLOURS[dark ? 'dark' : 'light'][lift];
  const font = shareFont();
  g.textAlign = 'center'; g.fillStyle = ink;
  g.font = `700 64px ${font}`; g.fillText(name.toUpperCase(), W / 2, 140);
  g.font = `700 150px ${font}`;
  const num = String(now), nw = g.measureText(num).width;
  g.fillText(num, W / 2 - 40, 300);
  g.font = `700 64px ${font}`; g.textAlign = 'left'; g.fillText(unit.toUpperCase(), W / 2 - 40 + nw / 2 + 16, 300);
  g.textAlign = 'center'; g.font = `600 38px ${font}`;
  g.fillText(rate ? `estimated max · ${rate}` : 'estimated max', W / 2, 362);
  if (rate) { g.fillStyle = rateDown ? '#e0a020' : '#2fbf7f'; g.beginPath(); g.arc(W / 2 - g.measureText(`estimated max · ${rate}`).width / 2 - 22, 350, 9, 0, Math.PI * 2); g.fill(); }

  // Chart.
  const L = 140, R = 990, T = 450, B = 1080;
  const xs = points.map((p) => dayNum(p.x)), x0 = Math.min(...xs), x1 = Math.max(x0 + 6, ...xs);
  const ys = [...points.map((p) => p.y), ...line.map((p) => p.y)];
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = Math.max(2, (y1 - y0) * 0.12); y0 -= pad; y1 += pad;
  const X = (iso) => L + ((dayNum(iso) - x0) / (x1 - x0)) * (R - L);
  const Y = (v) => B - ((v - y0) / (y1 - y0)) * (B - T);
  glow(false);
  g.strokeStyle = dark ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.12)'; g.lineWidth = 2;
  g.font = `600 30px ${font}`; g.textAlign = 'right'; g.fillStyle = ink;
  for (let i = 0; i <= 3; i++) {
    const v = y0 + ((y1 - y0) * i) / 3, y = Y(v);
    g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke();
    glow(true, 8); g.fillText(String(Math.round(v)), L - 18, y + 10); glow(false);
  }
  g.textAlign = 'left'; glow(true, 8); g.fillText(shortDate(points[0].x), L, B + 52);
  g.textAlign = 'right'; g.fillText(shortDate(points.at(-1).x), R, B + 52); glow(false);
  for (const p of points.filter((q) => !q.hard)) { g.globalAlpha = 0.35; g.fillStyle = colour; g.beginPath(); g.arc(X(p.x), Y(p.y), 9, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  if (line.length > 1) {
    glow(true, 12); g.strokeStyle = colour; g.lineWidth = 7; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); line.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y)))); g.stroke(); glow(false);
  }
  for (const p of points.filter((q) => q.hard)) { g.fillStyle = colour; g.beginPath(); g.arc(X(p.x), Y(p.y), 12, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = ink; g.textAlign = 'center'; g.font = `700 34px ${font}`; glow(true, 8);
  for (const p of prs) g.fillText('★', X(p.x), Y(p.y) - 26);

  drawBrand(g, W, 1290, ink);
  return shareOut(c, `${lift}-progress.png`, `${name} ${now} ${unit}`, save);
}
