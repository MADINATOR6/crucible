// Plate calibration: how far the loaded plates can be from their stamped weight.
// Calibrated competition discs must sit inside a published tolerance (IPF Technical Rules 2026 table of disc
// weights: face value with a maximum and a minimum). Gym plates carry no such guarantee. Pure functions.
import { convert } from '../core/units.js';

/** `tolerances` is { "<face kg>": { min, max } } (plates.json kg.calibration.tolerances). */
export function plateBand(valueKg, tolerances) {
  const t = tolerances?.[String(valueKg)];
  return t && Number.isFinite(t.min) && Number.isFinite(t.max) ? { min: t.min, max: t.max } : null;
}

/**
 * Plates-only weight of a loaded bar (both sides loaded identically) with its tolerance band.
 * @param {Array<{value:number, unit:string}>} side  one side, one entry per physical plate
 * @param {{ tolerances?: object, measured?: Record<string, number>, mode?: 'calibrated'|'gym' }} opts
 *   `measured` maps a plate's face value (as written in plates.json, in its own unit) to the weight the athlete
 *   actually weighed, in that same unit.
 * @returns {{ nominalKg, minKg, maxKg, bandKnown: boolean, measuredKg: number|null, measuredPlates: number }}
 */
export function platesTolerance(side, { tolerances = null, measured = {}, mode = 'calibrated' } = {}) {
  let nominal = 0, min = 0, max = 0, known = true, measuredTotal = 0, measuredCount = 0, allKnown = true;
  for (const p of side || []) {
    const kg = convert(p.value, p.unit, 'kg');
    nominal += kg;
    const band = mode === 'calibrated' && p.unit === 'kg' ? plateBand(p.value, tolerances) : null;
    if (band) { min += band.min; max += band.max; } else { min += kg; max += kg; known = false; }
    const m = Number(measured?.[String(p.value)]);
    if (Number.isFinite(m) && m > 0) { measuredTotal += convert(m, p.unit, 'kg'); measuredCount++; } else { measuredTotal += kg; allKnown = false; }
  }
  const r = (x) => Math.round(x * 1e6) / 1e6;
  return {
    nominalKg: r(2 * nominal), minKg: r(2 * min), maxKg: r(2 * max),
    bandKnown: known && (side || []).length > 0,
    measuredKg: measuredCount ? r(2 * measuredTotal) : null,
    measuredPlates: measuredCount,
    measuredComplete: measuredCount > 0 && allKnown,
  };
}
