// Progress statistics for the Progress view. Pure functions over working-set events ({ date, weightKg, reps, rpe }).
// - Each set's estimated 1RM uses the RPE chart when the set has an RPE (reps in reserve matter: 150 x 3 @6 and
//   @9.5 imply very different maxes) and Epley otherwise.
// - A session's point is its best set. Light days (top set under RPE 7, or without RPE well under recent form) are
//   kept but marked, and left out of every trend.
// - Trends are Theil-Sen (median of pairwise slopes), so one bad day cannot tilt them; the drawn line is the same
//   estimator over a moving window. Intervals are approximate (residual spread from the median absolute deviation).
import { estimate1RM } from './e1rm.js';
import { pctSmooth } from './rpe-chart.js';

const DAY = 86400000;
export const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY;
export const isoOf = (d) => new Date(Math.round(d) * DAY).toISOString().slice(0, 10);
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Estimated 1RM of one set: { value, method: 'rpe' | 'epley' } or null. */
export function setE1rm(weightKg, reps, rpe) {
  if (!(weightKg > 0) || !Number.isInteger(reps) || reps < 1) return null;
  const p = rpe != null ? pctSmooth(reps, Number(rpe)) : null;
  if (p) return { value: weightKg / p, method: 'rpe' };
  const e = estimate1RM(weightKg, reps);
  return e == null ? null : { value: e, method: 'epley' };
}

/**
 * One point per session day: the best set's estimate, sorted by date.
 * Point: { x, y, weightKg, reps, rpe, method, hard }. `hard` is false for light days.
 */
export function sessionPoints(sets) {
  const byDay = new Map();
  for (const s of sets) {
    const e = setE1rm(s.weightKg, s.reps, s.rpe);
    if (!e) continue;
    const cur = byDay.get(s.date);
    const topRpe = Math.max(cur?.topRpe ?? -Infinity, s.rpe ?? -Infinity);
    if (!cur || e.value > cur.y) byDay.set(s.date, { x: s.date, y: e.value, weightKg: s.weightKg, reps: s.reps, rpe: s.rpe ?? null, method: e.method, topRpe });
    else cur.topRpe = topRpe;
  }
  const pts = [...byDay.values()].sort((a, b) => (a.x < b.x ? -1 : 1));
  const hard = [];
  for (const p of pts) {
    if (Number.isFinite(p.topRpe)) p.hard = p.topRpe >= 7;
    else {
      // No RPE that day: light if well under the best hard estimate of the previous six weeks.
      const recent = hard.filter((q) => dayNum(p.x) - dayNum(q.x) <= 42).map((q) => q.y);
      p.hard = !recent.length || p.y >= 0.9 * Math.max(...recent);
    }
    if (p.hard) hard.push(p);
    delete p.topRpe;
  }
  return pts;
}

/** Theil-Sen line through { t, y }: { slope, intercept } or null with fewer than two distinct t. */
export function theilSen(pts) {
  const slopes = [];
  // ponytail: O(n^2) pairs; fine for the ~30 points of an 8-week window, subsample if windows grow past ~500.
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    if (pts[j].t !== pts[i].t) slopes.push((pts[j].y - pts[i].y) / (pts[j].t - pts[i].t));
  }
  if (!slopes.length) return null;
  const slope = median(slopes);
  return { slope, intercept: median(pts.map((p) => p.y - slope * p.t)) };
}

/**
 * Trend over the last `weeks` weeks of hard points (needs 3+ points spanning 14+ days).
 * Returns { slopePerWeek, n, from, to, at(iso), interval(iso) } or null. `interval` gives a rough 90% range
 * for a future date: { mid, lo, hi }.
 */
export function trend(points, { weeks = 8, asOf = null } = {}) {
  const hard = points.filter((p) => p.hard);
  if (!hard.length) return null;
  const end = asOf ? dayNum(asOf) : dayNum(hard.at(-1).x);
  const win = hard.filter((p) => dayNum(p.x) <= end && end - dayNum(p.x) <= weeks * 7).map((p) => ({ t: dayNum(p.x), y: p.y }));
  if (win.length < 3 || win.at(-1).t - win[0].t < 14) return null;
  const fit = theilSen(win);
  if (!fit) return null;
  const at = (iso) => fit.intercept + fit.slope * dayNum(iso);
  const res = win.map((p) => p.y - (fit.intercept + fit.slope * p.t));
  const sd = Math.max(0.5, 1.4826 * median(res.map((r) => Math.abs(r - median(res)))));
  const tm = win.reduce((a, p) => a + p.t, 0) / win.length;
  const sxx = win.reduce((a, p) => a + (p.t - tm) ** 2, 0);
  const interval = (iso) => {
    const t = dayNum(iso), mid = at(iso);
    const se = sd * Math.sqrt(1 + 1 / win.length + (t - tm) ** 2 / sxx);
    return { mid, lo: mid - 1.645 * se, hi: mid + 1.645 * se };
  };
  return { slopePerWeek: fit.slope * 7, n: win.length, from: isoOf(win[0].t), to: isoOf(win.at(-1).t), at, interval };
}

/**
 * Smooth line through the hard points, one value per hard point: a local Theil-Sen line over the hard points within
 * `days` either side (the same robust estimator as `trend`, so the line and the kg/week figure agree), or the
 * median when fewer than three points or under a week of spread fall in the window.
 */
export function smoothLine(points, days = 28) {
  const hard = points.filter((p) => p.hard).map((p) => ({ t: dayNum(p.x), y: p.y, x: p.x }));
  return hard.map(({ t: t0, x }) => {
    const win = hard.filter((p) => Math.abs(p.t - t0) <= days);
    const fit = win.length >= 3 && win.at(-1).t - win[0].t >= 7 ? theilSen(win) : null;
    return { x, y: fit ? fit.intercept + fit.slope * t0 : median(win.map((p) => p.y)) };
  });
}

/** Weeks since the best hard estimate (0 when the latest hard point is the best), or null without hard points. */
export function weeksSinceBest(points, asOf = null) {
  const hard = points.filter((p) => p.hard);
  if (!hard.length) return null;
  const best = hard.reduce((a, p) => (p.y >= a.y ? p : a));
  return Math.floor(((asOf ? dayNum(asOf) : dayNum(hard.at(-1).x)) - dayNum(best.x)) / 7);
}

/** Hard-point estimate on or before `iso` (latest such), for "change versus 4 weeks ago". */
export function valueAt(points, iso) {
  const t = dayNum(iso);
  let out = null;
  for (const p of points) if (p.hard && dayNum(p.x) <= t) out = p;
  return out;
}

// IPF GL points (IPF, 2020), classic (raw) powerlifting: total * 100 / (A - B * e^(-C * bodyweight)).
const GL = { male: [1199.72839, 1025.18162, 0.00921], female: [610.32796, 1045.59282, 0.03048] };
export function ipfGl(totalKg, bodyweightKg, sex) {
  const c = GL[sex];
  if (!c || !(totalKg > 0) || !(bodyweightKg >= 35)) return null;
  return (totalKg * 100) / (c[0] - c[1] * Math.exp(-c[2] * bodyweightKg));
}

/** Monday of the week containing `iso`. */
export const mondayIso = (iso) => isoOf(dayNum(iso) - ((new Date(dayNum(iso) * DAY).getUTCDay() + 6) % 7));

/**
 * Weekly training load for one lift: [{ week, sets, tonnage, intensity }] oldest first. `intensity` is the mean
 * load as a fraction of form at the time (best hard estimate in the previous six weeks), or null.
 */
export function weeklyLoad(sets, points) {
  const hard = points.filter((p) => p.hard);
  const form = (iso) => {
    const t = dayNum(iso);
    const r = hard.filter((p) => dayNum(p.x) <= t && t - dayNum(p.x) <= 42).map((p) => p.y);
    return r.length ? Math.max(...r) : null;
  };
  const weeks = new Map();
  for (const s of sets) {
    if (!(s.weightKg > 0) || !(s.reps > 0)) continue;
    const w = mondayIso(s.date);
    const row = weeks.get(w) || { week: w, sets: 0, tonnage: 0, pct: [] };
    row.sets += 1; row.tonnage += s.weightKg * s.reps;
    const f = form(s.date);
    if (f) row.pct.push(s.weightKg / f);
    weeks.set(w, row);
  }
  return [...weeks.values()].sort((a, b) => (a.week < b.week ? -1 : 1))
    .map(({ pct, ...r }) => ({ ...r, intensity: pct.length ? pct.reduce((a, b) => a + b, 0) / pct.length : null }));
}

/**
 * "Same weight, lower RPE": for each load x reps done at least twice with an RPE, 14+ days apart, the first and
 * latest time. Returns the biggest drops first: [{ weightKg, reps, from: { date, rpe }, to: { date, rpe }, drop }].
 */
export function rpeAtLoad(sets, { minDays = 14 } = {}) {
  const groups = new Map();
  for (const s of sets) {
    if (s.rpe == null || !(s.weightKg > 0) || !(s.reps > 0)) continue;
    const key = `${Math.round(s.weightKg * 4) / 4}x${s.reps}`;
    (groups.get(key) || groups.set(key, []).get(key)).push(s);
  }
  const out = [];
  for (const g of groups.values()) {
    g.sort((a, b) => (a.date < b.date ? -1 : 1));
    const a = g[0], b = g.at(-1);
    if (dayNum(b.date) - dayNum(a.date) < minDays) continue;
    out.push({ weightKg: a.weightKg, reps: a.reps, from: { date: a.date, rpe: a.rpe }, to: { date: b.date, rpe: b.rpe }, drop: a.rpe - b.rpe });
  }
  return out.sort((x, y) => y.drop - x.drop || y.weightKg - x.weightKg);
}
