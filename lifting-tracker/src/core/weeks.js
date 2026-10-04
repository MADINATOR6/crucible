const DAY_MS = 86400000;

function utcDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('date must be YYYY-MM-DD');
  const [year, month, day] = date.split('-').map(Number);
  // setUTCFullYear avoids Date.UTC's special handling of years 00..99.
  const result = new Date(Date.UTC(2000, month - 1, day));
  result.setUTCFullYear(year);
  if (result.toISOString().slice(0, 10) !== date) throw new RangeError('invalid calendar date');
  return result;
}

export function addDays(date, n) {
  const result = utcDate(date);
  if (!Number.isSafeInteger(n)) throw new RangeError('days must be an integer');
  result.setUTCDate(result.getUTCDate() + n);
  if (!Number.isFinite(result.getTime()) || result.getUTCFullYear() < 0 || result.getUTCFullYear() > 9999) throw new RangeError('date outside YYYY-MM-DD range');
  return result.toISOString().slice(0, 10);
}

export function mondayOf(date) {
  return addDays(date, -((utcDate(date).getUTCDay() + 6) % 7));
}

export function weekKey(date) { return mondayOf(date); }

export function daysBetween(a, b) { return (utcDate(b) - utcDate(a)) / DAY_MS; }
