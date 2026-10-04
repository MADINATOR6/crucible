// Muscles view: weekly hard sets per muscle on a front/back body map.
import { weeklyHardSets } from '../../core/muscles.js';
import { mondayOf, addDays } from '../../core/weeks.js';
import { renderHeatmap, renderLegend, renderMuscleList, MUSCLE_LABELS, bandFor, fmtSets } from '../heatmap.js';
import { esc, todayIso } from '../dom.js';
import { longDate } from '../charts.js';

const DUMMY_MONDAY = '2000-01-03';

function programmeWeekEvents(app, blockNumber, weekNumber, mode) {
  const block = app.programme.blocks.find((b) => b.number === blockNumber);
  const week = block?.weeks.find((w) => w.number === weekNumber);
  if (!week) return { events: [], weekStart: DUMMY_MONDAY, estimated: false };
  const start = app.dateFor({ blockNumber, weekNumber, dayNumber: 1 });
  const weekStart = start ? mondayOf(start) : DUMMY_MONDAY;
  const events = [];
  let order = 0;
  week.days.forEach((d) => d.entries.forEach((e, ei) => e.sets.forEach((s, si) => {
    const logged = app.loggedFor({ blockNumber, weekNumber, dayNumber: d.number, entryIndex: ei, setIndex: si });
    if (mode === 'done' && !(s.completed || logged)) return;
    events.push({ date: weekStart, exerciseId: logged?.exerciseId || e.exerciseId || ('custom:' + e.name), weightKg: 1, reps: 1, rpe: null, isWarmup: false, order: order++, source: 'programme' });
  })));
  return { events, weekStart, estimated: !!start };
}

export function musclesView(app, ui) {
  const p = app.programme;
  ui.muscles ||= { mode: 'programme', what: 'done', block: null, week: null, calWeek: null, view: 'front', selected: null };
  const m = ui.muscles;
  const blocks = [...(p?.blocks || [])].sort((a, b) => a.number - b.number);
  if (!m.block || !blocks.some((b) => b.number === m.block)) m.block = blocks.at(-1)?.number ?? null;
  const block = blocks.find((b) => b.number === m.block);
  if (block && (!m.week || !block.weeks.some((w) => w.number === m.week))) {
    // Default to the most recent week with work done (so "Done" is never empty by default).
    const hasDone = (w) => w.days.some((d) => d.entries.some((e, ei) => e.sets.some((s, si) => s.completed || app.loggedFor({ blockNumber: block.number, weekNumber: w.number, dayNumber: d.number, entryIndex: ei, setIndex: si }))));
    const lastDone = [...block.weeks].reverse().find(hasDone);
    m.week = (lastDone || block.weeks[0])?.number ?? null;
  }
  if (!m.calWeek) {
    const evs = app.events();
    const last = evs.at(-1)?.date;
    const cur = mondayOf(todayIso());
    m.calWeek = evs.some((e) => mondayOf(e.date) === cur) || !last ? cur : mondayOf(last);
  }

  let events, weekStart, label, estimated = false;
  if (m.mode === 'programme' && block && m.week != null) {
    ({ events, weekStart, estimated } = programmeWeekEvents(app, m.block, m.week, m.what));
    label = `Block ${m.block} · Week ${m.week}${m.what === 'planned' ? ' (planned)' : ''}`;
  } else {
    events = app.events(); weekStart = m.calWeek;
    label = `${longDate(weekStart)} – ${longDate(addDays(weekStart, 6))}`;
  }
  const res = weeklyHardSets(events, app.catalogue, weekStart);
  const data = Object.fromEntries(Object.entries(res.muscles).map(([k, v]) => [k, v.sets]));
  // The previous week, so each muscle can show whether it went up or down.
  let prev = null;
  try {
    let pres = null;
    if (m.mode === 'programme' && block) {
      const sortedBlocks = blocks;
      const wi = block.weeks.findIndex((w) => w.number === m.week);
      let target = wi > 0 ? { b: block.number, w: block.weeks[wi - 1].number } : null;
      if (!target) { const bi = sortedBlocks.findIndex((b) => b.number === block.number); const pb = bi > 0 ? sortedBlocks[bi - 1] : null; if (pb?.weeks.length) target = { b: pb.number, w: pb.weeks.at(-1).number }; }
      if (target) { const pe = programmeWeekEvents(app, target.b, target.w, m.what); pres = weeklyHardSets(pe.events, app.catalogue, pe.weekStart); }
    } else if (m.mode !== 'programme') {
      pres = weeklyHardSets(events, app.catalogue, addDays(weekStart, -7));
    }
    if (pres) prev = Object.fromEntries(Object.entries(pres.muscles).map(([k, v]) => [k, v.sets]));
  } catch { prev = null; }
  const sel = m.selected && res.muscles[m.selected] ? m.selected : null;
  const wkEnd = addDays(weekStart, 6);
  const total = events.filter((e) => e.date >= weekStart && e.date <= wkEnd && e.isWarmup === false).length;

  const detail = sel ? (() => {
    const r = res.muscles[sel]; const band = bandFor(r.sets);
    return `<div class="card" id="hm-detail" style="margin-top:14px"><div class="card-h"><h2>${MUSCLE_LABELS[sel]}</h2><span class="pill accent">${fmtSets(r.sets)} hard sets · ${band.label}</span></div>
      ${r.contributors.length ? `<table class="plain"><thead><tr><th>Exercise</th><th>Sets</th><th>Counts as</th></tr></thead><tbody>${r.contributors.map((c) => `<tr><td>${esc(app.exerciseName(c.exerciseId))}</td><td>${fmtSets(c.sets)}</td><td>${fmtSets(c.contribution)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing hit this muscle in this week.</p>'}
      <p class="muted small" style="margin-top:8px">A primary mover counts 1 per set, a secondary mover 0.5. These weights are estimates you can edit in <code>data/exercises.json</code>.</p></div>`;
  })() : '<p class="muted small" style="margin-top:12px">Tap a muscle to see which exercises contributed.</p>';

  const html = `
    <div class="topbar"><div><h1>Muscles</h1><p class="muted small">Weekly hard sets per muscle. Numbers are on the map; colour is only a guide.</p></div>
      ${app.usingExample ? '<span class="pill example">Example data</span>' : ''}</div>
    <div class="row spread" style="margin-bottom:12px">
      <div class="seg" role="group" aria-label="Week type"><button data-mode="programme" aria-pressed="${m.mode === 'programme'}">Programme week</button><button data-mode="calendar" aria-pressed="${m.mode === 'calendar'}">Calendar week</button></div>
      ${m.mode === 'programme' ? `<div class="seg" role="group" aria-label="Counting"><button data-what="done" aria-pressed="${m.what === 'done'}">Done</button><button data-what="planned" aria-pressed="${m.what === 'planned'}">Planned</button></div>` : ''}
    </div>
    ${m.mode === 'programme' ? `<div class="chips" role="group" aria-label="Block">${blocks.map((b) => `<button class="chip" data-block="${b.number}" aria-pressed="${b.number === m.block}">${b.number}<small>${esc(b.name)}</small></button>`).join('')}</div>
      <div class="chips" role="group" aria-label="Week">${(block?.weeks || []).map((w) => `<button class="chip" data-week="${w.number}" aria-pressed="${w.number === m.week}">Week ${w.number}</button>`).join('')}</div>`
      : `<div class="row" style="margin-bottom:10px"><button class="btn small" data-cal="-7" aria-label="Previous week">‹</button><b>${esc(label)}</b><button class="btn small" data-cal="7" aria-label="Next week">›</button></div>`}
    <div class="card">
      <div class="card-h"><h2>${esc(label)}</h2><span class="muted small">${total} working sets${m.mode === 'programme' && !estimated ? ' · dates unknown' : ''}</span></div>
      <div class="seg hm-view-toggle" role="group" aria-label="Body view" style="margin-bottom:8px"><button data-view="front" aria-pressed="${m.view === 'front'}">Front</button><button data-view="back" aria-pressed="${m.view === 'back'}">Back</button></div>
      ${renderHeatmap(data, { selected: sel, view: m.view, prev })}
      ${renderLegend()}<p class="small muted" style="margin-top:8px">In the list below, the green zone marks 10 to 20 hard sets a week, a common range for building muscle. ▲ ▼ show the change on the previous week.</p>
      ${res.unknownExerciseIds?.length ? `<p class="small" style="color:var(--warn);margin-top:10px">Not counted (not in the exercise catalogue): ${res.unknownExerciseIds.map((x) => esc(String(x).replace('custom:', ''))).join(', ')}</p>` : ''}
    </div>
    ${detail}
    <div class="card" style="margin-top:14px"><div class="card-h"><h2>All muscles</h2></div>${renderMuscleList(data, sel, prev)}</div>`;

  function bind(root, rerender) {
    const set = (patch) => { Object.assign(m, patch); rerender(); };
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => set({ mode: b.dataset.mode, selected: null })));
    root.querySelectorAll('[data-what]').forEach((b) => b.addEventListener('click', () => set({ what: b.dataset.what })));
    root.querySelectorAll('[data-block]').forEach((b) => b.addEventListener('click', () => set({ block: Number(b.dataset.block), week: null })));
    root.querySelectorAll('[data-week]').forEach((b) => b.addEventListener('click', () => set({ week: Number(b.dataset.week) })));
    root.querySelectorAll('[data-cal]').forEach((b) => b.addEventListener('click', () => set({ calWeek: addDays(m.calWeek, Number(b.dataset.cal)) })));
    root.querySelectorAll('.hm-view-toggle [data-view]').forEach((b) => b.addEventListener('click', () => set({ view: b.dataset.view })));
    const pick = (id) => { set({ selected: m.selected === id ? null : id }); requestAnimationFrame(() => document.getElementById(`hm-detail`)?.scrollIntoView({ block: `nearest`, behavior: `smooth` })); };
    root.querySelectorAll('.hm-region').forEach((el) => {
      el.addEventListener('click', () => pick(el.dataset.muscle));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(el.dataset.muscle); } });
    });
    root.querySelectorAll('.hm-row').forEach((el) => el.addEventListener('click', () => pick(el.dataset.muscle)));
  }
  return { html, bind };
}
