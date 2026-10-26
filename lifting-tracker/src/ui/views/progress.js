// Progress view: one chart per competition lift (RPE-aware estimated max, light days faded, smoothed trend, kg per
// week, block bands, PR stars, projection to meet day), the total with IPF GL points, weekly training load,
// "same weight, lower RPE" signals, PRs, planned vs actual RPE, per-block bests and bodyweight.
import { workingSets, fromProgrammeSets } from '../../core/sets.js';
import { rpeDeltas } from '../../core/rpe.js';
import { sessionPoints, trend, smoothLine, weeksSinceBest, valueAt, ipfGl, weeklyLoad, rpeAtLoad, setE1rm, dayNum, isoOf } from '../../core/progress.js';
import { formatWeight, round1, convert } from '../../core/units.js';
import { lineChart, bindCharts, movingAverage, shortDate, longDate } from '../charts.js';
import { esc, toast, todayIso } from '../dom.js';
import { prLabel } from './train.js';
import { coachReview } from '../../core/coach.js';
import { shareBgPicker, bindShareBg, saveButton } from '../share-image.js';
import { shareLiftImage } from '../share-progress.js';

const LIFTS = ['squat', 'bench', 'deadlift'];
const NAMES = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
const RANGES = { '4w': 28, '12w': 84, '6m': 182, all: Infinity };
const RANGE_LABEL = { '4w': '4 wk', '12w': '12 wk', '6m': '6 mo', all: 'All' };
const fmtRpe = (r) => (r == null ? '' : ` @${r}`);

/** Linear interpolation of a sorted [{x, y}] line at `iso`; null outside it. */
function lineAt(line, iso) {
  const t = dayNum(iso);
  for (let i = 0; i < line.length; i++) {
    const a = line[i], ta = dayNum(a.x);
    if (ta === t) return a.y;
    const b = line[i + 1];
    if (b && ta < t && dayNum(b.x) > t) return a.y + ((b.y - a.y) * (t - ta)) / (dayNum(b.x) - ta);
  }
  return null;
}

export function progressView(app, ui) {
  const unit = app.settings.unit;
  const toU = (kg) => round1(convert(kg, 'kg', unit));
  const pg = (ui.progress ||= { maxReps: 12, variants: true, range: '6m' });
  pg.range ||= '6m';
  const { meetDate, sex } = app.settings;
  const today = todayIso();

  // Working sets per lift. With variants on, high bar, paused, tempo and similar versions count towards the lift.
  const sets = { squat: [], bench: [], deadlift: [] };
  for (const e of workingSets(app.events())) {
    const ex = app.exercise(e.exerciseId);
    if (!ex?.lift || !sets[ex.lift] || !(ex.competition || pg.variants) || e.reps > pg.maxReps) continue;
    sets[ex.lift].push({ date: e.date, weightKg: e.weightKg, reps: e.reps, rpe: e.rpe ?? null });
  }
  const lifts = LIFTS.map((lift) => {
    const points = sessionPoints(sets[lift]);
    return { lift, points, tr: trend(points, { weeks: 8 }), line: smoothLine(points), since: weeksSinceBest(points), load: weeklyLoad(sets[lift], points) };
  });
  const lastDate = lifts.flatMap((l) => l.points.map((p) => p.x)).sort().at(-1) || today;
  const meetAhead = meetDate && meetDate > lastDate ? meetDate : null;
  const end = meetAhead && dayNum(meetAhead) - dayNum(lastDate) <= 26 * 7 ? meetAhead : lastDate;
  const firstDate = lifts.flatMap((l) => l.points.map((p) => p.x)).sort()[0] || lastDate;
  const start = isoOf(Math.max(dayNum(firstDate), dayNum(lastDate) - RANGES[pg.range]));
  const domain = [start, end];
  const inRange = (iso) => iso >= start && iso <= end;

  // Training blocks as shaded bands.
  const bands = [];
  for (const b of [...(app.programme?.blocks || [])].sort((a, c) => a.number - c.number)) {
    const s = app.blockStarts().get(b.number);
    if (s) bands.push({ from: s, to: isoOf(dayNum(s) + 7 * Math.max(1, b.weeks.length) - 1), label: `B${b.number}` });
  }
  const meetMarker = meetAhead || (meetDate && inRange(meetDate)) ? [{ x: meetDate, label: 'Meet', kind: 'meet' }] : [];

  // Projection to meet day, only when it is honest: the meet is no further ahead than 1.5x the trend's own span
  // (4 weeks at least), and the likely range is within +-8% of the middle. Otherwise `why` says what is missing.
  const projection = (l) => {
    if (!meetAhead || !l.tr) return null;
    const span = dayNum(l.tr.to) - dayNum(l.tr.from), ahead = dayNum(meetAhead) - dayNum(l.tr.to);
    if (ahead > Math.max(28, 1.5 * span)) return { why: `Needs more weeks of hard sessions to project ${Math.round(ahead / 7)} weeks ahead to the meet.` };
    const m = l.tr.interval(meetAhead);
    if ((m.hi - m.lo) / 2 > 0.08 * m.mid) return { why: 'Too much session-to-session spread to project to the meet. Logging an RPE on top sets helps.' };
    const steps = [];
    for (let t = dayNum(l.tr.to); t < dayNum(meetAhead); t += 7) steps.push(isoOf(t));
    steps.push(meetAhead);
    return { range: steps.map((x) => { const i = l.tr.interval(x); return { x, lo: toU(i.lo), hi: toU(i.hi) }; }), meet: l.tr.interval(meetAhead) };
  };

  const shareData = {};
  const liftCard = (l) => {
    const { lift, points, tr, line, since } = l;
    if (!points.length) return `<div class="card s-${lift}"><div class="card-h"><h2>${NAMES[lift]}</h2></div><p class="muted">No ${NAMES[lift].toLowerCase()} sets yet.</p></div>`;
    const pj = projection(l), proj = pj?.meet ? pj : null;
    let best = -Infinity;
    const prs = points.filter((p) => p.hard && p.y > best && (best = p.y, true)).slice(1); // the first hard point is a baseline
    const tips = points.map((p) => ({ x: p.x, lines: [
      `${longDate(p.x)}${p.hard ? '' : ' · light day'}`,
      `${toU(p.weightKg)} ${unit} × ${p.reps}${fmtRpe(p.rpe)}`,
      `Est. max ${toU(p.y)} ${unit} (${p.method === 'rpe' ? 'RPE chart' : 'Epley, no RPE'})`,
    ] }));
    if (proj) tips.push({ x: meetAhead, lines: [`Meet day · ${longDate(meetAhead)}`, `Likely ${toU(proj.meet.lo)}–${toU(proj.meet.hi)} ${unit}`, `Middle ${toU(proj.meet.mid)} ${unit}`] });
    const series = [
      { id: lift, label: '', faint: true, kind: 'dots', points: points.filter((p) => !p.hard).map((p) => ({ x: p.x, y: toU(p.y) })) },
      { id: lift, label: '', kind: 'dots', points: points.filter((p) => p.hard).map((p) => ({ x: p.x, y: toU(p.y) })) },
      { id: lift, label: '', kind: 'line', points: line.map((p) => ({ x: p.x, y: toU(p.y) })), range: proj?.range },
    ];
    const rate = tr ? `${tr.slopePerWeek >= 0 ? '+' : '−'}${toU(Math.abs(tr.slopePerWeek))} ${unit}/wk` : '';
    const hardPts = points.filter((p) => p.hard);
    shareData[lift] = { lift, name: NAMES[lift], unit, rate, rateDown: !!tr && tr.slopePerWeek < 0,
      now: toU(tr ? tr.at(hardPts.at(-1)?.x ?? points.at(-1).x) : (hardPts.at(-1) ?? points.at(-1)).y),
      points: points.filter((p) => inRange(p.x)).map((p) => ({ x: p.x, y: toU(p.y), hard: p.hard })),
      line: line.filter((p) => inRange(p.x)).map((p) => ({ x: p.x, y: toU(p.y) })),
      prs: prs.filter((p) => inRange(p.x)).map((p) => ({ x: p.x, y: toU(p.y) })) };
    const note = since >= 4 ? `No new high in ${since} weeks. Normal in a deload or peak; otherwise worth a change.` : '';
    return `<div class="card s-${lift}"><div class="card-h"><h2><i class="swatch"></i>${NAMES[lift]}</h2><span class="rate${tr && tr.slopePerWeek < 0 ? ' down' : ''}" title="Trend over ${tr ? tr.n : 0} hard sessions, last 8 weeks">${rate || '<span class="muted small">trend needs 3 hard sessions in 8 weeks</span>'}</span></div>
      ${lineChart({ series, unit, height: 190, domain, bands, markers: [...meetMarker, ...prs.filter((p) => inRange(p.x)).map((p) => ({ x: p.x, y: toU(p.y), label: 'PR', kind: 'pr' }))], tips, title: `${NAMES[lift]} estimated max per session with trend` })}
      ${proj ? `<p class="small mt-2 mb-0">Meet day: likely <b>${toU(proj.meet.lo)}–${toU(proj.meet.hi)} ${unit}</b> if the last 8 weeks' trend holds.</p>` : ''}
      ${pj?.why ? `<p class="small muted mt-2 mb-0">${esc(pj.why)}</p>` : ''}
      ${note ? `<p class="small muted mt-2 mb-0">${esc(note)}</p>` : ''}
      <div class="share-row mt-2"><button class="btn ghost small" data-share-lift="${lift}">Share image</button>${saveButton(`data-share-lift="${lift}" data-save`)}</div></div>`;
  };

  // Tiles: current form, change on four weeks ago, and a sparkline of the trend.
  const tile = (l) => {
    const hard = l.points.filter((p) => p.hard);
    if (!hard.length) return `<div class="card stat s-${l.lift}"><span>${NAMES[l.lift]}</span><b class="figure">–</b><small>no hard sets yet</small></div>`;
    const lastX = hard.at(-1).x;
    const now = l.tr ? l.tr.at(lastX) : hard.at(-1).y;
    const ago = valueAt(l.points, isoOf(dayNum(lastX) - 28));
    const d = ago ? toU(now) - toU(l.tr ? l.tr.at(ago.x) ?? ago.y : ago.y) : null;
    const spark = l.line.filter((p) => dayNum(lastX) - dayNum(p.x) <= 84);
    let svg = '';
    if (spark.length > 1) {
      const ys = spark.map((p) => p.y), lo = Math.min(...ys), hi = Math.max(...ys), t0 = dayNum(spark[0].x), t1 = dayNum(spark.at(-1).x) || t0 + 1;
      svg = `<svg class="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d="${spark.map((p, i) => `${i ? 'L' : 'M'}${(((dayNum(p.x) - t0) / Math.max(1, t1 - t0)) * 100).toFixed(1)} ${(22 - ((p.y - lo) / Math.max(1e-9, hi - lo)) * 20).toFixed(1)}`).join(' ')}" vector-effect="non-scaling-stroke"/></svg>`;
    }
    return `<div class="card stat s-${l.lift}"><span>${NAMES[l.lift]} now</span><b class="figure series">${toU(now)}<small>${unit}</small></b>${svg}
      <small>${d == null ? 'estimated max' : `<span class="${d > 0 ? 'tone-good' : d < 0 ? 'tone-warn' : 'tone-muted'}">${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${toU(Math.abs(d))}</span> in 4 wk`}</small></div>`;
  };

  // Total at current form: the three trend lines summed wherever all three exist.
  const dates = [...new Set(lifts.flatMap((l) => l.line.map((p) => p.x)))].sort();
  const totalLine = dates.map((x) => {
    const v = lifts.map((l) => lineAt(l.line, x));
    return v.every((y) => y != null) ? { x, y: v.reduce((a, b) => a + b, 0) } : null;
  }).filter(Boolean);
  const bw = app.bodyweightPoints();
  const bwAvg = bw.length ? movingAverage(bw, 7).at(-1).y : null;
  const totalNow = totalLine.at(-1)?.y ?? null;
  const gl = totalNow != null && bwAvg && sex ? ipfGl(totalNow, bwAvg, sex) : null;
  const projs = lifts.map(projection);
  const totalProj = projs.every((p) => p?.meet) ? (() => {
    const mid = projs.reduce((a, p) => a + p.meet.mid, 0), half = Math.sqrt(projs.reduce((a, p) => a + ((p.meet.hi - p.meet.lo) / 2) ** 2, 0));
    return { mid, lo: mid - half, hi: mid + half };
  })() : null;
  const totalTips = totalLine.map((p) => ({ x: p.x, lines: [longDate(p.x), `Total ${toU(p.y)} ${unit}`, ...(bwAvg && sex ? [`IPF GL ${round1(ipfGl(p.y, lineAt(movingAverage(bw, 7), p.x) ?? bwAvg, sex))}`] : [])] }));

  // Weekly load table, last 8 weeks in range.
  const weeks = [...new Set(lifts.flatMap((l) => l.load.map((r) => r.week)))].sort().filter((w) => w <= end).slice(-8).reverse();
  const loadCell = (l, w) => {
    const r = l.load.find((x) => x.week === w);
    return r ? `<td><b>${r.sets}</b><small class="muted"> ${r.intensity ? Math.round(r.intensity * 100) + '%' : ''}</small></td>` : '<td class="muted">–</td>';
  };
  const signals = lifts.flatMap((l) => rpeAtLoad(sets[l.lift]).filter((s) => s.drop > 0).slice(0, 3).map((s) => ({ ...s, lift: l.lift }))).sort((a, b) => b.drop - a.drop).slice(0, 5);

  const prs = app.prs().slice().reverse().slice(0, 12);
  const bwSeries = bw.length ? [{ id: 'bw', label: 'Weigh-ins', kind: 'dots', faint: true, points: bw.map((p) => ({ x: p.x, y: toU(p.y) })) }, { id: 'bw', label: '7-day average', kind: 'line', points: movingAverage(bw, 7).map((p) => ({ x: p.x, y: toU(p.y) })) }] : [];
  const rpe = rpeDeltas(app.programme);
  const rpeRows = Object.entries(rpe.perExercise).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.sets - a.sets).slice(0, 12);
  const allDeltas = rpe.perSet.map((s) => s.delta);
  const meanDelta = allDeltas.length ? allDeltas.reduce((a, b) => a + b, 0) / allDeltas.length : null;
  const blockRows = [...(app.programme?.blocks || [])].sort((a, b) => a.number - b.number).map((b) => {
    const evs = workingSets(fromProgrammeSets({ blocks: [b] }, () => '2000-01-03').filter((e) => e.reps <= pg.maxReps));
    const best = { squat: null, bench: null, deadlift: null };
    for (const e of evs) { const ex = app.exercise(e.exerciseId); const v = setE1rm(e.weightKg, e.reps, e.rpe)?.value; if (ex?.competition && ex.lift && v != null && (best[ex.lift] == null || v > best[ex.lift])) best[ex.lift] = v; }
    return { b, sets: evs.length, weeks: b.weeks.length, best };
  });
  const datesEst = app.usingExample || !(app.programme?.blocks || []).length ? '' : 'Programme dates are estimates until you set a start date in Data.';

  const html = `
    <div class="topbar"><div><h1>Progress</h1><p class="muted small">Estimated max from each session's best set, using the RPE chart when the set has an RPE. Faded dots are light days, left out of the trend.</p></div>${app.usingExample ? '<span class="pill example">Example data</span>' : ''}</div>
    <div class="seg mb-3" role="group" aria-label="Time range">${Object.keys(RANGES).map((k) => `<button data-range="${k}" aria-pressed="${pg.range === k}">${RANGE_LABEL[k]}</button>`).join('')}</div>
    <div class="stats3">${lifts.map(tile).join('')}</div>
    <details class="options mb-4"><summary>Options · ${pg.variants ? 'with variants' : 'competition only'} · up to ${pg.maxReps} reps${meetDate ? ' · meet ' + shortDate(meetDate) : ''}</summary><div class="options-body">
      <div class="field"><span>Lifts counted</span><div class="seg" role="group" aria-label="Which lifts count"><button data-variants="1" aria-pressed="${pg.variants}">With variants</button><button data-variants="0" aria-pressed="${!pg.variants}">Competition only</button></div></div>
      <div class="field"><span>Share image background</span>${shareBgPicker(app.settings.shareBg)}</div>
      <div class="field"><span>Estimate from sets of up to</span><div class="seg" role="group" aria-label="Maximum reps for the estimate">${[5, 8, 12].map((n) => `<button data-maxreps="${n}" aria-pressed="${pg.maxReps === n}">${n} reps</button>`).join('')}</div></div>
      <label class="field"><span>Meet date (projection)</span><input id="meet-date" type="date" value="${esc(meetDate || '')}"></label>
      <div class="field"><span>IPF GL category</span><div class="seg" role="group" aria-label="IPF GL category">${[['male', 'Men'], ['female', 'Women'], ['', 'Not set']].map(([v, t]) => `<button data-sex="${v}" aria-pressed="${(sex || '') === v}">${t}</button>`).join('')}</div></div>
    </div></details>
    ${coachSummary(app, unit)}
    ${lifts.map(liftCard).join('')}
    ${datesEst ? `<p class="small muted">${esc(datesEst)}</p>` : ''}
    <div class="card"><div class="card-h"><h2>Total</h2><span class="muted small">${totalNow != null ? 'now ' + formatWeight({ value: totalNow, unit: 'kg' }, unit) : ''}</span></div>
      ${totalLine.length ? lineChart({ series: [{ id: 'total', label: '', kind: 'line', area: true, points: totalLine.map((p) => ({ x: p.x, y: toU(p.y) })), range: totalProj ? [{ x: totalLine.at(-1).x, lo: toU(totalLine.at(-1).y), hi: toU(totalLine.at(-1).y) }, { x: meetAhead, lo: toU(totalProj.lo), hi: toU(totalProj.hi) }] : undefined }], unit, height: 170, domain, bands, markers: meetMarker, tips: totalTips, title: 'Squat plus bench plus deadlift at current form' }) : '<p class="muted">The total appears once squat, bench and deadlift all have hard sessions.</p>'}
      <div class="stat-row mt-3">
        <div><span class="muted small">IPF GL points</span><b>${gl != null ? round1(gl) : '–'}</b><small class="muted">${gl != null ? `at ${toU(bwAvg)} ${unit} bodyweight` : !sex ? 'set your category in Options' : 'needs a bodyweight'}</small></div>
        ${totalProj ? `<div><span class="muted small">Meet day total</span><b>${toU(totalProj.lo)}–${toU(totalProj.hi)}</b><small class="muted">${unit}, likely range${bwAvg && sex ? ` · GL ${round1(ipfGl(totalProj.mid, bwAvg, sex))}` : ''}</small></div>` : ''}
      </div></div>
    <div class="card mt-4"><div class="card-h"><h2>Training load</h2><span class="muted small">working sets · average % of form</span></div>
      ${weeks.length ? `<div class="scroll-x"><table class="plain load"><thead><tr><th>Week</th>${LIFTS.map((l) => `<th class="s-${l}"><i class="swatch"></i>${NAMES[l]}</th>`).join('')}<th>Tonnes</th></tr></thead><tbody>${weeks.map((w) => `<tr><td>${shortDate(w)}</td>${lifts.map((l) => loadCell(l, w)).join('')}<td>${toU(lifts.reduce((a, l) => a + (l.load.find((x) => x.week === w)?.tonnage || 0), 0) / 1000)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No sets yet.</p>'}</div>
    <div class="card mt-4"><div class="card-h"><h2>Same weight, lower RPE</h2></div>
      ${signals.length ? `<p class="small muted">A load that feels easier than it used to is a strength gain you don't need a max to see.</p><ul class="list">${signals.map((s) => `<li class="list-row"><span class="main">${NAMES[s.lift]} ${toU(s.weightKg)} ${unit} × ${s.reps}<small>@${s.from.rpe} on ${shortDate(s.from.date)} → @${s.to.rpe} on ${shortDate(s.to.date)}</small></span><span class="trail tone-good">−${s.drop} RPE</span></li>`).join('')}</ul>` : '<p class="muted">Shows up when you repeat a weight and reps with an RPE at least two weeks apart and it feels easier.</p>'}</div>
    <div class="grid cols-2 mt-4">
      <div class="card"><div class="card-h"><h2>Personal records</h2></div>
        ${prs.length ? `<ol class="list">${prs.map((x) => `<li class="list-row"><span class="lead"><span class="pill pr">PR</span></span><span class="main">${esc(app.exerciseName(x.exerciseId))}<small>${esc(prLabel(x, unit))}</small></span><span class="trail">${esc(shortDate(x.date))}${x.date.slice(0, 4) !== today.slice(0, 4) ? ' ' + esc(x.date.slice(0, 4)) : ''}</span></li>`).join('')}</ol>` : '<p class="muted">PRs appear after your first logged sessions. The first set is a baseline, never a PR.</p>'}</div>
      <div class="card"><div class="card-h"><h2>Planned vs actual RPE</h2><span class="muted small">${meanDelta == null ? '' : (meanDelta >= 0 ? '+' : '') + (Math.round(meanDelta * 100) / 100) + ' avg'}</span></div>
        ${rpeRows.length ? `<p class="small muted">Positive means you finished harder than the coach planned. RPE 11 "to failure" sets are left out.</p><table class="plain"><thead><tr><th>Exercise</th><th>Sets</th><th>Δ RPE</th></tr></thead><tbody>${rpeRows.map((r) => `<tr><td>${esc(app.exerciseName(r.id))}</td><td>${r.sets}</td><td class="${Math.abs(r.meanDelta) < 0.3 ? 'tone-good' : r.meanDelta > 0 ? 'tone-warn' : 'tone-muted'}">${r.meanDelta > 0 ? '+' : ''}${r.meanDelta}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Needs sets with both a target and an actual RPE.</p>'}</div>
    </div>
    <div class="card mt-4"><div class="card-h"><h2>By block</h2><span class="muted small">from the coach's workbook</span></div>
      ${blockRows.length ? `<div class="scroll-x"><table class="plain"><thead><tr><th>Block</th><th>Weeks</th><th>Sets</th><th>Squat</th><th>Bench</th><th>Deadlift</th></tr></thead><tbody>${blockRows.map((r) => `<tr><td><b>${r.b.number}</b> ${esc(r.b.name)}</td><td>${r.weeks}</td><td>${r.sets}</td>${LIFTS.map((l) => `<td>${r.best[l] != null ? toU(r.best[l]) : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="small muted mt-2">Best estimated max in ${unit} for each block's competition lifts.</p>` : '<p class="muted">No blocks yet.</p>'}</div>
    <div class="card mt-4"><div class="card-h"><h2>Bodyweight</h2><span class="muted small">${bw.length ? bw.length + ' entries' : ''}</span></div>
      ${bwSeries.length ? lineChart({ series: bwSeries, unit, height: 160, tips: bw.map((p) => ({ x: p.x, lines: [longDate(p.x), `${toU(p.y)} ${unit}${p.estimated ? ' (estimated date)' : ''}`] })), title: 'Bodyweight weigh-ins and their 7-day average' }) : '<p class="muted">No bodyweight yet.</p>'}
      <form id="bwform" class="row end mt-3"><label class="field grow"><span>Weight (${unit})</span><input name="w" type="number" step="0.1" min="20" inputmode="decimal" required></label>
        <label class="field grow"><span>Date</span><input name="d" type="date" value="${today}" required></label><button class="btn primary" type="submit">Add</button></form>
      ${datesEst && bw.some((p) => p.estimated) ? '<p class="small muted mt-2">Points from the workbook use estimated dates.</p>' : ''}</div>`;

  function bind(root, rerender) {
    bindCharts(root);
    bindShareBg(root, app);
    root.querySelectorAll('[data-share-lift]').forEach((b) => b.addEventListener('click', () => {
      const d = shareData[b.dataset.shareLift];
      if (!d?.points.length) { toast('No sessions in this range to share'); return; }
      shareLiftImage({ ...d, bg: app.settings.shareBg, save: b.hasAttribute('data-save') }).catch((e) => { if (e?.name !== 'AbortError') toast(`Could not make the image: ${e?.message || e}`); });
    }));
    root.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => { pg.range = b.dataset.range; rerender(); }));
    root.querySelectorAll('[data-variants]').forEach((b) => b.addEventListener('click', () => { pg.variants = b.dataset.variants === '1'; rerender(); }));
    root.querySelectorAll('[data-maxreps]').forEach((b) => b.addEventListener('click', () => { pg.maxReps = Number(b.dataset.maxreps); rerender(); }));
    root.querySelectorAll('[data-sex]').forEach((b) => b.addEventListener('click', () => app.saveSettings({ sex: b.dataset.sex || null })));
    root.querySelector('#meet-date')?.addEventListener('change', (e) => app.saveSettings({ meetDate: e.target.value || null }));
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
  return `<div class="card mb-4"><div class="card-h"><h2>Coach's notes</h2><a class="btn small" href="#plan">Plan the next block</a></div>
    <p class="coach-headline">${esc(r.headline)}</p>
    ${top.map((f) => `<p class="small mt-2 mb-0"><b>${esc(f.title)}.</b> <span class="muted">${esc(f.suggestion)}</span></p>`).join('')}</div>`;
}
