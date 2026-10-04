// Athlete model: working e1RM per lift, deadlift stance, RPE reporting bias and per-exercise recency, all
// derived from the athlete's own set events. Pure and deterministic (pass `asOf`); rules in GENERATOR.md.
import { e1rmFrom } from './rpe-chart.js';
import { estimate1RM } from './e1rm.js';
import { addDays, daysBetween } from './weeks.js';

const LIFTS = ['squat', 'bench', 'deadlift'];
const SUMO = new Set(['sumo_deadlift', 'tempo_to_knee_sumo_deadlift', 'cluster_sumo_deadlift']);
const CONVENTIONAL = new Set(['conventional_deadlift', 'deadlift', 'tempo_to_knee_deadlift']);
const VARIANT_FACTOR = 0.95;
const CAP_FACTOR = 1.04;
const EXERCISE_WEEKS = 16;
const MIN_BIAS_SETS = 8;

const round1 = x => Math.round(x * 10) / 10;
const list = x => (Array.isArray(x) ? x : []);
const isDate = d => { try { return addDays(d, 0) === d; } catch { return false; } };
const inWindow = (date, from, to) => date > from && date <= to;

// Working sets only: not a warm-up, positive weight, whole reps >= 1, valid date, named exercise.
function workingEvents(events) {
  return events.filter(e => e && typeof e === 'object' && typeof e.exerciseId === 'string' && e.exerciseId !== ''
    && e.isWarmup === false && Number.isFinite(e.weightKg) && e.weightKg > 0
    && Number.isInteger(e.reps) && e.reps >= 1 && isDate(e.date));
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Best first: e1RM descending, newer date first on ties. Array sort is stable, so input order breaks the rest.
const byBest = (a, b) => b.e1rmKg - a.e1rmKg || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const newestFirst = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || b.e1rmKg - a.e1rmKg;

// Rules 2-3: competition sources; variant sources (x0.95) only while fewer than 3 competition sources exist.
function collectSources(lift, sets, byId, from, asOf) {
  const competition = [], variants = [];
  for (const s of sets) {
    if (s.reps > 8 || !inWindow(s.date, from, asOf)) continue;
    const meta = byId.get(s.exerciseId);
    if (meta?.lift !== lift) continue;
    const e1rmKg = e1rmFrom(s.weightKg, s.reps, s.rpe); // null for a missing rpe, rpe > 10 or off the chart
    if (e1rmKg == null) continue;
    const source = { date: s.date, exerciseId: s.exerciseId, weightKg: s.weightKg, reps: s.reps, rpe: s.rpe, e1rmKg };
    if (meta.competition === true) competition.push(source);
    else variants.push({ ...source, e1rmKg: e1rmKg * VARIANT_FACTOR });
  }
  return competition.length >= 3 ? competition : [...competition, ...variants];
}

function liftModel(lift, sets, byId, asOf, windowWeeks) {
  let weeks = windowWeeks, widened = false;
  let sources = asOf === null ? [] : collectSources(lift, sets, byId, addDays(asOf, -7 * weeks), asOf);
  if (asOf !== null && sources.length === 0) { // rule 4: widen once
    weeks = 2 * windowWeeks;
    widened = true;
    sources = collectSources(lift, sets, byId, addDays(asOf, -7 * weeks), asOf);
  }
  const n = sources.length;
  if (n === 0) {
    return { e1rmKg: null, n: 0, confidence: 'none', basis: `no sets at RPE 6-10 in the last ${weeks} weeks (${lift})`, sources: [] };
  }
  const ranked = [...sources].sort(byBest);
  const top = ranked.slice(0, 3);
  const mean = top.reduce((sum, s) => sum + s.e1rmKg, 0) / top.length;
  const e1rmKg = round1(Math.min(mean, CAP_FACTOR * median(sources.map(s => s.e1rmKg))));
  let level = n >= 6 ? 3 : n >= 3 ? 2 : 1; // 3 high, 2 medium, 1 low
  const newest = sources.reduce((a, s) => (s.date > a ? s.date : a), '');
  if ((widened || daysBetween(newest, asOf) > 28) && level > 1) level -= 1; // low is the floor while e1rmKg is non-null
  const used = n <= 3 ? `all ${n} set${n === 1 ? '' : 's'}` : `top 3 of ${n} sets`;
  return {
    e1rmKg, n, confidence: ['none', 'low', 'medium', 'high'][level],
    basis: `${used} at RPE 6-10 in the last ${weeks} weeks (${lift})`,
    sources: ranked.slice(0, 5).sort(newestFirst),
  };
}

// Mean (actual RPE - target RPE) over completed planned sets per lift family; 0 below 8 sets.
function rpeBiases(programme, byId, from, asOf, dateFor) {
  const diffs = { squat: [], bench: [], deadlift: [] };
  const windowed = typeof dateFor === 'function' && asOf !== null;
  for (const block of list(programme?.blocks)) for (const week of list(block?.weeks)) for (const day of list(week?.days)) {
    if (windowed) {
      const date = dateFor({ blockNumber: block.number, weekNumber: week.number, dayNumber: day.number });
      if (!isDate(date) || !inWindow(date, from, asOf)) continue;
    }
    for (const entry of list(day?.entries)) {
      const family = byId.get(entry?.exerciseId)?.lift;
      if (!LIFTS.includes(family)) continue;
      for (const set of list(entry.sets)) {
        const { actualRpe: actual, targetRpe: target } = set ?? {};
        if (set?.completed === true && Number.isFinite(actual) && Number.isFinite(target)
          && actual > 0 && target > 0 && actual <= 10 && target <= 10) diffs[family].push(actual - target);
      }
    }
  }
  const out = {};
  for (const lift of LIFTS) {
    const d = diffs[lift];
    const bias = d.length >= MIN_BIAS_SETS ? d.reduce((a, b) => a + b, 0) / d.length : 0;
    out[lift] = Math.round(Math.max(-1, Math.min(1, bias)) * 20) / 20 + 0; // + 0 turns -0 into 0
  }
  return out;
}

function exerciseSummaries(sets, from, asOf) {
  const map = new Map();
  const e1rmOf = s => estimate1RM(s.weightKg, s.reps) ?? -Infinity;
  for (const s of sets) {
    if (!inWindow(s.date, from, asOf)) continue;
    const rec = map.get(s.exerciseId);
    if (!rec) { map.set(s.exerciseId, { last: s, count: 1, best: estimate1RM(s.weightKg, s.reps) }); continue; }
    rec.count += 1;
    const e = estimate1RM(s.weightKg, s.reps);
    if (e !== null && (rec.best === null || e > rec.best)) rec.best = e;
    if (s.date > rec.last.date || (s.date === rec.last.date
      && (e1rmOf(s) > e1rmOf(rec.last) || (e1rmOf(s) === e1rmOf(rec.last) && s.weightKg > rec.last.weightKg)))) rec.last = s;
  }
  return Object.fromEntries([...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([id, r]) => [id, {
    lastDate: r.last.date, lastWeightKg: r.last.weightKg, lastReps: r.last.reps,
    lastRpe: Number.isFinite(r.last.rpe) ? r.last.rpe : null, count: r.count, bestE1rmKg: r.best,
  }]));
}

/**
 * buildAthleteModel({ events, catalogue, asOf, windowWeeks = 8, programme, dateFor }) -> AthleteModel.
 * `programme` (optional) feeds rpeBias. Planned sets carry no dates, so the optional `dateFor({ blockNumber,
 * weekNumber, dayNumber })` (the same callback `fromProgrammeSets` takes) restricts them to the window; without
 * it every completed planned set in the given programme counts, so pass only the weeks that matter.
 */
export function buildAthleteModel({ events, catalogue, asOf, windowWeeks = 8, programme = null, dateFor = null } = {}) {
  if (!catalogue || !Array.isArray(catalogue.exercises)) throw new RangeError('catalogue with an exercises list is required');
  if (!Number.isInteger(windowWeeks) || windowWeeks < 1) throw new RangeError('windowWeeks must be a positive integer');
  if (asOf != null) addDays(asOf, 0); // throws RangeError on a bad date string
  const all = Array.isArray(events) ? events : [];
  const latest = all.reduce((a, e) => (e && isDate(e.date) && e.date > a ? e.date : a), '');
  const end = asOf ?? (latest || null);
  const sets = workingEvents(all);
  const byId = new Map(catalogue.exercises.filter(x => x && typeof x.id === 'string').map(x => [x.id, x]));
  const windowFrom = end === null ? null : addDays(end, -7 * windowWeeks);

  const lifts = {};
  for (const lift of LIFTS) lifts[lift] = liftModel(lift, sets, byId, end, windowWeeks);
  let sumo = 0, conventional = 0;
  if (end !== null) {
    for (const s of sets) {
      if (s.reps > 8 || !inWindow(s.date, windowFrom, end)) continue;
      if (SUMO.has(s.exerciseId)) sumo += 1; else if (CONVENTIONAL.has(s.exerciseId)) conventional += 1;
    }
  }
  lifts.deadlift.stance = sumo > conventional ? 'sumo' : conventional > sumo ? 'conventional' : null;

  return {
    asOf: end,
    lifts,
    rpeBias: rpeBiases(programme, byId, windowFrom, end, dateFor),
    exercises: end === null ? {} : exerciseSummaries(sets, addDays(end, -7 * EXERCISE_WEEKS), end),
  };
}
