// Shared pieces of the share images (bar, heat map, lift progress): a canvas with the chosen background, the brand
// mark, and handing the PNG to the phone's share sheet (Android) or downloading it.
import { esc, toast } from './dom.js';

const BG = { dark: '#111216', light: '#f4f0e6' };
export const SHARE_BG_LABELS = { transparent: 'Transparent', dark: 'Dark', light: 'Light' };

/** Background picker shown beside a Share image button; reads and writes settings.shareBg. */
export function shareBgPicker(current) {
  return `<select class="share-bg" data-share-bg aria-label="Image background">${Object.entries(SHARE_BG_LABELS).map(([v, t]) => `<option value="${v}"${v === current ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
}
export function bindShareBg(root, app) {
  root.querySelectorAll('[data-share-bg]').forEach((s) => s.addEventListener('change', () => app.saveSettings({ shareBg: s.value })));
}

/**
 * A w x h canvas filled with the background. Returns { c, g, ink, glow, dark }: `ink` is the text colour, `glow(on)`
 * switches the soft text shadow that keeps white text readable on a photo (transparent background only), and
 * `dark` says whether the dark-theme colours suit this background.
 */
export function shareCanvas(w, h, bg) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (BG[bg]) { g.fillStyle = BG[bg]; g.fillRect(0, 0, w, h); }
  const ink = bg === 'light' ? '#17181b' : '#ffffff';
  const glow = (on, blur = 18) => { g.shadowColor = on && bg === 'transparent' ? 'rgba(0,0,0,.6)' : 'transparent'; g.shadowBlur = on ? blur : 0; };
  glow(true);
  return { c, g, ink, glow, dark: bg !== 'light' };
}

export const shareFont = () => getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'system-ui, sans-serif';

/** The app's mark and name, centred with its baseline at y. */
export function drawBrand(g, w, y, ink) {
  const font = shareFont();
  g.save();
  g.font = `700 34px ${font}`;
  const label = 'LIFTING TRACKER', tw = g.measureText(label).width, size = 46, gap = 16;
  const x = (w - size - gap - tw) / 2, top = y - size + 8;
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d93a17';
  g.beginPath(); g.roundRect(x, top, size, size, 12); g.fill();
  g.strokeStyle = '#fff6f2'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath();
  const s = size / 32, X = (v) => x + v * s, Y = (v) => top + v * s;
  for (const [x1, y1, x2, y2] of [[6, 12, 6, 20], [9.5, 9, 9.5, 23], [22.5, 9, 22.5, 23], [26, 12, 26, 20], [9.5, 16, 22.5, 16]]) { g.moveTo(X(x1), Y(y1)); g.lineTo(X(x2), Y(y2)); }
  g.stroke();
  g.fillStyle = ink; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText(label, x + size + gap, y - 4);
  g.restore();
}

/** Shares the canvas as a PNG through the share sheet where files can be shared, otherwise downloads it. */
export async function shareOut(c, name, title) {
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file], title });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file.name });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Image saved');
}
