// Meet attempt suggestions. A suggestion, not advice: the athlete and coach decide.
// Competition loads go up in 2.5 kg steps and each attempt must be at least 2.5 kg above the last.

export const DEFAULT_PCTS = Object.freeze({ opener: 0.91, second: 0.97, third: 1 });

/** Round to the nearest multiple of `step` (ties go up), avoiding binary artefacts. */
export function roundToStep(value, step = 2.5) {
  const n = Math.round(Math.round((value / step) * 1e9) / 1e9);
  return Math.round(n * step * 1e6) / 1e6;
}

/**
 * @param {number} projectedKg  projected best (kg) for the day
 * @returns {{ opener: number, second: number, third: number } | null}
 */
export function planAttempts(projectedKg, { pcts = DEFAULT_PCTS, step = 2.5 } = {}) {
  if (!Number.isFinite(projectedKg) || projectedKg <= 0 || !(step > 0)) return null;
  const opener = roundToStep(projectedKg * pcts.opener, step);
  const second = Math.max(roundToStep(projectedKg * pcts.second, step), opener + step);
  const third = Math.max(roundToStep(projectedKg * pcts.third, step), second + step);
  return { opener, second, third };
}
