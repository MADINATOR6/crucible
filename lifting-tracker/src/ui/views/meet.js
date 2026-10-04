// Meet planner card: attempt suggestions from a projected max, with the plates for each attempt.
import { planAttempts, DEFAULT_PCTS } from '../../core/attempts.js';
import { runningBests } from '../../core/lifts.js';
import { convert, round1 } from '../../core/units.js';
import { loadBar, perSideText } from '../../plates/loading.js';
import { esc } from '../dom.js';

const LIFTS = ['squat', 'bench', 'deadlift'];

export function meetCard(app, ui, cfg) {
  const unit = app.settings.unit;
  const m = (ui.meet ||= { lift: 'squat', projected: '', pcts: { ...DEFAULT_PCTS } });
  const best = runningBests(app.events(), app.catalogue, { basis: 'e1rm' }).at(-1)?.[m.lift];
  const suggested = best != null ? round1(convert(best, 'kg', unit)) : '';
  const proj = m.projected !== '' ? parseFloat(m.projected) : suggested;
  const projKg = Number.isFinite(Number(proj)) && proj !== '' ? convert(Number(proj), unit, 'kg') : NaN;
  const pcts = { opener: m.pcts.opener, second: m.pcts.second, third: m.pcts.third };
  const attempts = planAttempts(projKg, { pcts, step: 2.5 }); // always rounded to the 2.5 kg competition step, then shown in your unit
  const rows = attempts ? ['opener', 'second', 'third'].map((k, i) => {
    const kg = attempts[k];
    const w = { value: convert(kg, 'kg', unit), unit };
    let text = '';
    try { text = perSideText(loadBar({ target: w, bar: cfg.bar.weight, collar: cfg.collar, plates: cfg.plates }).perSide, unit); } catch { /* ignore */ }
    return { n: i + 1, k, kg, w, pct: pcts[k], text };
  }) : [];

  const html = `<div class="card" style="margin-top:14px"><div class="card-h"><h2>Meet planner</h2><span class="pill">suggestion only</span></div>
    <div class="row" style="align-items:end">
      <div class="seg" role="group" aria-label="Lift">${LIFTS.map((l) => `<button data-meet-lift="${l}" aria-pressed="${m.lift === l}">${l}</button>`).join('')}</div>
      <label class="field" style="flex:1;min-width:130px"><span>Projected best (${unit})</span><input id="meet-proj" type="number" step="0.5" min="0" inputmode="decimal" value="${esc(m.projected !== '' ? m.projected : suggested)}" placeholder="${suggested === '' ? 'enter a number' : suggested}"></label>
    </div>
    ${best != null ? `<p class="small muted" style="margin-top:6px">Prefilled from your best estimated 1RM (an approximation). Use what you and your coach trust.</p>` : '<p class="small muted" style="margin-top:6px">Enter your projected best to see attempts.</p>'}
    ${rows.length ? `<ol class="feed" style="margin-top:10px">${rows.map((r) => `<li><span class="medal" style="background:var(--surface-3);color:var(--text)">${r.n}</span>
      <span><b>${round1(r.w.value)} ${unit}</b> <span class="muted small">${Math.round(r.pct * 100)}% of projected</span><br><span class="muted small">${esc(r.text)}</span></span>
      <button class="btn small" data-meet-load="${r.n - 1}">Load</button></li>`).join('')}</ol>
      <p class="small muted" style="margin-top:8px">Opener is a weight you could triple on a bad day; the third is the target. Attempts rise by at least 2.5 kg.</p>` : ''}
  </div>`;

  function bind(root, rerender, loadOnBar) {
    root.querySelectorAll('[data-meet-lift]').forEach((b) => b.addEventListener('click', () => { m.lift = b.dataset.meetLift; m.projected = ''; rerender(); }));
    root.querySelector('#meet-proj')?.addEventListener('change', (e) => { m.projected = e.target.value; rerender(); });
    root.querySelectorAll('[data-meet-load]').forEach((b) => b.addEventListener('click', () => loadOnBar(rows[Number(b.dataset.meetLoad)].w)));
  }
  return { html, bind };
}
