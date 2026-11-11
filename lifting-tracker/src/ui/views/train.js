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
import { setDraftToken } from '../drafts.js';
import { isStrictDate } from '../../store/programme-schema.js';
import { substitutes } from '../../core/swaps.js';

const repsText = (s) => (s.repsMin == null ? (s.repsRaw ? esc(s.repsRaw) : '–') : s.repsMin === s.repsMax ? String(s.repsMin) : `${s.repsMin}–${s.repsMax}`);
const sameDay = (a, b) => !!a && !!b && a.blockNumber === b.blockNumber && a.weekNumber === b.weekNumber && a.dayNumber === b.dayNumber;
const shortDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const dateStatus = (date) => !date ? 'Choose an actual date' : date < todayIso() ? 'Backdated session' : date > todayIso() ? 'Future session' : 'Training today';

/** Most recent actual working set, never inferred from workbook dates. */
export function lastPerformance(app, exerciseId, date, excludeId = null) {
  const sessions = new Map((app.sessions || []).map((s) => [s.id, s]));
  return (app.sets || []).filter((s) => s.id !== excludeId && s.exerciseId === exerciseId && s.isWarmup === false &&
    s.reps > 0 && s.weight?.value > 0 && isStrictDate(sessions.get(s.sessionId)?.date) && sessions.get(s.sessionId).date <= date)
    .map((s) => ({ ...s, date: sessions.get(s.sessionId).date }))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.order || 0) - (a.order || 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
}
/** The exercise a planned entry resolves to once swaps are applied (the planned one when the app has no swaps). */
function resolved(app, ref, entry) {
  const plannedId = entry.exerciseId || 'custom:' + entry.name;
  return app.exerciseFor?.(ref, entry) ?? { plannedId, id: plannedId, swapped: false, scope: null };
}
const isOpen = (app, ref, entry) => entry.sets.some((s, setIndex) => !s.completed && !app.loggedFor({ ...ref, setIndex }));
const performanceText = (s, unit) => `${formatWeight(s.weight, unit)} × ${s.reps}${s.rpe != null ? ` @ RPE ${s.rpe}` : ''} · ${shortDate(s.date)}`;

function receipt(app, message, undoToken) {
  toast(message, 8000, undoToken ? { label: 'Undo', onClick: async () => {
    try { await app.undoSetChange(undoToken); toast('Change undone'); }
    catch (err) { toast(`Could not undo: ${err?.message || err}`, 5000); }
  } } : undefined);
}

const rawField = (value, max = 64) => typeof value === 'string' && value.length <= max ? value : null;
function recoverSetDraft(app) {
  const saved = app.getDraft?.('set');
  const draft = saved?.value;
  if (!draft || !['planned', 'quick'].includes(draft.kind) || draft.unit !== app.settings.unit || !draft.fields || typeof draft.fields !== 'object') return saved ? { stale: true } : null;
  const fields = {};
  for (const key of ['w', 'r', 'e', 'd', 'ex']) {
    fields[key] = rawField(draft.fields[key] ?? '', key === 'ex' ? 120 : 64);
    if (fields[key] == null) return { stale: true };
  }
  if (typeof draft.fields.wu !== 'boolean') return { stale: true };
  fields.wu = draft.fields.wu;
  if (draft.kind === 'quick') {
    if (!app.catalogue.exercises.some((e) => e.id === fields.ex && e.id === draft.exerciseId)) return { stale: true };
    return { kind: 'quick', fields };
  }
  const ref = draft.programmeRef, plannedRef = draft.plannedRef;
  if (!ref || !plannedRef || ![ref.blockNumber, ref.weekNumber, ref.dayNumber, plannedRef.entryIndex, plannedRef.setIndex].every(Number.isInteger)) return { stale: true };
  const block = app.programme.blocks.find((b) => b.number === ref.blockNumber);
  const week = block?.weeks.find((w) => w.number === ref.weekNumber);
  const day = week?.days.find((d) => d.number === ref.dayNumber);
  const entry = day?.entries[plannedRef.entryIndex];
  if (!entry || !entry.sets[plannedRef.setIndex] || entry.exerciseId !== draft.exerciseId) return { stale: true };
  const logged = app.loggedFor({ ...ref, ...plannedRef });
  const token = setDraftToken(app.programme, ref, plannedRef, logged);
  if (!token || draft.sourceToken !== token) return { stale: true };
  return { kind: 'planned', block, week, day, ...plannedRef, fields };
}

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
  const dateKey = dayRef && `${dayRef.blockNumber}:${dayRef.weekNumber}:${dayRef.dayNumber}`;
  if (ui.train.dateKey !== dateKey) Object.assign(ui.train, { dateKey, actualDate: todayIso() });
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
  const skipped = dayRef ? app.skippedDay?.(dayRef) ?? null : null;
  // An entry shows its swap only while it still has sets to do: finished work keeps the name it was done under.
  const eff = (day?.entries || []).map((e, entryIndex) => {
    const ref = { ...dayRef, entryIndex };
    const r = isOpen(app, ref, e) ? resolved(app, ref, e) : { ...resolved(app, ref, e), swapped: false, scope: null, id: e.exerciseId || 'custom:' + e.name };
    return { ...r, name: r.swapped ? app.exercise(r.id)?.name || r.id : ex(app, e) };
  });
  const label = sameDay(next, dayRef) ? (est === todayIso() ? 'Today' : 'Next up') : skipped ? 'Skipped session' : est && est < todayIso() ? 'Earlier session' : 'Session';
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  const daySession = dayRef && app.sessions.find((s) => s.date === ui.train.actualDate && sameDay(s.programmeRef, dayRef));
  const cal = daySession && app.sessionCalories(daySession);
  const kcal = (n) => Math.round(n / 10) * 10;
  const loggedSessionIds = new Set(app.sets.map((s) => s.sessionId));
  const reminder = backupReminder({ ...app.settings, today: todayIso(), loggedDates: app.sessions.filter((s) => loggedSessionIds.has(s.id)).map((s) => s.date) });
  const draft = recoverSetDraft(app);

  const header = `
    <div class="topbar train-top">
      <div class="train-title">
        <span class="eyebrow">${label}${est ? ` · ${esc(shortDate(est))}` : ''}${app.usingExample ? ' · <span class="pill example">Example data</span>' : ''}</span>
        <button class="day-switch" id="pick" aria-haspopup="dialog" aria-label="Choose another day. Showing block ${block.number}, week ${week?.number ?? '–'}, day ${day?.number ?? '–'}">
          <h1>${week ? `Week ${week.number} · Day ${day?.number ?? '–'}` : `Block ${block.number}`}</h1><span class="caret" aria-hidden="true">▾</span>
        </button>
        <span class="muted small">Block ${block.number} · ${esc(block.name)}</span>
      </div>
      <button class="btn small" id="quick" aria-label="Quick log a set outside the programme">+ Log</button>
    </div>
    ${!app.usingExample && reminder.due ? `<div class="banner mb-4"><span>${reminder.sessions} sessions since your last backup${app.settings.lastBackupAt ? '.' : ', and no backup yet.'}</span><div class="actions"><button class="btn small primary" id="backup-now">Back up</button><button class="btn small ghost" id="backup-later">Later</button></div></div>` : ''}
    ${app.usingExample ? `<div class="banner mb-4"><span>This is <b>example data</b>. Import your coach's workbook, or build a starter programme from your own numbers.</span><span class="row"><a class="btn small" href="#data">Import</a><a class="btn small" href="#plan">Start without one</a></span></div>` : ''}
    ${draft ? `<div class="banner mb-4" role="status"><span><b>UNSAVED set inputs</b> · ${draft.stale ? 'This draft no longer matches the programme or set.' : 'Ready to resume; nothing was logged.'}</span><div class="actions">${draft.stale ? '' : '<button class="btn small primary" id="resume-draft">Resume</button>'}<button class="btn small ghost" id="discard-draft">Discard</button></div></div>` : ''}
    ${skipped ? `<div class="banner mb-4" role="status"><span>Skipped on ${esc(shortDate(skipped.on))}${openSets.length ? ` · ${openSets.length} ${openSets.length === 1 ? 'set' : 'sets'} not done` : ''}. The next session has moved on.</span><div class="actions"><button class="btn small" id="unskip-day">Un-skip</button></div></div>` : ''}
    ${day ? `<div class="progress mb-4" role="progressbar" aria-valuenow="${prog.done}" aria-valuemin="0" aria-valuemax="${prog.total}" aria-valuetext="${prog.done} of ${prog.total} sets done" aria-label="Session progress"><div class="progress-track"><i style="width:${pct}%"></i></div><span class="nowrap">${prog.done} of ${prog.total} sets</span></div>` : ''}`;

  // Session date and the calorie line sit after the current set: they are reference, not the next action.
  const sessionMeta = !day ? '' : `
    <label class="field train-session-date mt-4"><span>Actual session date</span><input id="session-date" type="date" value="${esc(ui.train.actualDate)}"><small id="session-date-status" class="muted small">${dateStatus(ui.train.actualDate)}${est ? ` · Planned ${esc(shortDate(est))}` : ''}</small></label>
    ${cal ? `<p class="small muted mt-2 mb-0 train-kcal">${Math.round(cal.minutes)} min · about ${kcal(cal.total[0])}–${kcal(cal.total[1])} kcal${cal.active ? ` (${kcal(cal.active[0])}–${kcal(cal.active[1])} active)` : ''} · <a href="#progress" data-to-body>details</a></p>` : ''}`;

  const cur = current ? eff[current.entryIndex] : null;
  const previous = current ? lastPerformance(app, cur.id, ui.train.actualDate) : null;
  const curReps = current && (current.set.repsMin == null && !current.set.repsRaw ? 'Reps not set' : `${repsText(current.set)} reps`);
  const focus = current ? `<section class="card train-focus" aria-label="Current set">
    <span class="eyebrow train-focus-kicker">Current set · ${prog.total - prog.done} remaining</span>
    <h2 class="train-focus-lift">${esc(cur.name)} · Set ${current.setIndex + 1}</h2>
    <p class="train-focus-prescription">${cur.swapped ? '' : `${current.set.load ? formatWeight(current.set.load, unit) : current.set.loadRange ? esc(`${current.set.loadRange.min}–${current.set.loadRange.max} ${current.set.loadRange.unit}`) : 'Weight not set'} × `}${curReps}${current.set.targetRpe != null ? `<small>RPE ${esc(current.set.targetRpe)}</small>` : ''}</p>
    ${cur.swapped ? `<p class="small muted train-swap-note">Instead of ${esc(ex(app, current.entry))}${cur.scope === 'always' ? ' (every time)' : ''}. The planned weight does not carry over: pick yours.</p>` : ''}
    ${previous ? `<p class="small muted">Last logged: ${esc(performanceText(previous, unit))}</p>` : ''}
    <p class="muted small train-focus-context">${openSets[1] ? `Next: ${esc(eff[openSets[1].entryIndex].name)}, set ${openSets[1].setIndex + 1}` : 'Last set of this session'}</p>
    <div class="train-focus-actions"><button class="btn primary" data-focus-log="${current.entryIndex}:${current.setIndex}">Log set</button></div>
    ${app.swapExercise || app.skipDay ? `<div class="row train-focus-more">${app.swapExercise ? `<button class="btn small ghost" data-swap="${current.entryIndex}">Swap exercise</button>` : ''}${app.skipDay && !skipped ? `<button class="btn small ghost" id="skip-day">${prog.done ? 'Skip the rest' : 'Skip session'}</button>` : ''}</div>` : ''}
  </section><div class="train-sticky-action"><button class="btn primary" data-focus-log="${current.entryIndex}:${current.setIndex}">Log set · ${esc(cur.name)}</button></div>`
    : day ? `<section class="card train-focus"><h2>${prog.total ? 'Session complete' : 'No sets planned'}</h2><p class="muted">${prog.total ? `All ${prog.total} planned sets are done.` : 'Choose another day or use Quick log.'}</p>${next && !sameDay(next, dayRef) ? `<div class="train-focus-actions"><button class="btn primary" id="go-next-session">Next session · Week ${next.weekNumber} Day ${next.dayNumber}</button></div>` : ''}</section>` : '';

  let body = focus + sessionMeta;
  if (!week) body += `<div class="empty card"><p>No weeks were found for this block.</p></div>`;
  if (day) {
    const workout = day.entries.map((e, ei) => {
      const name = esc(eff[ei].name);
      const open = isOpen(app, { ...dayRef, entryIndex: ei }, e);
      const notes = e.sets.map((s, si) => (s.athleteComment ? `<p class="cue">Set ${si + 1}: ${esc(s.athleteComment)}</p>` : '')).join('');
      return `<section class="card exercise">
        <div class="card-h"><h3>${e.supersetGroup ? `<span class="pill">${esc(e.supersetGroup)}</span> ` : ''}${name}${eff[ei].swapped ? ` <span class="pill accent">for ${esc(ex(app, e))}</span>` : ''}</h3>
          <span class="row">${open && app.swapExercise ? `<button class="btn small ghost" data-swap="${ei}" aria-label="Swap ${name} for another exercise">Swap</button>` : ''}<button class="btn small ghost" data-warm="${ei}" aria-label="Warm-up ladder for ${name}">Warm-up</button></span></div>
        ${e.tempo ? `<p class="cue">Tempo ${esc(e.tempo)}</p>` : ''}${e.cues?.length ? `<p class="cue">${e.cues.map(esc).join(' · ')}</p>` : ''}${[...new Set(e.sets.map((x) => x.coachComment).filter(Boolean))].map((t) => `<p class="cue coach">${esc(t)}</p>`).join('')}
        <ol class="list mt-3">${e.sets.map((s, si) => setRow(app, unit, { ...dayRef, entryIndex: ei, setIndex: si }, s, name, fmtLoad, { swapped: eff[ei].swapped, plannedId: eff[ei].plannedId })).join('')}</ol>
        ${notes}
      </section>`;
    }).join('') || '<div class="empty"><p>No exercises on this day.</p></div>';
    // The count is already in the progress bar and the focus card's kicker; the summary just names the fold.
    body += `<details class="train-overview options" data-keep-open="workout-${dateKey}" ${current ? '' : 'open'}><summary>Full workout</summary><div class="options-body">${workout}</div></details>`;
    const t = week.target;
    body += `<details class="options mt-4" data-keep-open="week-${block.number}:${week.number}"><summary>Week ${week.number} details</summary><div class="options-body">
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
    root.querySelector('[data-to-body]')?.addEventListener('click', () => { (ui.progress ||= {}).tab = 'body'; ui.body = { date: ui.train.actualDate }; });
    root.querySelector('#pick')?.addEventListener('click', () => openDayPicker(app, ui, blocks, rerender));
    const goTo = (r) => { Object.assign(ui.train, { block: r.blockNumber, week: r.weekNumber, day: r.dayNumber }); rerender(); };
    root.querySelector('#go-next-session')?.addEventListener('click', () => goTo(next));
    root.querySelectorAll('[data-swap]').forEach((b) => b.addEventListener('click', () => {
      const entryIndex = Number(b.dataset.swap);
      openSwapSheet(app, ui, dayRef, entryIndex, day.entries[entryIndex]);
    }));
    root.querySelector('#skip-day')?.addEventListener('click', (e) => guarded(e.currentTarget, async () => {
      await app.skipDay(dayRef, todayIso());
      const after = app.nextSession?.();
      if (after && !sameDay(after, dayRef)) goTo(after);
      toast(`Week ${week.number} · Day ${day.number} skipped`, 6000, { label: 'Undo', onClick: async () => {
        try { await app.unskipDay(dayRef); goTo(dayRef); toast('Skip undone'); }
        catch (err) { toast(`Could not undo: ${err?.message || err}`, 5000); }
      } });
    }));
    root.querySelector('#unskip-day')?.addEventListener('click', (e) => guarded(e.currentTarget, () => app.unskipDay(dayRef)));
    root.querySelector('#resume-draft')?.addEventListener('click', () => {
      if (draft.kind === 'quick') { openQuickLog(app, draft.fields); return; }
      Object.assign(ui.train, { block: draft.block.number, week: draft.week.number, day: draft.day.number,
        dateKey: `${draft.block.number}:${draft.week.number}:${draft.day.number}`, actualDate: isStrictDate(draft.fields.d) ? draft.fields.d : todayIso() });
      rerender();
      openLogSheet(app, ui, draft, draft.fields);
    });
    root.querySelector('#discard-draft')?.addEventListener('click', (e) => guarded(e.currentTarget, async () => { await app.clearDraft('set'); rerender(); }));
    root.querySelector('#session-date')?.addEventListener('change', (e) => {
      if (!e.target.value) { e.target.value = ui.train.actualDate; return; }
      ui.train.actualDate = e.target.value;
      root.querySelector('#session-date-status').textContent = `${dateStatus(ui.train.actualDate)}${est ? ` · Planned ${shortDate(est)}` : ''}`;
    });
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
      if (b.getAttribute('aria-pressed') === 'true' || !app.logAsPlanned || eff[ei].swapped) { openLogSheet(app, ui, { block, week, day, entryIndex: ei, setIndex: si }); return; }
      guarded(b, async () => {
        try {
          const r = await app.logAsPlanned({ programmeRef: dayRef, plannedRef: { entryIndex: ei, setIndex: si }, date: ui.train.actualDate });
          try { if (app.settings.vibrate) navigator.vibrate?.(30); } catch { /* not supported */ }
          receipt(app, r.newPRs.length ? `New PR! ${r.newPRs.map((x) => prLabel(x, unit)).join(', ')}` : `Set ${si + 1} done as planned`, r.undoToken);
          startRest(suggestedRest(app.exercise(day.entries[ei].exerciseId)), { vibrate: app.settings.vibrate });
        } catch (err) {
          // No planned weight or reps: the set needs the full form.
          if (err instanceof RangeError) openLogSheet(app, ui, { block, week, day, entryIndex: ei, setIndex: si }); else throw err;
        }
      });
    }));
    root.querySelectorAll('[data-warm]').forEach((b) => b.addEventListener('click', () => openWarmups(app, ui, day.entries[Number(b.dataset.warm)], eff[Number(b.dataset.warm)])));
  }
  return { html: header + body, bind };
}

const ex = (app, e) => app.exercise(e.exerciseId)?.name || e.name;

/** One set as one line: number, what to do (or what was done), and a check that logs it as planned. */
function setRow(app, unit, ref, s, name, fmtLoad, { swapped = false, plannedId = null } = {}) {
  const logged = app.loggedFor(ref);
  const done = !!logged || !!s.completed;
  // A set logged with a substitute names it; an open set in a swapped entry shows reps only (the planned weight is not the substitute's).
  const loggedSwap = logged?.exerciseId && plannedId && logged.exerciseId !== plannedId ? app.exercise(logged.exerciseId)?.name || 'swapped' : null;
  const load = swapped && !done ? '' : s.load ? fmtLoad(s.load) : s.loadRange ? esc(`${s.loadRange.min}–${s.loadRange.max} ${s.loadRange.unit}`) : '';
  const plan = `${repsText(s)}${load ? ` × ${load}` : ' reps'}`;
  const rpe = (v) => (v != null ? `<small>@${esc(v)}</small>` : '');
  const text = logged
    ? `${logged.reps} × ${formatWeight(logged.weight, unit)} ${rpe(logged.rpe)}${loggedSwap ? `<small>${esc(loggedSwap)}</small>` : ''}`
    // The coach's sheet records the actual RPE against the planned load and reps unless the athlete wrote others in.
    : s.completed ? `${s.actualReps ?? repsText(s)}${s.actualLoad ? ` × ${fmtLoad(s.actualLoad)}` : load ? ` × ${load}` : ' reps'} ${rpe(s.actualRpe)}<small>workbook</small>`
    : `${plan} ${rpe(s.targetRpe)}`;
  const n = ref.setIndex + 1;
  return `<li class="list-row set-row${done ? ' is-done' : ''}">
    <span class="lead">${n}</span>
    <button class="main" data-set="${ref.entryIndex}:${ref.setIndex}" aria-label="Set ${n} of ${name}: ${done ? 'edit what you did' : 'log different numbers'}">${text}</button>
    ${logged && !loggedSwap && s.load && (logged.reps !== s.repsMin || Math.abs(toKg(logged.weight) - toKg(s.load)) > 0.01) ? `<span class="trail">plan ${plan}</span>` : ''}
    <button class="check-btn" data-done="${ref.entryIndex}:${ref.setIndex}" aria-pressed="${done}" aria-label="${done ? `Set ${n} done. Edit it` : swapped ? `Log set ${n} of ${name}` : `Mark set ${n} of ${name} done as planned`}">✓</button>
  </li>`;
}

/** Block, week and day in one sheet, with how much of each week is done. */
function openDayPicker(app, ui, blocks, rerender) {
  let blockNo = ui.train.block;
  const upNext = app.nextSession?.() ?? null;
  const sheet = openSheet('<div id="picker"></div>');
  const host = sheet.el.querySelector('#picker');
  const draw = () => {
    const block = blocks.find((b) => b.number === blockNo);
    const done = (w, d) => d.entries.every((e, ei) => e.sets.every((s, si) => s.completed || app.loggedFor({ blockNumber: block.number, weekNumber: w.number, dayNumber: d.number, entryIndex: ei, setIndex: si })));
    host.innerHTML = `<div class="card-h"><h2>Choose a day</h2>${app.nextSession ? '<button class="btn small" id="go-next">Next session</button>' : ''}</div>
      ${blocks.length > 1 ? `<div class="chips" role="group" aria-label="Block">${blocks.map((b) => `<button class="chip" data-b="${b.number}" aria-pressed="${b.number === blockNo}">Block ${b.number}<small>${esc(b.name)}</small></button>`).join('')}</div>` : ''}
      <div class="stack">${block.weeks.map((w) => `<div><h3 class="mb-3">Week ${w.number}</h3><div class="picker-days">${w.days.map((d) => {
        const current = block.number === ui.train.block && w.number === ui.train.week && d.number === ui.train.day;
        const ref = { blockNumber: block.number, weekNumber: w.number, dayNumber: d.number };
        const mark = done(w, d) ? '✓' : app.skippedDay?.(ref) ? 'skipped' : sameDay(upNext, ref) ? 'next' : '';
        return `<button class="chip" data-w="${w.number}" data-d="${d.number}" aria-pressed="${current}">Day ${d.number}${mark ? `<small>${mark}</small>` : ''}</button>`;
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

/** One nudge of the weight field: the smallest jump most gyms can actually make. */
const stepFor = (unit) => (unit === 'lb' ? 5 : 2.5);

/** Wire −/+ to a number input so they behave exactly like typing into it. */
function bindStep(q, id, step, min = 0) {
  const input = q(`#${id}`);
  for (const [suffix, sign] of [['-down', -1], ['-up', 1]]) {
    q(`#${id}${suffix}`)?.addEventListener('click', () => {
      const now = parseFloat(input.value);
      const next = Math.max(min, round1((Number.isFinite(now) ? now : 0) + sign * step));
      if (next === now) return;
      input.value = next;
      // The same event typing fires, so draft keeping, the plate preview and the 1RM line all follow.
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
}

function suggestedWeight(app, entry, set, unit) {
  const w = set.actualLoad || set.load || (set.loadRange ? { value: set.loadRange.min, unit: set.loadRange.unit } : null);
  return w ? round1(convert(w.value, w.unit, unit)) : '';
}

function openLogSheet(app, ui, { block, week, day, entryIndex, setIndex }, recovered = null) {
  const entry = day.entries[entryIndex];
  const set = entry.sets[setIndex];
  const unit = app.settings.unit;
  const ref = { blockNumber: block.number, weekNumber: week.number, dayNumber: day.number };
  const plannedRef = { entryIndex, setIndex };
  const logged = app.loggedFor({ ...ref, ...plannedRef });
  const sourceToken = setDraftToken(app.programme, ref, plannedRef, logged);
  const plannedName = app.exerciseName(entry.exerciseId, entry.name);
  // A logged set keeps the exercise it was logged with; an open one follows the entry's swap.
  const plan = resolved(app, { ...ref, entryIndex }, entry);
  const exId = logged ? logged.exerciseId : plan.id;
  const swapped = exId !== plan.plannedId;
  const exName = swapped ? app.exerciseName(exId) : plannedName;
  const lastSwap = swapped && !logged ? lastPerformance(app, exId, ui.train.actualDate || todayIso()) : null;
  const defW = recovered?.w ?? (logged ? round1(convert(logged.weight.value, logged.weight.unit, unit))
    : swapped ? (lastSwap ? round1(convert(lastSwap.weight.value, lastSwap.weight.unit, unit)) : '') : suggestedWeight(app, entry, set, unit));
  const defReps = recovered?.r ?? (logged ? logged.reps : (set.actualReps ?? (set.repsMin === set.repsMax ? set.repsMin : set.repsMax) ?? ''));
  const defRpe = recovered?.e ?? (logged ? (logged.rpe ?? '') : (set.actualRpe ?? set.targetRpe ?? ''));
  const date = recovered?.d ?? (logged ? app.sessions.find((s) => s.id === logged.sessionId)?.date : (ui.train.actualDate || todayIso()));
  const previous = lastPerformance(app, exId, date, logged?.id);

  const sheet = openSheet(`
    <div class="card-h"><h2>${esc(exName)}</h2><span class="pill">Set ${setIndex + 1}</span></div>
    ${recovered ? '<p class="pill">UNSAVED · recovered inputs</p>' : ''}
    <p class="muted small">Plan: ${repsText(set)} reps${set.targetRpe != null ? ` @ RPE ${set.targetRpe}` : ''}${set.load && !swapped ? ` · ${formatWeight(set.load, unit)}` : ''}${swapped ? ` · swapped from ${esc(plannedName)}` : ''}</p>
    ${previous ? `<p class="small muted">Last logged: ${esc(performanceText(previous, unit))}</p><button class="btn small ghost" id="use-last">Use last numbers</button>` : ''}
    <div class="log-fields mt-3">
      <label class="field wide"><span>Weight (${esc(unit)})</span><div class="num-step"><button type="button" id="w-down" aria-label="Decrease weight by ${stepFor(unit)} ${esc(unit)}">−</button><input id="w" type="number" step="0.5" min="0" inputmode="decimal" value="${esc(defW)}"><button type="button" id="w-up" aria-label="Increase weight by ${stepFor(unit)} ${esc(unit)}">+</button></div><small class="tone-bad" data-error="w"></small></label>
      <label class="field"><span>Reps</span><input id="r" type="number" step="1" min="0" inputmode="numeric" value="${esc(defReps)}"><small class="tone-bad" data-error="r"></small></label>
      <label class="field"><span>RPE</span><input id="e" type="number" step="0.5" min="1" max="11" inputmode="decimal" value="${esc(defRpe)}"><small class="tone-bad" data-error="e"></small></label>
    </div>
    <p id="est" class="small muted mt-2"></p>
    <div id="bb" class="bb-stage mt-3"></div><p id="bb-text" class="loading-text"></p>
    <label class="field mt-3"><span>Actual date</span><input id="d" type="date" value="${esc(date)}"><small class="tone-bad" data-error="d"></small><small class="muted small" id="date-status">${dateStatus(date)}</small></label>
    <p id="draft-status" class="small muted" role="status">${recovered ? 'Recovered inputs were not logged.' : ''}</p>
    <div class="row spread mt-4">
      <div class="row">${logged ? '<button class="btn ghost" id="del">Remove</button>' : ''}<button class="btn ghost" id="onbar">Open in Plates</button></div>
      <div class="row"><button class="btn ghost" id="cancel">Cancel</button><button class="btn primary" id="save">Save set</button></div>
    </div>`);
  const el = sheet.el;
  const q = (s) => el.querySelector(s);
  const checkSource = () => {
    if (setDraftToken(app.programme, ref, plannedRef, app.loggedFor({ ...ref, ...plannedRef })) !== sourceToken) {
      throw new RangeError('This set changed while the form was open. Close it and open the current set again.');
    }
  };
  const invalid = (id, message) => { q(`[data-error="${id}"]`).textContent = message; q(`#${id}`).focus(); };
  let pending = Promise.resolve();
  const keepDraft = () => {
    const value = { kind: 'planned', unit, programmeRef: ref, plannedRef, exerciseId: entry.exerciseId,
      sourceToken, fields: { w: q('#w').value, r: q('#r').value, e: q('#e').value, d: q('#d').value, ex: '', wu: false } };
    pending = pending.then(() => app.saveDraft('set', value)).then(() => { q('#draft-status').textContent = app.store?.persistent === false ? 'UNSAVED inputs are temporary and will be lost when you close this tab.' : 'UNSAVED inputs kept on this device.'; })
      .catch(() => { q('#draft-status').textContent = 'Could not keep unsaved inputs on this device.'; });
  };
  const clearDraft = async () => {
    await pending;
    const saved = app.getDraft?.('set')?.value;
    if (saved?.kind === 'planned' && saved.sourceToken === sourceToken &&
      saved.programmeRef?.blockNumber === ref.blockNumber && saved.programmeRef?.weekNumber === ref.weekNumber && saved.programmeRef?.dayNumber === ref.dayNumber &&
      saved.plannedRef?.entryIndex === entryIndex && saved.plannedRef?.setIndex === setIndex) await app.clearDraft('set');
  };
  const refresh = () => {
    const w = parseFloat(q('#w').value), r = parseInt(q('#r').value, 10);
    if (Number.isFinite(w) && w > 0) {
      try {
        const { side, text } = describeLoad(app, { value: w, unit });
        q('#bb').innerHTML = renderBarbell({ plates: side, collar: app.settings.collar });
        q('#bb-text').textContent = text.replaceAll(' × ', '\u00a0×\u00a0');
      } catch { /* plates unavailable */ }
      const e1 = Number.isFinite(r) ? estimate1RM(toKg({ value: w, unit }), r) : null;
      q('#est').textContent = e1 ? `Estimated 1RM ≈ ${formatWeight({ value: e1, unit: 'kg' }, unit)} (Epley, an approximation)` : (Number.isFinite(r) && r > 12 ? 'Over 12 reps: no 1RM estimate.' : '');
    }
  };
  q('#use-last')?.addEventListener('click', () => {
    q('#w').value = round1(convert(previous.weight.value, previous.weight.unit, unit));
    q('#r').value = previous.reps; q('#e').value = '';
    ['w', 'r', 'e'].forEach((id) => { q(`[data-error="${id}"]`).textContent = ''; });
    refresh(); keepDraft(); q('#e').focus();
  });
  ['#w', '#r'].forEach((s) => q(s).addEventListener('input', refresh)); refresh();
  ['w', 'r', 'e', 'd'].forEach((id) => q(`#${id}`).addEventListener('input', () => { q(`[data-error="${id}"]`).textContent = ''; keepDraft(); }));
  bindStep(q, 'w', stepFor(unit));
  q('#d').addEventListener('change', () => { q('#date-status').textContent = dateStatus(q('#d').value); });
  q('#cancel').addEventListener('click', () => guarded(q('#cancel'), async () => { await clearDraft(); sheet.close(); app.changed?.(); }));
  q('#onbar').addEventListener('click', () => { const w = Number(q('#w').value); if (!(w > 0)) { invalid('w', 'Enter a weight first'); return; } ui.plates = { side: [], target: String(w), top: '', autoload: true }; sheet.close(); location.hash = '#plates'; });
  q('#del')?.addEventListener('click', () => guarded(q('#del'), async () => {
    checkSource();
    const r = await app.deleteSet(logged.id, { withUndo: true });
    let cleared = true; try { await clearDraft(); } catch { cleared = false; }
    sheet.close(); app.changed?.(); receipt(app, `Logged set removed${cleared ? '' : ' · unsaved copy could not be cleared'}`, r.undoToken);
  }));
  q('#save').addEventListener('click', () => guarded(q('#save'), async () => {
    checkSource();
    const w = q('#w').value === '' ? NaN : Number(q('#w').value), r = q('#r').value === '' ? NaN : Number(q('#r').value), rpe = q('#e').value === '' ? null : Number(q('#e').value), d = q('#d').value;
    if (!(Number.isFinite(w) && w >= 0 && w < 1e5)) { invalid('w', 'Enter a realistic weight'); return; }
    if (!Number.isInteger(r) || r < 0 || r > 1000) { invalid('r', 'Enter whole reps'); return; }
    if (rpe != null && !(Number.isFinite(rpe) && rpe >= 1 && rpe <= 11)) { invalid('e', 'RPE must be between 1 and 11'); return; }
    if (!d) { invalid('d', 'Choose an actual date'); return; }
    const weight = { value: w, unit };
    const before = new Set(app.prs().map(prKey));
    let saved;
    try { saved = await app.logSet({ date: d, programmeRef: ref, plannedRef, exerciseId: exId, weight, reps: r, rpe, note: '' }, { withUndo: true, expectedRevision: app.dataRevision }); }
    catch (err) { const id = /date/i.test(err.message) ? 'd' : /rpe/i.test(err.message) ? 'e' : /rep/i.test(err.message) ? 'r' : /weight|load/i.test(err.message) ? 'w' : null; if (id) { invalid(id, err.message); return; } throw err; }
    const fresh = app.prs().filter((x) => !before.has(prKey(x)));
    let cleared = true; try { await clearDraft(); } catch { cleared = false; }
    sheet.close();
    app.changed?.();
    receipt(app, `${fresh.length ? `New PR! ${fresh.map((x) => prLabel(x, unit)).join(', ')}` : logged ? 'Set updated' : 'Set saved'}${cleared ? '' : ' · unsaved copy could not be cleared'}`, saved.undoToken);
    startRest(suggestedRest(app.exercise(exId)), { vibrate: app.settings.vibrate });
  }));
}

/** Pick a substitute for a planned exercise: for this planned session only, or every time it is planned. */
function openSwapSheet(app, ui, dayRef, entryIndex, entry) {
  const ref = { ...dayRef, entryIndex };
  const now = resolved(app, ref, entry);
  const unit = app.settings.unit;
  const plannedName = ex(app, entry);
  const canAlways = !!app.exercise(now.plannedId);
  let scope = now.scope === 'always' ? 'always' : 'session';
  const similar = substitutes(app.catalogue, now.plannedId);
  const shown = new Set([now.plannedId, ...similar.map((x) => x.id)]);
  const others = app.catalogue.exercises.filter((e) => !shown.has(e.id)).sort((a, b) => a.name.localeCompare(b.name));
  const option = (x) => {
    const last = lastPerformance(app, x.id, ui.train.actualDate || todayIso());
    return `<li class="list-row"><button class="main" data-to="${esc(x.id)}" aria-pressed="${x.id === now.id}">${esc(x.name)}${last ? `<small>last ${esc(formatWeight(last.weight, unit))} × ${last.reps}</small>` : ''}</button>${x.id === now.id ? '<span class="trail">in use</span>' : ''}</li>`;
  };
  const sheet = openSheet(`
    <div class="card-h"><h2>Swap exercise</h2><span class="pill">${esc(plannedName)}</span></div>
    <p class="muted small">Sets you log count for the exercise you pick. Reps and RPE stay as planned; the planned weight does not carry over. Sets already logged keep their exercise.</p>
    <div class="chips" role="group" aria-label="How long the swap lasts">
      <button class="chip" data-scope="session" aria-pressed="${scope === 'session'}">This session</button>
      <button class="chip" data-scope="always" aria-pressed="${scope === 'always'}" ${canAlways ? '' : 'disabled'}>Every time</button>
    </div>
    <p class="small muted" id="scope-note"></p>
    ${now.swapped ? `<button class="btn mb-4" data-to="${esc(now.plannedId)}">Back to ${esc(plannedName)}</button>` : ''}
    <h3 class="mb-3">Similar</h3>
    ${similar.length ? `<ul class="list">${similar.map(option).join('')}</ul>` : '<p class="muted small">No close match in the catalogue. Pick from all exercises.</p>'}
    <details class="options mt-4"><summary>All exercises</summary><div class="options-body"><ul class="list">${others.map(option).join('')}</ul></div></details>
    <div class="row spread mt-4"><span></span><button class="btn ghost" id="cancel">Cancel</button></div>`);
  const q = (sel) => sheet.el.querySelector(sel);
  const note = () => {
    q('#scope-note').textContent = scope === 'always' ? `Every session where ${plannedName} is planned, until you change it back.`
      : `Only week ${dayRef.weekNumber}, day ${dayRef.dayNumber}.${canAlways ? '' : ' This exercise is not in the catalogue, so it can only be swapped per session.'}`;
  };
  note();
  sheet.el.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => {
    scope = b.dataset.scope;
    sheet.el.querySelectorAll('[data-scope]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    note();
  }));
  q('#cancel').addEventListener('click', () => sheet.close());
  sheet.el.querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', () => guarded(b, async () => {
    const to = b.dataset.to, always = scope === 'always';
    const { undo } = await app.swapExercise(ref, to, { always });
    sheet.close();
    toast(to === now.plannedId ? `Back to ${plannedName}` : `${app.exerciseName(to)} instead of ${plannedName}${always ? ', every time' : ''}`, 4500, { label: 'Undo', onClick: async () => {
      try { await undo(); toast('Swap undone'); } catch (err) { toast(`Could not undo: ${err?.message || err}`, 5000); }
    } });
  })));
}

/** Run an action with its button disabled, so a double tap cannot run it twice; report failures instead of hanging. */
async function guarded(button, fn) {
  if (button.disabled) return;
  button.disabled = true;
  try { await fn(); } catch (err) { toast(err instanceof RangeError ? err.message : `Could not save: ${err?.message || err}`, 4200); } finally { button.disabled = false; }
}

/** Log a set that is not part of the coach's programme (any catalogue exercise). */
function openQuickLog(app, recovered = null) {
  const unit = app.settings.unit;
  const options = [...app.catalogue.exercises].sort((a, b) => a.name.localeCompare(b.name));
  const sheet = openSheet(`
    <div class="card-h"><h2>Quick log</h2><span class="pill">outside the programme</span></div>
    ${recovered ? '<p class="pill">UNSAVED · recovered inputs</p>' : ''}
    <label class="field"><span>Exercise</span><select id="ex">${options.map((e) => `<option value="${esc(e.id)}" ${recovered?.ex === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
    <div class="log-fields mt-3">
      <label class="field wide"><span>Weight (${esc(unit)})</span><div class="num-step"><button type="button" id="w-down" aria-label="Decrease weight by ${stepFor(unit)} ${esc(unit)}">−</button><input id="w" type="number" step="0.5" min="0" inputmode="decimal" value="${esc(recovered?.w ?? '')}"><button type="button" id="w-up" aria-label="Increase weight by ${stepFor(unit)} ${esc(unit)}">+</button></div><small class="tone-bad" data-error="w"></small></label>
      <label class="field"><span>Reps</span><input id="r" type="number" step="1" min="1" inputmode="numeric" value="${esc(recovered?.r ?? '')}"><small class="tone-bad" data-error="r"></small></label>
      <label class="field"><span>RPE</span><input id="e" type="number" step="0.5" min="1" max="11" inputmode="decimal" value="${esc(recovered?.e ?? '')}"><small class="tone-bad" data-error="e"></small></label>
    </div>
    <label class="row mt-3"><input id="wu" type="checkbox" ${recovered?.wu ? 'checked' : ''}> Warm-up set (not counted for PRs or volume)</label>
    <label class="field mt-3"><span>Actual date</span><input id="d" type="date" value="${esc(recovered?.d ?? todayIso())}"><small class="tone-bad" data-error="d"></small><small class="muted small" id="date-status">${dateStatus(recovered?.d ?? todayIso())}</small></label>
    <p id="draft-status" class="small muted" role="status">${recovered ? 'Recovered inputs were not logged.' : ''}</p>
    <div class="row spread mt-4"><button class="btn ghost" id="cancel">Cancel</button><button class="btn primary" id="save">Save set</button></div>`);
  const q = (s) => sheet.el.querySelector(s);
  const invalid = (id, message) => { q(`[data-error="${id}"]`).textContent = message; q(`#${id}`).focus(); };
  let pending = Promise.resolve();
  const keepDraft = () => {
    const fields = { w: q('#w').value, r: q('#r').value, e: q('#e').value, d: q('#d').value, ex: q('#ex').value, wu: q('#wu').checked };
    pending = pending.then(() => app.saveDraft('set', { kind: 'quick', unit, programmeRef: null, plannedRef: null, exerciseId: fields.ex, fields }))
      .then(() => { q('#draft-status').textContent = app.store?.persistent === false ? 'UNSAVED inputs are temporary and will be lost when you close this tab.' : 'UNSAVED inputs kept on this device.'; })
      .catch(() => { q('#draft-status').textContent = 'Could not keep unsaved inputs on this device.'; });
  };
  const clearDraft = async () => { await pending; if (app.getDraft?.('set')?.value?.kind === 'quick') await app.clearDraft('set'); };
  ['w', 'r', 'e', 'd'].forEach((id) => q(`#${id}`).addEventListener('input', () => { q(`[data-error="${id}"]`).textContent = ''; keepDraft(); }));
  bindStep(q, 'w', stepFor(unit));
  ['ex', 'wu'].forEach((id) => q(`#${id}`).addEventListener('change', keepDraft));
  q('#d').addEventListener('change', () => { q('#date-status').textContent = dateStatus(q('#d').value); });
  q('#cancel').addEventListener('click', () => guarded(q('#cancel'), async () => { await clearDraft(); sheet.close(); app.changed?.(); }));
  q('#save').addEventListener('click', () => guarded(q('#save'), async () => {
    const w = q('#w').value === '' ? NaN : Number(q('#w').value), r = q('#r').value === '' ? NaN : Number(q('#r').value), rpe = q('#e').value === '' ? null : Number(q('#e').value);
    if (!(Number.isFinite(w) && w >= 0 && w < 1e5)) { invalid('w', 'Enter a realistic weight'); return; }
    if (!Number.isInteger(r) || r < 1 || r > 1000) { invalid('r', 'Enter whole reps'); return; }
    if (rpe != null && !(Number.isFinite(rpe) && rpe >= 1 && rpe <= 11)) { invalid('e', 'RPE must be between 1 and 11'); return; }
    if (!q('#d').value) { invalid('d', 'Choose an actual date'); return; }
    const before = new Set(app.prs().map(prKey));
    let saved;
    try { saved = await app.logSet({ date: q('#d').value, programmeRef: null, plannedRef: null, exerciseId: q('#ex').value, weight: { value: w, unit }, reps: r, rpe, isWarmup: q('#wu').checked }, { withUndo: true }); }
    catch (err) { const id = /date/i.test(err.message) ? 'd' : /rpe/i.test(err.message) ? 'e' : /rep/i.test(err.message) ? 'r' : /weight|load/i.test(err.message) ? 'w' : null; if (id) { invalid(id, err.message); return; } throw err; }
    const fresh = app.prs().filter((x) => !before.has(prKey(x)));
    let cleared = true; try { await clearDraft(); } catch { cleared = false; }
    sheet.close();
    app.changed?.();
    receipt(app, `${fresh.length ? `New PR! ${fresh.map((x) => prLabel(x, unit)).join(', ')}` : 'Set saved'}${cleared ? '' : ' · unsaved copy could not be cleared'}`, saved.undoToken);
    if (!q('#wu')?.checked) startRest(suggestedRest(app.exercise(q('#ex')?.value)), { vibrate: app.settings.vibrate });
  }));
}

const prKey = (x) => `${x.exerciseId}|${x.type}|${x.date}|${x.order}|${x.value}`;
export function prLabel(x, unit) {
  const kg = (v) => formatWeight({ value: v, unit: 'kg' }, unit);
  return x.type === 'e1rm' ? `e1RM ${kg(x.value)}` : x.type === 'single' ? `heaviest single ${kg(x.value)}` : `${x.value} reps at ${kg(x.weightKg)}`;
}

function openWarmups(app, ui, entry, eff) {
  const unit = app.settings.unit;
  // A swapped exercise warms up toward what was last lifted on it: the planned load is the other exercise's.
  const top = eff?.swapped ? lastPerformance(app, eff.id, ui.train.actualDate || todayIso())?.weight
    : entry.sets.map((s) => s.actualLoad || s.load).filter(Boolean).sort((a, b) => toKg(b) - toKg(a))[0];
  if (!top) { toast(eff?.swapped ? 'No earlier set of this exercise to warm up toward' : 'No load planned to warm up toward'); return; }
  const { plates, bar, collar } = plateConfig(app, unit);
  const topW = { value: round1(convert(top.value, top.unit, unit)), unit };
  let ladder = [];
  try { ladder = warmupLadder({ top: topW, bar: bar.weight, collar, plates }); } catch { /* ignore */ }
  openSheet(`<div class="card-h"><h2>Warm-up</h2><span class="pill">${esc(eff?.swapped ? eff.name : app.exerciseName(entry.exerciseId, entry.name))}</span></div>
    <p class="muted small">Toward ${round1(topW.value)} ${esc(unit)}. Jumps are rounded to plates you own.</p>
    <ol class="feed">${ladder.map((s, i) => `<li><span class="medal plain">${i + 1}</span><span><b>${round1(s.weight.value)} ${esc(unit)}</b> × ${s.reps}<br><span class="muted small">${esc(s.text)}</span></span><span></span></li>`).join('') || '<li class="muted">Nothing to show.</li>'}</ol>`);
}
