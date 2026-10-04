export function rpeDeltas(programme) {
  const perSet = [];
  for (const block of programme?.blocks ?? []) {
    for (const week of block?.weeks ?? []) {
      for (const day of week?.days ?? []) {
        for (const entry of day?.entries ?? []) {
          if (typeof entry?.exerciseId !== 'string' || !entry.exerciseId) continue;
          for (const set of entry.sets ?? []) {
            if (!Number.isFinite(set?.targetRpe) || !Number.isFinite(set?.actualRpe) || set.targetRpe > 10 || set.actualRpe > 10) continue;
            perSet.push({ blockNumber: block.number, weekNumber: week.number, dayNumber: day.number,
              exerciseId: entry.exerciseId, setIndex: set.index, target: set.targetRpe,
              actual: set.actualRpe, delta: set.actualRpe - set.targetRpe });
          }
        }
      }
    }
  }
  perSet.sort((a, b) => a.blockNumber - b.blockNumber || a.weekNumber - b.weekNumber || a.dayNumber - b.dayNumber
    || (a.exerciseId < b.exerciseId ? -1 : a.exerciseId > b.exerciseId ? 1 : 0) || a.setIndex - b.setIndex);
  const grouped = new Map();
  for (const set of perSet) {
    const group = grouped.get(set.exerciseId) ?? { sets: 0, sum: 0 };
    group.sets++;
    group.sum += set.delta;
    grouped.set(set.exerciseId, group);
  }
  const perExercise = Object.fromEntries([...grouped].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([id, group]) => [id, { sets: group.sets, meanDelta: Math.round(group.sum / group.sets * 100) / 100 }]));
  return { perSet, perExercise };
}
