// Coach's review: reads the athlete's own training history and says, in plain coaching language, what is
// working and what to improve next, with the numbers behind each point and an action the block generator
// can apply. Pure and deterministic; no clock (pass `asOf`), no storage, no DOM.
//
// These are heuristics from common powerlifting practice (autoregulated RPE training, weekly e1RM trends,
// volume landmarks, strength ratios), not a diagnosis. Every finding carries a confidence and the evidence,
// and the app labels the whole review as a suggestion. Thresholds are named constants so they are easy to tune.
import { e1rmFrom } from './rpe-chart.js';
import { addDays, daysBetween, mondayOf } from './weeks.js';
import { weeklyHardSets } from './muscles.js';
import { convert, round1 } from './units.js';

const LIFTS = ['squat', 'bench', 'deadlift'];
const T = {
  windowWeeks: 12, minTrendWeeks: 6, minTrendSpan: 8,
  progressPctPerWeek: 0.003, plateauPctPerWeek: -0.0015, regressPctPerWeek: -0.003,
  benchToSquat: [0.6, 0.78], deadliftToSquat: [1.08, 1.32],
  rpeHigh: 0.5, rpeLow: -0.4, rpeCreepPerWeek: 0.15, minRpeSets: 8,
  adherenceLow: 0.85, adherenceGood: 0.93,
  volumeLow: 6, volumeHigh: 22, volumeWeeks: 4,
  heavyPct: 0.85, singlePct: 0.9, weeksSinceHeavy: 8,
  pausedBenchRatio: 0.9, kneeDeadliftRatio: 0.85, highBarRatio: 1.05,
  deloadWeeksOverdue: 8, deloadDrop: 0.7,
  bwLossPctPerWeek: 0.007,
};
const KEY_MUSCLES = ['quads', 'glutes', 'hamstrings', 'chest', 'triceps', 'lats', 'upper_back', 'lower_back'];
const SMALL_MUSCLES = {
  calves: { id: 'standing_calf_raise', label: 'calf raises' },
  side_delts: { id: 'cable_lateral_raise', label: 'lateral raises' },
  rear_delts: { id: 'face_pull', label: 'face pulls' },
  abs: { id: 'cable_crunch', label: 'cable crunches' },
};
const SEV = { high: 3, medium: 2, low: 1, good: 0 };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
function median(a) { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/** Weekly best RPE-based e1RM for a set of exercise ids. Returns [{ week: 'YYYY-MM-DD' (Monday), e1rm }] ascending. */
function weeklySeries(events, ids, since) {
  const best = new Map();
  for (const e of events) {
    if (!ids.has(e.exerciseId) || e.isWarmup !== false || e.date < since) continue;
    if (!Number.isInteger(e.reps) || e.reps < 1 || e.reps > 8 || !(e.rpe >= 6 && e.rpe <= 10)) continue;
    const v = e1rmFrom(e.weightKg, e.reps, e.rpe);
    if (v == null) continue;
    const wk = mondayOf(e.date);
    if (!(best.get(wk) >= v)) best.set(wk, v);
  }
  return [...best].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([week, e1rm]) => ({ week, e1rm }));
}

/** Least-squares trend of a weekly series. */
function trendOf(series) {
  if (series.length < 2) return null;
  const x0 = series[0].week;
  const xs = series.map((p) => daysBetween(x0, p.week) / 7), ys = series.map((p) => p.e1rm);
  const mx = mean(xs), my = mean(ys);
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx;
  const recent = series.slice(-3), early = series.slice(0, 3);
  return { n: series.length, span: xs.at(-1) - xs[0], slope, pct: slope / my, mean: my, latest: Math.max(...recent.map((p) => p.e1rm)), earliest: Math.max(...early.map((p) => p.e1rm)) };
}

function programmeWeeks(programme) {
  const out = [];
  for (const b of [...(programme?.blocks || [])].sort((a, c) => a.number - c.number)) for (const w of b.weeks || []) out.push({ block: b, week: w });
  return out;
}

const setsOf = (w) => w.days.flatMap((d) => d.entries.flatMap((e) => e.sets.map((s) => ({ s, e, d }))));

/**
 * @param {{ events: object[], programme: object|null, catalogue: object, athlete?: object|null,
 *           bodyweight?: Array<{x:string,y:number}>, asOf?: string|null, unit?: 'kg'|'lb' }} input
 */
export function coachReview({ events, programme = null, catalogue, athlete = null, bodyweight = [], asOf = null, unit = 'kg' }) {
  if (!catalogue || !Array.isArray(catalogue.exercises)) throw new RangeError('catalogue is required');
  const ex = new Map(catalogue.exercises.map((e) => [e.id, e]));
  const evs = (events || []).filter((e) => e && typeof e.date === 'string' && e.weightKg > 0);
  const latest = evs.reduce((m, e) => (e.date > m ? e.date : m), '');
  const end = asOf || latest || null;
  const kg = (v) => `${round1(convert(v, 'kg', unit))} ${unit}`;
  const findings = [];
  const add = (f) => findings.push({ confidence: 'medium', because: [], action: null, ...f });
  if (!end) {
    return { asOf: null, headline: 'There is no training history yet, so there is nothing to review. Log or import some training first.', priorities: [], strengths: [], notes: [], findings: [], apply: [] };
  }
  const since = addDays(end, -7 * T.windowWeeks);
  const win = evs.filter((e) => e.date > since && e.date <= end && e.isWarmup === false);

  // ---- progress per lift (weekly best e1RM from RPE-rated sets) ----
  const idsFor = (lift, comp) => new Set(catalogue.exercises.filter((e) => e.lift === lift && (comp ? e.competition : true)).map((e) => e.id));
  const trends = {};
  for (const lift of LIFTS) {
    let series = weeklySeries(win, idsFor(lift, true), since);
    if (series.length < T.minTrendWeeks) series = weeklySeries(win, idsFor(lift, false), since);
    trends[lift] = series.length >= 2 ? trendOf(series) : null;
  }
  const e1 = {};
  // Use the same weekly-best basis as the trend analysis, so the findings never contradict each other.
  for (const lift of LIFTS) e1[lift] = (trends[lift]?.n >= 3 ? trends[lift].latest : null) ?? athlete?.lifts?.[lift]?.e1rmKg ?? trends[lift]?.latest ?? null;

  for (const lift of LIFTS) {
    const t = trends[lift];
    if (!t || t.n < T.minTrendWeeks || t.span < T.minTrendSpan) continue;
    const pct = (t.pct * 100).toFixed(2), perWk = `${t.slope >= 0 ? '+' : ''}${round1(convert(t.slope, 'kg', unit))} ${unit}`;
    const base = [`Weekly best e1RM over ${t.n} weeks: ${kg(t.earliest)} early, ${kg(t.latest)} lately (${perWk} a week, ${t.pct >= 0 ? '+' : ''}${pct}% a week).`];
    if (t.pct >= T.progressPctPerWeek) {
      add({ id: `progress-${lift}`, area: 'progress', severity: 'good', title: `${cap(lift)} is moving well`, because: base, suggestion: `Keep the plan that is working. Do not change much on ${lift} for now.`, confidence: 'medium' });
    } else if (t.pct <= T.regressPctPerWeek) {
      add({ id: `regress-${lift}`, area: 'progress', severity: 'high', title: `${cap(lift)} is trending down`, because: base,
        suggestion: `Before changing the programme, check recovery (sleep, food, stress, work). If that is fine, run a deload week and rebuild with a more conservative ramp, and review ${lift} technique on video.`,
        action: { type: 'progression', value: 'conservative', label: 'Use a conservative ramp' }, confidence: 'medium' });
    } else if (t.pct <= T.plateauPctPerWeek + 0.003) {
      add({ id: `plateau-${lift}`, area: 'progress', severity: 'medium', title: `${cap(lift)} has stalled`, because: base,
        suggestion: `${cap(lift)} has not moved for about ${Math.round(t.span)} weeks. Change the stimulus rather than just trying harder: bring it up for a block (extra set on the lift and its variation), and look at the variation numbers below for a weak point.`,
        action: { type: 'emphasis', lift, label: `Bring up ${lift}` }, confidence: 'medium' });
    }
  }

  // ---- balance between lifts ----
  if (e1.squat && e1.bench && e1.deadlift) {
    const bs = e1.bench / e1.squat, ds = e1.deadlift / e1.squat;
    const ev = `Bench is ${(bs * 100).toFixed(0)}% of squat, deadlift is ${(ds * 100).toFixed(0)}% of squat (your estimates: ${kg(e1.squat)} / ${kg(e1.bench)} / ${kg(e1.deadlift)}).`;
    if (bs < T.benchToSquat[0]) add({ id: 'balance-bench', area: 'balance', severity: 'medium', title: 'Bench is lagging behind your squat', because: [ev, 'A typical raw lifter benches about 60 to 75% of their squat.'], suggestion: 'Give bench more weekly work for a block: a second heavy exposure, paused work, and upper-back volume. It is usually the cheapest total gain.', action: { type: 'emphasis', lift: 'bench', label: 'Bring up bench' }, confidence: 'low' });
    else if (bs > T.benchToSquat[1]) add({ id: 'balance-squat', area: 'balance', severity: 'medium', title: 'Squat is lagging behind your bench', because: [ev], suggestion: 'Squat has the most room to grow: add a squat exposure and quad/glute volume for a block.', action: { type: 'emphasis', lift: 'squat', label: 'Bring up squat' }, confidence: 'low' });
    if (ds < T.deadliftToSquat[0]) add({ id: 'balance-deadlift', area: 'balance', severity: 'medium', title: 'Deadlift is low relative to your squat', because: [ev, 'A typical raw lifter pulls about 110 to 130% of their squat.'], suggestion: 'Bring the deadlift up: more volume off the floor, a tempo or pause variation, and posterior-chain accessories.', action: { type: 'emphasis', lift: 'deadlift', label: 'Bring up deadlift' }, confidence: 'low' });
    else if (ds > T.deadliftToSquat[1]) add({ id: 'balance-squat2', area: 'balance', severity: 'low', title: 'Your squat has room to catch your deadlift', because: [ev], suggestion: 'A squat emphasis block would likely pay off most.', action: { type: 'emphasis', lift: 'squat', label: 'Bring up squat' }, confidence: 'low' });
    if (!findings.some((f) => f.area === 'balance')) add({ id: 'balance-ok', area: 'balance', severity: 'good', title: 'Your three lifts are in proportion', because: [ev], suggestion: 'No lift is far behind. Keep progressing all three.', confidence: 'low' });
  }

  // ---- effort: planned vs actual RPE, and creep ----
  const pw = programmeWeeks(programme);
  const rpeByWeek = [];
  const biasBy = { squat: [], bench: [], deadlift: [] };
  pw.forEach(({ week }, i) => {
    const ds = [];
    for (const { s, e } of setsOf(week)) {
      const x = ex.get(e.exerciseId);
      if (!x?.lift || !s.completed || s.targetRpe == null || s.actualRpe == null || s.targetRpe > 10 || s.actualRpe > 10) continue;
      ds.push(s.actualRpe - s.targetRpe);
      biasBy[x.lift].push({ i, d: s.actualRpe - s.targetRpe });
    }
    if (ds.length >= 3) rpeByWeek.push({ i, d: mean(ds), n: ds.length });
  });
  const recentIdx = pw.length ? pw.length - 12 : 0;
  for (const lift of LIFTS) {
    const rows = biasBy[lift].filter((r) => r.i >= recentIdx);
    if (rows.length < T.minRpeSets) continue;
    const m = mean(rows.map((r) => r.d));
    const ev = `Across ${rows.length} recent ${lift} sets you reported ${m >= 0 ? '+' : ''}${m.toFixed(2)} RPE against the plan.`;
    if (m >= T.rpeHigh) add({ id: `effort-high-${lift}`, area: 'effort', severity: 'medium', title: `${cap(lift)} is costing more effort than planned`, because: [ev], suggestion: `Sets are landing harder than the coach intends, which is how fatigue stacks up. Slow the ramp, hold loads a week longer, and check sleep and food.`, action: { type: 'progression', value: 'conservative', label: 'Use a conservative ramp' }, confidence: 'medium' });
    else if (m <= T.rpeLow) add({ id: `effort-low-${lift}`, area: 'effort', severity: 'low', title: `${cap(lift)} loads look light`, because: [ev], suggestion: `You are finishing sets easier than planned, so there is room to load more. The generator will use this and nudge ${lift} loads up.`, confidence: 'medium' });
  }
  if (rpeByWeek.length >= 4) {
    const last6 = rpeByWeek.slice(-6);
    const t = trendOf(last6.map((r) => ({ week: addDays('2000-01-03', r.i * 7), e1rm: r.d })));
    if (t && t.slope >= T.rpeCreepPerWeek && t.n >= 4) add({ id: 'effort-creep', area: 'recovery', severity: 'medium', title: 'Effort is creeping up week on week', because: [`Your RPE against plan has risen about ${t.slope.toFixed(2)} a week over the last ${t.n} weeks with data.`], suggestion: 'That pattern usually means fatigue is accumulating. Plan an easier week soon rather than waiting for a bad session.', action: { type: 'focus', focus: 'deload', label: 'Plan a deload block' }, confidence: 'medium' });
  }

  // ---- adherence ----
  const weeksWith = pw.map((x, i) => ({ ...x, i, all: setsOf(x.week) })).filter((x) => x.all.some(({ s }) => s.completed));
  if (weeksWith.length >= 3) {
    const comp = (x) => x.all.filter(({ s }) => s.completed).length / x.all.length;
    let take = weeksWith.slice(-5);
    if (comp(take.at(-1)) < 0.8) take = take.slice(0, -1); // the newest week is probably still in progress
    take = take.slice(-4);
    if (take.length >= 3) {
      const rate = mean(take.map(comp));
      const dayRates = new Map();
      for (const x of take) for (const d of x.week.days) { const all = d.entries.flatMap((e) => e.sets); if (!all.length) continue; (dayRates.get(d.number) || dayRates.set(d.number, []).get(d.number)).push(all.filter((s) => s.completed).length / all.length); }
      const worst = [...dayRates].map(([n, r]) => ({ n, r: mean(r) })).sort((a, b) => a.r - b.r)[0];
      const ev = `You completed ${(rate * 100).toFixed(0)}% of planned sets over the last ${take.length} full weeks.`;
      if (rate < T.adherenceLow) add({ id: 'adherence-low', area: 'consistency', severity: rate < 0.7 ? 'high' : 'medium', title: 'Sessions are being missed', because: [ev, worst ? `Day ${worst.n} is skipped most (${(worst.r * 100).toFixed(0)}% done).` : ''].filter(Boolean),
        suggestion: 'A smaller plan you finish beats a bigger one you do not. Drop to three days and keep the heavy work; accessories are the first thing to trim.', action: { type: 'days', value: 3, label: 'Plan 3 days a week' }, confidence: 'high' });
      else if (rate >= T.adherenceGood) add({ id: 'adherence-good', area: 'consistency', severity: 'good', title: 'Very consistent training', because: [ev], suggestion: 'Consistency is your biggest asset. Protect it.', confidence: 'high' });
    }
  }

  // ---- volume and coverage (completed calendar weeks) ----
  const weekStarts = [];
  for (let i = 1; i <= T.volumeWeeks; i++) weekStarts.push(mondayOf(addDays(end, -7 * i)));
  const volRows = weekStarts.map((ws) => weeklyHardSets(win.concat(evs.filter((e) => e.date >= ws && e.date <= addDays(ws, 6) && e.date <= end && !win.includes(e))), catalogue, ws).muscles);
  const activeWeeks = volRows.filter((m) => Object.values(m).some((v) => v.sets > 0));
  if (activeWeeks.length >= 2) {
    const med = (mu) => median(activeWeeks.map((m) => m[mu].sets));
    const low = KEY_MUSCLES.filter((mu) => med(mu) < T.volumeLow).map((mu) => `${mu.replace('_', ' ')} ${round1(med(mu))}`);
    const high = Object.keys(volRows[0]).filter((mu) => med(mu) > T.volumeHigh).map((mu) => `${mu.replace('_', ' ')} ${round1(med(mu))}`);
    if (low.length) add({ id: 'volume-low', area: 'volume', severity: 'medium', title: 'Some big muscles get little work', because: [`Weekly hard sets (median of ${activeWeeks.length} recent weeks): ${low.join(', ')}.`, `Under about ${T.volumeLow} a week is closer to maintenance than growth.`], suggestion: 'If size or support strength matters, add a set or two for those muscles. If you are maintaining on purpose, ignore this.', confidence: 'medium' });
    if (high.length) add({ id: 'volume-high', area: 'volume', severity: 'low', title: 'Very high volume for some muscles', because: [`Weekly hard sets: ${high.join(', ')}.`], suggestion: 'Past about 20 hard sets a week the returns shrink and recovery suffers. Watch effort creep and trim if it shows.', confidence: 'low' });
    for (const [mu, rec] of Object.entries(SMALL_MUSCLES)) {
      const v = med(mu);
      if (v < 4) add({ id: `gap-${mu}`, area: 'volume', severity: 'low', title: `${cap(mu.replace('_', ' '))} are barely trained`, because: [`${round1(v)} hard ${round1(v) === 1 ? 'set' : 'sets'} a week.`], suggestion: `Two or three sets of ${rec.label} twice a week is cheap, rarely limits recovery, and covers a gap.`, action: { type: 'addExercise', exerciseId: rec.id, sets: 2, reps: [10, 15], rpe: 9, label: `Add ${rec.label}` }, confidence: 'medium' });
    }
  }

  // ---- heavy exposure ----
  for (const lift of LIFTS) {
    const ref = e1[lift];
    if (!ref) continue;
    const ids = idsFor(lift, true);
    const recent = win.filter((e) => ids.has(e.exerciseId) && e.date > addDays(end, -42));
    const heavy = recent.filter((e) => e.weightKg >= T.heavyPct * ref);
    const singles = win.filter((e) => ids.has(e.exerciseId) && e.weightKg >= T.singlePct * ref && e.reps <= 3);
    const lastSingle = singles.reduce((m, e) => (e.date > m ? e.date : m), '');
    if (recent.length >= 6 && heavy.length === 0) add({ id: `heavy-${lift}`, area: 'specificity', severity: 'medium', title: `No heavy ${lift} work lately`, because: [`None of ${recent.length} recent ${lift} sets reached ${Math.round(T.heavyPct * 100)}% of your e1RM (${kg(T.heavyPct * ref)}).`], suggestion: `Strength is skill at heavy loads. Put a top set at 85% or more back in, even if volume stays low.`, confidence: 'medium' });
    else if (lastSingle && daysBetween(lastSingle, end) > 7 * T.weeksSinceHeavy) add({ id: `single-${lift}`, area: 'specificity', severity: 'low', title: `${cap(lift)}: no 90%+ set for ${Math.round(daysBetween(lastSingle, end) / 7)} weeks`, because: [`Last set at 90% or more of e1RM was on ${lastSingle}.`], suggestion: 'If a meet is coming, rehearse heavy singles before it. For general training, a heavy single every few blocks keeps the skill sharp.', confidence: 'low' });
  }

  // ---- possible weak points from variation numbers ----
  const bestOf = (id) => { const s = weeklySeries(win, new Set([id]), since); return s.length ? Math.max(...s.map((p) => p.e1rm)) : null; };
  const comp = { bench: bestOf('comp_bench'), squatLow: bestOf('low_bar_squat'), dl: Math.max(bestOf('conventional_deadlift') ?? 0, bestOf('sumo_deadlift') ?? 0, bestOf('deadlift') ?? 0) || null };
  const pb = bestOf('paused_bench') ?? bestOf('long_pause_bench');
  if (comp.bench && pb && pb / comp.bench < T.pausedBenchRatio) add({ id: 'weak-chest', area: 'weakpoint', severity: 'low', title: 'Possible weak spot: off the chest', because: [`Paused bench estimates ${kg(pb)} against ${kg(comp.bench)} for the competition bench (${((pb / comp.bench) * 100).toFixed(0)}%).`], suggestion: 'A big gap suggests the pause (the bottom position) costs you. More paused and long-pause work, plus leg drive and setup cues, tends to close it.', action: { type: 'addExercise', exerciseId: 'long_pause_bench', sets: 3, reps: 3, rpe: 7, label: 'Add long-pause bench' }, confidence: 'low' });
  const tk = Math.max(bestOf('tempo_to_knee_deadlift') ?? 0, bestOf('tempo_to_knee_sumo_deadlift') ?? 0) || null;
  if (comp.dl && tk && tk / comp.dl < T.kneeDeadliftRatio) add({ id: 'weak-floor', area: 'weakpoint', severity: 'low', title: 'Possible weak spot: floor to knee', because: [`Tempo-to-knee deadlifts estimate ${kg(tk)} against ${kg(comp.dl)} for the full deadlift (${((tk / comp.dl) * 100).toFixed(0)}%).`], suggestion: 'Strength off the floor may be what limits your pull. Keep the tempo work and add a deficit or paused pull occasionally.', confidence: 'low' });
  const hb = bestOf('high_bar_squat');
  if (comp.squatLow && hb && hb / comp.squatLow > T.highBarRatio) add({ id: 'squat-style', area: 'weakpoint', severity: 'low', title: 'High bar squat is stronger than your low bar', because: [`High bar estimates ${kg(hb)} against ${kg(comp.squatLow)} low bar.`], suggestion: 'The low bar squat is probably still being learned. Keep technique work on it; the gap is expected to close.', confidence: 'low' });

  // ---- deload timing ----
  if (pw.length >= 6) {
    const totals = pw.map(({ week }) => setsOf(week).filter(({ s }) => s.completed).length);
    const idx = totals.map((t, i) => i).filter((i) => totals[i] > 0);
    const med = median(idx.map((i) => totals[i]));
    const lastLow = idx.filter((i) => totals[i] <= T.deloadDrop * med && i < pw.length - 1).at(-1);
    const since = lastLow == null ? idx.length : idx.at(-1) - lastLow;
    if (since >= T.deloadWeeksOverdue && !findings.some((f) => f.id === 'effort-creep')) add({ id: 'deload-due', area: 'recovery', severity: 'low', title: 'No easier week for a while', because: [`The last clearly lighter week was about ${since} weeks ago.`], suggestion: 'Not an emergency, but a planned lighter week every 6 to 8 weeks keeps progress steady. Consider ending the next block with one.', action: { type: 'deloadWeek', value: 'last', label: 'End the block with a deload' }, confidence: 'low' });
  }

  // ---- recurring technique cues ----
  const cueBlocks = new Map();
  for (const { block, week } of pw) for (const { s } of setsOf(week)) {
    const c = (s.coachComment || '').trim();
    if (c.length < 6 || c.length > 120) continue;
    const k = c.toLowerCase();
    (cueBlocks.get(k) || cueBlocks.set(k, { text: c, blocks: new Set() }).get(k)).blocks.add(block.number);
  }
  const cues = [...cueBlocks.values()].filter((c) => c.blocks.size >= 3).sort((a, b) => b.blocks.size - a.blocks.size).slice(0, 3);
  if (cues.length) add({ id: 'cues', area: 'technique', severity: 'low', title: 'Cues your coach keeps repeating', because: cues.map((c) => `"${c.text}" (in ${c.blocks.size} blocks)`), suggestion: 'If a cue shows up block after block it is not automatic yet. Rehearse it in your warm-up sets and film one set a week to check it.', confidence: 'high' });

  // ---- bodyweight ----
  const bw = (bodyweight || []).filter((p) => p && p.x > addDays(end, -56) && p.x <= end && p.y > 20);
  if (bw.length >= 6) {
    const series = bw.map((p) => ({ week: p.x, e1rm: p.y })).sort((a, b) => (a.week < b.week ? -1 : 1));
    const t = trendOf(series.map((p) => ({ week: p.week, e1rm: p.e1rm })));
    if (t && t.span >= 4) {
      const pctWk = t.slope / t.mean;
      const ev = `Bodyweight about ${kg(t.mean)}, ${t.slope >= 0 ? '+' : ''}${round1(convert(t.slope, 'kg', unit))} ${unit} a week over ${Math.round(t.span)} weeks.`;
      if (pctWk <= -T.bwLossPctPerWeek) add({ id: 'bw-fast-loss', area: 'bodyweight', severity: 'medium', title: 'Bodyweight is dropping fast', because: [ev], suggestion: 'Losing more than about 0.7% of bodyweight a week will cost strength. Slow the cut, or hold maintenance calories during the heavy weeks.', confidence: 'medium' });
      else if (Math.abs(pctWk) < 0.002) add({ id: 'bw-stable', area: 'bodyweight', severity: 'good', title: 'Bodyweight is steady', because: [ev], suggestion: 'Stable weight makes your strength numbers easy to read. Good.', confidence: 'medium' });
    }
  }

  if (win.length < 30) add({ id: 'data-thin', area: 'data', severity: 'low', title: 'Not much recent data', because: [`Only ${win.length} working sets in the last ${T.windowWeeks} weeks.`], suggestion: 'Rate your sets with an RPE when you log them; the more you log, the sharper this review gets.', confidence: 'high' });

  findings.sort((a, b) => SEV[b.severity] - SEV[a.severity]);
  const priorities = findings.filter((f) => f.severity !== 'good' && f.severity !== 'low').slice(0, 3);
  const notes = findings.filter((f) => f.severity === 'low');
  const strengths = findings.filter((f) => f.severity === 'good').slice(0, 3);
  const headline = priorities.length
    ? `Top priority: ${priorities[0].title.charAt(0).toLowerCase() + priorities[0].title.slice(1)}.${priorities[1] ? ` Then: ${priorities[1].title.charAt(0).toLowerCase() + priorities[1].title.slice(1)}.` : ''}${strengths[0] ? ` Keep doing: ${strengths[0].title.charAt(0).toLowerCase() + strengths[0].title.slice(1)}.` : ''}`
    : strengths.length ? `Nothing urgent. ${strengths[0].title}.` : 'Nothing stands out yet. Keep training and logging.';
  const apply = [];
  for (const f of [...priorities, ...notes]) if (f.action && !apply.some((a) => JSON.stringify(a.action) === JSON.stringify(f.action))) apply.push({ findingId: f.id, action: f.action });
  return { asOf: end, headline, priorities, strengths, notes, findings, apply };
}

/**
 * Add exercises the review suggested to a generated block: each goes on the day with the fewest entries
 * (preferring a day that trains the exercise's own lift, for variations), in every non-deload week.
 * Returns { block, rationale }. The input block is not mutated.
 */
export function applyExtras(block, extras, catalogue) {
  const out = structuredClone(block);
  const ex = new Map(catalogue.exercises.map((e) => [e.id, e]));
  const rationale = [];
  for (const x of extras || []) {
    const info = ex.get(x.exerciseId);
    if (!info) continue;
    const lo = Array.isArray(x.reps) ? x.reps[0] : x.reps, hi = Array.isArray(x.reps) ? x.reps[1] : x.reps;
    let placed = false;
    for (const week of out.weeks) {
      if (/deload/i.test(week.label)) continue;
      const days = week.days.filter((d) => d.entries.length < 7);
      if (!days.length) continue;
      const withLift = info.lift ? days.filter((d) => d.entries.some((e) => ex.get(e.exerciseId)?.lift === info.lift)) : [];
      const pool = withLift.length ? withLift : days;
      const day = [...pool].sort((a, b) => a.entries.length - b.entries.length || a.number - b.number)[0];
      if (day.entries.some((e) => e.exerciseId === x.exerciseId)) continue;
      day.entries.push({ exerciseId: x.exerciseId, name: info.name, rawName: info.name, supersetGroup: null, tempo: null,
        cues: [lo === hi ? '' : 'Find a load that reaches the target effort inside the rep range.'].filter(Boolean),
        sets: Array.from({ length: x.sets }, (_, i) => ({ index: i + 1, repsMin: lo, repsMax: hi, repsRaw: lo === hi ? String(lo) : `${lo}-${hi}`, targetRpe: x.rpe ?? null, load: null, loadRange: null,
          actualRpe: null, actualReps: null, actualLoad: null, coachComment: null, athleteComment: null, completed: false, source: { sheet: 'generated', row: 0, col: 0 }, warnings: [],
          gen: { slotId: `x-${x.exerciseId}`, kind: 'accessory', family: null, reps: lo, rpe: x.rpe ?? null, e1rmRef: null, k: null, week: week.number } })) });
      placed = true;
    }
    if (placed) rationale.push({ scope: 'slot', text: `Added ${info.name} (${x.sets} x ${lo === hi ? lo : lo + '-' + hi}) because of the coach's review.` });
  }
  return { block: out, rationale };
}
