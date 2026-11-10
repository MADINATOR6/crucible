export function sessionProgress(day, ref, isDone) {
  let done = 0, total = 0;
  day.entries.forEach((entry, entryIndex) => entry.sets.forEach((set, setIndex) => {
    total++;
    if (isDone({ ...ref, entryIndex, setIndex })) done++;
  }));
  return { done, total };
}

// The next session to train. The anchor is the last day with any work done or that the athlete skipped.
//  1. A day earlier in the anchor's own week that was never started (and not skipped) comes first: training
//     the week's days out of order postpones a day, it does not drop it.
//  2. Otherwise the first unfinished, unskipped day from the anchor on; a partly done latest day stays next so
//     it can be finished.
// Gaps in older weeks and blocks are history, not the next session. `isSkipped(dayRef)` is optional.
export function nextSession(programme, isDone, isSkipped = () => false) {
  const ordered = (items) => [...items].sort((a, b) => a.number - b.number);
  const days = [];
  let last = null; // the programme's final day, even an empty one: the answer when everything is done
  for (const block of ordered(programme?.blocks || [])) {
    for (const week of ordered(block.weeks)) {
      for (const day of ordered(week.days)) {
        last = { blockNumber: block.number, weekNumber: week.number, dayNumber: day.number };
        const { done, total } = sessionProgress(day, last, isDone);
        if (total) days.push({ ref: last, done, total, skipped: !!isSkipped(last) });
      }
    }
  }
  const anchorAt = days.findLastIndex((d) => d.done > 0 || d.skipped);
  const anchor = days[anchorAt];
  if (anchor) {
    const postponed = days.slice(0, anchorAt).find((d) => d.ref.blockNumber === anchor.ref.blockNumber
      && d.ref.weekNumber === anchor.ref.weekNumber && d.done === 0 && !d.skipped);
    if (postponed) return postponed.ref;
  }
  return days.slice(Math.max(0, anchorAt)).find((d) => d.done < d.total && !d.skipped)?.ref ?? last;
}

export function plannedValues(set) {
  const weight = set.load || (set.loadRange ? { value: set.loadRange.min, unit: set.loadRange.unit } : null);
  if (!weight || typeof set.repsMin !== 'number') return null;
  return { weight, reps: set.repsMin, rpe: set.targetRpe ?? null };
}
