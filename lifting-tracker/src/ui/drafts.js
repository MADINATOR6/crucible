// Include the exact target and source so a recovered form cannot attach to a replaced plan.
export function setDraftToken(programme, ref, plannedRef, loggedRecord = null) {
  if (!ref || !plannedRef) return null;
  const block = programme?.blocks?.find((b) => b.number === ref.blockNumber);
  const day = block?.weeks.find((w) => w.number === ref.weekNumber)?.days.find((d) => d.number === ref.dayNumber);
  const entry = day?.entries[plannedRef.entryIndex];
  const set = entry?.sets[plannedRef.setIndex];
  if (!set) return null;
  return JSON.stringify([programme.importedAt ?? null, programme.source ?? null, block.number, block.name, block.generated ?? null,
    ref.weekNumber, ref.dayNumber, entry.exerciseId, entry.name, plannedRef, set, loggedRecord]);
}
