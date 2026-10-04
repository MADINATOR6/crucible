// Application state: loads storage, owns settings/programme/logs, and derives set events, PRs and dates.
import { openStore, requestPersistence, uuid } from '../store/db.js';
import { buildBackup, validateBackup } from '../store/backup.js';
import { toKg } from '../core/units.js';
import { fromLoggedSet, fromProgrammeSets, sortEvents } from '../core/sets.js';
import { detectPRs } from '../core/prs.js';
import { mondayOf, addDays } from '../core/weeks.js';
import { buildExampleProgramme } from './example-data.js';
import { todayIso } from './dom.js';

export const DEFAULT_SETTINGS = Object.freeze({
  unit: 'kg', theme: 'system', barId: 'kg20', collar: true, plateCounts: null, programmeStart: null, blockStarts: {}, dayWeekdays: { 1: 1, 2: 2, 3: 4, 4: 5 },
});

async function fetchJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  return r.json();
}

export async function createApp() {
  const store = await openStore();
  const [catalogue, platesData] = await Promise.all([fetchJson('data/exercises.json'), fetchJson('data/plates.json')]);
  const persisted = await requestPersistence();
  const app = {
    store, catalogue, platesData, persisted,
    settings: { ...DEFAULT_SETTINGS }, programme: null, usingExample: false, sessions: [], sets: [], bodyweights: [],
    listeners: new Set(), cache: new Map(),
  };
  const byId = new Map(catalogue.exercises.map((e) => [e.id, e]));
  app.exercise = (id) => byId.get(id) || null;
  app.exerciseName = (id, fallback = id) => byId.get(id)?.name || fallback;

  app.changed = () => { app.cache.clear(); for (const l of app.listeners) l(); };
  app.subscribe = (fn) => { app.listeners.add(fn); return () => app.listeners.delete(fn); };
  const memo = (key, fn) => { if (!app.cache.has(key)) app.cache.set(key, fn()); return app.cache.get(key); };

  async function load() {
    const [settings, programme, sessions, sets, bodyweights] = await Promise.all([
      store.get('meta', 'settings'), store.get('meta', 'programme'), store.getAll('sessions'), store.getAll('sets'), store.getAll('bodyweights'),
    ]);
    app.settings = { ...DEFAULT_SETTINGS, ...(settings?.value || {}) };
    app.sessions = sessions; app.sets = sets; app.bodyweights = bodyweights;
    if (programme?.value) { app.programme = programme.value; app.usingExample = !!programme.value.isExample; }
    else { app.programme = buildExampleProgramme(); app.usingExample = true; }
    app.changed();
  }

  app.saveSettings = async (patch) => {
    app.settings = { ...app.settings, ...patch };
    await store.put('meta', { key: 'settings', value: app.settings });
    app.changed();
  };

  app.setProgramme = async (programme) => {
    app.programme = programme; app.usingExample = !!programme.isExample;
    if (!programme.isExample) await store.put('meta', { key: 'programme', value: programme });
    app.changed();
  };

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

  /** Programme with logged-over sets switched to "not completed" so they are not double counted. */
  app.programmeForEvents = () => memo('progForEvents', () => {
    const p = structuredClone(app.programme);
    for (const b of p.blocks) for (const w of b.weeks) for (const d of w.days) d.entries.forEach((e, ei) => e.sets.forEach((s, si) => {
      if (app.loggedFor({ blockNumber: b.number, weekNumber: w.number, dayNumber: d.number, entryIndex: ei, setIndex: si })) s.completed = false;
    }));
    return p;
  });

  app.events = () => memo('events', () => {
    const progEvents = app.programme ? fromProgrammeSets(app.programmeForEvents(), app.dateFor) : [];
    const logged = app.sets.map((s) => { const sess = sessionById().get(s.sessionId); return sess ? fromLoggedSet(s, sess) : null; }).filter(Boolean);
    return sortEvents([...progEvents, ...logged]);
  });
  app.prs = () => memo('prs', () => detectPRs(app.events()));

  /** Bodyweight points in kg: programme "Monday: 84.1 KG" lines (estimated dates) plus entries logged here. */
  app.bodyweightPoints = () => memo('bw', () => {
    const pts = [];
    for (const b of app.programme?.blocks || []) for (const w of b.weeks) {
      const start = app.dateFor({ blockNumber: b.number, weekNumber: w.number, dayNumber: 1 });
      if (!start) continue;
      const weekStart = mondayOf(start);
      const idx = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };
      for (const e of w.bodyLog || []) if (e.bodyweightKg) pts.push({ x: addDays(weekStart, idx[e.weekday] ?? 0), y: e.bodyweightKg, estimated: true });
    }
    for (const r of app.bodyweights) pts.push({ x: r.date, y: toKg(r.weight), estimated: false });
    return pts.sort((a, c) => (a.x < c.x ? -1 : 1));
  });

  // ---- logging ----
  app.logSet = async ({ date, programmeRef, plannedRef, exerciseId, weight, reps, rpe, isWarmup = false, note = '' }) => {
    const now = new Date().toISOString();
    let session = app.sessions.find((s) => s.date === date && JSON.stringify(s.programmeRef) === JSON.stringify(programmeRef ?? null));
    if (!session) {
      session = { id: uuid(), date, programmeRef: programmeRef ?? null, note: '', createdAt: now, updatedAt: now };
      await store.put('sessions', session); app.sessions.push(session);
    }
    const existing = plannedRef && programmeRef ? app.loggedFor({ ...programmeRef, ...plannedRef }) : null;
    const rec = existing
      ? { ...existing, sessionId: session.id, weight, reps, rpe, isWarmup, note, updatedAt: now }
      : { id: uuid(), sessionId: session.id, exerciseId, order: app.sets.filter((s) => s.sessionId === session.id).length, weight, reps, rpe, isWarmup, plannedRef: plannedRef ?? null, note, createdAt: now, updatedAt: now };
    await store.put('sets', rec);
    const i = app.sets.findIndex((s) => s.id === rec.id);
    if (i >= 0) app.sets[i] = rec; else app.sets.push(rec);
    app.changed();
    return rec;
  };
  app.deleteSet = async (id) => {
    await store.delete('sets', id);
    app.sets = app.sets.filter((s) => s.id !== id);
    app.changed();
  };
  app.addBodyweight = async (date, weight, calories = null) => {
    const rec = { id: uuid(), date, weight, calories, createdAt: new Date().toISOString() };
    await store.put('bodyweights', rec); app.bodyweights.push(rec); app.changed();
  };
  app.deleteBodyweight = async (id) => { await store.delete('bodyweights', id); app.bodyweights = app.bodyweights.filter((b) => b.id !== id); app.changed(); };

  // ---- backup ----
  app.exportBackup = () => buildBackup(store);
  app.importBackup = async (text) => {
    const v = validateBackup(text);
    if (!v.ok) return v;
    await store.replaceAll(v.snapshot);
    await load();
    return v;
  };
  app.resetAll = async () => { await store.clearAll(); await load(); };
  app.useExample = async () => { await store.delete('meta', 'programme'); app.programme = buildExampleProgramme(); app.usingExample = true; app.changed(); };

  await load();
  return app;
}
