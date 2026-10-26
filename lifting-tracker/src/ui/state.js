// Application state: loads storage, owns settings/programme/logs, and derives set events, PRs and dates.
import { openStore, requestPersistence, uuid } from '../store/db.js';
import { buildBackup, validateBackup } from '../store/backup.js';
import { isStrictDate, sanitizeProgramme, sanitizeSettings, sanitizeActivities, MAX_ACTIVITIES } from '../store/programme-schema.js';
import { isUnit, toKg } from '../core/units.js';
import { fromLoggedSet, fromProgrammeSets, sortEvents } from '../core/sets.js';
import { detectPRs } from '../core/prs.js';
import { nextSession, plannedValues } from '../core/session.js';
import { buildAthleteModel } from '../core/athlete.js';
import { mondayOf, addDays } from '../core/weeks.js';
import { sessionCalories, weightOn, restingKcal, dayEnergy } from '../core/calories.js';
import { maintenance, target, kcalPerKg } from '../core/targets.js';
import { buildExampleProgramme } from './example-data.js';
import { todayIso } from './dom.js';

async function fetchJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  return r.json();
}

const sameRef = (a, b) => (a == null || b == null ? a == null && b == null
  : a.blockNumber === b.blockNumber && a.weekNumber === b.weekNumber && a.dayNumber === b.dayNumber);

export async function createApp() {
  const store = await openStore();
  const [catalogue, platesData] = await Promise.all([fetchJson('data/exercises.json'), fetchJson('data/plates.json')]);
  const persisted = await requestPersistence();
  const app = {
    store, catalogue, platesData, persisted,
    settings: sanitizeSettings(null), programme: null, usingExample: false, sessions: [], sets: [], bodyweights: [], activities: [],
    listeners: new Set(), cache: new Map(), dataRevision: 0,
  };
  const byId = new Map(catalogue.exercises.map((e) => [e.id, e]));
  app.exercise = (id) => byId.get(id) || null;
  app.exerciseName = (id, fallback = id) => byId.get(id)?.name || fallback;

  app.changed = () => { app.cache.clear(); for (const l of app.listeners) l(); };
  app.subscribe = (fn) => { app.listeners.add(fn); return () => app.listeners.delete(fn); };
  const memo = (key, fn) => { if (!app.cache.has(key)) app.cache.set(key, fn()); return app.cache.get(key); };

  // Writes run one at a time, so a double tap can never interleave two read-modify-write sequences.
  let queue = Promise.resolve();
  const enqueue = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };
  let undo = null;
  const drafts = new Map();
  const draftKeys = ['draft:set', 'draft:coach'];
  const dataChanged = (invalidate = true) => { app.dataRevision++; if (invalidate) undo = null; app.changed(); };
  const checkRevision = (expected) => {
    if (expected != null && expected !== app.dataRevision) throw new RangeError('Your training data changed since this preview. Choose the file again.');
  };
  function draftValue(value) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new RangeError('Invalid draft.');
    const text = JSON.stringify(value);
    if (text.length > 24000) throw new RangeError('Draft is too large to recover.');
    return JSON.parse(text);
  }
  const draftKey = (kind) => {
    if (!['set', 'coach'].includes(kind)) throw new RangeError('Unknown draft.');
    return 'draft:' + kind;
  };
  app.getDraft = (kind) => structuredClone(drafts.get(draftKey(kind)) || null);
  app.saveDraft = (kind, value) => {
    const key = draftKey(kind), envelope = { value: draftValue(value), savedAt: new Date().toISOString() };
    return enqueue(async () => { await store.put('meta', { key, value: envelope }); drafts.set(key, envelope); });
  };
  app.clearDraft = (kind) => enqueue(async () => { const key = draftKey(kind); await store.delete('meta', key); drafts.delete(key); });

  async function load() {
    const [settings, programme, sessions, sets, bodyweights, activities, setDraft, coachDraft] = await Promise.all([
      store.get('meta', 'settings'), store.get('meta', 'programme'), store.getAll('sessions'), store.getAll('sets'), store.getAll('bodyweights'), store.get('meta', 'activities'),
      ...draftKeys.map((key) => store.get('meta', key)),
    ]);
    app.settings = sanitizeSettings(settings?.value);
    app.sessions = sessions; app.sets = sets; app.bodyweights = bodyweights; app.activities = sanitizeActivities(activities?.value);
    const clean = sanitizeProgramme(programme?.value);
    if (clean) { app.programme = clean; app.usingExample = !!clean.isExample; }
    else { app.programme = buildExampleProgramme(); app.usingExample = true; }
    drafts.clear();
    [setDraft, coachDraft].forEach((record, i) => {
      try {
        const envelope = record?.value;
        if (envelope && Number.isFinite(Date.parse(envelope.savedAt))) drafts.set(draftKeys[i], { value: draftValue(envelope.value), savedAt: envelope.savedAt });
      } catch { /* malformed drafts never prevent opening the app */ }
    });
    dataChanged();
  }

  app.reload = () => enqueue(load);

  app.saveSettings = (patch) => enqueue(async () => {
    const next = sanitizeSettings({ ...app.settings, ...patch });
    await store.put('meta', { key: 'settings', value: next });
    app.settings = next;
    app.changed();
  });

  app.setProgramme = (programme, { expectedRevision } = {}) => enqueue(async () => {
    checkRevision(expectedRevision);
    const clean = sanitizeProgramme(programme);
    if (!clean) throw new Error('That is not a programme.');
    await store.deleteAndPut({ meta: [...draftKeys, ...(clean.isExample ? ['programme'] : [])] },
      clean.isExample ? {} : { meta: [{ key: 'programme', value: clean }] });
    app.programme = clean; app.usingExample = !!clean.isExample;
    drafts.clear(); dataChanged();
  });

  // Generated blocks: appended to (or replaced in) the athlete's own programme, never the example one.
  const writeBlocks = async (blocks) => {
    const next = sanitizeProgramme({ ...app.programme, blocks });
    if (!next) throw new Error('That is not a valid programme.');
    await store.put('meta', { key: 'programme', value: next });
    app.programme = next; dataChanged();
    return next;
  };
  app.addBlock = (block) => enqueue(async () => {
    if (app.usingExample) throw new RangeError('Import your workbook first: generated blocks are added to your own programme.');
    if (!block || !Number.isInteger(block.number)) throw new RangeError('The block has no number.');
    if (app.programme.blocks.some((b) => b.number === block.number)) throw new RangeError(`Block ${block.number} already exists.`);
    return writeBlocks([...app.programme.blocks, block]);
  });
  // Only a generated block can be replaced, and only by a generated block with the same number (a revised copy).
  // A block's token changes on every replacement, so `expectedToken` (from app.blockToken, taken when the revision
  // was made) rejects an old revision applied to a block that has since been replaced or revised again.
  const tokenOf = (b) => (b?.generated ? `${b.generated.at}#${b.generated.rev ?? 0}` : null);
  app.blockToken = (number) => tokenOf(app.programme?.blocks.find((b) => b.number === number));
  app.replaceBlock = (block, { expectedToken = null } = {}) => enqueue(async () => {
    if (app.usingExample) throw new RangeError('Import your workbook first.');
    const current = app.programme.blocks.find((b) => b.number === block?.number);
    if (!current?.generated) throw new RangeError('Only generated blocks can be replaced.');
    if (!block.generated) throw new RangeError('The replacement is not a generated block.');
    if (expectedToken && tokenOf(current) !== expectedToken) throw new RangeError('That block has changed since the revision was made. Re-load it again.');
    const next = { ...block, generated: { ...block.generated, at: current.generated.at, rev: (current.generated.rev ?? 0) + 1 } };
    return writeBlocks(app.programme.blocks.map((b) => (b.number === block.number ? next : b)));
  });
  // Removing a generated block keeps what was logged against it, as free-standing sets in your history (they must
  // not attach themselves to whichever block later takes the same number).
  app.removeBlock = (number) => enqueue(async () => {
    const b = app.programme.blocks.find((x) => x.number === number);
    if (!b?.generated) throw new RangeError('Only generated blocks can be removed here.');
    const sessions = app.sessions.filter((s) => s.programmeRef?.blockNumber === number).map((s) => ({ ...s, programmeRef: null, updatedAt: new Date().toISOString() }));
    const ids = new Set(sessions.map((s) => s.id));
    const sets = app.sets.filter((s) => ids.has(s.sessionId) && s.plannedRef).map((s) => ({ ...s, plannedRef: null, updatedAt: new Date().toISOString() }));
    const next = sanitizeProgramme({ ...app.programme, blocks: app.programme.blocks.filter((x) => x.number !== number) });
    if (!next) throw new Error('That is not a valid programme.');
    await store.putAll({ meta: [{ key: 'programme', value: next }], sessions, sets });
    app.programme = next;
    app.sessions = app.sessions.map((s) => sessions.find((x) => x.id === s.id) || s);
    app.sets = app.sets.map((s) => sets.find((x) => x.id === s.id) || s);
    dataChanged();
    return next;
  });

  /** Estimated date for a programme day. Dates are estimates: the workbook has none. */
  app.blockStarts = () => memo('blockStarts', () => {
    const p = app.programme; const starts = new Map();
    if (!p) return starts;
    let start = app.settings.programmeStart;
    if (p.isExample) start = addDays(mondayOf(todayIso()), -21);
    if (!start) {
      // The overview's first result is usually logged on the day before training starts: a Sunday means the next Monday.
      const d = p.overview?.results?.[0]?.date;
      if (d) { const m = mondayOf(d); start = addDays(m, 6) === d ? addDays(d, 1) : m; }
    }
    if (!start) return starts;
    let cursor = mondayOf(start);
    const overrides = app.settings.blockStarts || {};
    for (const b of [...p.blocks].sort((a, c) => a.number - c.number)) {
      if (overrides[b.number]) cursor = mondayOf(overrides[b.number]); // the athlete knows when a block really began
      starts.set(b.number, cursor);
      cursor = addDays(cursor, 7 * Math.max(1, b.weeks.length));
    }
    return starts;
  });
  app.datesKnown = () => app.blockStarts().size > 0;
  app.dateFor = ({ blockNumber, weekNumber, dayNumber }) => {
    const start = app.blockStarts().get(blockNumber);
    if (!start) return null;
    const block = app.programme.blocks.find((b) => b.number === blockNumber);
    const widx = block ? block.weeks.findIndex((w) => w.number === weekNumber) : -1;
    if (widx < 0) return null;
    const wd = app.settings.dayWeekdays?.[dayNumber] ?? Math.min(7, dayNumber);
    return addDays(start, 7 * widx + (wd - 1));
  };

  const refKey = (r) => `${r.blockNumber}:${r.weekNumber}:${r.dayNumber}:${r.entryIndex}:${r.setIndex}`;
  const sessionById = () => memo('sessionById', () => new Map(app.sessions.map((s) => [s.id, s])));
  app.loggedFor = (ref) => memo('loggedIdx', () => {
    const m = new Map();
    for (const s of app.sets) {
      const sess = sessionById().get(s.sessionId);
      if (!sess?.programmeRef || !s.plannedRef) continue;
      m.set(refKey({ ...sess.programmeRef, ...s.plannedRef }), s);
    }
    return m;
  }).get(refKey(ref)) || null;

  app.nextSession = () => nextSession(app.programme, (ref) => {
    const set = app.programme.blocks.find((b) => b.number === ref.blockNumber)
      .weeks.find((w) => w.number === ref.weekNumber)
      .days.find((d) => d.number === ref.dayNumber).entries[ref.entryIndex].sets[ref.setIndex];
    return !!(set.completed || app.loggedFor(ref));
  });

  /** Programme with logged-over sets switched to "not completed" so they are not double counted. */
  app.programmeForEvents = () => memo('progForEvents', () => {
    const p = structuredClone(app.programme);
    for (const b of p.blocks) for (const w of b.weeks) for (const d of w.days) d.entries.forEach((e, ei) => e.sets.forEach((s, si) => {
      if (app.loggedFor({ blockNumber: b.number, weekNumber: w.number, dayNumber: d.number, entryIndex: ei, setIndex: si })) s.completed = false;
    }));
    return p;
  });

  /** The programme with sets logged in the app overlaid as done (with what was actually lifted). For reviews and revisions. */
  app.programmeMerged = () => memo('progMerged', () => {
    const p = structuredClone(app.programme);
    for (const b of p.blocks) for (const w of b.weeks) for (const d of w.days) d.entries.forEach((e, ei) => e.sets.forEach((s, si) => {
      const log = app.loggedFor({ blockNumber: b.number, weekNumber: w.number, dayNumber: d.number, entryIndex: ei, setIndex: si });
      if (!log || log.isWarmup) return;
      s.completed = true; s.actualRpe = log.rpe ?? s.actualRpe; s.actualReps = log.reps; s.actualLoad = { value: log.weight.value, unit: log.weight.unit };
    }));
    return p;
  });

  /** Athlete model (working e1RMs, stance, RPE bias), cached until the data changes. */
  app.athlete = () => memo('athlete', () => buildAthleteModel({ events: app.events(), catalogue: app.catalogue, programme: app.programmeMerged(), dateFor: app.dateFor }));

  app.events = () => memo('events', () => {
    let progEvents = [];
    try { progEvents = app.programme ? fromProgrammeSets(app.programmeForEvents(), app.dateFor) : []; } catch (err) { console.warn('Programme sets skipped:', err); }
    const logged = [];
    for (const s of app.sets) {
      const sess = sessionById().get(s.sessionId);
      if (!sess) continue;
      try { const ev = fromLoggedSet(s, sess); if (ev) logged.push(ev); } catch { /* skip a malformed record instead of breaking every view */ }
    }
    return sortEvents([...progEvents, ...logged]);
  });
  app.prs = () => memo('prs', () => detectPRs(app.events()));

  /** Bodyweight points in kg: programme "Monday: 84.1 KG" lines (estimated dates) plus entries logged here. */
  app.bodyweightPoints = () => memo('bw', () => {
    const pts = [];
    const idx = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };
    for (const b of app.programme?.blocks || []) for (const w of b.weeks) {
      const start = app.dateFor({ blockNumber: b.number, weekNumber: w.number, dayNumber: 1 });
      if (!start) continue;
      const weekStart = mondayOf(start);
      for (const e of w.bodyLog || []) if (e.bodyweightKg) pts.push({ x: addDays(weekStart, idx[e.weekday] ?? 0), y: e.bodyweightKg, kcal: e.calories ?? null, estimated: true });
    }
    for (const r of app.bodyweights) { try { pts.push({ x: r.date, y: toKg(r.weight), kcal: r.calories ?? null, estimated: false }); } catch { /* skip */ } }
    return pts.sort((a, c) => (a.x < c.x ? -1 : 1));
  });

  /** The body details the calorie estimates use, for a date. */
  const bodyOn = (date) => {
    const s = app.settings;
    return { weightKg: weightOn(app.bodyweightPoints(), date), heightCm: s.heightCm, age: s.birthYear ? Number(date.slice(0, 4)) - s.birthYear : null, sex: s.sex, bodyFatPct: s.bodyFatPct };
  };
  /** Estimated calories for a logged session (src/core/calories.js), or null without set times or a bodyweight. */
  app.sessionCalories = (session) => sessionCalories({ date: session.date, sets: app.sets.filter((x) => x.sessionId === session.id), ...bodyOn(session.date) });
  /** A day's estimated energy: sleep, lifting, logged cardio and work, everyday movement and digestion. */
  app.dayEnergy = (date) => {
    const body = bodyOn(date);
    return dayEnergy({ weightKg: body.weightKg, restKcal: restingKcal(body), sleepHours: app.settings.sleepHours, everyday: app.settings.everyday,
      lifting: app.sessions.filter((s) => s.date === date).map(app.sessionCalories).filter(Boolean), activities: app.activities.filter((a) => a.date === date) });
  };
  /** Maintenance and the daily eating target for the goal in settings (src/core/targets.js), as of `today`. */
  app.eatingTarget = (today) => {
    const s = app.settings, body = bodyOn(today);
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((date) => { const e = app.dayEnergy(date); return { date, kcal: e ? (e.total[0] + e.total[1]) / 2 : null }; });
    const pts = app.bodyweightPoints();
    const m = maintenance({ days, intake: pts.filter((p) => p.kcal > 0).map((p) => ({ date: p.x, kcal: p.kcal })), weights: pts, today, perKg: kcalPerKg(body) });
    return { maintenance: m, target: target({ maintenanceKcal: m.kcal, weightKg: body.weightKg, goal: s.goal, pace: s.goalPace, restKcal: restingKcal(body), sex: s.sex, bodyFatPct: s.bodyFatPct }) };
  };
  const saveActivities = async (next) => { await store.put('meta', { key: 'activities', value: next }); app.activities = next; dataChanged(false); };
  app.addActivity = (date, kind, minutes) => enqueue(async () => {
    if (app.activities.length >= MAX_ACTIVITIES) throw new RangeError('Activity log is full. Export a backup, then remove old entries.');
    const [clean] = sanitizeActivities([{ id: uuid(), date, kind, minutes, createdAt: new Date().toISOString() }]);
    if (!clean) throw new RangeError('Choose an activity and a time between 1 minute and 24 hours.');
    await saveActivities([...app.activities, clean]);
  });
  app.deleteActivity = (id) => enqueue(() => saveActivities(app.activities.filter((a) => a.id !== id)));

  // ---- logging ----
  app.logAsPlanned = ({ programmeRef, plannedRef, date }) => enqueue(async () => {
    const day = app.programme?.blocks.find((b) => b.number === programmeRef?.blockNumber)
      ?.weeks.find((w) => w.number === programmeRef?.weekNumber)
      ?.days.find((d) => d.number === programmeRef?.dayNumber);
    const entry = day?.entries[plannedRef?.entryIndex];
    const planned = entry?.sets[plannedRef?.setIndex];
    if (!planned) throw new RangeError('Choose a valid planned set.');
    const values = plannedValues(planned);
    if (!values) throw new RangeError('This set has no planned weight or reps: open it to log.');
    const today = todayIso();
    const existing = app.loggedFor({ ...programmeRef, ...plannedRef });
    const savedDate = app.sessions.find((s) => s.id === existing?.sessionId)?.date;
    const prKey = (x) => `${x.exerciseId}|${x.type}|${x.date}|${x.order}|${x.value}`;
    const before = new Set(app.prs().map(prKey));
    const { set, undoToken } = await logSet({
      programmeRef, plannedRef, date: date ?? savedDate ?? today,
      exerciseId: entry.exerciseId || 'custom:' + entry.name, ...values,
    }, { withUndo: true });
    return { set, undoToken, newPRs: app.prs().filter((x) => !before.has(prKey(x))) };
  });

  const logSet = async (input, { withUndo = false } = {}) => {
    const { date, programmeRef = null, plannedRef = null, exerciseId, weight, reps, rpe = null, isWarmup = false, note = '' } = input;
    if (!isStrictDate(date)) throw new RangeError('Choose a valid date.');
    if (!weight || !Number.isFinite(weight.value) || weight.value < 0 || weight.value >= 1e5 || !isUnit(weight.unit)) throw new RangeError('Enter a realistic weight.');
    if (!Number.isInteger(reps) || reps < 0 || reps > 1000) throw new RangeError('Enter whole reps.');
    if (rpe != null && !(Number.isFinite(rpe) && rpe >= 1 && rpe <= 11)) throw new RangeError('RPE must be between 1 and 11.');
    if (typeof exerciseId !== 'string' || !exerciseId) throw new RangeError('Choose an exercise.');
    const now = new Date().toISOString();
    let session = app.sessions.find((s) => s.date === date && sameRef(s.programmeRef, programmeRef));
    const isNewSession = !session;
    if (!session) session = { id: uuid(), date, programmeRef: programmeRef ?? null, note: '', createdAt: now, updatedAt: now };
    const existing = plannedRef && programmeRef ? app.loggedFor({ ...programmeRef, ...plannedRef }) : null;
    const inSession = app.sets.filter((s) => s.sessionId === session.id && s.id !== existing?.id).length;
    const rec = existing
      ? { ...existing, sessionId: session.id, weight, reps, rpe, isWarmup, order: existing.sessionId === session.id ? existing.order : inSession, note, updatedAt: now }
      : { id: uuid(), sessionId: session.id, exerciseId, order: inSession, weight, reps, rpe, isWarmup, plannedRef: plannedRef ?? null, note, createdAt: now, updatedAt: now };
    const oldSessionId = existing && existing.sessionId !== session.id ? existing.sessionId : null;
    const orphaned = oldSessionId && !app.sets.some((s) => s.id !== rec.id && s.sessionId === oldSessionId) ? oldSessionId : null;
    const receipt = beforeChange(rec.id, [session.id, existing?.sessionId].filter(Boolean));
    await store.deleteAndPut(orphaned ? { sessions: [orphaned] } : {}, { sessions: [session], sets: [rec] }); // one transaction
    if (isNewSession) app.sessions.push(session);
    if (orphaned) app.sessions = app.sessions.filter((s) => s.id !== orphaned);
    const i = app.sets.findIndex((s) => s.id === rec.id);
    if (i >= 0) app.sets[i] = rec; else app.sets.push(rec);
    finishChange(receipt);
    return withUndo ? { set: rec, undoToken: receipt.token } : rec;
  };
  app.logSet = (input, options) => enqueue(() => logSet(input, options));

  app.deleteSet = (id, { withUndo = false } = {}) => enqueue(async () => {
    const target = app.sets.find((s) => s.id === id);
    if (!target) return;
    const lastInSession = !app.sets.some((s) => s.id !== id && s.sessionId === target.sessionId);
    const receipt = beforeChange(id, [target.sessionId]);
    await store.deleteAndPut({ sets: [id], ...(lastInSession ? { sessions: [target.sessionId] } : {}) }, {});
    app.sets = app.sets.filter((s) => s.id !== id);
    if (lastInSession) app.sessions = app.sessions.filter((s) => s.id !== target.sessionId);
    finishChange(receipt);
    return withUndo ? { removed: target, undoToken: receipt.token } : undefined;
  });

  function beforeChange(id, sessionIds) {
    return { token: uuid(), id, set: structuredClone(app.sets.find((s) => s.id === id) || null),
      index: app.sets.findIndex((s) => s.id === id), sessionIds: [...new Set(sessionIds)],
      sessions: app.sessions.flatMap((s, index) => sessionIds.includes(s.id) ? [{ record: structuredClone(s), index }] : []) };
  }
  function finishChange(receipt) {
    // Publish the receipt before subscribers see the successful write.
    receipt.revision = app.dataRevision + 1; undo = receipt; dataChanged(false);
  }
  app.undoSetChange = (token) => enqueue(async () => {
    if (!undo || undo.token !== token || undo.revision !== app.dataRevision) throw new RangeError('That change can no longer be undone.');
    const receipt = undo;
    await store.deleteAndPut({ sets: [receipt.id], sessions: receipt.sessionIds },
      { sets: receipt.set ? [receipt.set] : [], sessions: receipt.sessions.map((s) => s.record) });
    app.sets = app.sets.filter((s) => s.id !== receipt.id);
    if (receipt.set) app.sets.splice(receipt.index, 0, receipt.set);
    app.sessions = app.sessions.filter((s) => !receipt.sessionIds.includes(s.id));
    for (const s of receipt.sessions) app.sessions.splice(s.index, 0, s.record);
    dataChanged();
  });

  app.addBodyweight = (date, weight, calories = null) => enqueue(async () => {
    if (!isStrictDate(date) || !weight || !(weight.value > 20 && weight.value < 500) || !isUnit(weight.unit)) throw new RangeError('Enter a realistic bodyweight and date.');
    const rec = { id: uuid(), date, weight, calories, createdAt: new Date().toISOString() };
    await store.put('bodyweights', rec); app.bodyweights.push(rec); dataChanged();
  });
  app.deleteBodyweight = (id) => enqueue(async () => { await store.delete('bodyweights', id); app.bodyweights = app.bodyweights.filter((b) => b.id !== id); dataChanged(); });

  // ---- backup ----
  app.exportBackup = () => buildBackup(store);
  app.importBackup = (text, { expectedRevision } = {}) => enqueue(async () => {
    checkRevision(expectedRevision);
    const v = validateBackup(text);
    if (!v.ok) return v;
    await store.replaceAll(v.snapshot);
    await load();
    return v;
  });
  app.resetAll = () => enqueue(async () => { await store.clearAll(); await load(); });
  app.useExample = () => enqueue(async () => {
    await store.deleteAndPut({ meta: ['programme', ...draftKeys] }, {});
    app.programme = buildExampleProgramme(); app.usingExample = true; drafts.clear(); dataChanged();
  });

  await load();
  return app;
}
