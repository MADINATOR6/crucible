// RPE chart: %1RM for a number of reps at a given RPE (reps in reserve = 10 - RPE).
// Values are the widely used RPE chart (as printed in the athlete's coaching workbook). It is an average
// across lifters and lifts, so treat results as a starting point, never as exact.
//
// Structure of the chart: the percentage for `reps` at `rpe` equals the percentage for
// `reps + (10 - rpe)` reps taken to failure (RPE 10). Half RPE steps sit midway between neighbours.

// BASE[n] = %1RM for n reps at RPE 10 (n = 1..16). Index 0 is unused.
const BASE = [null, 100, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 70.7, 68.0, 65.3, 62.6, 59.9, 57.3];

export const CHART_SOURCE = 'RPE chart from the coaching workbook (%1RM by reps and RPE). Approximate; individual lifters differ.';
export const RPE_MIN = 6;
export const RPE_MAX = 10;
export const REPS_MAX = 12;

/** Fraction of 1RM (0..1) for `reps` (1..12) at `rpe` (6..10 in half steps), or null outside the chart. */
export function pctOfE1rm(reps, rpe) {
  if (!Number.isInteger(reps) || reps < 1 || reps > REPS_MAX) return null;
  if (!Number.isFinite(rpe) || rpe < RPE_MIN || rpe > RPE_MAX || !Number.isInteger(rpe * 2)) return null;
  const n = reps + (10 - rpe); // may end in .5
  const lo = Math.floor(n), hi = Math.ceil(n);
  if (hi >= BASE.length) return null;
  const pct = lo === hi ? BASE[lo] : (BASE[lo] + BASE[hi]) / 2;
  return Math.round(pct * 10) / 1000; // chart values are printed to 0.1%
}

/** Load (kg, unrounded) a lifter with this 1RM should use for `reps` at `rpe`; null outside the chart. */
export function loadFor(e1rmKg, reps, rpe) {
  const p = pctOfE1rm(reps, rpe);
  return p == null || !(e1rmKg > 0) ? null : e1rmKg * p;
}

/** 1RM implied by a set of `reps` at `rpe` with `loadKg`; null outside the chart. */
export function e1rmFrom(loadKg, reps, rpe) {
  const p = pctOfE1rm(reps, rpe);
  return p == null || !(loadKg > 0) ? null : loadKg / p;
}
