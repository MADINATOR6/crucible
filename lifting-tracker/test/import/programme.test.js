import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importProgramme } from '../../src/import/programme.js';
import { makeXlsx, makeZipWithoutWorkbook } from '../helpers/make-xlsx.js';

const catalogue = JSON.parse(await readFile(new URL('../../data/exercises.json', import.meta.url)));
const now = () => new Date('2026-01-02T03:04:05Z');
const c = (r, col, v, extra = {}) => ({ r, c: col, v, ...extra });
const options = { catalogue, fileName: 'C:\\synthetic\\example.xlsx', now };

function block(name, starts, { days = 4, labels = starts.length, body = false } = {}) {
  const cells = [c(0, 40, 'Block Goal'), c(1, 40, 'Build strength; contact 12345678'),
    c(0, 41, 'Additional Instructions'), c(1, 41, 'Use steady effort'),
    c(0, 43, 'Athlete'), c(1, 43, 'Example Person')];
  starts.forEach((start, week) => {
    if (week < labels) cells.push(c(0, start, `Week ${week + 1}`));
    for (let day = 1; day <= days; day++) {
      const r = 3 + (day - 1) * 8;
      cells.push(c(r, start, `Day ${day}`));
      ['Reps', 'Target RPE', 'Load', 'Actual RPE', 'Coach Comments', 'Athlete Comments']
        .forEach((header, i) => cells.push(c(r + 1, start + i + 1, header)));
      cells.push(c(r + 2, start, day === 1 ? 'Competition Bench Press' : 'Low Bar Squat'));
      cells.push(c(r + 2, start + 1, 5, { t: 'n' }));
      cells.push(c(r + 2, start + 2, 7.5, { t: 'n' }));
      cells.push(c(r + 2, start + 3, 140, { t: 'n' }));
      cells.push(c(r + 2, start + 4, '-'));
      if (body && week === 0 && day === 1) {
        cells.push(c(r + 2, start + 5, 'Keep form; call +61 412 345 678'));
        cells.push(c(r + 2, start + 6, 'Monday: 2000 Calories, 84.6 KG'));
        cells.push(c(r + 3, start, 'Paused on Chest'));
        cells.push(c(r + 3, start + 1, 8, { date: [2025, 12, 8] }));
        cells.push(c(r + 3, start + 2, 11, { t: 'n' }));
        cells.push(c(r + 3, start + 3, '235 pounds'));
        cells.push(c(r + 3, start + 6, '8 reps'));
        cells.push(c(r + 4, start, 'CHEST UP'));
        cells.push(c(r + 4, start + 1, '-'));
        cells.push(c(r + 5, start, '030'));
        cells.push(c(r + 6, start, 'SUPERSET'));
      }
    }
  });
  if (body) cells.push(c(2, 39, 'Mystery note with no rule'));
  return { name, cells };
}

test('group starts are discovered even after an irregular column gap', async () => {
  const bytes = makeXlsx({ sheets: [block('Block 2 - Example', [0, 7, 14, 22, 29])] });
  const programme = await importProgramme(bytes, options);
  assert.equal(programme.schema, 1);
  assert.equal(programme.importedAt, now().toISOString());
  assert.equal(programme.source.fileName, 'example.xlsx');
  assert.equal(programme.source.sheetCount, 1);
  assert.deepEqual(programme.blocks.map((x) => x.number), [2]);
  assert.deepEqual(programme.blocks[0].weeks.map((x) => x.number), [1, 2, 3, 4, 5]);
  assert.ok(programme.blocks[0].weeks.every((week) => week.days.length === 4));
  assert.equal(programme.report.weeks, 5);
  assert.equal(programme.report.days, 20);
  assert.equal(programme.report.sets, 20);
  assert.equal(programme.report.completedSets, 0);
  assert.equal(programme.report.placeholders, 20);
  assert.equal(programme.report.assumedKgLoads, 20);
  assert.equal(programme.report.warningsByType.load_assumed_kg, 20);
  const set = programme.blocks[0].weeks[0].days[0].entries[0].sets[0];
  assert.deepEqual(set.source, { sheet: 'Block 2 - Example', row: 6, col: 1 });
  assert.equal(set.completed, false);
});

test('missing week labels and three-day blocks retain all groups', async () => {
  const bytes = makeXlsx({ sheets: [block('Block 5 – Example', [0, 7, 14, 21], { days: 3, labels: 3 })] });
  const programme = await importProgramme(bytes, options);
  assert.deepEqual(programme.blocks[0].weeks.map((x) => x.number), [1, 2, 3, 4]);
  assert.ok(programme.blocks[0].weeks.every((week) => week.days.length === 3));
  assert.equal(programme.report.warningsByType.week_label_missing, 1);
});

test('comments, privacy, date reps, cue rows and unparsed cells survive import safely', async () => {
  const bytes = makeXlsx({ sheets: [block('Block 1 - Example', [0], { days: 3, body: true })] });
  const programme = await importProgramme(bytes, options);
  const week = programme.blocks[0].weeks[0];
  assert.equal(week.bodyLog[0].bodyweightKg, 84.6);
  const entries = week.days[0].entries;
  assert.deepEqual(entries.slice(0, 2).map((entry) => entry.exerciseId), ['comp_bench', 'paused_bench']);
  assert.equal(entries[1].sets[0].repsRaw, '8/12');
  assert.equal(entries[1].sets[0].completed, true);
  assert.ok(entries[0].sets[0].warnings.includes('redacted_number'));
  assert.equal(programme.report.dateRepsConverted, 1);
  assert.ok(programme.report.warningsByType.reps_date_converted >= 1);
  assert.ok(programme.report.warningsByType.redacted_number >= 1);
  assert.ok(programme.report.unparsedCells.some((item) => item.raw.includes('Mystery note')));
  const output = JSON.stringify(programme);
  assert.ok(!output.includes('Example Person'));
  assert.ok(!output.includes('12345678'));
  assert.ok(!output.includes('+61 412 345 678'));
  assert.ok(output.includes('[redacted]'));
});

test('same bytes give identical programme and input stays unchanged', async () => {
  const bytes = makeXlsx({ sheets: [block('Block 1 - Example', [0])] });
  const original = bytes.slice();
  const first = await importProgramme(bytes, options);
  const second = await importProgramme(bytes, options);
  assert.deepEqual(first, second);
  assert.deepEqual(bytes, original);
});

test('shifted headers, comment-only rows, numeric comments and orphan sets', async () => {
  const cells = [c(0, 0, 'Week 1'), c(2, 0, 'Day 1')];
  ['Reps', 'Target RPE', 'Load', 'Actual RPE', 'Coach Comments', 'Athlete Comments']
    .forEach((header, i) => cells.push(c(3, i + 2, header)));
  cells.push(c(4, 0, 'Competition Bench Press'), c(4, 2, '10-15'), c(4, 3, 8), c(4, 4, '30 kg'),
    c(4, 7, '12'), c(5, 6, 'Try a pause'), c(5, 7, 'did 40'),
    c(7, 2, 5), c(7, 4, 42),
    c(8, 0, 'CHEST UP'), c(8, 2, 6), c(8, 4, 43),
    c(9, 0, '030'), c(9, 2, 7), c(9, 4, 44));
  const programme = await importProgramme(makeXlsx({ sheets: [{ name: 'Block 3 - Example', cells }] }), options);
  const entry = programme.blocks[0].weeks[0].days[0].entries[0];
  assert.equal(entry.sets.length, 4);
  assert.equal(entry.sets[0].source.col, 2);
  assert.equal(entry.sets[0].actualReps, 12);
  assert.equal(entry.sets[0].actualLoad.value, 40);
  assert.equal(entry.sets[0].coachComment, 'Try a pause');
  assert.equal(programme.report.numericCommentsAsReps, 1);
  assert.equal(programme.report.warningsByType.numeric_comment_as_reps, 1);
  assert.equal(programme.report.warningsByType.orphan_set, 1);
  assert.ok(entry.sets[1].warnings.includes('orphan_set'));
  assert.ok(entry.cues.includes('CHEST UP'));
  assert.equal(entry.tempo, '030');
});

test('metadata, overview offsets, unknown sheet, bad cells and bounded evidence', async () => {
  const overview = [
    ...['DATE', 'SQUAT', 'BENCH', 'DEADLIFT', 'TOTAL', 'COMMENTS'].map((v, i) => c(1, i + 4, v)),
    c(2, 4, 4, { date: [2025, 8, 4] }), c(2, 5, 175), c(2, 6, 120), c(2, 7, 200),
    c(2, 8, '495kg'), c(2, 9, 'Example result'), c(3, 4, 'unknown'), c(3, 5, 'not a number'),
  ];
  const cells = [c(0, 16, 'Block Goal'), c(1, 16, 'Patient strength'),
    c(0, 17, 'Additional Instructions'), c(1, 17, 'Repeat carefully'),
    c(0, 0, 'Week 1'), c(1, 5, 'unparsed '.repeat(40)), c(2, 0, 'Day 1'),
    ...['Reps', 'Target RPE', 'Load', 'Actual RPE', 'Coach Comments', 'Athlete Comments'].map((v, i) => c(3, i + 1, v)),
    c(4, 0, 'Unlisted Novel Lift'), c(4, 1, true, { t: 'b' }), c(4, 2, '#VALUE!', { t: 'e' }),
    c(4, 3, 20), c(4, 4, 'invalid '.repeat(40)), c(4, 5, 'x'.repeat(240)),
    c(5, 0, 'A1: Cable Tricep Pushdown'), c(5, 1, 8),
    c(6, 0, 'A2: Cable Bicep Curl'), c(6, 1, 8),
  ];
  const programme = await importProgramme(makeXlsx({ sheets: [
    { name: 'TRAINING OVERVIEW', cells: overview }, { name: 'Scratch Notes', cells: [c(0, 0, 'ignored')] },
    { name: 'Block 4 - Example', cells },
  ] }), options);
  assert.deepEqual(programme.overview.results[0], {
    date: '2025-08-04', squat: 175, bench: 120, deadlift: 200, totalText: '495kg', comment: 'Example result',
  });
  assert.equal(programme.overview.results[1].date, null);
  assert.equal(programme.overview.results[1].squat, null);
  assert.equal(programme.report.warningsByType.overview_date, 1);
  assert.equal(programme.report.warningsByType.sheet_ignored, 1);
  const block = programme.blocks[0];
  assert.equal(block.goal, 'Patient strength');
  assert.equal(block.instructions, 'Repeat carefully');
  const entries = block.weeks[0].days[0].entries;
  assert.equal(entries[0].exerciseId, null);
  assert.equal(entries[1].supersetGroup, 'A1');
  assert.equal(entries[2].supersetGroup, 'A2');
  assert.ok(programme.report.warningsByType.unknown_exercise >= 1);
  assert.ok(entries[0].sets[0].warnings.length >= 1);
  assert.ok(programme.report.warnings.every((item) => String(item.raw).length <= 200));
  assert.ok(programme.report.unparsedCells.every((item) => String(item.raw).length <= 200));
  assert.ok(programme.report.warnings.some((item) => item.raw.length === 200 && item.raw.endsWith('…')));
  assert.ok(programme.report.unparsedCells.some((item) => item.raw.length === 200 && item.raw.endsWith('…')));
});

test('targets, averages, empty groups and block sorting preserve structure', async () => {
  const cells = [c(0, 0, 'Week 3 - 180/125/205 [510kg]'),
    c(1, 0, 'Average Daily Calories'), c(1, 3, 2300),
    c(2, 0, 'Average Morning BW'), c(2, 2, 82.4),
    c(4, 0, 'Day 1'), c(5, 0, 'Low Bar Squat'), c(5, 1, 6),
    c(0, 8, 'Week 4'), c(4, 8, 'Day 1'), c(5, 9, '-'), c(5, 10, '.'), c(5, 11, ' '),
  ];
  const empty = { name: 'Block 1 - Empty', cells: [c(0, 0, 'Week 1'), c(2, 0, 'Day 1')] };
  const programme = await importProgramme(makeXlsx({ sheets: [{ name: 'Block 10–Later', cells }, empty] }), options);
  assert.deepEqual(programme.blocks.map((item) => item.number), [1, 10]);
  assert.deepEqual(programme.blocks[0].weeks, []);
  const week = programme.blocks[1].weeks[0];
  assert.deepEqual(week.target, { squat: 180, bench: 125, deadlift: 205, total: 510 });
  assert.equal(week.avgCalories, 2300);
  assert.equal(week.avgBodyweightKg, 82.4);
  assert.equal(week.days[0].entries.length, 1);
  assert.equal(programme.report.weeks, 1);
  assert.equal(programme.report.warningsByType.empty_week_group, 2);
  assert.equal(programme.report.placeholders, 3);
  assert.deepEqual(programme.report.unparsedCells, []);
});

test('an orphan before any exercise drops safely and a later body-log row attaches', async () => {
  const cells = [c(0, 0, 'Week 1'), c(2, 0, 'Day 1'),
    ...['Reps', 'Target RPE', 'Load', 'Actual RPE', 'Coach Comments', 'Athlete Comments'].map((v, i) => c(3, i + 1, v)),
    c(4, 1, 5), c(4, 3, 50),
    c(5, 0, 'Low Bar Squat'), c(5, 1, 6), c(5, 3, 60),
    c(6, 6, 'Tuesday: 2100 Calories, 83.2 KG'), c(7, 6, 'did 65'),
  ];
  const programme = await importProgramme(makeXlsx({ sheets: [{ name: 'Block 7 - Example', cells }] }), options);
  const week = programme.blocks[0].weeks[0];
  assert.equal(week.days[0].entries.length, 1);
  assert.equal(week.days[0].entries[0].sets.length, 1);
  assert.equal(week.days[0].entries[0].sets[0].actualLoad.value, 65);
  assert.equal(week.days[0].entries[0].sets[0].completed, true);
  assert.equal(week.bodyLog[0].weekday, 'Tuesday');
  assert.equal(week.days[0].entries[0].sets[0].athleteComment, 'did 65');
  assert.equal(programme.report.warningsByType.orphan_set, 1);
});

test('bad archives fail clearly; a readable garbage block produces a report', async () => {
  await assert.rejects(importProgramme(Uint8Array.of(1, 2, 3), options), /zip|workbook|xlsx/i);
  await assert.rejects(importProgramme(makeZipWithoutWorkbook(), options), /workbook|xlsx/i);
  const programme = await importProgramme(makeXlsx({ sheets: [{ name: 'Block 9 - Example', cells: [c(2, 3, 'nonsense')] }] }), options);
  assert.equal(programme.blocks.length, 1);
  assert.equal(programme.blocks[0].weeks.length, 0);
  assert.ok(programme.report.unparsedCells.length || programme.report.warnings.length);
});
