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
  const minutes = (gaps.reduce((a, b) => a + b, 0) + typical) / 60000;
  return minutes >= 5 ? minutes : null; // sets typed in one after another were not timed live
}

const localDate = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * Estimate for one session. `sets` are its logged sets ({ createdAt, rpe, isWarmup }); timing starts with the first set
 * logged on the session's own date, so a backfilled workout (typed in on a later day) gets no estimate. Returns { minutes, total: [lo, hi],
 * active: [lo, hi] | null } in kcal, or null when the time or bodyweight is unknown.
 */
export function sessionCalories({ date, sets, weightKg, heightCm = null, age = null, sex = null, bodyFatPct = null }) {
  // Live sets start on the session's own date; a session running past midnight keeps sets up to 6 h after its first.
  const onDay = sets.map((s) => Date.parse(s.createdAt)).filter((t, i) => Number.isFinite(t) && localDate(sets[i].createdAt) === date);
  const start = onDay.length ? Math.min(...onDay) : null;
  const live = start == null ? [] : sets.filter((s) => { const t = Date.parse(s.createdAt); return t >= start && t <= start + 6 * 3600000; });
  const minutes = sessionMinutes(live.map((s) => s.createdAt));
  if (!minutes || !(weightKg > 0)) return null;
  const rpes = live.filter((s) => !s.isWarmup && Number.isFinite(s.rpe)).map((s) => s.rpe);
  const [lo, hi] = metRange(rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null);
  const kcal = (met) => (met * 3.5 * weightKg / 200) * minutes;
  const rest = restingKcal({ weightKg, heightCm, age, sex, bodyFatPct });
  const active = rest == null ? null : [lo, hi].map((m) => Math.max(0, kcal(m) - (rest / 1440) * minutes));
  return { minutes, total: [kcal(lo), kcal(hi)], active };
}

/**
 * Activities you can log for a day, each one 2024 Compendium code (pacompendium.com). Speeds converted from mph.
 * Work levels map a nursing shift onto the occupation codes: 11600 light standing tasks, 11650 patient care, 11610
 * standing work that names nursing patient care.
 */
export const ACTIVITIES = {
  'walk-slow': { group: 'Walk & run', label: 'Walking, slow 3.2–3.9 km/h', met: 2.8, code: '17152' },
  'walk': { group: 'Walk & run', label: 'Walking, 4.5–5.5 km/h', met: 3.8, code: '17190' },
  'walk-brisk': { group: 'Walk & run', label: 'Walking, brisk 5.6–6.3 km/h', met: 4.8, code: '17200' },
  'walk-incline': { group: 'Walk & run', label: 'Uphill or incline walking, 6–10%', met: 7.0, code: '17035' },
  'jog-walk': { group: 'Walk & run', label: 'Jog/walk mix', met: 6.0, code: '12010' },
  'jog': { group: 'Walk & run', label: 'Jogging, easy pace', met: 7.5, code: '12020' },
  'run-8': { group: 'Walk & run', label: 'Running, 8 km/h', met: 8.5, code: '12030' },
  'run-10': { group: 'Walk & run', label: 'Running, 10 km/h', met: 9.3, code: '12050' },
  'run-12': { group: 'Walk & run', label: 'Running, 12 km/h', met: 11.8, code: '12080' },
  'hike': { group: 'Walk & run', label: 'Hiking, normal pace', met: 5.3, code: '17082' },
  'hike-pack': { group: 'Walk & run', label: 'Hiking with a day pack', met: 7.8, code: '17012' },
  'bike-light': { group: 'Gym cardio', label: 'Exercise bike, light (~50 W)', met: 4.0, code: '01214' },
  'bike': { group: 'Gym cardio', label: 'Exercise bike, moderate (90–100 W)', met: 6.0, code: '01220' },
  'bike-hard': { group: 'Gym cardio', label: 'Exercise bike, hard (150–200 W)', met: 10.3, code: '01232' },
  'spin': { group: 'Gym cardio', label: 'Spin class', met: 9.0, code: '01270' },
  'elliptical': { group: 'Gym cardio', label: 'Elliptical, moderate', met: 5.0, code: '02048' },
  'elliptical-hard': { group: 'Gym cardio', label: 'Elliptical, hard', met: 9.0, code: '02049' },
  'row': { group: 'Gym cardio', label: 'Rowing machine, moderate (<100 W)', met: 5.0, code: '02071' },
  'row-hard': { group: 'Gym cardio', label: 'Rowing machine, hard (100–150 W)', met: 7.5, code: '02072' },
  'stairs': { group: 'Gym cardio', label: 'Stair climber', met: 9.3, code: '02065' },
  'cycle-easy': { group: 'Outdoors & sports', label: 'Cycling, leisurely under 16 km/h', met: 4.0, code: '01010' },
  'cycle': { group: 'Outdoors & sports', label: 'Cycling, 16–19 km/h', met: 6.8, code: '01020' },
  'cycle-fast': { group: 'Outdoors & sports', label: 'Cycling, 19–22 km/h', met: 8.0, code: '01030' },
  'swim-easy': { group: 'Outdoors & sports', label: 'Swimming, leisurely', met: 6.0, code: '18310' },
  'swim-hard': { group: 'Outdoors & sports', label: 'Swimming laps, fast', met: 9.8, code: '18230' },
  'basketball': { group: 'Outdoors & sports', label: 'Basketball', met: 7.5, code: '15055' },
  'soccer': { group: 'Outdoors & sports', label: 'Soccer, casual', met: 7.0, code: '15610' },
  'netball': { group: 'Outdoors & sports', label: 'Netball', met: 7.0, code: '15477' },
  'tennis': { group: 'Outdoors & sports', label: 'Tennis', met: 6.8, code: '15675' },
  'badminton': { group: 'Outdoors & sports', label: 'Badminton, social', met: 5.5, code: '15030' },
  // Whole-shift averages, not the peak task: accelerometry puts ward nurses' active time at about 27% of a shift
  // (Chappel et al. 2023, J Act Sedentary Sleep Behav 2:27), so a typical shift ≈ 0.27 × 3.5 + 0.73 × 1.8 ≈ 2.3 METs.
  'shift-light': { group: 'Work', label: 'Nursing shift, quiet (mostly charting and meds)', met: 1.8, code: '11600' },
  'shift': { group: 'Work', label: 'Nursing shift, typical (rounds and patient care)', met: 2.3, code: '11650' },
  'shift-tough': { group: 'Work', label: 'Nursing shift, busy (on your feet, transfers)', met: 3.3, code: '11610' },
};

/** Untracked waking time, by lifestyle: Compendium 07026 sitting (1.3), 07022/07041 sitting and standing, fidgeting
 * (1.5), 11600 standing tasks, light effort (1.8). */
export const EVERYDAY = { sitting: { met: 1.3, label: 'Mostly sitting' }, mixed: { met: 1.5, label: 'Mixed' }, feet: { met: 1.8, label: 'On my feet' } };
const TEF = 0.10; // digestion: about 10% of a day's energy

/**
 * A day's estimated energy: sleep at resting burn, each logged activity (lifting sessions with their MET range, cardio
 * and work at their Compendium MET), the rest of the waking day at light everyday movement, plus digestion.
 * `lifting` is [{ minutes, total: [lo, hi] }] from sessionCalories; `activities` are [{ kind, minutes }].
 * Returns null without a resting burn (height, birth year and sex, or body fat %) or a bodyweight.
 */
export function dayEnergy({ weightKg, restKcal, sleepHours = 8, everyday = 'mixed', lifting = [], activities = [] }) {
  const everydayMet = (EVERYDAY[everyday] ?? EVERYDAY.mixed).met;
  if (!(weightKg > 0 && restKcal > 0)) return null;
  const perMin = (met) => (met * 3.5 * weightKg) / 200;
  const restMin = restKcal / 1440;
  const parts = [];
  for (const l of lifting) parts.push({ group: 'Lifting', label: 'Lifting session', minutes: l.minutes, kcal: l.total });
  for (const a of activities) {
    const def = ACTIVITIES[a.kind];
    if (def && a.minutes > 0) parts.push({ id: a.id, group: def.group, label: def.label, minutes: a.minutes, kcal: [perMin(def.met) * a.minutes, perMin(def.met) * a.minutes] });
  }
  const sleepMin = Math.min(1440, sleepHours * 60);
  const logged = parts.reduce((a, p) => a + p.minutes, 0);
  const awake = Math.max(0, 1440 - sleepMin - logged);
  const overMinutes = Math.max(0, sleepMin + logged - 1440); // more than 24 h: usually a duplicate entry, shown to the user
  const sum = (i) => restMin * sleepMin + perMin(everydayMet) * awake + parts.reduce((a, p) => a + p.kcal[i], 0);
  const total = [0, 1].map((i) => sum(i) / (1 - TEF));
  return { overMinutes, sleep: { minutes: sleepMin, kcal: restMin * sleepMin }, everyday: { minutes: awake, kcal: perMin(everydayMet) * awake, met: everydayMet }, parts, digestion: total.map((t) => t * TEF), total };
}

/** Bodyweight (kg) on a date: the latest weigh-in on or before it, else the first one after. */
export function weightOn(points, date) {
  const sorted = [...points].sort((a, b) => (a.x < b.x ? -1 : 1));
  return (sorted.filter((p) => p.x <= date).at(-1) ?? sorted[0])?.y ?? null;
}
