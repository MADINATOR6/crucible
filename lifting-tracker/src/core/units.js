// Weight units. Weights are stored as entered ({ value, unit }); all maths is done in kg.
// 1 lb is exactly 0.45359237 kg (international avoirdupois pound).

export const LB_TO_KG = 0.45359237;
export const UNITS = Object.freeze(['kg', 'lb']);

export function isUnit(u) { return u === 'kg' || u === 'lb'; }

/** Convert a plain number between units. Throws on a non-finite value or unknown unit. */
export function convert(value, from, to) {
  if (!Number.isFinite(value)) throw new RangeError('weight must be a finite number');
  if (!isUnit(from) || !isUnit(to)) throw new RangeError('unit must be "kg" or "lb"');
  if (from === to) return value;
  return from === 'lb' ? value * LB_TO_KG : value / LB_TO_KG;
}

export function toKg(weight) { return convert(weight.value, weight.unit, 'kg'); }

/** Round to one decimal place for display, avoiding binary artefacts (1.005 style). */
export function round1(x) { return Math.round((x + Number.EPSILON) * 10) / 10; }

/** Format a weight in the unit the user chose, to 1 decimal place, trimming a trailing ".0". */
export function formatWeight(weight, displayUnit) {
  const v = round1(convert(weight.value, weight.unit, displayUnit));
  return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)} ${displayUnit}`;
}
