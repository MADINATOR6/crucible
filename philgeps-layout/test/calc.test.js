const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate, oneMonthAfter, parseDate, sanitizeCustom } = require('../calc.js');

const end = (date, options) => calculate(date, options).end;

test('a plain working day keeps the same date next month', () => {
  const r = calculate('2026-06-16');
  assert.equal(r.nominal, '2026-07-16');
  assert.equal(r.end, '2026-07-16');
  assert.deepEqual(r.skipped, []);
  assert.equal(r.clamped, false);
});

test('a Sunday moves to Monday', () => {
  assert.equal(end('2026-01-15'), '2026-02-16');
});

test('a Saturday moves to Monday', () => {
  assert.equal(end('2026-01-14'), '2026-02-16');
});

test('a proclaimed weekday holiday moves to the next day', () => {
  const r = calculate('2026-01-17');
  assert.equal(r.end, '2026-02-18');
  assert.deepEqual(r.skipped, [{ date: '2026-02-17', reason: 'Chinese New Year' }]);
});

test('the special working day stays a working day', () => {
  assert.equal(end('2026-01-25'), '2026-02-25');
  assert.equal(end('2027-01-25'), '2027-02-25');
});

test('Holy Week chains into the weekend', () => {
  const r = calculate('2026-03-02');
  assert.equal(r.end, '2026-04-06');
  assert.deepEqual(r.skipped.map(s => s.date), ['2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05']);
  assert.equal(r.skipped[2].reason, 'Saturday, Black Saturday');
});

test('a month without that date uses its last day, then moves on', () => {
  const r = calculate('2026-01-31');
  assert.equal(r.nominal, '2026-02-28');
  assert.equal(r.clamped, true);
  assert.equal(r.end, '2026-03-02');
});

test('a leap year keeps 29 February', () => {
  assert.deepEqual(oneMonthAfter('2028-01-31'), { iso: '2028-02-29', clamped: true });
  assert.deepEqual(oneMonthAfter('2028-01-29'), { iso: '2028-02-29', clamped: false });
  assert.deepEqual(oneMonthAfter('2027-01-29'), { iso: '2027-02-28', clamped: true });
});

test('31 August goes to 30 September, 31 December to 31 January', () => {
  assert.deepEqual(oneMonthAfter('2026-08-31'), { iso: '2026-09-30', clamped: true });
  assert.deepEqual(oneMonthAfter('2026-12-31'), { iso: '2027-01-31', clamped: false });
});

test('a skip that runs over New Year uses both years', () => {
  const r = calculate('2026-11-30');
  assert.equal(r.nominal, '2026-12-30');
  assert.equal(r.end, '2027-01-04');
  assert.deepEqual(r.skipped.map(s => s.date), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
});

test('NCR days count only when NCR is on, and off shows a note', () => {
  const off = calculate('2026-10-16');
  assert.equal(off.end, '2026-11-16');
  assert.equal(off.areaNotes.length, 1);
  assert.equal(off.areaNotes[0].source, 'Proclamation No. 1447, s. 2026');

  const on = calculate('2026-10-16', { areas: ['NCR'] });
  assert.equal(on.end, '2026-11-19');
  assert.deepEqual(on.areaNotes, []);
});

test('an area note appears only when the end date is that day', () => {
  assert.deepEqual(calculate('2026-10-19').areaNotes, []);
});

test('an added day is skipped and chains into the next holiday', () => {
  const r = calculate('2026-02-19', { custom: [{ date: '2026-03-19', name: 'Declared later' }] });
  assert.equal(r.end, '2026-03-23');
  assert.deepEqual(r.skipped[0], { date: '2026-03-19', reason: 'Declared later' });
  assert.equal(r.skipped[1].reason, "Eid'l Fitr");
});

test('an added day on a holiday shows both names', () => {
  const r = calculate('2026-01-17', { custom: [{ date: '2026-02-17', name: 'Also local' }] });
  assert.equal(r.skipped[0].reason, 'Chinese New Year, Also local');
});

test('a year with no loaded list is flagged, and an added day does not clear the flag', () => {
  assert.deepEqual(calculate('2027-11-10').unconfirmedYears, []);
  assert.deepEqual(calculate('2027-12-15').unconfirmedYears, [2028]); // lands on 15 Jan 2028
  assert.deepEqual(calculate('2028-03-15').unconfirmedYears, [2028]);
  assert.deepEqual(calculate('2025-11-10').unconfirmedYears, [2025]);
  assert.deepEqual(calculate('2025-12-10').unconfirmedYears, []); // only the end date's year matters
  const added = calculate('2028-03-15', { custom: [{ date: '2028-04-14', name: 'Added' }] });
  assert.deepEqual(added.unconfirmedYears, [2028]);
});

test('a skip into a year with no list is flagged', () => {
  const r = calculate('2027-11-30');
  assert.equal(r.end, '2028-01-03');
  assert.deepEqual(r.unconfirmedYears, [2028]);
});

test('2027 warns that the Eid dates are not proclaimed; 2026 does not', () => {
  assert.deepEqual(calculate('2027-02-10').pending, [{ year: 2027, names: ["Eid'l Fitr", "Eid'l Adha"] }]);
  assert.deepEqual(calculate('2026-06-16').pending, []);
});

test('a date that is not real returns an error', () => {
  for (const bad of ['2026-02-30', '2026-13-01', '', 'tomorrow', null, undefined, '2026-1-5']) {
    assert.ok(calculate(bad).error, String(bad));
  }
});

test('a year outside 1900-2999 returns an error, including one still being typed', () => {
  for (const bad of ['0002-03-02', '0099-12-31', '0202-03-02', '1899-12-31', '3000-01-15', '9999-12-01']) {
    assert.ok(calculate(bad).error, bad);
    assert.equal(oneMonthAfter(bad), null, bad);
  }
  assert.equal(calculate('1900-01-15').nominal, '1900-02-15');
  assert.equal(calculate('2999-12-15').nominal, '3000-01-15');
});

test('parseDate works in any time zone setting because it stays in UTC', () => {
  assert.equal(parseDate('2026-03-01').toISOString().slice(0, 10), '2026-03-01');
});

test('sanitizeCustom drops bad entries, dedupes, names blanks and sorts', () => {
  const out = sanitizeCustom([
    { date: '2026-05-05', name: '  B  ' },
    { date: '2026-05-05', name: 'duplicate' },
    { date: '2026-02-30', name: 'bad date' },
    { date: '2026-01-01', name: '' },
    null,
    'text',
  ]);
  assert.deepEqual(out, [{ date: '2026-01-01', name: 'Added day' }, { date: '2026-05-05', name: 'B' }]);
  assert.deepEqual(sanitizeCustom('not a list'), []);
});
