import { workingSets, sortEvents } from './sets.js';
import { mondayOf, addDays } from './weeks.js';

export function weeklyHardSets(events, catalogue, weekStart) {
  if (mondayOf(weekStart) !== weekStart) throw new RangeError('weekStart must be a Monday');
  const end = addDays(weekStart, 6);
  const muscles = Object.fromEntries([...catalogue.muscles].sort().map(muscle => [muscle, { sets: 0, contributors: [] }]));
  const exercises = new Map(catalogue.exercises.map(exercise => [exercise.id, exercise]));
  const unknown = new Set();
  for (const event of sortEvents(workingSets(events))) {
    if (event.date < weekStart || event.date > end) continue;
    const exercise = exercises.get(event.exerciseId);
    if (!exercise) { if (typeof event.exerciseId === 'string') unknown.add(event.exerciseId); continue; }
    for (const role of ['primary', 'secondary']) {
      for (const muscle of exercise[role] ?? []) {
        const bucket = muscles[muscle];
        if (!bucket) continue;
        const contribution = catalogue.weights[role];
        bucket.sets += contribution;
        let contributor = bucket.contributors.find(item => item.exerciseId === exercise.id);
        if (!contributor) { contributor = { exerciseId: exercise.id, sets: 0, contribution: 0 }; bucket.contributors.push(contributor); }
        contributor.sets++;
        contributor.contribution += contribution;
      }
    }
  }
  for (const bucket of Object.values(muscles)) {
    bucket.contributors.sort((a, b) => b.contribution - a.contribution || (a.exerciseId < b.exerciseId ? -1 : a.exerciseId > b.exerciseId ? 1 : 0));
  }
  return { weekStart, muscles, unknownExerciseIds: [...unknown].sort() };
}
