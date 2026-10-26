// Shared pieces of the share images (bar, heat map, lift progress): a canvas with the chosen background, and handing
// the PNG to the phone's share sheet (Android) or downloading it.
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

/** Save image button shown beside a Share image button; `attrs` are the same data attributes plus the save flag. */
export const saveButton = (attrs, disabled = false) => `<button class="btn ghost small" ${attrs} ${disabled ? 'disabled' : ''}>Save image</button>`;

/**
 * Shares the canvas as a PNG through the share sheet where files can be shared, otherwise downloads it. `save` always
 * downloads (Android puts it in Downloads, where Photos and Instagram can pick it up); PNG keeps the transparency.
 */
export async function shareOut(c, name, title, save = false) {
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  const file = new File([blob], name, { type: 'image/png' });
  if (!save && navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file], title });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file.name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  toast(`Saved ${file.name} to Downloads`);
}
