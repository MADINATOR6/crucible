// Application state: loads storage, owns settings/programme/logs, and derives set events, PRs and dates.
import { openStore, requestPersistence, uuid } from '../store/db.js';
import { buildBackup, validateBackup } from '../store/backup.js';
import { isStrictDate, sanitizeProgramme, sanitizeSettings } from '../store/programme-schema.js';
import { isUnit, toKg } from '../core/units.js';
import { fromLoggedSet, fromProgrammeSets, sortEvents } from '../core/sets.js';
import { detectPRs } from '../core/prs.js';
import { mondayOf, addDays } from '../core/weeks.js';
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
    settings: sanitizeSettings(null), programme: null, usingExample: false, sessions: [], sets: [], bodyweights: [],
    listeners: new Set(), cache: new Map(),
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

  async function load() {
    const [settings, programme, sessions, sets, bodyweights] = await Promise.all([
      store.get('meta', 'settings'), store.get('meta', 'programme'), store.getAll('sessions'), store.getAll('sets'), store.getAll('bodyweights'),
    ]);
    app.settings = sanitizeSettings(settings?.value);
    app.sessions = sessions; app.sets = sets; app.bodyweights = bodyweights;
    const clean = sanitizeProgramme(programme?.value);
    if (clean) { app.programme = clean; app.usingExample = !!clean.isExample; }
    else { app.programme = buildExampleProgramme(); app.usingExample = true; }
    app.changed();
  }

  app.reload = () => enqueue(load);

  app.saveSettings = (patch) => enqueue(async () => {
    const next = sanitizeSettings({ ...app.settings, ...patch });
    await store.put('meta', { key: 'settings', value: next });
    app.settings = next;
    app.changed();
  });

  app.setProgramme = (programme) => enqueue(async () => {
    const clean = sanitizeProgramme(programme);
    if (!clean) throw new Error('That is not a programme.');
    if (!clean.isExample) await store.put('meta', { key: 'programme', value: clean });
    app.programme = clean; app.usingExample = !!clean.isExample;
    app.changed();
  });

  // Generated blocks: appended to (or replaced in) the athlete's own programme, never the example one.
  const writeBlocks = async (blocks) => {
    const next = sanitizeProgramme({ ...app.programme, blocks });
    if (!next) throw new Error('That is not a valid programme.');
    await store.put('meta', { key: 'programme', value: next });
    app.programme = next; app.changed();
    return next;
  };
  app.addBlock = (block) => enqueue(async () => {
    if (app.usingExample) throw new RangeError('Import your workbook first: generated blocks are added to your own programme.');
    if (!block || !Number.isInteger(block.number)) throw new RangeError('The block has no number.');
    if (app.programme.blocks.some((b) => b.number === block.number)) throw new RangeError(`Block ${block.number} already exists.`);
    return writeBlocks([...app.programme.blocks, block]);
  });
  app.replaceBlock = (block) => enqueue(async () => {
    if (app.usingExample) throw new RangeError('Import your workbook first.');
    if (!app.programme.blocks.some((b) => b.number === block?.number)) throw new RangeError('No such block to replace.');
    return writeBlocks(app.programme.blocks.map((b) => (b.number === block.number ? block : b)));
  });
  app.removeBlock = (number) => enqueue(async () => {
    const b = app.programme.blocks.find((x) => x.number === number);
    if (!b?.generated) throw new RangeError('Only generated blocks can be removed here.');
    return writeBlocks(app.programme.blocks.filter((x) => x.number !== number));
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

  /** Programme with logged-over sets switched to "not completed" so they are not double counted. */
  app.programmeForEvents = () => memo('progForEvents', () => {
    const p = structuredClone(app.programme);
    for (const b of p.blocks) for (const w of b.weeks) for (const d of w.days) d.entries.forEach((e, ei) => e.sets.forEach((s, si) => {
      if (app.loggedFor({ blockNumber: b.number, weekNumber: w.number, dayNumber: d.number, entryIndex: ei, setIndex: si })) s.completed = false;
    }));
    return p;
  });

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
      for (const e of w.bodyLog || []) if (e.bodyweightKg) pts.push({ x: addDays(weekStart, idx[e.weekday] ?? 0), y: e.bodyweightKg, estimated: true });
    }
    for (const r of app.bodyweights) { try { pts.push({ x: r.date, y: toKg(r.weight), estimated: false }); } catch { /* skip */ } }
    return pts.sort((a, c) => (a.x < c.x ? -1 : 1));
  });

  // ---- logging ----
  app.logSet = (input) => enqueue(async () => {
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
    await store.deleteAndPut(orphaned ? { sessions: [orphaned] } : {}, { sessions: [session], sets: [rec] }); // one transaction
    if (isNewSession) app.sessions.push(session);
    if (orphaned) app.sessions = app.sessions.filter((s) => s.id !== orphaned);
    const i = app.sets.findIndex((s) => s.id === rec.id);
    if (i >= 0) app.sets[i] = rec; else app.sets.push(rec);
    app.changed();
    return rec;
  });

  app.deleteSet = (id) => enqueue(async () => {
    const target = app.sets.find((s) => s.id === id);
    if (!target) return;
    const lastInSession = !app.sets.some((s) => s.id !== id && s.sessionId === target.sessionId);
    await store.deleteAndPut({ sets: [id], ...(lastInSession ? { sessions: [target.sessionId] } : {}) }, {});
    app.sets = app.sets.filter((s) => s.id !== id);
    if (lastInSession) app.sessions = app.sessions.filter((s) => s.id !== target.sessionId);
    app.changed();
  });

  app.addBodyweight = (date, weight, calories = null) => enqueue(async () => {
    if (!isStrictDate(date) || !weight || !(weight.value > 20 && weight.value < 500) || !isUnit(weight.unit)) throw new RangeError('Enter a realistic bodyweight and date.');
    const rec = { id: uuid(), date, weight, calories, createdAt: new Date().toISOString() };
    await store.put('bodyweights', rec); app.bodyweights.push(rec); app.changed();
  });
  app.deleteBodyweight = (id) => enqueue(async () => { await store.delete('bodyweights', id); app.bodyweights = app.bodyweights.filter((b) => b.id !== id); app.changed(); });

  // ---- backup ----
  app.exportBackup = () => buildBackup(store);
  app.importBackup = (text) => enqueue(async () => {
    const v = validateBackup(text);
    if (!v.ok) return v;
    await store.replaceAll(v.snapshot);
    await load();
    return v;
  });
  app.resetAll = () => enqueue(async () => { await store.clearAll(); await load(); });
  app.useExample = () => enqueue(async () => { await store.delete('meta', 'programme'); app.programme = buildExampleProgramme(); app.usingExample = true; app.changed(); });

  await load();
  return app;
}
