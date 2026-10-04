import { estimate1RM } from './e1rm.js';
import { workingSets, sortEvents } from './sets.js';

export function runningBests(events, catalogue, { basis = 'e1rm' } = {}) {
  if (basis !== 'e1rm' && basis !== 'single') throw new RangeError('basis must be e1rm or single');
  const exercises = new Map(catalogue.exercises.map(exercise => [exercise.id, exercise]));
  const best = { squat: null, bench: null, deadlift: null };
  const rows = [];
  for (const event of sortEvents(workingSets(events))) {
    const exercise = exercises.get(event.exerciseId);
    if (!exercise?.competition || !Object.hasOwn(best, exercise.lift)) continue;
    const value = basis === 'single' ? (event.reps === 1 ? event.weightKg : null) : estimate1RM(event.weightKg, event.reps);
    if (value !== null) best[exercise.lift] = Math.max(best[exercise.lift] ?? value, value);
    const row = { date: event.date, ...best, total: Object.values(best).every(value => value !== null) ? best.squat + best.bench + best.deadlift : null };
    if (rows.at(-1)?.date === event.date) rows[rows.length - 1] = row;
    else rows.push(row);
  }
  return rows;
}
