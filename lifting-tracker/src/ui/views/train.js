// Train view: Block -> Week -> Day -> Exercise -> Set, planned values beside what was actually done.
import { convert, formatWeight, round1, toKg } from '../../core/units.js';
import { estimate1RM } from '../../core/e1rm.js';
import { esc, openSheet, toast, todayIso } from '../dom.js';
import { renderBarbell } from '../barbell.js';
import { describeLoad, plateConfig } from './plates.js';
import { warmupLadder } from '../../plates/loading.js';
import { startRest, suggestedRest } from '../rest-timer.js';

const repsText = (s) => (s.repsMin == null ? (s.repsRaw ? esc(s.repsRaw) : '–') : s.repsMin === s.repsMax ? String(s.repsMin) : `${s.repsMin}–${s.repsMax}`);
const rpeText = (v) => (v == null ? '–' : String(v));

function pickDefaults(app, ui) {
  const blocks = [...app.programme.blocks].sort((a, b) => a.number - b.number);
  if (!blocks.length) return;
  if (!ui.train.block || !blocks.some((b) => b.number === ui.train.block)) ui.train.block = blocks.at(-1).number;
  const block = blocks.find((b) => b.number === ui.train.block);
  if (!block.weeks.length) return;
  if (!ui.train.week || !block.weeks.some((w) => w.number === ui.train.week)) {
    const open = block.weeks.find((w) => w.days.some((d) => d.entries.some((e) => e.sets.some((s) => !s.completed))));
    ui.train.week = (open || block.weeks.at(-1)).number;
  }
  const week = block.weeks.find((w) => w.number === ui.train.week);
  if (!week.days.length) return;
  if (!ui.train.day || !week.days.some((d) => d.number === ui.train.day)) {
    const open = week.days.find((d) => d.entries.some((e) => e.sets.some((s) => !s.completed)));
    ui.train.day = (open || week.days[0]).number;
  }
}

export function trainView(app, ui) {
  ui.train ||= { block: null, week: null, day: null };
  const p = app.programme;
  const unit = app.settings.unit;
  if (!p || !p.blocks.length) return { html: `<div class="empty card"><h2>No programme yet</h2><p>Import your coach's workbook in Data.</p><a class="btn primary" href="#data">Go to Data</a></div>`, bind() {} };
  pickDefaults(app, ui);
  const blocks = [...p.blocks].sort((a, b) => a.number - b.number);
  const block = blocks.find((b) => b.number === ui.train.block);
  const week = block.weeks.find((w) => w.number === ui.train.week);
  const day = week?.days.find((d) => d.number === ui.train.day);
  const est = !app.datesKnown() ? '' : app.dateFor({ blockNumber: block.number, weekNumber: week?.number, dayNumber: day?.number || 1 });
  const fmtLoad = (l) => (l ? formatWeight(l, unit) : '–');

  const weekStats = (w) => {
    let done = 0, total = 0;
    for (const d of w.days) d.entries.forEach((e, ei) => e.sets.forEach((s, si) => { total++; if (s.completed || app.loggedFor({ blockNumber: block.number, weekNumber: w.number, dayNumber: d.number, entryIndex: ei, setIndex: si })) done++; }));
    return { done, total };
  };

  const header = `
    <div class="topbar"><div>
      <h1>${esc(block.name)}</h1>
      <p class="muted small">Block ${block.number}${block.goal ? ' · ' + esc(block.goal) : ''}</p></div>
      <div class="row">${app.usingExample ? '<span class="pill example">Example data</span>' : ''}<a class="btn small" href="#plan" style="white-space:nowrap">Plan next block</a><button class="btn small" id="quick" style="white-space:nowrap" aria-label="Quick log a set outside the programme">+ Log</button></div></div>
    ${app.usingExample ? `<div class="banner" style="margin-bottom:14px"><span>You're looking at <b>example data</b>, not yours. Import your coach's workbook to replace it.</span><a class="btn small primary" href="#data">Import workbook</a></div>` : ''}
    <div class="chips" role="group" aria-label="Block">${blocks.map((b) => `<button class="chip" data-block="${b.number}" aria-pressed="${b.number === block.number}">${b.number}<small>${esc(b.name)}</small></button>`).join('')}</div>
    <div class="chips" role="group" aria-label="Week">${block.weeks.map((w) => { const st = weekStats(w); return `<button class="chip" data-week="${w.number}" aria-pressed="${w.number === week?.number}">Week ${w.number}<small>${st.done}/${st.total}</small></button>`; }).join('') || '<span class="muted small">No weeks parsed for this block.</span>'}</div>
    ${week ? `<div class="chips" role="group" aria-label="Day">${week.days.map((d) => `<button class="chip" data-day="${d.number}" aria-pressed="${d.number === day?.number}">Day ${d.number}</button>`).join('')}</div>` : ''}`;

  let body = '';
  if (week) {
    const t = week.target;
    body += `<div class="stats3">
      <div class="card stat"><span>Week target</span><b>${t && t.total != null ? t.total + ' kg' : '–'}</b><small>${t ? [t.squat, t.bench, t.deadlift].map((v) => v ?? '–').join(' / ') : 'not set by coach'}${t && [t.squat, t.bench, t.deadlift].some((v) => v == null) ? ' (total of the known lifts)' : ''}</small></div>
      <div class="card stat"><span>Avg bodyweight</span><b>${week.avgBodyweightKg ? week.avgBodyweightKg + ' kg' : '–'}</b><small>${week.avgCalories ? week.avgCalories + ' kcal' : 'no calories noted'}</small></div>
      <div class="card stat"><span>${est ? 'Estimated date' : 'Date'}</span><b>${est ? est.slice(8) + '/' + est.slice(5, 7) : '–'}</b><small>${est ? 'estimate: set the start date in Data' : 'set a start date in Data'}</small></div>
    </div>`;
  }
  if (day) {
    body += `<div class="card">${day.entries.map((e, ei) => {
      const ex = app.exercise(e.exerciseId);
      return `<section class="entry">
        <div class="entry-h"><h3>${e.supersetGroup ? `<span class="pill">${esc(e.supersetGroup)}</span> ` : ''}${esc(ex?.name || e.name)}</h3>
          <button class="btn small ghost" data-warm="${ei}" aria-label="Warm-up ladder for ${esc(ex?.name || e.name)}">Warm-up</button></div>
        ${e.tempo ? `<p class="cue">Tempo ${esc(e.tempo)}</p>` : ''}${e.cues?.length ? `<p class="cue">${e.cues.map(esc).join(' · ')}</p>` : ''}${[...new Set(e.sets.map((x) => x.coachComment).filter(Boolean))].map((t) => `<p class="cue coach">${esc(t)}</p>`).join('')}
        <table class="sets"><thead><tr><th>#</th><th>Plan</th><th>Load</th><th>Actual</th><th></th></tr></thead><tbody>
        ${e.sets.map((s, si) => {
          const logged = app.loggedFor({ blockNumber: block.number, weekNumber: week.number, dayNumber: day.number, entryIndex: ei, setIndex: si });
          const done = !!logged || s.completed;
          const planned = `${repsText(s)} reps${s.targetRpe != null ? ` @ ${rpeText(s.targetRpe)}` : ''}`;
          const actual = logged
            ? `<span class="actual">${formatWeight(logged.weight, unit)} × ${logged.reps}${logged.rpe != null ? ` @ ${logged.rpe}` : ''}</span><span class="sub">logged</span>`
            : s.completed ? `<span class="actual">${s.actualReps != null ? s.actualReps + ' reps ' : ''}${s.actualRpe != null ? '@ ' + s.actualRpe : 'done'}</span><span class="sub">from workbook</span>` : '<span class="muted">–</span>';
          return `<tr class="${done ? 'done' : ''}"><td>${si + 1}</td>
            <td><button class="set-btn" data-set="${ei}:${si}"><span class="planned">${planned}</span></button></td>
            <td class="num">${s.load ? fmtLoad(s.load) : s.loadRange ? esc(`${s.loadRange.min}–${s.loadRange.max} ${s.loadRange.unit}`) : '–'}</td>
            <td>${actual}${s.athleteComment ? `<span class="note">${esc(s.athleteComment)}</span>` : ``}</td>
            <td><button class="btn small ${done ? 'ghost' : ''}" data-set="${ei}:${si}" aria-label="${done ? 'Edit' : 'Log'} set ${si + 1} of ${esc(ex?.name || e.name)}">${done ? 'Edit' : 'Log'}</button></td></tr>`;
        }).join('')}
        </tbody></table></section>`;
    }).join('') || '<p class="muted">No exercises on this day.</p>'}</div>`;
  }

  function bind(root, rerender) {
    root.querySelector('#quick')?.addEventListener('click', () => openQuickLog(app));
    root.querySelectorAll('[data-block]').forEach((b) => b.addEventListener('click', () => { ui.train.block = Number(b.dataset.block); ui.train.week = null; ui.train.day = null; rerender(); }));
    root.querySelectorAll('[data-week]').forEach((b) => b.addEventListener('click', () => { ui.train.week = Number(b.dataset.week); ui.train.day = null; rerender(); }));
    root.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { ui.train.day = Number(b.dataset.day); rerender(); }));
    root.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => {
      const [ei, si] = b.dataset.set.split(':').map(Number);
      openLogSheet(app, ui, { block, week, day, entryIndex: ei, setIndex: si });
    }));
    root.querySelectorAll('[data-warm]').forEach((b) => b.addEventListener('click', () => openWarmups(app, day.entries[Number(b.dataset.warm)], week)));
  }
  return { html: header + body, bind };
}

function suggestedWeight(app, entry, set, unit) {
  const w = set.actualLoad || set.load || (set.loadRange ? { value: set.loadRange.min, unit: set.loadRange.unit } : null);
  return w ? round1(convert(w.value, w.unit, unit)) : '';
}

function openLogSheet(app, ui, { block, week, day, entryIndex, setIndex }) {
  const entry = day.entries[entryIndex];
  const set = entry.sets[setIndex];
  const unit = app.settings.unit;
  const ref = { blockNumber: block.number, weekNumber: week.number, dayNumber: day.number };
  const plannedRef = { entryIndex, setIndex };
  const logged = app.loggedFor({ ...ref, ...plannedRef });
  const exName = app.exerciseName(entry.exerciseId, entry.name);
  const defW = logged ? round1(convert(logged.weight.value, logged.weight.unit, unit)) : suggestedWeight(app, entry, set, unit);
  const defReps = logged ? logged.reps : (set.actualReps ?? (set.repsMin === set.repsMax ? set.repsMin : set.repsMax) ?? '');
  const defRpe = logged ? (logged.rpe ?? '') : (set.actualRpe ?? set.targetRpe ?? '');
  const date = logged ? app.sessions.find((s) => s.id === logged.sessionId)?.date : (app.dateFor(ref) && app.dateFor(ref) <= todayIso() ? app.dateFor(ref) : todayIso());

  const sheet = openSheet(`
    <div class="card-h"><h2>${esc(exName)}</h2><span class="pill">Set ${setIndex + 1}</span></div>
    <p class="muted small">Plan: ${repsText(set)} reps${set.targetRpe != null ? ` @ RPE ${set.targetRpe}` : ''}${set.load ? ` · ${formatWeight(set.load, unit)}` : ''}</p>
    <div id="bb" class="bb-stage" style="margin:10px 0"></div><p id="bb-text" class="loading-text" style="font-size:18px"></p>
    <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px">
      <label class="field"><span>Weight (${esc(unit)})</span><input id="w" type="number" step="0.5" min="0" inputmode="decimal" value="${esc(defW)}"></label>
      <label class="field"><span>Reps</span><input id="r" type="number" step="1" min="0" inputmode="numeric" value="${esc(defReps)}"></label>
      <label class="field"><span>RPE</span><input id="e" type="number" step="0.5" min="1" max="11" inputmode="decimal" value="${esc(defRpe)}"></label>
    </div>
    <p id="est" class="small muted" style="margin-top:8px"></p>
    <label class="field" style="margin-top:10px"><span>Date</span><input id="d" type="date" value="${esc(date)}"></label>
    <div class="row spread" style="margin-top:16px">
      <div class="row">${logged ? '<button class="btn ghost" id="del">Remove</button>' : ''}<button class="btn ghost" id="onbar">Open in Plates</button></div>
      <div class="row"><button class="btn ghost" id="cancel">Cancel</button><button class="btn primary" id="save">Save set</button></div>
    </div>`);
  const el = sheet.el;
  const q = (s) => el.querySelector(s);
  const refresh = () => {
    const w = parseFloat(q('#w').value), r = parseInt(q('#r').value, 10);
    if (Number.isFinite(w) && w > 0) {
      try {
        const { side, text } = describeLoad(app, { value: w, unit });
        q('#bb').innerHTML = renderBarbell({ plates: side, collar: app.settings.collar });
        q('#bb-text').textContent = text;
      } catch { /* plates unavailable */ }
      const e1 = Number.isFinite(r) ? estimate1RM(toKg({ value: w, unit }), r) : null;
      q('#est').textContent = e1 ? `Estimated 1RM ≈ ${formatWeight({ value: e1, unit: 'kg' }, unit)} (Epley, an approximation)` : (Number.isFinite(r) && r > 12 ? 'Over 12 reps: no 1RM estimate.' : '');
    }
  };
  ['#w', '#r'].forEach((s) => q(s).addEventListener('input', refresh)); refresh();
  q('#cancel').addEventListener('click', sheet.close);
  q('#onbar').addEventListener('click', () => { const w = parseFloat(q('#w').value); if (!(w > 0)) { toast('Enter a weight first'); return; } ui.plates = { side: [], target: String(w), top: '', autoload: true }; sheet.close(); location.hash = '#plates'; });
  q('#del')?.addEventListener('click', () => guarded(q('#del'), async () => { await app.deleteSet(logged.id); sheet.close(); toast('Logged set removed'); }));
  q('#save').addEventListener('click', () => guarded(q('#save'), async () => {
    const w = parseFloat(q('#w').value), r = parseInt(q('#r').value, 10), rpe = q('#e').value === '' ? null : parseFloat(q('#e').value), d = q('#d').value;
    if (!(Number.isFinite(w) && w >= 0 && w < 1e5) || !Number.isInteger(r) || r < 0 || !d) { toast('Enter a weight, reps and date'); return; }
    if (rpe != null && !(rpe >= 1 && rpe <= 11)) { toast('RPE must be between 1 and 11'); return; }
    const weight = { value: w, unit };
    const before = new Set(app.prs().map(prKey));
    const exerciseId = entry.exerciseId || ('custom:' + entry.name);
    await app.logSet({ date: d, programmeRef: ref, plannedRef, exerciseId, weight, reps: r, rpe, note: '' });
    const fresh = app.prs().filter((x) => !before.has(prKey(x)));
    sheet.close();
    toast(fresh.length ? `New PR! ${fresh.map((x) => prLabel(x, unit)).join(', ')}` : 'Set saved');
    startRest(suggestedRest(app.exercise(entry.exerciseId)));
  }));
}

/** Run an action with its button disabled, so a double tap cannot run it twice; report failures instead of hanging. */
async function guarded(button, fn) {
  if (button.disabled) return;
  button.disabled = true;
  try { await fn(); } catch (err) { toast(err instanceof RangeError ? err.message : `Could not save: ${err?.message || err}`, 4200); } finally { button.disabled = false; }
}

/** Log a set that is not part of the coach's programme (any catalogue exercise). */
function openQuickLog(app) {
  const unit = app.settings.unit;
  const options = [...app.catalogue.exercises].sort((a, b) => a.name.localeCompare(b.name));
  const sheet = openSheet(`
    <div class="card-h"><h2>Quick log</h2><span class="pill">outside the programme</span></div>
    <label class="field"><span>Exercise</span><select id="ex">${options.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</select></label>
    <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px">
      <label class="field"><span>Weight (${esc(unit)})</span><input id="w" type="number" step="0.5" min="0" inputmode="decimal"></label>
      <label class="field"><span>Reps</span><input id="r" type="number" step="1" min="1" inputmode="numeric"></label>
      <label class="field"><span>RPE</span><input id="e" type="number" step="0.5" min="1" max="11" inputmode="decimal"></label>
    </div>
    <label class="row" style="margin-top:10px"><input id="wu" type="checkbox" style="width:auto;min-height:0"> Warm-up set (not counted for PRs or volume)</label>
    <label class="field" style="margin-top:10px"><span>Date</span><input id="d" type="date" value="${todayIso()}"></label>
    <div class="row spread" style="margin-top:16px"><button class="btn ghost" id="cancel">Cancel</button><button class="btn primary" id="save">Save set</button></div>`);
  const q = (s) => sheet.el.querySelector(s);
  q('#cancel').addEventListener('click', sheet.close);
  q('#save').addEventListener('click', () => guarded(q('#save'), async () => {
    const w = parseFloat(q('#w').value), r = parseInt(q('#r').value, 10), rpe = q('#e').value === '' ? null : parseFloat(q('#e').value);
    if (!(Number.isFinite(w) && w >= 0 && w < 1e5) || !Number.isInteger(r) || r < 1 || !q('#d').value) { toast('Enter a weight, reps and date'); return; }
    if (rpe != null && !(rpe >= 1 && rpe <= 11)) { toast('RPE must be between 1 and 11'); return; }
    const before = new Set(app.prs().map(prKey));
    await app.logSet({ date: q('#d').value, programmeRef: null, plannedRef: null, exerciseId: q('#ex').value, weight: { value: w, unit }, reps: r, rpe, isWarmup: q('#wu').checked });
    const fresh = app.prs().filter((x) => !before.has(prKey(x)));
    sheet.close();
    toast(fresh.length ? `New PR! ${fresh.map((x) => prLabel(x, unit)).join(', ')}` : 'Set saved');
    if (!q('#wu')?.checked) startRest(suggestedRest(app.exercise(q('#ex')?.value)));
  }));
}

const prKey = (x) => `${x.exerciseId}|${x.type}|${x.date}|${x.order}|${x.value}`;
export function prLabel(x, unit) {
  const kg = (v) => formatWeight({ value: v, unit: 'kg' }, unit);
  return x.type === 'e1rm' ? `e1RM ${kg(x.value)}` : x.type === 'single' ? `heaviest single ${kg(x.value)}` : `${x.value} reps at ${kg(x.weightKg)}`;
}

function openWarmups(app, entry, week) {
  const unit = app.settings.unit;
  const top = entry.sets.map((s) => s.actualLoad || s.load).filter(Boolean).sort((a, b) => toKg(b) - toKg(a))[0];
  if (!top) { toast('No load planned to warm up toward'); return; }
  const { plates, bar, collar } = plateConfig(app, unit);
  const topW = { value: round1(convert(top.value, top.unit, unit)), unit };
  let ladder = [];
  try { ladder = warmupLadder({ top: topW, bar: bar.weight, collar, plates }); } catch { /* ignore */ }
  openSheet(`<div class="card-h"><h2>Warm-up</h2><span class="pill">${esc(app.exerciseName(entry.exerciseId, entry.name))}</span></div>
    <p class="muted small">Toward ${round1(topW.value)} ${esc(unit)}. Jumps are rounded to plates you own.</p>
    <ol class="feed">${ladder.map((s, i) => `<li><span class="medal" style="background:var(--surface-3);color:var(--text)">${i + 1}</span><span><b>${round1(s.weight.value)} ${esc(unit)}</b> × ${s.reps}<br><span class="muted small">${esc(s.text)}</span></span><span></span></li>`).join('') || '<li class="muted">Nothing to show.</li>'}</ol>`);
}
