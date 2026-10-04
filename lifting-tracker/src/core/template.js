// Template learner: reads the shape of one past block (days, slots, schemes, relative loads) from the
// athlete's programme so the generator can build a new block in the same shape. Pure; rules in GENERATOR.md.
import { pctSmooth } from './rpe-chart.js';
import { isUnit, toKg } from './units.js';

const FAMILIES = ['squat', 'bench', 'deadlift'];
const K_MIN = 0.5;
const K_MAX = 1.05;
const MAX_COACH_COMMENTS = 3;
const MAX_COMMENT_CHARS = 160;

const list = x => (Array.isArray(x) ? x : []);
const isObj = x => x !== null && typeof x === 'object';
const objects = x => list(x).filter(isObj);

// A planned set's weight is actualLoad ?? load; unusable weights and unknown units give null, never a throw.
function setLoadKg(set) {
  const w = set.actualLoad ?? set.load;
  return isObj(w) && isUnit(w.unit) && Number.isFinite(w.value) && w.value > 0 ? toKg(w) : null;
}

// number, [min, max] (ranges stay ranges), or null when the set carries no usable reps.
function repsOf(set) {
  const { repsMin: lo, repsMax: hi } = set;
  if (Number.isFinite(lo) && Number.isFinite(hi)) return lo === hi ? lo : [Math.min(lo, hi), Math.max(lo, hi)];
  if (Number.isFinite(lo)) return lo;
  if (Number.isFinite(hi)) return hi;
  return Number.isFinite(set.actualReps) ? set.actualReps : null;
}

const hasCompleted = week => objects(week.days).some(d => objects(d.entries).some(e => objects(e.sets).some(s => s.completed === true)));

function chooseBlock(programme, blockNumber) {
  const blocks = objects(programme?.blocks)
    .filter(b => Number.isFinite(b.number) && objects(b.weeks).length > 0)
    .sort((a, b) => b.number - a.number); // highest number first; stable for duplicates
  if (blockNumber != null) return blocks.find(b => b.number === blockNumber) ?? null;
  return blocks.find(b => objects(b.weeks).filter(hasCompleted).length >= 2) ?? blocks[0] ?? null;
}

function cuesOf(entry) {
  const comments = [];
  for (const set of objects(entry.sets)) {
    if (typeof set.coachComment !== 'string' || comments.length >= MAX_COACH_COMMENTS) continue;
    const text = Array.from(set.coachComment.trim()).slice(0, MAX_COMMENT_CHARS).join('');
    if (text !== '' && !comments.includes(text)) comments.push(text);
  }
  return [...list(entry.cues).filter(c => typeof c === 'string'), ...comments];
}

function schemeOf(role, sets, repsList, loads) {
  if (role === 'accessory') return 'accessory';
  if (repsList.every(r => r === 1)) return 'singles';
  const first = loads[0], last = loads[loads.length - 1];
  return sets.length > 1 && first !== null && last !== null && first > last ? 'top-backoff' : 'straight';
}

function kOf(role, family, loadKg, reps, rpe, referenceE1rm) {
  const reference = isObj(referenceE1rm) ? referenceE1rm[family] : null;
  if (role === 'accessory' || family === null || loadKg === null || reps === null || !(Number.isFinite(reference) && reference > 0)) return null;
  const pct = pctSmooth(Array.isArray(reps) ? reps[0] : reps, rpe === null || rpe === 11 ? 7 : rpe);
  return pct === null ? null : Math.min(K_MAX, Math.max(K_MIN, loadKg / (reference * pct)));
}

function slotOf(entry, dayNumber, position, byId, referenceE1rm) {
  const meta = byId.get(entry.exerciseId);
  const role = meta?.lift && meta.competition === true ? 'main' : meta?.lift ? 'variation' : 'accessory';
  const family = FAMILIES.includes(meta?.lift) ? meta.lift : null;
  const sets = objects(entry.sets);
  const repsList = sets.map(repsOf);
  const loads = sets.map(setLoadKg);
  const reps = repsList[0];
  const rpe = Number.isFinite(sets[0].targetRpe) ? sets[0].targetRpe : null;
  const loadKg = loads[0];
  return {
    slotId: `d${dayNumber}s${position}`,
    exerciseId: typeof entry.exerciseId === 'string' ? entry.exerciseId : null,
    name: String(entry.name ?? entry.rawName ?? ''),
    supersetGroup: entry.supersetGroup ?? null,
    tempo: entry.tempo ?? null,
    cues: cuesOf(entry),
    role, family,
    scheme: schemeOf(role, sets, repsList, loads),
    sets: sets.length,
    reps, rpe, loadKg,
    k: kOf(role, family, loadKg, reps, rpe, referenceE1rm),
  };
}

/**
 * learnTemplate({ programme, catalogue, referenceE1rm: { squat, bench, deadlift }, blockNumber = null }) -> Template | null.
 * `referenceE1rm` is the athlete's e1RM per lift when that block was run (the caller computes it); without it every `k` is null.
 */
export function learnTemplate({ programme, catalogue, referenceE1rm = null, blockNumber = null } = {}) {
  if (!catalogue || !Array.isArray(catalogue.exercises)) throw new RangeError('catalogue with an exercises list is required');
  if (blockNumber != null && !Number.isFinite(blockNumber)) throw new RangeError('blockNumber must be a finite number');
  const block = chooseBlock(programme, blockNumber);
  if (block === null) return null;
  const byId = new Map(catalogue.exercises.filter(x => x && typeof x.id === 'string').map(x => [x.id, x]));
  const weeks = objects(block.weeks);
  const week = weeks[1] ?? weeks[0];
  const days = [];
  objects(week.days).forEach((day, index) => {
    const dayNumber = Number.isFinite(day.number) ? day.number : index + 1;
    const slots = [];
    for (const entry of objects(day.entries)) {
      if (objects(entry.sets).length === 0) continue; // nothing to learn from an entry without sets
      slots.push(slotOf(entry, dayNumber, slots.length + 1, byId, referenceE1rm));
    }
    if (slots.length > 0) days.push({ number: dayNumber, slots });
  });
  return {
    fromBlock: block.number,
    blockName: typeof block.name === 'string' ? block.name : '',
    weeksInBlock: weeks.length,
    daysPerWeek: days.length,
    days,
  };
}
