import { mondayOf, addDays } from './weeks.js';

export function estimateDates({ startDate, weeks, dayWeekdays = { 1: 1, 2: 2, 3: 4, 4: 5 } }) {
  if (mondayOf(startDate) !== startDate) throw new RangeError('startDate must be a Monday');
  if (!Array.isArray(weeks) || weeks.some(week => !Number.isSafeInteger(week) || week < 1)) throw new RangeError('weeks must be positive integers');
  if (!dayWeekdays || typeof dayWeekdays !== 'object' || Array.isArray(dayWeekdays)) throw new RangeError('invalid weekday map');
  const days = Object.entries(dayWeekdays).sort((a, b) => Number(a[0]) - Number(b[0]));
  for (const [day, weekday] of days) {
    if (!/^[1-9]\d*$/.test(day) || !Number.isSafeInteger(Number(day)) || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw new RangeError('day must be positive and weekday must be 1..7');
  }
  const result = new Map();
  for (const week of [...new Set(weeks)].sort((a, b) => a - b)) {
    for (const [day, weekday] of days) result.set(`${week}:${day}`, addDays(startDate, 7 * (week - 1) + weekday - 1));
  }
  return result;
}
