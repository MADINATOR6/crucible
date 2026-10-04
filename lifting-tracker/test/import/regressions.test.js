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
test('phone shapes found by the third verifier run are redacted (including Unicode spaces)', async () => {
  const phones = ['1300 123 456', '1800 123 456', '61 4 1234 5678', '0412\u00a0345\u00a0678', '+61\u00a0499\u00a0888\u00a0777', '+1 234 567', '0412\u202f345\u202f678'];
  const cells = [c(0, 0, 'Week 1'), c(1, 0, 'Day 1'), ...header(2)];
  phones.forEach((p, i) => cells.push(...setRow(3 + i, [c(3 + i, 5, 'contact ' + p)])));
  const p = await run(cells);
  const sets = p.blocks[0].weeks[0].days[0].entries.flatMap((e) => e.sets);
  assert.equal(sets.length, phones.length);
  sets.forEach((s, i) => assert.equal(s.coachComment, 'contact [redacted]', phones[i]));
});

test('redaction removes only the phone, never neighbouring training numbers', async () => {
  const goal = (text) => run([c(0, 0, 'Block Goal'), c(1, 0, text), c(3, 0, 'Week 1'), c(4, 0, 'Day 1'), ...header(5), ...setRow(6)]).then((p) => p.blocks[0].goal);
  assert.equal(await goal('work up (60 80 100 120 140)'), 'work up (60 80 100 120 140)');
  assert.equal(await goal('RPE (7.5 8.5 9.5 10 10)'), 'RPE (7.5 8.5 9.5 10 10)');
  assert.equal(await goal('call 0412 345 678\n100 120 140'), 'call [redacted]\n100 120 140');
  assert.equal(await goal('3 x 8 @ 7 then 4 x 6 @ 8'), '3 x 8 @ 7 then 4 x 6 @ 8');
});

test('a comment that says "Load" after a full header row is a comment, not a header', async () => {
  for (const word of ['Load', '  lOaD  ']) {
    const p = await run([c(0, 0, 'Week 1'), c(1, 0, 'Day 1'), ...header(2), ...setRow(3), c(4, 5, word),
      c(5, 0, 'Low Bar Squat'), c(5, 1, 6, { t: 'n' }), c(5, 2, 8, { t: 'n' }), c(5, 3, 120, { t: 'n' })]);
    const sets = p.blocks[0].weeks[0].days[0].entries.flatMap((e) => e.sets);
    const last = sets.at(-1);
    assert.deepEqual([last.repsMin, last.targetRpe, last.load?.value, last.source.col], [6, 8, 120, 1]);
    assert.match(sets[0].coachComment, /load/i);
  }
});

test('a partial header with extra text cells is still a header (first, middle and last group)', async () => {
  for (const starts of [[0], [0, 7], [0, 7, 14]]) {
    const cells = [];
    starts.forEach((s, g) => cells.push(c(0, s, `Week ${g + 1}`), c(2, s, 'Day 1'), c(3, s, 'Exercise'), c(3, s + 1, 'kg'), c(3, s + 2, 'Reps'),
      c(4, s, 'Synthetic Lift'), c(4, s + 2, 5, { t: 'n' }), c(4, s + 3, 7, { t: 'n' }), c(4, s + 4, 100, { t: 'n' }), c(4, s + 5, 8, { t: 'n' }), c(4, s + 6, 'steady'), c(4, s + 7, 'fine')));
    const p = await run(cells);
    for (const w of p.blocks[0].weeks) {
      const sets = w.days[0].entries.flatMap((e) => e.sets);
      assert.equal(w.days[0].entries.length, 1, 'no phantom Exercise entry');
      assert.deepEqual([sets[0].repsMin, sets[0].targetRpe, sets[0].load?.value, sets[0].actualRpe], [5, 7, 100, 8]);
    }
  }
});