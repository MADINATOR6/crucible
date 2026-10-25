// Train view: today's session first. One header picks the day; each set is one line with a one-tap "done as planned" check.
import { convert, formatWeight, round1, toKg } from '../../core/units.js';
import { estimate1RM } from '../../core/e1rm.js';
import { esc, openSheet, toast, todayIso } from '../dom.js';
import { renderBarbell } from '../barbell.js';
import { describeLoad, plateConfig } from './plates.js';
import { warmupLadder } from '../../plates/loading.js';
import { startRest, suggestedRest } from '../rest-timer.js';
import { backupReminder } from '../../store/backup.js';
import { addDays } from '../../core/weeks.js';
import { saveBackup } from './data.js';

const repsText = (s) => (s.repsMin == null ? (s.repsRaw ? esc(s.repsRaw) : '–') : s.repsMin === s.repsMax ? String(s.repsMin) : `${s.repsMin}–${s.repsMax}`);
const sameDay = (a, b) => !!a && !!b && a.blockNumber === b.blockNumber && a.weekNumber === b.weekNumber && a.dayNumber === b.dayNumber;
const shortDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

function keepScreenAwake(root, app) {
  if (!app.settings.keepAwake || !navigator.wakeLock) return;
  const header = root.querySelector('.train-top');
  let lock = null, pending = false, left = false;
  const active = () => !left && root.contains(header) && app.settings.keepAwake;
  const release = () => { lock?.release().catch(() => {}); lock = null; };
  const request = async () => {
    if (!active() || document.visibilityState !== 'visible' || pending || (lock && !lock.released)) return;
    pending = true;
    try {
      const acquired = await navigator.wakeLock.request('screen');
      if (active() && document.visibilityState === 'visible') lock = acquired;
      else await acquired.release();
    } catch { /* unsupported or refused */ }
    finally { pending = false; }
  };
  const observer = new MutationObserver(() => {
    if (active()) return;
    left = true; observer.disconnect();
    document.removeEventListener('visibilitychange', request);
    release();
  });
  observer.observe(root, { childList: true });
  document.addEventListener('visibilitychange', request);
  request();
}

function pickDefaults(app, ui) {
  const blocks = [...app.programme.blocks].sort((a, b) => a.number - b.number);
  if (!blocks.length) return;
  if (!ui.train.block && app.nextSession) {
    const next = app.nextSession();
    if (next) Object.assign(ui.train, { block: next.blockNumber, week: next.weekNumber, day: next.dayNumber });
  }
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
  const dayRef = day && { blockNumber: block.number, weekNumber: week.number, dayNumber: day.number };
  const est = !app.datesKnown() || !week ? '' : app.dateFor({ blockNumber: block.number, weekNumber: week.number, dayNumber: day?.number || 1 });
  const fmtLoad = (l) => (l ? formatWeight(l, unit) : '');
  const prog = { done: 0, total: 0 };
  const openSets = [];
  day?.entries.forEach((e, ei) => e.sets.forEach((s, si) => {
    prog.total++;
    if (s.completed || app.loggedFor({ ...dayRef, entryIndex: ei, setIndex: si })) prog.done++;
    else openSets.push({ entry: e, set: s, entryIndex: ei, setIndex: si });
  }));
  const current = openSets[0];
  const next = app.nextSession?.();
  const label = sameDay(next, dayRef) ? (est === todayIso() ? 'Today' : 'Next up') : est && est < todayIso() ? 'Earlier session' : 'Session';
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  const loggedSessionIds = new Set(app.sets.map((s) => s.sessionId));
  const reminder = backupReminder({ ...app.settings, today: todayIso(), loggedDates: app.sessions.filter((s) => loggedSessionIds.has(s.id)).map((s) => s.date) });

  const header = `
    <div class="topbar train-top">
      <div class="train-title">
        <span class="eyebrow">${label}${est ? ` · ${esc(shortDate(est))}` : ''}${app.usingExample ? ' · <span class="pill example">Example</span>' : ''}</span>
        <button class="day-switch" id="pick" aria-haspopup="dialog" aria-label="Choose another day. Showing block ${block.number}, week ${week?.number ?? '–'}, day ${day?.number ?? '–'}">
          <h1>${week ? `Week ${week.number} · Day ${day?.number ?? '–'}` : `Block ${block.number}`}</h1><span class="caret" aria-hidden="true">▾</span>
        </button>
        <span class="muted small">Block ${block.number} · ${esc(block.name)}</span>
      </div>
      <button class="btn small" id="quick" aria-label="Quick log a set outside the programme">+ Log</button>
    </div>
    ${!app.usingExample && reminder.due ? `<div class="banner mb-4"><span>${reminder.sessions} sessions since your last backup${app.settings.lastBackupAt ? '.' : ', and no backup yet.'}</span><div class="actions"><button class="btn small primary" id="backup-now">Back up</button><button class="btn small ghost" id="backup-later">Later</button></div></div>` : ''}
    ${app.usingExample ? `<div class="banner mb-4"><span>This is <b>example data</b>. Import your coach's workbook to use your own.</span><a class="btn small" href="#data">Import</a></div>` : ''}
    ${day ? `<div class="progress mb-4" aria-label="${prog.done} of ${prog.total} sets done"><div class="progress-track"><i style="width:${pct}%"></i></div><span class="nowrap">${prog.done} of ${prog.total} sets</span></div>` : ''}`;

  const focus = current ? `<section class="card train-focus" aria-label="Current set">
    <span class="eyebrow train-focus-kicker">Current set · ${prog.total - prog.done} remaining</span>
    <h2 class="train-focus-lift">${esc(ex(app, current.entry))} · Set ${current.setIndex + 1}</h2>
    <p class="train-focus-prescription">${current.set.load ? formatWeight(current.set.load, unit) : current.set.loadRange ? esc(`${current.set.loadRange.min}–${current.set.loadRange.max} ${current.set.loadRange.unit}`) : 'Weight not set'} × ${current.set.repsMin == null && !current.set.repsRaw ? 'Reps not set' : `${repsText(current.set)} reps`}${current.set.targetRpe != null ? `<small>RPE ${esc(current.set.targetRpe)}</small>` : ''}</p>
    <p class="muted small train-focus-context">${openSets[1] ? `Next: ${esc(ex(app, openSets[1].entry))}, set ${openSets[1].setIndex + 1}` : 'Last set of this session'}</p>
    <div class="train-focus-actions"><button class="btn primary" data-focus-log="${current.entryIndex}:${current.setIndex}">Log set</button></div>
  </section><div class="train-sticky-action"><button class="btn primary" data-focus-log="${current.entryIndex}:${current.setIndex}">Log set · ${esc(ex(app, current.entry))}</button></div>`
    : day ? `<section class="card train-focus"><h2>${prog.total ? 'Session complete' : 'No sets planned'}</h2><p class="muted">${prog.total ? `All ${prog.total} planned sets are done.` : 'Choose another day or use Quick log.'}</p></section>` : '';

  let body = focus;
  if (!week) body += `<div class="empty card"><p>No weeks were found for this block.</p></div>`;
  if (day) {
    const workout = day.entries.map((e, ei) => {
      const name = esc(ex(app, e));
      const notes = e.sets.map((s, si) => (s.athleteComment ? `<p class="cue">Set ${si + 1}: ${esc(s.athleteComment)}</p>` : '')).join('');
      return `<section class="card exercise">
        <div class="card-h"><h3>${e.supersetGroup ? `<span class="pill">${esc(e.supersetGroup)}</span> ` : ''}${name}</h3>
          <button class="btn small ghost" data-warm="${ei}" aria-label="Warm-up ladder for ${name}">Warm-up</button></div>
        ${e.tempo ? `<p class="cue">Tempo ${esc(e.tempo)}</p>` : ''}${e.cues?.length ? `<p class="cue">${e.cues.map(esc).join(' · ')}</p>` : ''}${[...new Set(e.sets.map((x) => x.coachComment).filter(Boolean))].map((t) => `<p class="cue coach">${esc(t)}</p>`).join('')}
        <ol class="list mt-3">${e.sets.map((s, si) => setRow(app, unit, { ...dayRef, entryIndex: ei, setIndex: si }, s, name, fmtLoad)).join('')}</ol>
        ${notes}
      </section>`;
    }).join('') || '<div class="empty card"><p>No exercises on this day.</p></div>';
    body += `<details class="train-overview" ${current ? '' : 'open'}><summary>Full workout · ${prog.done} of ${prog.total} sets done</summary>${workout}</details>`;
    const t = week.target;
    body += `<details class="options mt-4"><summary>Week ${week.number} details</summary><div class="options-body">
      <div class="grid-3">
        <div class="stat"><span>Week target</span><b class="figure">${t && t.total != null ? `${t.total}<small>kg</small>` : '–'}</b><small>${t ? [t.squat, t.bench, t.deadlift].map((v) => v ?? '–').join(' / ') : 'not set by coach'}</small></div>
        <div class="stat"><span>Avg bodyweight</span><b class="figure">${week.avgBodyweightKg ? `${week.avgBodyweightKg}<small>kg</small>` : '–'}</b><small>${week.avgCalories ? week.avgCalories + ' kcal' : 'no calories noted'}</small></div>
        <div class="stat"><span>Date</span><b class="figure">${est ? est.slice(8) + '/' + est.slice(5, 7) : '–'}</b><small>${est ? 'an estimate (Data)' : 'set a start date in Data'}</small></div>
      </div></div></details>`;
  }
  body += `<a class="btn ghost plan-link mt-4" href="#plan">Plan the next block →</a>`;

  function bind(root, rerender) {
    keepScreenAwake(root, app);
    // The sticky Log set bar repeats the card's button, so it only shows once that button has scrolled out of view.
    const sticky = root.querySelector('.train-sticky-action'), cardAction = root.querySelector('.train-focus-actions');
    if (sticky && cardAction && globalThis.IntersectionObserver) {
      const watch = new IntersectionObserver(([e]) => {
        if (!cardAction.isConnected) { watch.disconnect(); return; }
        sticky.classList.toggle('is-visible', !e.isIntersecting);
      });
      watch.observe(cardAction);
    } else sticky?.classList?.add('is-visible');
    root.querySelector('#backup-now')?.addEventListener('click', (e) => guarded(e.currentTarget, () => saveBackup(app, true)));
    root.querySelector('#backup-later')?.addEventListener('click', (e) => guarded(e.currentTarget, () => app.saveSettings({ backupSnoozeUntil: addDays(todayIso(), 3) })));
    root.querySelector('#quick')?.addEventListener('click', () => openQuickLog(app));
    root.querySelector('#pick')?.addEventListener('click', () => openDayPicker(app, ui, blocks, rerender));
    root.querySelectorAll('[data-focus-log]').forEach((b) => b.addEventListener('click', () => {
      const [entryIndex, setIndex] = b.dataset.focusLog.split(':').map(Number);
      openLogSheet(app, ui, { block, week, day, entryIndex, setIndex });
    }));
    root.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => {
      const [ei, si] = b.dataset.set.split(':').map(Number);
      openLogSheet(app, ui, { block, week, day, entryIndex: ei, setIndex: si });
    }));
    root.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', () => {
      const [ei, si] = b.dataset.done.split(':').map(Number);
      if (b.getAttribute('aria-pressed') === 'true' || !app.logAsPlanned) { openLogSheet(app, ui, { block, week, day, entryIndex: ei, setIndex: si }); return; }
      guarded(b, async () => {
        try {
          const r = await app.logAsPlanned({ programmeRef: dayRef, plannedRef: { entryIndex: ei, setIndex: si } });
          try { if (app.settings.vibrate) navigator.vibrate?.(30); } catch { /* not supported */ }
          toast(r.newPRs.length ? `New PR! ${r.newPRs.map((x) => prLabel(x, unit)).join(', ')}` : `Set ${si + 1} done as planned`, 8000,
            { label: 'Undo', onClick: async () => {
              try { await app.deleteSet(r.set.id); toast(`Set ${si + 1} unmarked`); } catch (err) { toast(`Could not undo: ${err?.message || err}. Open the set to remove it.`, 5000); }
            } });
          startRest(suggestedRest(app.exercise(day.entries[ei].exerciseId)), { vibrate: app.settings.vibrate });
        } catch (err) {
          // No planned weight or reps: the set needs the full form.
          if (err instanceof RangeError) openLogSheet(app, ui, { block, week, day, entryIndex: ei, setIndex: si }); else throw err;
        }
      });
    }));
    root.querySelectorAll('[data-warm]').forEach((b) => b.addEventListener('click', () => openWarmups(app, day.entries[Number(b.dataset.warm)], week)));
  }
  return { html: header + body, bind };
}

const ex = (app, e) => app.exercise(e.exerciseId)?.name || e.name;

/** One set as one line: number, what to do (or what was done), and a check that logs it as planned. */
function setRow(app, unit, ref, s, name, fmtLoad) {
  const logged = app.loggedFor(ref);
  const done = !!logged || !!s.completed;
  const load = s.load ? fmtLoad(s.load) : s.loadRange ? esc(`${s.loadRange.min}–${s.loadRange.max} ${s.loadRange.unit}`) : '';
  const plan = `${repsText(s)}${load ? ` × ${load}` : ' reps'}`;
  const rpe = (v) => (v != null ? `<small>@${esc(v)}</small>` : '');
  const text = logged
    ? `${logged.reps} × ${formatWeight(logged.weight, unit)} ${rpe(logged.rpe)}`
    // The coach's sheet records the actual RPE against the planned load and reps unless the athlete wrote others in.
    : s.completed ? `${s.actualReps ?? repsText(s)}${s.actualLoad ? ` × ${fmtLoad(s.actualLoad)}` : load ? ` × ${load}` : ' reps'} ${rpe(s.actualRpe)}<small>workbook</small>`
    : `${plan} ${rpe(s.targetRpe)}`;
  const n = ref.setIndex + 1;
  return `<li class="list-row set-row${done ? ' is-done' : ''}">
    <span class="lead">${n}</span>
    <button class="main" data-set="${ref.entryIndex}:${ref.setIndex}" aria-label="Set ${n} of ${name}: ${done ? 'edit what you did' : 'log different numbers'}">${text}</button>
    ${logged && s.load && (logged.reps !== s.repsMin || Math.abs(toKg(logged.weight) - toKg(s.load)) > 0.01) ? `<span class="trail">plan ${plan}</span>` : ''}
    <button class="check-btn" data-done="${ref.entryIndex}:${ref.setIndex}" aria-pressed="${done}" aria-label="${done ? `Set ${n} done. Edit it` : `Mark set ${n} of ${name} done as planned`}">✓</button>
  </li>`;
}

/** Block, week and day in one sheet, with how much of each week is done. */
function openDayPicker(app, ui, blocks, rerender) {
  let blockNo = ui.train.block;
  const sheet = openSheet('<div id="picker"></div>');
  const host = sheet.el.querySelector('#picker');
  const draw = () => {
    const block = blocks.find((b) => b.number === blockNo);
    const done = (w, d) => d.entries.every((e, ei) => e.sets.every((s, si) => s.completed || app.loggedFor({ blockNumber: block.number, weekNumber: w.number, dayNumber: d.number, entryIndex: ei, setIndex: si })));
    host.innerHTML = `<div class="card-h"><h2>Choose a day</h2>${app.nextSession ? '<button class="btn small" id="go-next">Next session</button>' : ''}</div>
      ${blocks.length > 1 ? `<div class="chips" role="group" aria-label="Block">${blocks.map((b) => `<button class="chip" data-b="${b.number}" aria-pressed="${b.number === blockNo}">Block ${b.number}<small>${esc(b.name)}</small></button>`).join('')}</div>` : ''}
      <div class="stack">${block.weeks.map((w) => `<div><h3 class="mb-3">Week ${w.number}</h3><div class="picker-days">${w.days.map((d) => {
        const current = block.number === ui.train.block && w.number === ui.train.week && d.number === ui.train.day;
        return `<button class="chip" data-w="${w.number}" data-d="${d.number}" aria-pressed="${current}">Day ${d.number}${done(w, d) ? '<small>✓</small>' : ''}</button>`;
      }).join('') || '<span class="muted small">No days</span>'}</div></div>`).join('') || '<p class="muted">No weeks were found for this block.</p>'}</div>`;
    host.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', () => { blockNo = Number(b.dataset.b); draw(); }));
    host.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
      Object.assign(ui.train, { block: blockNo, week: Number(b.dataset.w), day: Number(b.dataset.d) });
      sheet.close(); rerender();
    }));
    host.querySelector('#go-next')?.addEventListener('click', () => {
      const n = app.nextSession();
      if (n) Object.assign(ui.train, { block: n.blockNumber, week: n.weekNumber, day: n.dayNumber });
      sheet.close(); rerender();
    });
  };
  draw();
  // openSheet focused an empty dialog; move focus to the current day (or the first choice) once the picker is drawn.
  (host.querySelector('[data-d][aria-pressed="true"]') || host.querySelector('button'))?.focus();
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
    <div id="bb" class="bb-stage mt-3 mb-3"></div><p id="bb-text" class="loading-text"></p>
    <div class="grid-3 mt-3">
      <label class="field"><span>Weight (${esc(unit)})</span><input id="w" type="number" step="0.5" min="0" inputmode="decimal" value="${esc(defW)}"></label>
      <label class="field"><span>Reps</span><input id="r" type="number" step="1" min="0" inputmode="numeric" value="${esc(defReps)}"></label>
      <label class="field"><span>RPE</span><input id="e" type="number" step="0.5" min="1" max="11" inputmode="decimal" value="${esc(defRpe)}"></label>
    </div>
    <p id="est" class="small muted mt-2"></p>
    <label class="field mt-3"><span>Date</span><input id="d" type="date" value="${esc(date)}"></label>
    <div class="row spread mt-4">
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
    startRest(suggestedRest(app.exercise(entry.exerciseId)), { vibrate: app.settings.vibrate });
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
    <div class="grid-3 mt-3">
      <label class="field"><span>Weight (${esc(unit)})</span><input id="w" type="number" step="0.5" min="0" inputmode="decimal"></label>
      <label class="field"><span>Reps</span><input id="r" type="number" step="1" min="1" inputmode="numeric"></label>
      <label class="field"><span>RPE</span><input id="e" type="number" step="0.5" min="1" max="11" inputmode="decimal"></label>
    </div>
    <label class="row mt-3"><input id="wu" type="checkbox"> Warm-up set (not counted for PRs or volume)</label>
    <label class="field mt-3"><span>Date</span><input id="d" type="date" value="${todayIso()}"></label>
    <div class="row spread mt-4"><button class="btn ghost" id="cancel">Cancel</button><button class="btn primary" id="save">Save set</button></div>`);
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
    if (!q('#wu')?.checked) startRest(suggestedRest(app.exercise(q('#ex')?.value)), { vibrate: app.settings.vibrate });
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
    <ol class="feed">${ladder.map((s, i) => `<li><span class="medal plain">${i + 1}</span><span><b>${round1(s.weight.value)} ${esc(unit)}</b> × ${s.reps}<br><span class="muted small">${esc(s.text)}</span></span><span></span></li>`).join('') || '<li class="muted">Nothing to show.</li>'}</ol>`);
}
