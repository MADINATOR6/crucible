import { estimate1RM } from './e1rm.js';
import { workingSets, sortEvents } from './sets.js';

export function detectPRs(events) {
  const bests = new Map();
  const records = [];
  for (const event of sortEvents(workingSets(events))) {
    if (typeof event.exerciseId !== 'string' || !event.exerciseId) continue;
    if (!bests.has(event.exerciseId)) bests.set(event.exerciseId, new Map());
    const best = bests.get(event.exerciseId);
    const candidates = [
      ['e1rm', 'e1rm', estimate1RM(event.weightKg, event.reps)],
      ['single', 'single', event.reps === 1 ? event.weightKg : null],
      ['repsAtWeight', `reps:${Math.round(event.weightKg * 100)}`, event.reps],
    ];
    for (const [type, key, value] of candidates) {
      if (value === null) continue;
      const previousBest = best.get(key);
      if (previousBest !== undefined && value - previousBest > (type === 'e1rm' ? 1e-9 : 0)) {
        const { date, exerciseId, weightKg, reps, order } = event;
        records.push({ date, exerciseId, type, value, weightKg, reps, order, previousBest });
      }
      best.set(key, previousBest === undefined ? value : Math.max(value, previousBest));
    }
  }
  return records;
}
