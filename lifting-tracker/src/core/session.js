export function sessionProgress(day, ref, isDone) {
  let done = 0, total = 0;
  day.entries.forEach((entry, entryIndex) => entry.sets.forEach((set, setIndex) => {
    total++;
    if (isDone({ ...ref, entryIndex, setIndex })) done++;
  }));
  return { done, total };
}

// The first unfinished day at or after the last day with any work done. Skipped sets in older blocks are history,
// not the next session; a partly done latest day stays next so it can be finished.
export function nextSession(programme, isDone) {
  const ordered = (items) => [...items].sort((a, b) => a.number - b.number);
  const days = [];
  let last = null; // the programme's final day, even an empty one: the answer when everything is done
  for (const block of ordered(programme?.blocks || [])) {
    for (const week of ordered(block.weeks)) {
      for (const day of ordered(week.days)) {
        last = { blockNumber: block.number, weekNumber: week.number, dayNumber: day.number };
        const { done, total } = sessionProgress(day, last, isDone);
        if (total) days.push({ ref: last, done, total });
      }
    }
  }
  const lastTouched = days.findLastIndex((d) => d.done > 0);
  return days.slice(Math.max(0, lastTouched)).find((d) => d.done < d.total)?.ref ?? last;
}

export function plannedValues(set) {
  const weight = set.load || (set.loadRange ? { value: set.loadRange.min, unit: set.loadRange.unit } : null);
  if (!weight || typeof set.repsMin !== 'number') return null;
  return { weight, reps: set.repsMin, rpe: set.targetRpe ?? null };
}
