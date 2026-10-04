import { isUnit, toKg } from './units.js';
import { addDays } from './weeks.js';

// Missing/non-finite weights are bad set data; unknown units are API errors.
function setWeight(weight) {
  if (weight == null) return null;
  if (!isUnit(weight.unit)) throw new RangeError('unit must be "kg" or "lb"');
  return Number.isFinite(weight.value) && weight.value > 0 ? toKg(weight) : null;
}

export function fromLoggedSet(loggedSet, session) {
  if (!loggedSet || !session) return null;
  const date = addDays(session.date, 0);
  const weightKg = setWeight(loggedSet.weight);
  if (weightKg === null || !Number.isInteger(loggedSet.reps) || loggedSet.reps < 1) return null;
  return { date, exerciseId: loggedSet.exerciseId, weightKg, reps: loggedSet.reps,
    rpe: loggedSet.rpe ?? null, isWarmup: loggedSet.isWarmup, order: loggedSet.order, source: 'logged' };
}

export function fromProgrammeSets(programme, dateFor) {
  const events = [];
  // Traversal order preserves entry/set order within a session, even when indices restart.
  let order = 0;
  for (const block of programme?.blocks ?? []) {
    for (const week of block?.weeks ?? []) {
      for (const day of week?.days ?? []) {
        const date = dateFor({ blockNumber: block.number, weekNumber: week.number, dayNumber: day.number });
        if (date === null) continue;
        addDays(date, 0);
        for (const entry of day?.entries ?? []) {
          for (const set of entry?.sets ?? []) {
            const setOrder = order++;
            if (set?.completed !== true) continue;
            const reps = set.actualReps ?? (set.repsMin === set.repsMax ? set.repsMin : null);
            const weightKg = setWeight(set.actualLoad ?? set.load);
            if (!Number.isInteger(reps) || reps < 1 || weightKg === null) continue;
            events.push({ date, exerciseId: entry.exerciseId, weightKg, reps, rpe: set.actualRpe ?? null,
              isWarmup: false, order: setOrder, source: 'programme' });
          }
        }
      }
    }
  }
  return sortEvents(events);
}

export function workingSets(events) {
  return (events ?? []).filter(event => event?.isWarmup === false && Number.isInteger(event.reps)
    && event.reps >= 1 && Number.isFinite(event.weightKg) && event.weightKg > 0);
}

export function sortEvents(events) {
  const indexed = (events ?? []).filter(event => event != null).map((event, index) => {
    addDays(event.date, 0);
    return { event, index };
  });
  return indexed.sort((a, b) => (a.event.date < b.event.date ? -1 : a.event.date > b.event.date ? 1 : 0)
    || ((Number.isFinite(a.event.order) ? a.event.order : 0) - (Number.isFinite(b.event.order) ? b.event.order : 0))
    || a.index - b.index).map(({ event }) => event);
}
