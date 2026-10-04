import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importProgramme } from '../../src/import/programme.js';
import { makeXlsx } from '../helpers/make-xlsx.js';

// Regression tests for findings from the independent Codex verifier run (synthetic data only).
const catalogue = JSON.parse(await readFile(new URL('../../data/exercises.json', import.meta.url)));
const now = () => new Date('2026-01-02T03:04:05Z');
const c = (r, col, v, extra = {}) => ({ r, c: col, v, ...extra });
const run = (cells) => importProgramme(makeXlsx({ sheets: [{ name: 'Block 1 - Example', cells }] }), { catalogue, fileName: 'x.xlsx', now });
const HEADERS = ['Reps', 'Target RPE', 'Load', 'Actual RPE', 'Coach Comments', 'Athlete Comments'];
const header = (r) => HEADERS.map((h, i) => c(r, i + 1, h));
const setRow = (r, extra = []) => [c(r, 0, 'Low Bar Squat'), c(r, 1, 5, { t: 'n' }), c(r, 2, 7, { t: 'n' }), c(r, 3, 140, { t: 'n' }), c(r, 4, 7, { t: 'n' }), ...extra];

test('phone numbers in comments are redacted in every common shape', async () => {
  const phones = ['Call + 61 499 888 777', 'Call +(61) 499 888 777', 'Call +61499888777', 'Call 0412 345 678', 'Call 0412345678',
    'Call 04 1234 5678', 'Call (03) 9999 1234', 'Call 0412\n345\n678', 'Call +61\n499\n888\n777', 'Call +61-4-1234-5678'];
  const cells = [c(0, 0, 'Week 1'), c(1, 0, 'Day 1'), ...header(2)];
  phones.forEach((p, i) => cells.push(...setRow(3 + i, [c(3 + i, 5, p)])));
  const p = await run(cells);
  const sets = p.blocks[0].weeks[0].days[0].entries.flatMap((e) => e.sets);
  assert.equal(sets.length, phones.length);
  for (const s of sets) {
    assert.match(s.coachComment, /\[redacted\]/);
    assert.doesNotMatch(s.coachComment, /\d{3}/);
  }
  assert.ok(p.report.warningsByType.redacted_number >= phones.length);
  assert.doesNotMatch(JSON.stringify(p), /499 ?888|0412|499888|1234 5678|9999 1234|1234-5678/);
});

test('ordinary loads and reps are not mistaken for phone numbers', async () => {
  const p = await run([c(0, 0, 'Week 1'), c(1, 0, 'Day 1'), ...header(2), ...setRow(3, [c(3, 5, 'Aim for 100 120 140 over three sets')])]);
  assert.equal(p.blocks[0].weeks[0].days[0].entries[0].sets[0].coachComment, 'Aim for 100 120 140 over three sets');
});

test('a partial, shifted header row is honoured instead of being read as a set', async () => {
  const p = await run([c(0, 0, 'Week 1'), c(3, 0, 'Day 1'), c(4, 2, 'Reps'), c(5, 0, 'Low Bar Squat'), c(5, 2, 5, { t: 'n' })]);
  const s = p.blocks[0].weeks[0].days[0].entries[0].sets[0];
  assert.equal(s.repsMin, 5);
  assert.equal(s.repsMax, 5);
  assert.equal(s.source.col, 2);
  assert.equal(s.targetRpe, null);
});

test('a bodyweight line that also carries a performance note keeps the note text', async () => {
  const p = await run([c(0, 0, 'Week 1'), c(1, 0, 'Day 1'), ...header(2), ...setRow(3, [c(3, 6, 'Monday: 82.6 KG, did 140, RPE 8')])]);
  const w = p.blocks[0].weeks[0];
  const s = w.days[0].entries[0].sets[0];
  assert.equal(w.bodyLog[0].bodyweightKg, 82.6);
  assert.equal(s.actualLoad.value, 140);
  assert.match(s.athleteComment, /did 140/);
});

test('a pure bodyweight line is not kept as the set comment', async () => {
  const p = await run([c(0, 0, 'Week 1'), c(1, 0, 'Day 1'), ...header(2), ...setRow(3, [c(3, 6, 'Monday : 2000 Calories, 84.6 KG')])]);
  const s = p.blocks[0].weeks[0].days[0].entries[0].sets[0];
  assert.equal(p.blocks[0].weeks[0].bodyLog[0].calories, 2000);
  assert.equal(s.athleteComment, null);
});

test('the importer carries no hard-coded athlete name', async () => {
  const src = await readFile(new URL('../../src/import/programme.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /madison|arnido/i);
});

test('a partial header survives blank, placeholder and label cells around it', async () => {
  for (const filler of [[c(3, 0, '', { t: 's' })], [c(3, 0, '-')], [c(3, 0, 'Exercise')], []]) {
    const p = await run([c(0, 0, 'Week 1'), c(1, 0, 'Day 1'), ...filler, c(3, 2, 'Reps'),
      c(4, 0, 'Low Bar Squat'), c(4, 2, 5, { t: 'n' }), c(4, 3, 7, { t: 'n' }), c(4, 4, 140, { t: 'n' }), c(4, 5, 8, { t: 'n' })]);
    const s = p.blocks[0].weeks[0].days[0].entries[0].sets[0];
    assert.deepEqual([s.repsMin, s.targetRpe, s.load?.value, s.actualRpe, s.source.col], [5, 7, 140, 8, 2], JSON.stringify(filler));
  }
});

test('digit lists that are not phone numbers survive', async () => {
  const p = await run([c(0, 0, 'Week 1'), c(1, 0, 'Day 1'), ...header(2),
    ...setRow(3, [c(3, 5, 'Warm up 60 80 100 120 then 140 x 5 (2 sets)')])]);
  assert.equal(p.blocks[0].weeks[0].days[0].entries[0].sets[0].coachComment, 'Warm up 60 80 100 120 then 140 x 5 (2 sets)');
});