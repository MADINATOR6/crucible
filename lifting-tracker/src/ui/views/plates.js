// Plate simulator view + shared helpers for describing a load with the user's plates.
import { convert, round1 } from '../../core/units.js';
import { loadBar, perSideText, warmupLadder } from '../../plates/loading.js';
import { renderBarbell, renderEndView } from '../barbell.js';
import { mount3d } from '../barbell3d.js';
import { esc, toast } from '../dom.js';
import { shareCanvas, shareFont, shareOut, shareBgPicker, bindShareBg, saveButton } from '../share-image.js';
import { meetCard } from './meet.js';
import { platesTolerance } from '../../plates/tolerance.js';

let webgl, active3d, mountId = 0, leaveObserver;
function supports3d() {
  if (webgl === undefined) {
    const canvas = document.createElement('canvas');
    try {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      webgl = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { webgl = false; }
  }
  return webgl;
}

// A 1080 × 1350 PNG of the loaded bar and its total, for an Instagram story (transparent by default, so it sits on a
// photo; dark or light backgrounds from the picker beside the button). Bar and number are centred vertically.
async function shareBarImage({ side, collar, total, unit, bg, end, save }) {
  const svg = renderBarbell({ plates: side, collar }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="717" ');
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await img.decode();
  const W = 1080, H = 1350, { c, g, ink } = shareCanvas(W, H, bg);
  g.save();
  if (end === 'left') { g.translate(W, 0); g.scale(-1, 1); } // mirror the bar only, never the number
  g.drawImage(img, 0, 200, W, 717);
  g.restore();
  URL.revokeObjectURL(img.src);
  g.textAlign = 'center'; g.fillStyle = ink;
  const font = shareFont();
  g.font = `700 200px ${font}`;
  const nw = g.measureText(`${total}`).width;
  g.fillText(`${total}`, W / 2 - 50, 1120);
  g.font = `700 80px ${font}`; g.textAlign = 'left'; g.fillText(unit.toUpperCase(), W / 2 - 50 + nw / 2 + 20, 1120);
  return shareOut(c, `bar-${total}${unit}.png`, `${total} ${unit}`, save);
}

export function barsFor(app, unit) { return app.platesData[unit].bars; }

export function plateConfig(app, unit) {
  const set = app.platesData[unit];
  const counts = app.settings.plateCounts?.[unit] || {};
  const plates = set.plates.map((p) => ({ ...p, count: Number.isInteger(counts[p.value]) ? counts[p.value] : p.count }));
  const barId = app.settings.barByUnit?.[unit] || set.bars[0].id;
  const customValue = Number(app.settings.customBar?.[unit]);
  const bar = barId === 'custom' && customValue > 0
    ? { id: 'custom', label: 'Custom bar', weight: { value: customValue, unit } }
    : (set.bars.find((b) => b.id === barId) || set.bars[0]);
  const collar = app.settings.collar ? set.collar : null;
  return { plates, bar, collar, set };
}

/** Load for a target weight in the user's display unit, using their plates. Returns { result, plates (one side, drawable), text }. */
export function describeLoad(app, weight) {
  const unit = app.settings.unit;
  const { plates, bar, collar } = plateConfig(app, unit);
  const target = { value: convert(weight.value, weight.unit, unit), unit };
  const result = loadBar({ target, bar: bar.weight, collar, plates });
  return { result, side: drawable(result.perSide), text: perSideText(result.perSide, unit) };
}

/** Expand [{plate, count}] to one drawable entry per physical plate, innermost (heaviest) first. */
export function drawable(perSide) {
  const out = [];
  for (const { plate, count } of perSide) for (let i = 0; i < count; i++) out.push({ value: plate.value, unit: plate.unit, colour: plate.colour, drawHeightMm: plate.drawHeightMm, thicknessMm: plate.thicknessMm });
  return out;
}

function totalOf(side, bar, collar, unit) {
  const sum = side.reduce((a, p) => a + convert(p.value, p.unit, unit), 0);
  const c = collar ? convert(collar.weight.value, collar.weight.unit, unit) * collar.perSide : 0;
  return convert(bar.weight.value, bar.weight.unit, unit) + 2 * c + 2 * sum;
}

export function platesView(app, ui) {
  const unit = app.settings.unit;
  const { plates, bar, collar, set } = plateConfig(app, unit);
  ui.plates ||= { side: [], target: '', top: '' };
  if (ui.plates.side.some((p) => p.unit !== unit)) ui.plates.side = []; // the unit changed elsewhere: plates of the other unit cannot stay on the bar
  if (ui.plates.view === '3d' && !supports3d()) ui.plates.view = 'side';
  const side = ui.plates.side; // [{value, unit, colour, drawHeightMm, thicknessMm}] heaviest first
  const justAdded = ui.plates.justAdded ?? -1; ui.plates.justAdded = -1;
  const total = totalOf(side, bar, collar, unit);
  const used = new Map();
  for (const p of side) used.set(p.value, (used.get(p.value) || 0) + 1);
  const grouped = [];
  for (const p of side) { const last = grouped.at(-1); if (last && last.plate.value === p.value) last.count++; else grouped.push({ plate: p, count: 1 }); }
  const mixed = side.some((p) => p.unit !== unit);
  const ladder = ui.plates.top ? safeLadder(app, ui.plates.top) : [];
  const meet = meetCard(app, ui, { bar, collar, plates });

  // Calibration: how far the loaded plates may be from their stamped weight.
  const mode = unit === 'kg' ? app.settings.plateMode : 'gym';
  const measuredMap = app.settings.plateMeasured?.[unit] || {};
  const tolr = platesTolerance(side, { tolerances: set.calibration?.tolerances, measured: measuredMap, mode, measuredUnit: unit });
  const nonPlateKg = convert(bar.weight.value, bar.weight.unit, 'kg') + (collar ? 2 * convert(collar.weight.value, collar.weight.unit, 'kg') * collar.perSide : 0);
  const showU = (kgVal, d = 2) => `${(Math.round(convert(kgVal, 'kg', unit) * 10 ** d) / 10 ** d).toFixed(d)} ${unit}`;
  const pctBand = tolr.nominalKg > 0 ? ((tolr.maxKg - tolr.nominalKg) / tolr.nominalKg) * 100 : 0;
  const calibrationCard = `<div class="card mt-4"><div class="card-h"><h2>Calibration</h2>
      ${unit === 'kg' ? `<div class="seg" role="group" aria-label="Plate type"><button data-pmode="calibrated" aria-pressed="${mode === 'calibrated'}">Calibrated</button><button data-pmode="gym" aria-pressed="${mode === 'gym'}">Gym plates</button></div>` : '<span class="pill">lb</span>'}</div>
    ${!side.length ? '<p class="muted small">Load some plates to see how far the weight can be from the number on the bar.</p>'
      : mode === 'calibrated' && tolr.bandKnown ? `<p><b>${showU(tolr.nominalKg)}</b> of plates. Competition-calibrated discs may read <b>${showU(tolr.minKg)}</b> to <b>${showU(tolr.maxKg)}</b> (about ±${pctBand.toFixed(2)}%).</p><p class="small muted">The IPF sets a minimum and maximum for every disc, so a calibrated set is accurate to a few hundred grams. Bar and collars have their own tolerance and are not included. ${esc(set.calibration?.source || '')}</p>`
      : `<p><b>${showU(tolr.nominalKg)}</b> of plates as stamped. ${unit === 'lb' ? 'There is no federation calibration table for lb plates.' : 'Uncalibrated gym plates have no guaranteed accuracy: a stamped plate can be a percent or more off.'} ${tolr.measuredKg == null ? 'Weigh a pair on a scale and enter it under My plates for exact numbers.' : ''}</p>`}
    ${tolr.measuredKg != null && side.length ? `<p class="small mt-2">As you weighed them: <b>${showU(tolr.measuredKg)}</b> of plates${tolr.measuredComplete ? '' : ` (${tolr.weighedSizes} of ${tolr.sizes} sizes weighed; the rest use the stamped weight)`}, about <b>${showU(tolr.measuredKg + nonPlateKg)}</b> on the bar with bar and collars at their stated weights.</p>` : ''}
  </div>`;

  const html = `
    <div class="topbar"><div><h1>Plates</h1><p class="muted small">Tap plates to load the bar, or type a target. Heaviest plates sit innermost, as in competition.</p></div>
      <div class="seg" role="group" aria-label="Unit"><button data-unit="kg" aria-pressed="${unit === 'kg'}">kg</button><button data-unit="lb" aria-pressed="${unit === 'lb'}">lb</button></div></div>
    <div class="card">
      <div class="row spread mb-2"><span class="small muted">${ui.plates.view === '3d' ? 'Drag to turn; tap a plate to remove it' : ui.plates.view === 'end' ? 'End view (stylised: outer plates drawn smaller so each shows)' : 'Tap a plate to remove it'}</span><div class="seg" role="group" aria-label="Bar view"><button data-bview="side" aria-pressed="${!ui.plates.view || ui.plates.view === 'side'}">Side</button><button data-bview="end" aria-pressed="${ui.plates.view === 'end'}">End</button>${supports3d() ? `<button data-bview="3d" aria-pressed="${ui.plates.view === '3d'}">3D</button>` : ''}</div></div>
      <div class="bb-stage">${ui.plates.view === '3d' ? `<div class="bb3d" role="img" aria-label="3D barbell: ${side.length} plates each side, ${round1(total)} ${unit} total"><p class="bb3d-status muted small">Loading 3D bar…</p></div>` : ui.plates.view === 'end' ? renderEndView({ plates: side, collar: !!collar }) : renderBarbell({ plates: side, collar: !!collar, justAdded })}</div>
      <div class="bb-total" aria-live="polite"><b>${round1(total)}</b><span>${unit}</span></div>
      <p class="loading-text">${esc(perSideText(grouped, unit))}</p>
      ${mixed ? '<p class="small tone-warn center">Mixed units on the bar: kg and lb plates are not interchangeable.</p>' : ''}
      <div class="plate-row mt-3 mb-3" role="group" aria-label="Add a plate to each side">
        ${plates.map((p) => {
          const left = Math.floor(p.count / 2) - (used.get(p.value) || 0);
          return `<button class="plate-btn" data-add="${p.value}" ${left <= 0 ? 'disabled' : ''} aria-label="Add ${p.value} ${p.unit} plate to each side, ${Math.max(0, left)} pairs left"><span class="disc" style="background:${p.colour};color:${lum(p.colour) < .35 ? '#fff' : '#101114'}">${p.value}</span><small>${Math.max(0, left)} left</small></button>`;
        }).join('')}
      </div>
      <div class="row spread">
        <button class="btn ghost small" data-act="undo" ${side.length ? '' : 'disabled'}>Remove last</button>
        <button class="btn ghost small" data-act="clear" ${side.length ? '' : 'disabled'}>Clear bar</button>
      </div>
      <div class="share-row mt-2">${shareBgPicker(app.settings.shareBg)}<select class="share-bg" data-bar-end aria-label="Bar end in the image">${[['right', 'Bar end right'], ['left', 'Bar end left']].map(([v, t]) => `<option value="${v}"${v === app.settings.shareBarEnd ? ' selected' : ''}>${t}</option>`).join('')}</select><button class="btn ghost small" data-act="share" ${side.length ? '' : 'disabled'}>Share image</button>${saveButton('data-act="save"', !side.length)}</div>
    </div>
    ${calibrationCard}
    <div class="grid cols-2 mt-4">
      <div class="card">
        <div class="card-h"><h2>Load a weight</h2></div>
        <label class="field"><span>Target (${unit})</span><input id="target" inputmode="decimal" type="number" step="any" min="0" value="${esc(ui.plates.target)}" placeholder="e.g. ${unit === 'kg' ? '142.5' : '315'}"></label>
        <div id="target-result" class="small mt-3" aria-live="polite"></div>
        <button class="btn primary" data-act="load">Load it</button>
      </div>
      <div class="card">
        <div class="card-h"><h2>Bar &amp; collars</h2></div>
        <div class="field"><span>Bar</span><select id="bar">${set.bars.map((b) => `<option value="${b.id}" ${b.id === bar.id ? 'selected' : ''}>${esc(b.label)}</option>`).join('')}<option value="custom" ${bar.id === 'custom' || app.settings.barByUnit?.[unit] === 'custom' ? 'selected' : ''}>Custom weight…</option></select></div>
        ${(app.settings.barByUnit?.[unit] === 'custom') ? `<label class="field mt-3"><span>Custom bar weight (${unit})</span><input id="custombar" type="number" step="0.5" min="1" inputmode="decimal" value="${esc(app.settings.customBar?.[unit] ?? '')}"></label>` : ''}
        <label class="row mt-3"><input type="checkbox" id="collar" ${collar ? 'checked' : ''}> Competition collars (${esc(String(set.collar.weight.value))} ${set.collar.weight.unit} each side)</label>
        <p class="small muted mt-2">${esc(set.collar.source)}</p>
      </div>
    </div>
    <div class="card mt-4">
      <div class="card-h"><h2>Warm-up ladder</h2></div>
      <div class="row end"><label class="field grow"><span>Top set (${unit})</span><input id="top" inputmode="decimal" type="number" step="any" min="0" value="${esc(ui.plates.top)}"></label><button class="btn" data-act="ladder">Build</button></div>
      ${ladder.length ? `<ol class="list mt-3">${ladder.map((s, i) => `<li class="list-row two-line"><span class="lead"><span class="medal plain">${i + 1}</span></span><span class="main"><b>${round1(s.weight.value)} ${unit} × ${s.reps}</b><small>${esc(s.text)}</small></span><button class="btn small" data-ladder="${i}">Load</button></li>`).join('')}</ol>` : '<p class="muted small mt-3">Enter your top set to get plate-friendly warm-up jumps.</p>'}
    </div>
    ${meet.html}
    <details class="card fold mt-4"><summary>My plates (how many your gym has)</summary>
      <p class="muted small">Counts are the total number of each plate, both sides. Colours follow the IPF rule for 25, 20 and 15 kg; the rest are convention and editable in <code>data/plates.json</code>.</p>
      <div class="grid cols-3">${plates.map((p) => `<label class="field"><span>${p.value} ${p.unit}</span><input type="number" min="0" step="2" inputmode="numeric" data-count="${p.value}" value="${p.count}"></label>`).join('')}</div>
      <h3 class="mt-4">Weighed on a scale (optional)</h3>
      <p class="muted small">Weigh one plate of each size, in ${unit}, and enter it here. The Calibration card then shows what your plates really add up to. Leave blank to use the stamped weight.</p>
      <div class="grid cols-3">${plates.map((p) => `<label class="field"><span>${p.value} ${p.unit} plate weighs</span><input type="number" min="0" step="0.01" inputmode="decimal" data-measured="${p.value}" value="${esc(measuredMap[String(p.value)] ?? '')}" placeholder="${p.value}"></label>`).join('')}</div>
    </details>`;

  function bind(root, rerender) {
    const keepSide = (fn) => { fn(); rerender(); };
    const removePlate = (i) => keepSide(() => side.splice(i, 1));
    const id = ++mountId;
    leaveObserver?.disconnect();
    if (ui.plates.view === '3d') {
      const container = root.querySelector('.bb3d');
      const fallback = () => {
        if (id !== mountId || !container.isConnected) return;
        active3d?.dispose(); active3d = null;
        ui.plates.view = 'side'; rerender();
        toast('3D view unavailable here; showing the side view');
      };
      mount3d(container, { plates: side, collar: !!collar, justAdded, onRemove: removePlate, onError: fallback }).then((v) => {
        if (id === mountId && container.isConnected) active3d = v;
        else if (!root.querySelector('.bb3d')) v.dispose();
      }).catch(fallback);
      leaveObserver = new MutationObserver(() => {
        if (!root.querySelector('.bb3d')) {
          ++mountId;
          active3d?.dispose(); active3d = null;
          leaveObserver.disconnect();
        }
      });
      leaveObserver.observe(root, { childList: true });
    } else { active3d?.dispose(); active3d = null; }
    root.querySelectorAll('[data-unit]').forEach((b) => b.addEventListener('click', async () => { ui.plates.side = []; await app.saveSettings({ unit: b.dataset.unit }); }));
    const addPlate = (b) => keepSide(() => {
      const p = plates.find((q) => String(q.value) === b.dataset.add);
      side.push({ value: p.value, unit: p.unit, colour: p.colour, drawHeightMm: p.drawHeightMm, thicknessMm: p.thicknessMm });
      side.sort((a, c) => convert(c.value, c.unit, 'kg') - convert(a.value, a.unit, 'kg'));
      ui.plates.justAdded = side.map((q) => q.value).lastIndexOf(p.value); // animate the new outermost plate of that size
    });
    const stage = root.querySelector('.bb-stage');
    root.querySelectorAll('[data-add]').forEach((b) => {
      b.addEventListener('click', () => { if (b.dataset.dragged) { delete b.dataset.dragged; return; } addPlate(b); });
      // Drag a plate from the tray onto the bar (tap also works).
      b.addEventListener('pointerdown', (e) => {
        if (b.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const sx = e.clientX, sy = e.clientY; let ghost = null;
        const over = (ev) => { const r = stage.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top - 24 && ev.clientY <= r.bottom + 24; };
        const move = (ev) => {
          if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) {
            ghost = b.querySelector('.disc').cloneNode(true);
            Object.assign(ghost.style, { position: 'fixed', zIndex: 80, pointerEvents: 'none', transform: 'translate(-50%,-50%) scale(1.25)', opacity: '.92' });
            document.body.append(ghost);
          }
          if (ghost) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; stage.style.outline = over(ev) ? '2px dashed var(--accent)' : ''; }
        };
        const end = (ev) => {
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
          stage.style.outline = '';
          if (ghost) { ghost.remove(); b.dataset.dragged = '1'; if (ev.type === 'pointerup' && over(ev)) addPlate(b); }
        };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
      });
    });
    root.querySelectorAll('.bb-plate').forEach((el) => {
      const rm = () => removePlate(Number(el.dataset.index));
      el.addEventListener('click', rm);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rm(); } });
    });
    root.querySelectorAll('[data-pmode]').forEach((b) => b.addEventListener('click', () => app.saveSettings({ plateMode: b.dataset.pmode })));
    root.querySelectorAll('[data-measured]').forEach((inp) => inp.addEventListener('change', () => {
      const cur = app.settings.plateMeasured || { kg: {}, lb: {} };
      const next = { ...(cur[unit] || {}) };
      const v = parseFloat(inp.value);
      if (Number.isFinite(v) && v > 0 && v < 100) next[inp.dataset.measured] = v; else delete next[inp.dataset.measured];
      app.saveSettings({ plateMeasured: { ...cur, [unit]: next } });
    }));
    root.querySelectorAll('[data-bview]').forEach((b) => b.addEventListener('click', () => { ui.plates.view = b.dataset.bview; rerender(); }));
    root.querySelector('[data-act=undo]')?.addEventListener('click', () => keepSide(() => side.pop()));
    root.querySelector('[data-act=clear]')?.addEventListener('click', () => keepSide(() => { side.length = 0; }));
    bindShareBg(root, app);
    root.querySelector('[data-bar-end]')?.addEventListener('change', (e) => app.saveSettings({ shareBarEnd: e.target.value }));
    root.querySelectorAll('[data-act=share], [data-act=save]').forEach((b) => b.addEventListener('click', () => shareBarImage({ side, collar: !!collar, total: round1(total), unit, bg: app.settings.shareBg, end: app.settings.shareBarEnd, save: b.dataset.act === 'save' })
      .catch((e) => { if (e?.name !== 'AbortError') toast(`Could not make the image: ${e?.message || e}`); })));
    const target = root.querySelector('#target');
    const preview = () => {
      const v = parseFloat(target.value); ui.plates.target = target.value;
      const out = root.querySelector('#target-result');
      if (!Number.isFinite(v) || v <= 0) { out.textContent = ''; return null; }
      const r = loadBar({ target: { value: v, unit }, bar: bar.weight, collar, plates });
      out.innerHTML = r.exact ? `<b class="tone-good">Exact:</b> ${esc(perSideText(r.perSide, unit))}`
        : r.reason === 'below-bar' ? `<b class="tone-warn">Below the bar.</b> Bar${collar ? ' and collars' : ''} alone is ${round1(r.loadedTotal.value)} ${unit}.`
        : `<b class="tone-warn">Not loadable exactly.</b> Nearest: ${r.below ? `${round1(r.below.loadedTotal.value)} ${unit} below` : ''}${r.below && r.above ? ' / ' : ''}${r.above ? `${round1(r.above.loadedTotal.value)} ${unit} above` : ''}.`;
      return r;
    };
    target.addEventListener('input', preview); preview();
    if (ui.plates.autoload) { ui.plates.autoload = false; root.querySelector('[data-act=load]').click(); }
    root.querySelector('[data-act=load]').addEventListener('click', () => {
      const r = preview(); if (!r) return;
      keepSide(() => { side.length = 0; side.push(...drawable(r.perSide)); });
      if (!r.exact) toast(`Loaded ${round1(r.loadedTotal.value)} ${unit} (nearest loadable)`);
    });
    root.querySelector('#bar').addEventListener('change', async (e) => { await app.saveSettings({ barByUnit: { ...(app.settings.barByUnit || {}), [unit]: e.target.value } }); });
    root.querySelector('#custombar')?.addEventListener('change', (e) => { const v = Number(e.target.value); if (v > 0) app.saveSettings({ customBar: { ...(app.settings.customBar || {}), [unit]: v } }); });
    root.querySelector('#collar').addEventListener('change', (e) => app.saveSettings({ collar: e.target.checked }));
    root.querySelectorAll('[data-count]').forEach((inp) => inp.addEventListener('change', async () => {
      const n = Math.max(0, Math.floor(Number(inp.value) || 0));
      const cur = app.settings.plateCounts || {};
      await app.saveSettings({ plateCounts: { ...cur, [unit]: { ...(cur[unit] || {}), [inp.dataset.count]: n } } });
    }));
    meet.bind(root, rerender, (w) => keepSide(() => { const r = loadBar({ target: w, bar: bar.weight, collar, plates }); side.length = 0; side.push(...drawable(r.perSide)); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
    root.querySelector('[data-act=ladder]').addEventListener('click', () => { ui.plates.top = root.querySelector('#top').value; rerender(); });
    root.querySelectorAll('[data-ladder]').forEach((b) => b.addEventListener('click', () => keepSide(() => {
      const s = ladder[Number(b.dataset.ladder)];
      side.length = 0; side.push(...drawable(s.perSide));
    })));
  }
  return { html, bind };
}

function safeLadder(app, topText) {
  const v = parseFloat(topText);
  if (!Number.isFinite(v) || v <= 0) return [];
  const unit = app.settings.unit;
  const { plates, bar, collar } = plateConfig(app, unit);
  try { return warmupLadder({ top: { value: v, unit }, bar: bar.weight, collar, plates }); } catch { return []; }
}

function lum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0;
  const n = parseInt(m[1], 16); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}
