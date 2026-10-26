// Estimated calories for a training session, from the 2024 Adult Compendium of Physical Activities (pacompendium.com):
// 02054 resistance training, 8-15 reps, 3.5 MET; 02052 squats and deadlifts, 5.0 MET; 02050 powerlifting, vigorous
// effort, 6.0 MET. Total kcal = MET × 3.5 ml O2/kg/min × kg ÷ 200 × minutes (about 5 kcal per litre of O2).
// Active kcal = total minus what the body burns at rest anyway. Resting burn uses ten Haaf & Weijs 2014 (PLOS One
// 9:e108460), the most precise equation for athletes in a 2023 meta-analysis (Sports Med, PMID 37632665): the
// fat-free-mass form when body fat is known, else the weight/height/age/sex form. Estimates only: without heart rate,
// expect roughly ±30% for lifting sessions.

/** MET range for a session's mean working-set RPE. */
// ponytail: RPE → MET bands are a heuristic over the three Compendium codes; replace with heart rate if ever available.
export function metRange(meanRpe) {
  if (meanRpe == null) return [3.5, 6.0];
  return meanRpe >= 7.5 ? [5.0, 6.0] : [3.5, 5.0];
}

/**
 * Resting kcal per day (ten Haaf & Weijs 2014): from fat-free mass when body fat % is given, otherwise from weight,
 * height, age and sex. Null when neither set of inputs is complete.
 */
export function restingKcal({ weightKg, heightCm, age, sex, bodyFatPct = null }) {
  if (!(weightKg > 0)) return null;
  if (bodyFatPct > 0 && bodyFatPct < 70) return 22.771 * weightKg * (1 - bodyFatPct / 100) + 484.264;
  if (!(heightCm > 0 && age > 0) || (sex !== 'male' && sex !== 'female')) return null;
  return 11.936 * weightKg + 587.728 * (heightCm / 100) - 8.129 * age + (sex === 'male' ? 191.027 : 0) + 29.279;
}

const GAP_CAP = 15 * 60000; // ponytail: a longer pause (phone down, app closed) counts as 15 minutes

/** Minutes trained, from the times sets were logged: the gaps between them plus one typical gap for the first set. */
export function sessionMinutes(timestamps) {
  const t = timestamps.map((x) => Date.parse(x)).filter(Number.isFinite).sort((a, b) => a - b);
  if (t.length < 2) return null;
  const gaps = t.slice(1).map((x, i) => Math.min(x - t[i], GAP_CAP));
  const typical = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  return (gaps.reduce((a, b) => a + b, 0) + typical) / 60000;
}

const localDate = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * Estimate for one session. `sets` are its logged sets ({ createdAt, rpe, isWarmup }); only sets logged on the session's
 * own date count, so a backfilled workout (typed in later) gets no estimate. Returns { minutes, total: [lo, hi],
 * active: [lo, hi] | null } in kcal, or null when the time or bodyweight is unknown.
 */
export function sessionCalories({ date, sets, weightKg, heightCm = null, age = null, sex = null, bodyFatPct = null }) {
  const live = sets.filter((s) => s.createdAt && localDate(s.createdAt) === date);
  const minutes = sessionMinutes(live.map((s) => s.createdAt));
  if (!minutes || !(weightKg > 0)) return null;
  const rpes = live.filter((s) => !s.isWarmup && Number.isFinite(s.rpe)).map((s) => s.rpe);
  const [lo, hi] = metRange(rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null);
  const kcal = (met) => (met * 3.5 * weightKg / 200) * minutes;
  const rest = restingKcal({ weightKg, heightCm, age, sex, bodyFatPct });
  const active = rest == null ? null : [lo, hi].map((m) => Math.max(0, kcal(m) - (rest / 1440) * minutes));
  return { minutes, total: [kcal(lo), kcal(hi)], active };
}

/** Bodyweight (kg) on a date: the latest weigh-in on or before it, else the first one after. */
export function weightOn(points, date) {
  const sorted = [...points].sort((a, b) => (a.x < b.x ? -1 : 1));
  return (sorted.filter((p) => p.x <= date).at(-1) ?? sorted[0])?.y ?? null;
}
