// End date = same date next month, moved forward to the next working day.
// Dates are ISO strings (YYYY-MM-DD) handled in UTC, so the viewer's time zone can never shift a day.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./holidays.js'));
  else root.EndDateCalc = factory(root.EndDateHolidays);
})(typeof self !== 'undefined' ? self : this, function (holidays) {
  'use strict';

  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY_MS = 86400000;

  // Returns a UTC Date, or null for anything that is not a real calendar date.
  function parseDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const date = new Date(0);
    date.setUTCFullYear(y, mo - 1, d);
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
  }

  const toIso = date => date.toISOString().slice(0, 10);
  const yearOf = iso => Number(iso.slice(0, 4));

  // Same date next month. A date the next month lacks uses that month's last day.
  // Years outside 1900-2999 are refused: a date box reports 0002, 0020, 0202 while a year is being typed.
  function oneMonthAfter(iso) {
    const date = parseDate(iso);
    if (!date) return null;
    const y = date.getUTCFullYear(), mo = date.getUTCMonth(), d = date.getUTCDate();
    if (y < 1900 || y > 2999) return null;
    const last = new Date(Date.UTC(y, mo + 2, 0)).getUTCDate();
    const next = new Date(Date.UTC(y, mo + 1, Math.min(d, last)));
    return { iso: toIso(next), clamped: d > last };
  }

  // Keeps only entries with a real date and text for a name, one per date.
  function sanitizeCustom(list) {
    const seen = new Set();
    const out = [];
    for (const item of Array.isArray(list) ? list : []) {
      if (!item || !parseDate(item.date) || seen.has(item.date)) continue;
      seen.add(item.date);
      out.push({ date: item.date, name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Added day' });
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  function calculate(proceed, options) {
    const opts = options || {};
    const start = oneMonthAfter(proceed);
    if (!start) return { error: 'Enter a valid proceed date.' };

    const enabled = new Set(opts.areas || []);
    const nonWorking = new Map();
    const add = (date, name) => nonWorking.set(date, nonWorking.has(date) ? `${nonWorking.get(date)}, ${name}` : name);
    for (const year of Object.values(holidays.YEARS)) for (const [date, , name] of year.days) add(date, name);
    for (const [code, area] of Object.entries(holidays.AREAS)) {
      if (enabled.has(code)) for (const [date, , name] of area.days) add(date, name);
    }
    for (const { date, name } of sanitizeCustom(opts.custom)) add(date, name);

    const skipped = [];
    const years = new Set();
    let date = parseDate(start.iso);
    for (;;) {
      const iso = toIso(date);
      years.add(yearOf(iso));
      const weekday = date.getUTCDay();
      const reasons = [];
      if (weekday === 0 || weekday === 6) reasons.push(WEEKDAYS[weekday]);
      if (nonWorking.has(iso)) reasons.push(nonWorking.get(iso));
      if (!reasons.length) break;
      skipped.push({ date: iso, reason: reasons.join(', ') });
      date = new Date(date.getTime() + DAY_MS);
    }
    const end = toIso(date);

    const unconfirmedYears = [...years].filter(y => !holidays.YEARS[y]).sort();
    const pending = [...years].sort()
      .filter(y => holidays.YEARS[y] && holidays.YEARS[y].pending.length)
      .map(y => ({ year: y, names: holidays.YEARS[y].pending }));
    const areaNotes = [];
    for (const [code, area] of Object.entries(holidays.AREAS)) {
      if (enabled.has(code)) continue;
      for (const [d, , name] of area.days) if (d === end) areaNotes.push({ code, label: area.label, name, source: area.source });
    }

    return { proceed, nominal: start.iso, clamped: start.clamped, end, skipped, unconfirmedYears, pending, areaNotes };
  }

  return { parseDate, oneMonthAfter, sanitizeCustom, calculate, WEEKDAYS };
});
