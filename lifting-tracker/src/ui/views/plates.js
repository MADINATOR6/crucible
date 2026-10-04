// Plate simulator view + shared helpers for describing a load with the user's plates.
import { convert, round1 } from '../../core/units.js';
import { loadBar, perSideText, warmupLadder } from '../../plates/loading.js';
import { renderBarbell } from '../barbell.js';
import { esc, toast } from '../dom.js';

export function barsFor(app, unit) { return app.platesData[unit].bars; }

export function plateConfig(app, unit) {
  const set = app.platesData[unit];
  const counts = app.settings.plateCounts?.[unit] || {};
  const plates = set.plates.map((p) => ({ ...p, count: Number.isInteger(counts[p.value]) ? counts[p.value] : p.count }));
  const barId = app.settings.barByUnit?.[unit] || set.bars[0].id;
  const bar = set.bars.find((b) => b.id === barId) || set.bars[0];
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
  for (const { plate, count } of perSide) for (let i = 0; i < count; i++) out.push({ value: plate.value, unit: plate.unit, colour: plate.colour, drawHeightMm: plate.drawHeightMm });
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
  const side = ui.plates.side; // [{value, unit, colour, drawHeightMm}] heaviest first
  const total = totalOf(side, bar, collar, unit);
  const used = new Map();
  for (const p of side) used.set(p.value, (used.get(p.value) || 0) + 1);
  const grouped = [];
  for (const p of side) { const last = grouped.at(-1); if (last && last.plate.value === p.value) last.count++; else grouped.push({ plate: p, count: 1 }); }
  const mixed = side.some((p) => p.unit !== unit);
  const ladder = ui.plates.top ? safeLadder(app, ui.plates.top) : [];

  const html = `
    <div class="topbar"><div><h1>Plates</h1><p class="muted small">Tap plates to load the bar, or type a target. Heaviest plates sit innermost, as in competition.</p></div>
      <div class="seg" role="group" aria-label="Unit"><button data-unit="kg" aria-pressed="${unit === 'kg'}">kg</button><button data-unit="lb" aria-pressed="${unit === 'lb'}">lb</button></div></div>
    <div class="card">
      <div class="bb-stage">${renderBarbell({ plates: side, collar: !!collar })}</div>
      <div class="bb-total" aria-live="polite"><b>${round1(total)}</b><span>${unit}</span></div>
      <p class="loading-text">${esc(perSideText(grouped, unit))}</p>
      ${mixed ? '<p class="small" style="color:var(--warn);text-align:center">Mixed units on the bar: kg and lb plates are not interchangeable.</p>' : ''}
      <div class="plate-row" style="margin:12px 0" role="group" aria-label="Add a plate to each side">
        ${plates.map((p) => {
          const left = Math.floor(p.count / 2) - (used.get(p.value) || 0);
          return `<button class="plate-btn" data-add="${p.value}" ${left <= 0 ? 'disabled' : ''} aria-label="Add ${p.value} ${p.unit} plate to each side, ${Math.max(0, left)} pairs left"><span class="disc" style="background:${p.colour};color:${lum(p.colour) < .35 ? '#fff' : '#101114'}">${p.value}</span><small>${Math.max(0, left)} left</small></button>`;
        }).join('')}
      </div>
      <div class="row spread">
        <button class="btn ghost small" data-act="undo" ${side.length ? '' : 'disabled'}>Remove last</button>
        <button class="btn ghost small" data-act="clear" ${side.length ? '' : 'disabled'}>Clear bar</button>
      </div>
    </div>
    <div class="grid cols-2" style="margin-top:14px">
      <div class="card">
        <div class="card-h"><h2>Load a weight</h2></div>
        <div class="field"><span>Target (${unit})</span><input id="target" inputmode="decimal" type="number" step="any" min="0" value="${esc(ui.plates.target)}" placeholder="e.g. ${unit === 'kg' ? '142.5' : '315'}"></div>
        <div id="target-result" class="small" style="margin:10px 0" aria-live="polite"></div>
        <button class="btn primary" data-act="load">Load it</button>
      </div>
      <div class="card">
        <div class="card-h"><h2>Bar &amp; collars</h2></div>
        <div class="field"><span>Bar</span><select id="bar">${set.bars.map((b) => `<option value="${b.id}" ${b.id === bar.id ? 'selected' : ''}>${esc(b.label)}</option>`).join('')}</select></div>
        <label class="row" style="margin-top:12px"><input type="checkbox" id="collar" ${collar ? 'checked' : ''} style="width:auto;min-height:0"> Competition collars (${esc(String(set.collar.weight.value))} ${set.collar.weight.unit} each side)</label>
        <p class="small muted" style="margin-top:8px">${esc(set.collar.source)}</p>
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-h"><h2>Warm-up ladder</h2></div>
      <div class="row"><div class="field" style="flex:1;min-width:140px"><span>Top set (${unit})</span><input id="top" inputmode="decimal" type="number" step="any" min="0" value="${esc(ui.plates.top)}"></div><button class="btn" data-act="ladder" style="align-self:end">Build</button></div>
      ${ladder.length ? `<ol class="feed" style="margin-top:12px">${ladder.map((s, i) => `<li><span class="medal" style="background:var(--surface-3);color:var(--text)">${i + 1}</span><span><b>${round1(s.weight.value)} ${unit}</b> × ${s.reps}<br><span class="muted small">${esc(s.text)}</span></span><button class="btn small" data-ladder="${i}">Load</button></li>`).join('')}</ol>` : '<p class="muted small" style="margin-top:10px">Enter your top set to get plate-friendly warm-up jumps.</p>'}
    </div>
    <details class="card fold" style="margin-top:14px"><summary>My plates (how many your gym has)</summary>
      <p class="muted small">Counts are the total number of each plate, both sides. Colours follow the IPF rule for 25, 20 and 15 kg; the rest are convention and editable in <code>data/plates.json</code>.</p>
      <div class="grid cols-3">${plates.map((p) => `<label class="field"><span>${p.value} ${p.unit}</span><input type="number" min="0" step="2" inputmode="numeric" data-count="${p.value}" value="${p.count}"></label>`).join('')}</div>
    </details>`;

  function bind(root, rerender) {
    const keepSide = (fn) => { fn(); rerender(); };
    root.querySelectorAll('[data-unit]').forEach((b) => b.addEventListener('click', async () => { ui.plates.side = []; await app.saveSettings({ unit: b.dataset.unit }); }));
    root.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => keepSide(() => {
      const p = plates.find((q) => String(q.value) === b.dataset.add);
      side.push({ value: p.value, unit: p.unit, colour: p.colour, drawHeightMm: p.drawHeightMm });
      side.sort((a, c) => convert(c.value, c.unit, 'kg') - convert(a.value, a.unit, 'kg'));
    })));
    root.querySelectorAll('.bb-plate').forEach((el) => {
      const rm = () => keepSide(() => side.splice(Number(el.dataset.index), 1));
      el.addEventListener('click', rm);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rm(); } });
    });
    root.querySelector('[data-act=undo]')?.addEventListener('click', () => keepSide(() => side.pop()));
    root.querySelector('[data-act=clear]')?.addEventListener('click', () => keepSide(() => { side.length = 0; }));
    const target = root.querySelector('#target');
    const preview = () => {
      const v = parseFloat(target.value); ui.plates.target = target.value;
      const out = root.querySelector('#target-result');
      if (!Number.isFinite(v) || v <= 0) { out.textContent = ''; return null; }
      const r = loadBar({ target: { value: v, unit }, bar: bar.weight, collar, plates });
      out.innerHTML = r.exact ? `<b style="color:var(--good)">Exact:</b> ${esc(perSideText(r.perSide, unit))}`
        : r.reason === 'below-bar' ? `<b style="color:var(--warn)">Below the bar.</b> Bar${collar ? ' and collars' : ''} alone is ${round1(r.loadedTotal.value)} ${unit}.`
        : `<b style="color:var(--warn)">Not loadable exactly.</b> Nearest: ${r.below ? `${round1(r.below.loadedTotal.value)} ${unit} below` : ''}${r.below && r.above ? ' / ' : ''}${r.above ? `${round1(r.above.loadedTotal.value)} ${unit} above` : ''}.`;
      return r;
    };
    target.addEventListener('input', preview); preview();
    root.querySelector('[data-act=load]').addEventListener('click', () => {
      const r = preview(); if (!r) return;
      keepSide(() => { side.length = 0; side.push(...drawable(r.perSide)); });
      if (!r.exact) toast(`Loaded ${round1(r.loadedTotal.value)} ${unit} (nearest loadable)`);
    });
    root.querySelector('#bar').addEventListener('change', async (e) => { await app.saveSettings({ barByUnit: { ...(app.settings.barByUnit || {}), [unit]: e.target.value } }); });
    root.querySelector('#collar').addEventListener('change', (e) => app.saveSettings({ collar: e.target.checked }));
    root.querySelectorAll('[data-count]').forEach((inp) => inp.addEventListener('change', async () => {
      const n = Math.max(0, Math.floor(Number(inp.value) || 0));
      const cur = app.settings.plateCounts || {};
      await app.saveSettings({ plateCounts: { ...cur, [unit]: { ...(cur[unit] || {}), [inp.dataset.count]: n } } });
    }));
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
