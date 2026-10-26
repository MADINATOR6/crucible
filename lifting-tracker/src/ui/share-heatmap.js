// A 1080 x 1920 PNG of the 2D heat map (front and back side by side) with its title, colour key and the app's mark,
// for an Instagram story; transparent by default, or a dark or light background. Shared through the phone's share sheet where files can be shared (Android), otherwise
// downloaded. The SVG is rendered off screen so its CSS (theme colours, pills, shading blend) can be read back and
// written into the copy as plain attributes, because an SVG drawn as an image cannot see the page's stylesheet.
import { renderHeatmap } from './heatmap.js';
import { shareCanvas, shareFont, drawBrand, shareOut } from './share-image.js';

const PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'opacity', 'font-family', 'font-weight', 'text-anchor', 'dominant-baseline', 'mix-blend-mode'];

async function dataUrl(href) {
  const blob = await (await fetch(href)).blob();
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}

/** Standalone copy of a rendered SVG: computed styles inlined, the shading image embedded. */
async function standalone(svg, w, h) {
  const copy = svg.cloneNode(true);
  const live = svg.querySelectorAll('*'), out = copy.querySelectorAll('*');
  for (let i = 0; i < live.length; i++) {
    const cs = getComputedStyle(live[i]), el = out[i];
    if (live[i].tagName === 'stop') { el.setAttribute('stop-color', cs.stopColor); el.removeAttribute('style'); continue; }
    if (live[i].tagName === 'title') { el.remove(); continue; }
    const keep = el.getAttribute('style')?.match(/fill:url\([^)]*\)/)?.[0];
    el.setAttribute('style', PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';') + (keep ? `;${keep}` : ''));
    if (live[i].tagName === 'image') el.setAttribute('href', await dataUrl(live[i].getAttribute('href')));
  }
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', w); copy.setAttribute('height', h);
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
  await img.decode();
  return img;
}

export async function shareHeatmapImage({ data, bands, title, subtitle, bg = 'transparent' }) {
  const host = Object.assign(document.createElement('div'), { innerHTML: renderHeatmap(data, { bands }) });
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px';
  host.querySelector('.hm')?.setAttribute('data-active-view', 'both'); // neither figure hidden
  document.body.append(host);
  try {
    const [front, back] = host.querySelectorAll('.hm-svg');
    const [vw, vh] = front.getAttribute('viewBox').split(' ').slice(2).map(Number);
    const fw = 480, fh = Math.round((fw * vh) / vw);
    const imgs = [await standalone(front, fw, fh), await standalone(back, fw, fh)];
    // Kept between y 200 and 1700: Instagram puts its own controls over the top and bottom of a story.
    const W = 1080, H = 1920, TOP = 380, { c, g, ink, glow } = shareCanvas(W, H, bg);
    const font = shareFont();
    g.textAlign = 'center'; g.fillStyle = ink;
    g.font = `700 76px ${font}`; g.fillText(title.toUpperCase(), W / 2, 262);
    g.font = `600 42px ${font}`; g.fillText(subtitle, W / 2, 326);
    glow(true, 24);
    imgs.forEach((img, i) => { g.drawImage(img, (W - 2 * fw) / 2 + i * fw, TOP, fw, fh); URL.revokeObjectURL(img.src); });
    // Colour key: two rows of three.
    const root = getComputedStyle(document.documentElement);
    g.font = `600 34px ${font}`; g.textAlign = 'left';
    bands.forEach((b, i) => {
      const x = 90 + (i % 3) * 320, y = TOP + fh + 80 + Math.floor(i / 3) * 66;
      glow(true, 10); g.fillStyle = root.getPropertyValue(`--b${b.id}`).trim() || '#888';
      g.beginPath(); g.roundRect(x, y - 30, 40, 40, 9); g.fill();
      g.fillStyle = ink; g.fillText(b.label, x + 56, y);
    });
    drawBrand(g, W, TOP + fh + 80 + 66 + 100, ink);
    return await shareOut(c, `muscles-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`, title);
  } finally {
    host.remove();
  }
}
