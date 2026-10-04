import { convert, isUnit } from '../core/units.js';

const TOLERANCE = 0.005;
const DEFAULT_SCHEME = [
  { pct: 0, reps: 10, label: 'Bar' },
  { pct: 0.4, reps: 5 },
  { pct: 0.6, reps: 3 },
  { pct: 0.75, reps: 2 },
  { pct: 0.9, reps: 1 },
];

function weightValue(weight, unit, positive = false) {
  if (!weight || !Number.isFinite(weight.value) ||
      (positive ? weight.value <= 0 : weight.value < 0)) {
    throw new RangeError('weight must be finite and non-negative (plates positive)');
  }
  return convert(weight.value, weight.unit, unit);
}

function equal(a, b) {
  return Math.abs(a - b) <= TOLERANCE + Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}

// Fewer discs first, then more of the heaviest available discs.
function better(a, b) {
  if (a.count !== b.count) return a.count < b.count;
  for (let i = 0; i < a.counts.length; i++) {
    if (a.counts[i] !== b.counts[i]) return a.counts[i] > b.counts[i];
  }
  return false;
}

function search({ target, bar, collar, collars, plates } = {}) {
  if (!target || !Number.isFinite(target.value) || !isUnit(target.unit)) {
    throw new RangeError('target must be a finite weight in kg or lb');
  }
  if (!Array.isArray(plates)) {
    throw new RangeError('plates must be an array of at most 12 sizes');
  }
  const unit = target.unit;
  let base = weightValue(bar, unit);
  let mixed = bar.unit !== unit;
  if (collars !== false && collar) {
    const value = weightValue(collar.weight, unit);
    if (!Number.isSafeInteger(collar.perSide) || collar.perSide < 0) {
      throw new RangeError('collar perSide must be a non-negative integer');
    }
    base += 2 * value * collar.perSide;
    mixed ||= value > 0 && collar.perSide > 0 && collar.weight.unit !== unit;
  }
  const sizes = plates.map(plate => {
    const value = weightValue(plate, unit, true);
    if (!Number.isSafeInteger(plate.count) || plate.count < 0) {
      throw new RangeError('plate count must be a non-negative integer');
    }
    return { plate, value, cents: Math.round(value * 100), available: Math.floor(plate.count / 2) };
  }).sort((a, b) => b.value - a.value);
  if (new Set(sizes.map(size => size.value)).size > 12) {
    throw new RangeError('plates must contain at most 12 distinct sizes');
  }
  const cap = sizes.reduce((sum, size) => sum + size.cents * size.available, 0);
  if (!Number.isFinite(base) || !Number.isSafeInteger(cap) ||
      !Number.isFinite(base + 2 * sizes.reduce((sum, size) => sum + size.value * size.available, 0))) {
    throw new RangeError('load exceeds numeric range');
  }
  let states = [{ count: 0, counts: [], sum: 0 }];
  for (const size of sizes) {
    const next = new Map();
    for (const state of states) {
      for (let n = 0; n <= size.available; n++) {
        const candidate = {
          count: state.count + n,
          counts: [...state.counts, n],
          sum: state.sum + n * size.value,
        };
        const key = Math.round(candidate.sum * 100);
        const bucket = next.get(key) || [];
        // Converted weights can share a cent bucket but differ by more than the
        // total-load tolerance. Keep them until their physical sums agree.
        const index = bucket.findIndex(other => Math.abs(other.sum - candidate.sum) <=
          Number.EPSILON * Math.max(1, other.sum, candidate.sum) * 8);
        if (index < 0) bucket.push(candidate);
        else if (better(candidate, bucket[index])) bucket[index] = candidate;
        next.set(key, bucket);
      }
    }
    states = [...next.values()].flat();
  }
  // The grid selects combinations only; physical totals always use unrounded conversions.
  const loads = states.map(state => ({ ...state, total: base + 2 * state.sum }));
  return { target, unit, base, mixed, sizes, loads };
}

function loading(context, state) {
  if (!state) return null;
  return {
    loadedTotal: { value: state.total, unit: context.unit },
    perSide: context.sizes.flatMap((size, i) => state.counts[i]
      ? [{ plate: structuredClone(size.plate), count: state.counts[i] }] : []),
  };
}

function result(context, target) {
  let below = null;
  let above = null;
  let exact = null;
  for (const state of context.loads) {
    if (equal(state.total, target.value) && (!exact || better(state, exact))) exact = state;
    if (state.total <= target.value && (!below || state.total > below.total ||
        (state.total === below.total && better(state, below)))) below = state;
    if (state.total >= target.value && (!above || state.total < above.total ||
        (state.total === above.total && better(state, above)))) above = state;
  }
  if (exact) below = above = exact;
  const chosen = exact || (!below ? above : !above ? below :
    target.value - below.total <= above.total - target.value + 1e-12 ? below : above);
  const chosenLoading = loading(context, chosen);
  const belowBar = !exact && target.value < context.base;
  return {
    target: structuredClone(target),
    loadable: !belowBar,
    exact: Boolean(exact),
    reason: belowBar ? 'below-bar' : exact ? null : 'unreachable',
    mixedUnits: context.mixed || chosenLoading.perSide.some(item => item.plate.unit !== context.unit),
    ...chosenLoading,
    difference: exact ? 0 : chosen.total - target.value,
    below: loading(context, below),
    above: loading(context, above),
  };
}

/** Find the exact or nearest loading. Plate counts in the inventory include both sides. */
export function loadBar(options) {
  const context = search(options);
  return result(context, context.target);
}

/** Convert plate labels to the requested display unit without rounding fractional plate sizes. */
export function perSideText(perSide, unit) {
  if (!isUnit(unit) || !Array.isArray(perSide)) throw new RangeError('invalid per-side display');
  if (!perSide.length) return 'Bar only';
  return `${perSide.map(({ plate, count }) =>
    `${count} × ${Number(convert(plate.value, plate.unit, unit).toFixed(6))}`).join(', ')} each side`;
}

/** requested is the unsnapped {value, unit}; pct: 0 requests bar plus collars. */
export function warmupLadder({ top, scheme = DEFAULT_SCHEME, ...options } = {}) {
  const context = search({ ...options, target: top });
  if (!Array.isArray(scheme)) throw new RangeError('scheme must be an array');
  if (top.value < context.base) return [];
  const steps = [];
  for (const step of scheme) {
    if (!step || !Number.isFinite(step.pct) || step.pct < 0 ||
        !Number.isSafeInteger(step.reps) || step.reps < 0) {
      throw new RangeError('scheme needs non-negative percentages and integer reps');
    }
    const requested = { value: step.pct === 0 ? context.base : step.pct * top.value, unit: top.unit };
    if (!Number.isFinite(requested.value)) throw new RangeError('warm-up exceeds numeric range');
    const snapped = result(context, requested);
    const value = snapped.loadedTotal.value;
    if (value >= top.value || equal(value, top.value) ||
        (steps.length && (value <= steps.at(-1).weight.value || equal(value, steps.at(-1).weight.value)))) continue;
    steps.push({ weight: snapped.loadedTotal, reps: step.reps, perSide: snapped.perSide,
      text: perSideText(snapped.perSide, top.unit), pct: step.pct, requested });
  }
  return steps;
}
