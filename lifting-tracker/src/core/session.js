export function sessionProgress(day, ref, isDone) {
  let done = 0, total = 0;
  day.entries.forEach((entry, entryIndex) => entry.sets.forEach((set, setIndex) => {
    total++;
    if (isDone({ ...ref, entryIndex, setIndex })) done++;
  }));
  return { done, total };
}

export function nextSession(programme, isDone) {
  const ordered = (items) => [...items].sort((a, b) => a.number - b.number);
  let last = null;
  for (const block of ordered(programme?.blocks || [])) {
    for (const week of ordered(block.weeks)) {
      for (const day of ordered(week.days)) {
        last = { blockNumber: block.number, weekNumber: week.number, dayNumber: day.number };
        const { done, total } = sessionProgress(day, last, isDone);
        if (done < total) return last;
      }
    }
  }
  return last;
}

export function plannedValues(set) {
  const weight = set.load || (set.loadRange ? { value: set.loadRange.min, unit: set.loadRange.unit } : null);
  if (!weight || typeof set.repsMin !== 'number') return null;
  return { weight, reps: set.repsMin, rpe: set.targetRpe ?? null };
}
