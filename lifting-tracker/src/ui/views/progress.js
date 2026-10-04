// Progress view: e1RM trends, totals, PRs, bodyweight trend, planned vs actual RPE.
import { estimate1RM } from '../../core/e1rm.js';
import { workingSets, fromProgrammeSets } from '../../core/sets.js';
import { runningBests } from '../../core/lifts.js';
import { rpeDeltas } from '../../core/rpe.js';
import { formatWeight, round1, convert } from '../../core/units.js';
import { lineChart, movingAverage, longDate } from '../charts.js';
import { esc, toast, todayIso } from '../dom.js';
import { prLabel } from './train.js';
import { coachReview } from '../../core/coach.js';

const LIFTS = ['squat', 'bench', 'deadlift'];

function bestE1rmByDate(app, events, includeVariants) {
  const byLift = { squat: new Map(), bench: new Map(), deadlift: new Map() };
  for (const e of workingSets(events)) {
    const ex = app.exercise(e.exerciseId);
    if (!ex?.lift || !(ex.competition || includeVariants)) continue;
    const v = estimate1RM(e.weightKg, e.reps);
    if (v == null) continue;
    const m = byLift[ex.lift];
    if (!m.has(e.date) || v > m.get(e.date)) m.set(e.date, v);
  }
  return byLift;
}

export function progressView(app, ui) {
  const unit = app.settings.unit;
  const toU = (kg) => round1(convert(kg, 'kg', unit));
  const pg = (ui.progress ||= { maxReps: 12, variants: true });
  // With variants on, high bar, paused, tempo and similar versions of a lift count towards that lift (useful when the competition version came later).
  const cat = pg.variants ? { ...app.catalogue, exercises: app.catalogue.exercises.map((e) => (e.lift ? { ...e, competition: true } : e)) } : app.catalogue;
  const events = app.events().filter((e) => e.reps <= pg.maxReps); // higher-rep sets make the estimate less reliable
  const byLift = bestE1rmByDate(app, events, pg.variants);
  const series = LIFTS.map((l) => ({ id: l, label: l[0].toUpperCase() + l.slice(1), points: [...byLift[l]].map(([x, y]) => ({ x, y: toU(y) })) })).filter((s) => s.points.length);
  const bests = runningBests(events, cat, { basis: 'e1rm' });
  const last = bests.at(-1);
  const totalSeries = [{ id: 'total', label: 'Total (e1RM)', area: true, points: bests.filter((r) => r.total != null).map((r) => ({ x: r.date, y: toU(r.total) })) }];
  const prs = app.prs().slice().reverse().slice(0, 12);
  const bw = app.bodyweightPoints();
  const bwSeries = bw.length ? [{ id: 'bw', label: 'Bodyweight', points: bw.map((p) => ({ x: p.x, y: toU(p.y) })), dashed: true }, { id: 'total', label: '7-day average', points: movingAverage(bw.map((p) => ({ x: p.x, y: toU(p.y) })), 7) }] : [];
  const rpe = rpeDeltas(app.programme);
  const rpeRows = Object.entries(rpe.perExercise).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.sets - a.sets).slice(0, 12);
  const allDeltas = rpe.perSet.map((s) => s.delta);
  const meanDelta = allDeltas.length ? allDeltas.reduce((a, b) => a + b, 0) / allDeltas.length : null;
  // Per-block summary from the coach's workbook: sets done and the best e1RM per competition lift in that block.
  const blockRows = [...(app.programme?.blocks || [])].sort((a, b) => a.number - b.number).map((b) => {
    const evs = workingSets(fromProgrammeSets({ blocks: [b] }, () => '2000-01-03').filter((e) => e.reps <= pg.maxReps));
    const best = { squat: null, bench: null, deadlift: null };
    for (const e of evs) { const ex = app.exercise(e.exerciseId); const v = estimate1RM(e.weightKg, e.reps); if (ex?.competition && ex.lift && v != null && (best[ex.lift] == null || v > best[ex.lift])) best[ex.lift] = v; }
    return { b, sets: evs.length, weeks: b.weeks.length, best };
  });
  const datesEst = app.usingExample || !(app.programme?.blocks || []).length ? '' : 'Programme dates are estimates until you set a start date in Data.';

  const tile = (lift) => {
    const v = last?.[lift];
    return `<div class="card stat s-${lift}"><span>${lift} e1RM</span><b style="color:var(--c)">${v != null ? toU(v) : '–'}<small style="font-size:14px"> ${v != null ? unit : ''}</small></b><small>best so far</small></div>`;
  };

  const html = `
    <div class="topbar"><div><h1>Progress</h1><p class="muted small">Estimated 1RM uses Epley and is an approximation. ${esc(datesEst)}</p></div>${app.usingExample ? '<span class="pill example">Example data</span>' : ''}</div>
    <div class="row spread" style="margin-bottom:8px"><span class="small muted">Lifts counted</span>
      <div class="seg" role="group" aria-label="Which lifts count"><button data-variants="1" aria-pressed="${pg.variants}">With variants</button><button data-variants="0" aria-pressed="${!pg.variants}">Competition only</button></div></div>
    <div class="row spread" style="margin-bottom:12px"><span class="small muted">Estimate 1RM from sets of up to</span>
      <div class="seg" role="group" aria-label="Maximum reps for the estimate">${[5, 8, 12].map((n) => `<button data-maxreps="${n}" aria-pressed="${pg.maxReps === n}">${n} reps</button>`).join(``)}</div></div>
    <div class="stats3">${LIFTS.map(tile).join('')}</div>
    ${coachSummary(app, unit)}
    <div class="card"><div class="card-h"><h2>Estimated 1RM by session</h2></div>${series.length ? lineChart({ series, unit, title: 'Estimated one-rep max over time for squat, bench press and deadlift' }) : '<p class="muted">Log or import competition lifts to see a trend.</p>'}</div>
    <div class="card"><div class="card-h"><h2>Total over time</h2><span class="muted small">${last?.total != null ? 'now ' + formatWeight({ value: last.total, unit: 'kg' }, unit) : ''}</span></div>${totalSeries[0].points.length ? lineChart({ series: totalSeries, unit, title: 'Estimated squat plus bench plus deadlift total over time' }) : '<p class="muted">The total appears once squat, bench and deadlift all have data.</p>'}</div>
    <div class="grid cols-2" style="margin-top:14px">
      <div class="card"><div class="card-h"><h2>Personal records</h2></div>
        ${prs.length ? `<ul class="feed">${prs.map((x) => `<li><span class="medal">PR</span><span><b>${esc(app.exerciseName(x.exerciseId))}</b><br><span class="muted small">${esc(prLabel(x, unit))}</span></span><span class="muted small">${esc(longDate(x.date))}</span></li>`).join('')}</ul>` : '<p class="muted">PRs appear after your first logged sessions. The first set is a baseline, never a PR.</p>'}</div>
      <div class="card"><div class="card-h"><h2>Planned vs actual RPE</h2><span class="muted small">${meanDelta == null ? '' : (meanDelta >= 0 ? '+' : '') + (Math.round(meanDelta * 100) / 100) + ' avg'}</span></div>
        ${rpeRows.length ? `<p class="small muted">Positive means you finished harder than the coach planned. RPE 11 "to failure" sets are left out.</p><table class="plain"><thead><tr><th>Exercise</th><th>Sets</th><th>Δ RPE</th></tr></thead><tbody>${rpeRows.map((r) => `<tr><td>${esc(app.exerciseName(r.id))}</td><td>${r.sets}</td><td style="color:${Math.abs(r.meanDelta) < 0.3 ? 'var(--good)' : r.meanDelta > 0 ? 'var(--warn)' : 'var(--text-2)'}">${r.meanDelta > 0 ? '+' : ''}${r.meanDelta}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Needs sets with both a target and an actual RPE.</p>'}</div>
    </div>
    <div class="card" style="margin-top:14px"><div class="card-h"><h2>By block</h2><span class="muted small">from the coach's workbook</span></div>
      ${blockRows.length ? `<div style="overflow-x:auto"><table class="plain"><thead><tr><th>Block</th><th>Weeks</th><th>Sets</th><th>Squat</th><th>Bench</th><th>Deadlift</th></tr></thead><tbody>${blockRows.map((r) => `<tr><td><b>${r.b.number}</b> ${esc(r.b.name)}</td><td>${r.weeks}</td><td>${r.sets}</td>${['squat', 'bench', 'deadlift'].map((l) => `<td>${r.best[l] != null ? toU(r.best[l]) : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="small muted" style="margin-top:8px">Best estimated 1RM in ${unit} for each block's competition lifts.</p>` : '<p class="muted">No blocks yet.</p>'}</div>
    <div class="card" style="margin-top:14px"><div class="card-h"><h2>Bodyweight</h2><span class="muted small">${bw.length ? bw.length + ' entries' : ''}</span></div>
      ${bwSeries.length ? lineChart({ series: bwSeries, unit, title: 'Bodyweight and its 7-entry moving average' }) : '<p class="muted">No bodyweight yet.</p>'}
      <form id="bwform" class="row" style="margin-top:12px;align-items:end"><label class="field" style="flex:1;min-width:120px"><span>Weight (${unit})</span><input name="w" type="number" step="0.1" min="20" inputmode="decimal" required></label>
        <label class="field" style="flex:1;min-width:140px"><span>Date</span><input name="d" type="date" value="${todayIso()}" required></label><button class="btn primary" type="submit">Add</button></form>
      ${datesEst && bw.some((p) => p.estimated) ? '<p class="small muted" style="margin-top:8px">Points from the workbook use estimated dates.</p>' : ''}</div>`;

  function bind(root, rerender) {
    root.querySelectorAll('[data-variants]').forEach((b) => b.addEventListener('click', () => { pg.variants = b.dataset.variants === '1'; rerender(); }));
    root.querySelectorAll(`[data-maxreps]`).forEach((b) => b.addEventListener(`click`, () => { pg.maxReps = Number(b.dataset.maxreps); rerender(); }));
    root.querySelector('#bwform')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target); const w = parseFloat(f.get('w'));
      if (!(w > 20 && w < 500)) { toast('Enter a realistic bodyweight'); return; }
      await app.addBodyweight(String(f.get('d')), { value: w, unit });
      toast('Bodyweight added');
    });
  }
  return { html, bind };
}

function coachSummary(app, unit) {
  if (app.usingExample) return '';
  let r;
  try { r = coachReview({ events: app.events(), programme: app.programmeMerged(), catalogue: app.catalogue, athlete: app.athlete(), bodyweight: app.bodyweightPoints(), unit }); } catch { return ''; }
  if (!r?.asOf) return '';
  const top = r.priorities.slice(0, 2);
  return `<div class="card coach" style="margin-bottom:14px"><div class="card-h"><h2>Coach's notes</h2><a class="btn small primary" href="#plan">Plan the next block</a></div>
    <p class="coach-headline">${esc(r.headline)}</p>
    ${top.map((f) => `<p class="small" style="margin:6px 0 0"><b>${esc(f.title)}.</b> <span class="muted">${esc(f.suggestion)}</span></p>`).join('')}</div>`;
}