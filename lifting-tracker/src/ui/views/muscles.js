// Muscles view: weekly hard sets per muscle on a front/back body map.
import { weeklyHardSets, recoveryLoad } from '../../core/muscles.js';
import { workingSets } from '../../core/sets.js';
import { mondayOf, addDays } from '../../core/weeks.js';
import { renderHeatmap, renderLegend, renderMuscleList, MUSCLE_LABELS, bandFor, fmtSets, BANDS, RECOVERY_BANDS } from '../heatmap.js';
import { esc, todayIso, toast } from '../dom.js';
import { mount3d } from '../heatmap3d.js';
import { longDate, shortDate } from '../charts.js';

const DUMMY_MONDAY = '2000-01-03';
let webgl, active3d, mountId = 0, leaveObserver, redraw;
// Wide screens show both 2D figures, so the switch is 2D / 3D there; re-render when the width crosses over so
// aria-pressed matches the button that is visible.
const wide = matchMedia('(min-width: 720px)');
wide.addEventListener('change', () => redraw?.());
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
  m.asOf ||= todayIso();
  const recovery = m.mode === 'recovery';
  const bands = recovery ? RECOVERY_BANDS : BANDS;
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
  if (recovery) {
    events = app.events(); weekStart = addDays(m.asOf, -6);
    label = 'Recovery · last 7 days';
  } else if (m.mode === 'programme' && block && m.week != null) {
    ({ events, weekStart, estimated } = programmeWeekEvents(app, m.block, m.week, m.what));
    label = `Block ${m.block} · Week ${m.week}${m.what === 'planned' ? ' (planned)' : ''}`;
  } else {
    events = app.events(); weekStart = m.calWeek;
    label = `${longDate(weekStart)} – ${longDate(addDays(weekStart, 6))}`;
  }
  const res = recovery ? recoveryLoad(events, app.catalogue, m.asOf) : weeklyHardSets(events, app.catalogue, weekStart);
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
    } else if (m.mode === 'calendar') {
      pres = weeklyHardSets(events, app.catalogue, addDays(weekStart, -7));
    }
    if (pres) prev = Object.fromEntries(Object.entries(pres.muscles).map(([k, v]) => [k, v.sets]));
  } catch { prev = null; }
  const sel = m.selected && res.muscles[m.selected] ? m.selected : null;
  const wkEnd = addDays(weekStart, 6);
  const total = (recovery ? workingSets(events) : events.filter((e) => e.isWarmup === false)).filter((e) => e.date >= weekStart && e.date <= wkEnd).length;
  const lastLogged = recovery ? workingSets(events).reduce((last, e) => !last || e.date > last ? e.date : last, null) : null;

  const detail = sel ? (() => {
    const r = res.muscles[sel]; const band = bandFor(r.sets, bands);
    return `<div class="card mt-4" id="hm-detail"><div class="card-h"><h2>${MUSCLE_LABELS[sel]}</h2><span class="pill accent">${fmtSets(r.sets)} ${recovery ? 'weighted' : 'hard'} sets · ${band.label}</span></div>
      ${r.contributors.length ? `<table class="plain"><thead><tr><th>Exercise</th><th>Sets</th><th>${recovery ? 'Weighted sets' : 'Counts as'}</th></tr></thead><tbody>${r.contributors.map((c) => `<tr><td>${esc(app.exerciseName(c.exerciseId))}</td><td>${fmtSets(c.sets)}</td><td>${fmtSets(c.contribution)}</td></tr>`).join('')}</tbody></table>` : `<p class="muted">${recovery ? 'No recent work for this muscle.' : 'Nothing hit this muscle in this week.'}</p>`}
      <p class="muted small mt-2">A primary mover counts 1 per set, a secondary mover 0.5. These weights are estimates you can edit in <code>data/exercises.json</code>.</p></div>`;
  })() : '<p class="muted small mt-3">Tap a muscle to see which exercises contributed.</p>';

  const html = `
    <div class="topbar"><div><h1>Muscles</h1><p class="muted small">${recovery ? 'Recent weighted sets per muscle. Colour is a guide to recent work.' : 'Weekly hard sets per muscle. The number on each muscle is the count; colour is a guide.'}</p></div>
      ${app.usingExample ? '<span class="pill example">Example data</span>' : ''}</div>
    <div class="filters">
      <div class="seg" role="group" aria-label="Week type"><button data-mode="programme" aria-pressed="${m.mode === 'programme'}">Programme</button><button data-mode="calendar" aria-pressed="${m.mode === 'calendar'}">Calendar</button><button data-mode="recovery" aria-pressed="${recovery}">Recovery</button></div>
      ${m.mode === 'programme' ? `<div class="seg" role="group" aria-label="Counting"><button data-what="done" aria-pressed="${m.what === 'done'}">Done</button><button data-what="planned" aria-pressed="${m.what === 'planned'}">Planned</button></div>` : ''}
      ${m.mode === 'programme' ? `<select data-block aria-label="Block">${blocks.map((b) => `<option value="${b.number}"${b.number === m.block ? ' selected' : ''}>Block ${b.number} · ${esc(b.name)}</option>`).join('')}</select>
        <select data-week aria-label="Week">${(block?.weeks || []).map((w) => `<option value="${w.number}"${w.number === m.week ? ' selected' : ''}>Week ${w.number}</option>`).join('')}</select>`
        : recovery ? `<button class="btn small" data-day="-1" aria-label="Previous day">‹</button><b>To ${shortDate(m.asOf)}</b><button class="btn small" data-day="1" aria-label="Next day">›</button>${m.asOf !== todayIso() ? '<button class="btn small" data-today>Today</button>' : ''}`
        : `<button class="btn small" data-cal="-7" aria-label="Previous week">‹</button><b>${esc(label)}</b><button class="btn small" data-cal="7" aria-label="Next week">›</button>`}
    </div>
    <div class="card">
      <div class="card-h"><h2>${esc(label)}</h2><span class="muted small">${recovery ? `${longDate(weekStart)} – ${longDate(m.asOf)} · ` : ''}${total} working sets${m.mode === 'programme' && !estimated ? ' · dates unknown' : ''}</span></div>
      ${recovery && !total ? `<div class="banner">No sets logged in the 7 days to ${longDate(m.asOf)}.${lastLogged ? ' <button class="btn small" data-last-session>Show the week of my last session</button>' : ''}</div>` : ''}
      <div class="seg hm-view-toggle mb-3${supports3d() ? ' has-3d' : ''}" role="group" aria-label="Body view"><button data-view="front" aria-pressed="${m.view === 'front' || (wide.matches && m.view === 'back')}"><span class="hm-narrow">Front</span><span class="hm-wide">2D</span></button><button data-view="back" aria-pressed="${!wide.matches && m.view === 'back'}">Back</button>${supports3d() ? `<button data-view="3d" aria-pressed="${m.view === '3d'}">3D</button>` : ''}</div>
      ${m.view === '3d' ? '<div class="hm3d" role="img" aria-label="3D muscle map. The list below has every muscle\'s count."><p class="hm3d-status muted small">Loading 3D model…</p></div>' : renderHeatmap(data, { selected: sel, view: m.view, prev, bands })}
      ${recovery ? `<p class="small muted">Recent sets count more: yesterday ${Math.round(100 * Math.exp(-res.factor))}%, 3 days ago ${Math.round(100 * Math.exp(-res.factor * 3))}%, 6 days ago ${Math.round(100 * Math.exp(-res.factor * 6))}%.</p>` : ''}
      ${renderLegend(bands)}
      ${res.unknownExerciseIds?.length ? `<p class="small tone-warn mt-3">Not counted (not in the exercise catalogue): ${res.unknownExerciseIds.map((x) => esc(String(x).replace('custom:', ''))).join(', ')}</p>` : ''}
    </div>
    ${detail}
    <div class="card mt-4"><div class="section-h"><h2>All muscles</h2><p class="note">${recovery ? 'Weighted sets over the last 7 days, with recent sets counting more.' : 'The green zone marks 10 to 20 hard sets a week, a common range for building muscle. ▲ ▼ show the change on the previous week.'}</p></div>${renderMuscleList(data, sel, prev, { bands, zone: !recovery })}</div>`;

  function bind(root, rerender) {
    redraw = () => root.querySelector('.hm-view-toggle') && rerender();
    const set = (patch) => { Object.assign(m, patch); rerender(); };
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => set({ mode: b.dataset.mode })));
    root.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => set({ asOf: addDays(m.asOf, Number(b.dataset.day)) })));
    root.querySelector('[data-today]')?.addEventListener('click', () => set({ asOf: todayIso() }));
    root.querySelector('[data-last-session]')?.addEventListener('click', () => set({ asOf: lastLogged }));
    root.querySelectorAll('[data-what]').forEach((b) => b.addEventListener('click', () => set({ what: b.dataset.what })));
    root.querySelector('[data-block]')?.addEventListener('change', (e) => set({ block: Number(e.target.value), week: null }));
    root.querySelector('[data-week]')?.addEventListener('change', (e) => set({ week: Number(e.target.value) }));
    root.querySelectorAll('[data-cal]').forEach((b) => b.addEventListener('click', () => set({ calWeek: addDays(m.calWeek, Number(b.dataset.cal)) })));
    root.querySelectorAll('.hm-view-toggle [data-view]').forEach((b) => b.addEventListener('click', () => set({ view: b.dataset.view })));
    const pick = (id) => { set({ selected: m.selected === id ? null : id }); requestAnimationFrame(() => document.getElementById(`hm-detail`)?.scrollIntoView({ block: `nearest`, behavior: `smooth` })); };
    const id = ++mountId;
    leaveObserver?.disconnect();
    if (m.view === '3d') {
      const container = root.querySelector('.hm3d');
      const fallback = () => {
        if (id !== mountId || !container.isConnected) return;
        active3d?.dispose(); active3d = null;
        set({ view: 'front' });
        toast('3D view unavailable here; showing the 2D map');
      };
      mount3d(container, { data, selected: sel, bands, onPick: pick, onError: fallback }).then((v) => {
        if (id === mountId && container.isConnected) active3d = v;
        else if (!root.querySelector('.hm3d')) v.dispose();
      }).catch(fallback);
      // Observe the existing router's DOM replacement without adding a new app lifecycle API.
      leaveObserver = new MutationObserver(() => {
        if (!root.querySelector('.hm3d')) {
          ++mountId;
          active3d?.dispose(); active3d = null;
          leaveObserver.disconnect();
        }
      });
      leaveObserver.observe(root, { childList: true });
    } else { active3d?.dispose(); active3d = null; }
    root.querySelectorAll('.hm-region').forEach((el) => {
      el.addEventListener('click', () => pick(el.dataset.muscle));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(el.dataset.muscle); } });
    });
    root.querySelectorAll('.hm-row').forEach((el) => el.addEventListener('click', () => pick(el.dataset.muscle)));
  }
  return { html, bind };
}
