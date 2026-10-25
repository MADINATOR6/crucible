import { workingSets, sortEvents } from './sets.js';
import { mondayOf, addDays, daysBetween } from './weeks.js';

export function weeklyHardSets(events, catalogue, weekStart) {
  if (mondayOf(weekStart) !== weekStart) throw new RangeError('weekStart must be a Monday');
  const end = addDays(weekStart, 6);
  const muscles = Object.fromEntries([...catalogue.muscles].sort().map(muscle => [muscle, { sets: 0, contributors: [] }]));
  const exercises = new Map(catalogue.exercises.map(exercise => [exercise.id, exercise]));
  const unknown = new Set();
  // Narrow to the week first: sorting a whole training history for one week's counts would be wasted work.
  const inWeek = (events ?? []).filter((event) => event && event.date >= weekStart && event.date <= end);
  for (const event of sortEvents(workingSets(inWeek))) {
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

export function recoveryLoad(events, catalogue, asOf, { days = 7, factor = 0.25 } = {}) {
  if (!Number.isSafeInteger(days) || days < 1) throw new RangeError('days must be a positive integer');
  if (!Number.isFinite(factor) || factor < 0) throw new RangeError('factor must be non-negative');
  const start = addDays(asOf, -(days - 1));
  const muscles = Object.fromEntries([...catalogue.muscles].sort().map(muscle => [muscle, { sets: 0, contributors: [] }]));
  const exercises = new Map(catalogue.exercises.map(exercise => [exercise.id, exercise]));
  const unknown = new Set();
  const inRange = (events ?? []).filter(event => event && event.date >= start && event.date <= asOf);
  for (const event of sortEvents(workingSets(inRange))) {
    const exercise = exercises.get(event.exerciseId);
    if (!exercise) { if (typeof event.exerciseId === 'string') unknown.add(event.exerciseId); continue; }
    const decay = Math.exp(-factor * daysBetween(event.date, asOf));
    for (const role of ['primary', 'secondary']) {
      for (const muscle of exercise[role] ?? []) {
        const bucket = muscles[muscle];
        if (!bucket) continue;
        const contribution = catalogue.weights[role] * decay;
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
  return { asOf, days, factor, muscles, unknownExerciseIds: [...unknown].sort() };
}
