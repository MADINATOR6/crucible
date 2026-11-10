// Exercise substitutions: which catalogue exercises can stand in for a planned one, and which exercise a planned
// entry resolves to once the athlete's swaps are applied. Pure: no DOM, no storage.

const WEIGHT = { primary: 1, secondary: 0.5 };

function muscleVector(exercise) {
  const v = new Map();
  for (const m of exercise.primary || []) v.set(m, WEIGHT.primary);
  for (const m of exercise.secondary || []) if (!v.has(m)) v.set(m, WEIGHT.secondary);
  return v;
}

// Cosine similarity of the two exercises' hard-set muscle weights (primary 1, secondary 0.5): 1 is the same muscles.
function similarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [m, w] of a) { na += w * w; dot += w * (b.get(m) || 0); }
  for (const w of b.values()) nb += w * w;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Below this, an exercise trains different muscles and is not offered as "similar". */
export const SIMILAR_MIN = 0.75;

/**
 * Catalogue exercises that could replace `exerciseId`, closest first:
 * [{ id, name, score, close }]. `close` is true for the same movement (the same `pattern`, or the same lift
 * family). Otherwise the muscle overlap must be at least SIMILAR_MIN, and a lift from another family is never
 * offered (a deadlift is not a stand-in for a squat, however many muscles they share). An unknown id gives [].
 */
export function substitutes(catalogue, exerciseId) {
  const all = Array.isArray(catalogue?.exercises) ? catalogue.exercises.filter((e) => e && typeof e.id === 'string') : [];
  const from = all.find((e) => e.id === exerciseId);
  if (!from) return [];
  const base = muscleVector(from);
  return all.filter((e) => e.id !== from.id).map((e) => {
    const close = (!!from.pattern && e.pattern === from.pattern) || (!!from.lift && e.lift === from.lift);
    return { id: e.id, name: e.name, score: Math.round(similarity(base, muscleVector(e)) * 100) / 100, close, otherLift: !!from.lift && !!e.lift && e.lift !== from.lift };
  }).filter((x) => x.close || (x.score >= SIMILAR_MIN && !x.otherLift)).map(({ otherLift, ...x }) => x)
    .sort((a, b) => Number(b.close) - Number(a.close) || b.score - a.score || a.name.localeCompare(b.name));
}

export const dayKey = (ref) => `${ref.blockNumber}:${ref.weekNumber}:${ref.dayNumber}`;
export const entryKey = (ref) => `${dayKey(ref)}:${ref.entryIndex}`;

/**
 * The exercise a planned entry resolves to.
 *   plannedId  the coach's exercise for the entry
 *   session    this planned session's swap for the entry ({ from, to, gen }), or null
 *   always     the athlete's standing swaps ({ [fromId]: toId })
 *   gen        the block's identity ('' for an imported block), so a swap never follows a replaced block
 *   known      (id) => boolean: is this a catalogue exercise
 * A session swap wins over a standing one, and a session swap back to the planned exercise switches a standing
 * swap off for that session. Anything stale (another exercise now sits there, an unknown target) is ignored.
 * Returns { id, swapped, scope: 'session' | 'always' | null }.
 */
export function resolveExercise({ plannedId, session = null, always = null, gen = '', known = () => true }) {
  const planned = { id: plannedId, swapped: false, scope: null };
  if (typeof plannedId !== 'string' || !plannedId) return planned;
  if (session && session.from === plannedId && (session.gen ?? '') === gen && (session.to === plannedId || known(session.to))) {
    return session.to === plannedId ? planned : { id: session.to, swapped: true, scope: 'session' };
  }
  const to = always && Object.hasOwn(always, plannedId) ? always[plannedId] : null;
  if (typeof to === 'string' && to !== plannedId && known(to)) return { id: to, swapped: true, scope: 'always' };
  return planned;
}
