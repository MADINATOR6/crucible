// How much to eat for a goal. Sources:
// - Rate of change: lose 0.5–1% of bodyweight a week to keep muscle (Helms, Aragon & Fitschen 2014, JISSN 11:20);
//   gain 0.25–0.5% a week for novice and intermediate lifters (Iraki et al. 2019, Sports 7:154).
// - Energy per kg of bodyweight change (Hall 2008, Int J Obes 32:573): the lean share of a small change is
//   10.4 / (10.4 + fat mass kg) (Forbes), at 7.6 MJ/kg lean and 39.5 MJ/kg fat. A lean lifter's kg is nearer 6,000
//   kcal than the 7,700 (3,500 kcal/lb) rule, which only fits people with over ~30 kg of fat. Without a body fat %
//   the rule is used. The measured maintenance below corrects how far the activity estimates are off for you.
// - Protein 1.6–2.2 g/kg (Morton et al. 2018, BJSM 52:376; Iraki 2019); when losing with a known body fat %,
//   2.3–3.1 g per kg of lean mass (Helms 2014). Fat 0.5–1.5 g/kg when maintaining or gaining (Iraki 2019) and 15–30%
//   of calories when losing (Helms 2014). Carbohydrate is the rest; at least 3 g/kg fuels training (Iraki 2019).
import { theilSen, dayNum } from './progress.js';

export const KCAL_PER_KG = 7700;
const MJ = 239.006; // kcal per MJ

/** kcal per kg of bodyweight change for this body (Hall 2008); the 7,700 rule without a body fat %. */
export function kcalPerKg({ weightKg, bodyFatPct = null }) {
  if (!(weightKg > 0 && bodyFatPct > 0 && bodyFatPct < 70)) return KCAL_PER_KG;
  const lean = 10.4 / (10.4 + weightKg * bodyFatPct / 100);
  return (lean * 7.6 + (1 - lean) * 39.5) * MJ;
}
/** Weekly change as % of bodyweight for each goal and pace. */
export const PACES = {
  lose: { gentle: -0.25, steady: -0.5, fast: -1.0 },
  maintain: { hold: 0 },
  gain: { lean: 0.25, faster: 0.5 },
};
export const PACE_LABELS = { gentle: 'Gentle', steady: 'Steady', fast: 'Fast', hold: 'Hold', lean: 'Lean', faster: 'Faster' };

/**
 * Maintenance calories. `estimated`: the mean of recent daily energy estimates. `measured`: from what you ate and how
 * your weight moved over the last 28 days (intake − trend × 7,700 kcal/kg), once there are at least 14 days of intake
 * and 8 weigh-ins spanning 14 days. `days` [{ date, kcal }], `intake` [{ date, kcal }], `weights` [{ x: date, y: kg }].
 */
export function maintenance({ days, intake, weights, today, perKg = KCAL_PER_KG }) {
  const recent = days.filter((d) => d.kcal > 0);
  const estimated = recent.length ? recent.reduce((a, d) => a + d.kcal, 0) / recent.length : null;
  const from = dayNum(today) - 27, inWindow = (iso) => dayNum(iso) >= from && dayNum(iso) <= dayNum(today);
  // One intake figure per date (the latest entry wins), so repeated weigh-ins never count as extra days.
  const eaten = [...new Map(intake.filter((d) => inWindow(d.date) && d.kcal > 0).map((d) => [d.date, d])).values()];
  const w = weights.filter((p) => inWindow(p.x)).map((p) => ({ t: dayNum(p.x), y: p.y })).sort((a, b) => a.t - b.t);
  let measured = null;
  if (eaten.length >= 14 && new Set(w.map((p) => p.t)).size >= 8 && w.at(-1).t - w[0].t >= 14) {
    const slope = theilSen(w)?.slope; // kg per day, robust to single odd weigh-ins
    if (slope != null) measured = { kcal: eaten.reduce((a, d) => a + d.kcal, 0) / eaten.length - slope * perKg, days: eaten.length, kgPerWeek: slope * 7 };
  }
  return { estimated, estimatedDays: recent.length, measured, kcal: measured?.kcal ?? estimated };
}

/**
 * Daily target for a goal. Returns { kcal, change (kcal vs maintenance), kgPerWeek, floored, protein: { g, lo, hi },
 * fat: { g, lo, hi }, carbs: { g, perKg }, lowCarb }. Never below resting burn or 1,500 kcal (men) / 1,200 (women).
 */
export function target({ maintenanceKcal, weightKg, goal, pace, restKcal = null, sex = null, bodyFatPct = null }) {
  if (!(maintenanceKcal > 0 && weightKg > 0) || !PACES[goal]) return null;
  const pct = Object.hasOwn(PACES[goal], pace) ? PACES[goal][pace] : Object.values(PACES[goal])[0];
  const kgPerWeek = (weightKg * pct) / 100, perKg = kcalPerKg({ weightKg, bodyFatPct });
  const floor = Math.max(restKcal || 0, sex === 'female' ? 1200 : 1500);
  const wanted = maintenanceKcal + (kgPerWeek * perKg) / 7;
  const kcal = Math.max(wanted, floor);
  const lean = bodyFatPct ? weightKg * (1 - bodyFatPct / 100) : null;
  const protein = goal === 'lose' && lean ? { lo: 2.3 * lean, hi: 3.1 * lean } : { lo: 1.6 * weightKg, hi: 2.2 * weightKg };
  protein.g = (protein.lo + protein.hi) / 2;
  const fat = goal === 'lose' ? { lo: (0.15 * kcal) / 9, hi: (0.3 * kcal) / 9, g: (0.25 * kcal) / 9 } : { lo: 0.5 * weightKg, hi: 1.5 * weightKg, g: 1.0 * weightKg };
  // When protein and fat alone pass the target, trim fat then protein towards the bottom of their ranges.
  const over = () => protein.g * 4 + fat.g * 9 - kcal;
  if (over() > 0) fat.g = Math.max(fat.lo, fat.g - over() / 9);
  if (over() > 0) protein.g = Math.max(protein.lo, protein.g - over() / 4);
  const carbG = Math.max(0, (kcal - protein.g * 4 - fat.g * 9) / 4);
  return { kcal, change: kcal - maintenanceKcal, kgPerWeek: ((kcal - maintenanceKcal) * 7) / perKg, perKg, floored: kcal > wanted,
    protein, fat, carbs: { g: carbG, perKg: carbG / weightKg }, lowCarb: carbG / weightKg < 3 };
}
