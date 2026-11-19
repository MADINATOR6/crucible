const test = require('node:test');
const assert = require('node:assert/strict');
const { YEARS, AREAS } = require('../holidays.js');
const { parseDate } = require('../calc.js');

const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const allDays = [
  ...Object.values(YEARS).flatMap(y => y.days),
  ...Object.values(AREAS).flatMap(a => a.days),
];

test('every date is real and falls on the weekday printed in its proclamation', () => {
  for (const [date, weekday, name] of allDays) {
    const d = parseDate(date);
    assert.ok(d, `${name}: ${date}`);
    assert.equal(NAMES[d.getUTCDay()], weekday, `${name}: ${date}`);
  }
});

test('each list has the number of days its proclamations declare', () => {
  assert.equal(YEARS[2026].days.length, 20); // 10 regular + 2 Eid + 4 special + 4 additional
  assert.equal(YEARS[2027].days.length, 18); // 10 regular + 4 special + 4 additional, Eid not yet declared
});

test('each date sits under its own year, once', () => {
  for (const [year, data] of Object.entries(YEARS)) {
    const dates = data.days.map(d => d[0]);
    assert.equal(new Set(dates).size, dates.length, year);
    for (const date of dates) assert.equal(date.slice(0, 4), year);
  }
});

test('the special working day is not listed as non-working', () => {
  const dates = allDays.map(d => d[0]);
  assert.ok(!dates.includes('2026-02-25'));
  assert.ok(!dates.includes('2027-02-25'));
});
