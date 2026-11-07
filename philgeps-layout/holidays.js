// Philippine non-working days, copied from the official proclamations. Do not add dates from memory.
// Each entry is [date, printed weekday, name]. The weekday is there so test/holidays.test.js catches a mistyped date.
// A special WORKING day (EDSA Anniversary, 25 Feb) is deliberately left out: it stays a working day.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EndDateHolidays = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const YEARS = {
    2026: {
      sources: ['Proclamation No. 1006, s. 2025', 'Proclamation No. 1189, s. 2026', 'Proclamation No. 1264, s. 2026'],
      pending: [],
      days: [
        // Regular holidays
        ['2026-01-01', 'Thu', "New Year's Day"],
        ['2026-03-20', 'Fri', "Eid'l Fitr"],
        ['2026-04-02', 'Thu', 'Maundy Thursday'],
        ['2026-04-03', 'Fri', 'Good Friday'],
        ['2026-04-09', 'Thu', 'Araw ng Kagitingan'],
        ['2026-05-01', 'Fri', 'Labor Day'],
        ['2026-05-27', 'Wed', "Eid'l Adha"],
        ['2026-06-12', 'Fri', 'Independence Day'],
        ['2026-08-31', 'Mon', 'National Heroes Day'],
        ['2026-11-30', 'Mon', 'Bonifacio Day'],
        ['2026-12-25', 'Fri', 'Christmas Day'],
        ['2026-12-30', 'Wed', 'Rizal Day'],
        // Special (non-working) days
        ['2026-08-21', 'Fri', 'Ninoy Aquino Day'],
        ['2026-11-01', 'Sun', "All Saints' Day"],
        ['2026-12-08', 'Tue', 'Feast of the Immaculate Conception of Mary'],
        ['2026-12-31', 'Thu', 'Last Day of the Year'],
        // Additional special (non-working) days
        ['2026-02-17', 'Tue', 'Chinese New Year'],
        ['2026-04-04', 'Sat', 'Black Saturday'],
        ['2026-11-02', 'Mon', "All Souls' Day"],
        ['2026-12-24', 'Thu', 'Christmas Eve'],
      ],
    },
    2027: {
      sources: ['Proclamation No. 1427, s. 2026'],
      pending: ["Eid'l Fitr", "Eid'l Adha"],
      days: [
        // Regular holidays
        ['2027-01-01', 'Fri', "New Year's Day"],
        ['2027-03-25', 'Thu', 'Maundy Thursday'],
        ['2027-03-26', 'Fri', 'Good Friday'],
        ['2027-04-09', 'Fri', 'Araw ng Kagitingan'],
        ['2027-05-01', 'Sat', 'Labor Day'],
        ['2027-06-12', 'Sat', 'Independence Day'],
        ['2027-08-30', 'Mon', 'National Heroes Day'],
        ['2027-11-30', 'Tue', 'Bonifacio Day'],
        ['2027-12-25', 'Sat', 'Christmas Day'],
        ['2027-12-30', 'Thu', 'Rizal Day'],
        // Special (non-working) days
        ['2027-08-21', 'Sat', 'Ninoy Aquino Day'],
        ['2027-11-01', 'Mon', "All Saints' Day"],
        ['2027-12-08', 'Wed', 'Feast of the Immaculate Conception of Mary'],
        ['2027-12-31', 'Fri', 'Last Day of the Year'],
        // Additional special (non-working) days
        ['2027-02-06', 'Sat', 'Chinese New Year'],
        ['2027-03-27', 'Sat', 'Black Saturday'],
        ['2027-11-02', 'Tue', "All Souls' Day"],
        ['2027-12-24', 'Fri', 'Christmas Eve'],
      ],
    },
  };

  // Days that apply to one area only. They count when the user turns that area on.
  const AREAS = {
    NCR: {
      label: 'Metro Manila (NCR)',
      source: 'Proclamation No. 1447, s. 2026',
      days: [
        ['2026-11-16', 'Mon', 'ASEAN Summit (NCR only)'],
        ['2026-11-17', 'Tue', 'ASEAN Summit (NCR only)'],
        ['2026-11-18', 'Wed', 'ASEAN Summit (NCR only)'],
      ],
    },
  };

  return { YEARS, AREAS };
});
