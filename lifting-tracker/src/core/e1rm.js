import { convert, round1 } from './units.js';

export function estimate1RM(weightKg, reps) {
  if (!Number.isFinite(weightKg) || weightKg <= 0 || !Number.isInteger(reps) || reps < 1 || reps > 12) return null;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

export function roundForDisplay(kg, unit) {
  return round1(convert(kg, 'kg', unit));
}
