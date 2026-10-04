import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseReps, parseRpe, parseLoad, parseWeekLabel, parseAthleteComment, classifyLabel } from '../../src/import/programme.js';
import { excelSerial } from '../helpers/make-xlsx.js';

const codes = (result) => result.warnings.map((warning) => warning.code);
const n = (v) => ({ t: 'n', v });
const s = (v) => ({ t: 's', v });

test('reps handle date formatted serials, ranges, placeholders and text', () => {
  for (const [month, day, min, max] of [[8, 4, 4, 8], [12, 8, 8, 12], [10, 6, 6, 10]]) {
    const result = parseReps({ t: 'd', v: excelSerial(2025, month, day), date: { y: 2025, m: month, d: day } });
    assert.equal(result.repsMin, min);
    assert.equal(result.repsMax, max);
    assert.equal(result.repsRaw, `${day}/${month}`);
    assert.ok(codes(result).includes('reps_date_converted'));
  }
  assert.equal(parseReps(s('10-15')).repsMax, 15);
  assert.deepEqual([parseReps(s('-')).repsMin, parseReps(s('-')).repsMax, codes(parseReps(s('-')))], [null, null, []]);
  assert.equal(parseReps(s('How many reps?')).repsRaw, 'How many reps?');
  assert.deepEqual(codes(parseReps(s('How many reps?'))), ['reps_text']);
  assert.deepEqual(codes(parseReps(s('15-10'))), ['reps_range_reversed']);
  assert.deepEqual(codes(parseReps({ t: 'd', v: excelSerial(2025, 4, 8), date: { y: 2025, m: 4, d: 8 } })), ['reps_date_reversed']);
});

test('RPE preserves 11 and reports impossible or cleaned values', () => {
  assert.equal(parseRpe(n(7.5)).value, 7.5);
  assert.equal(parseRpe(n(11)).value, 11);
  assert.deepEqual(codes(parseRpe(n(11))), ['rpe_above_10']);
  assert.equal(parseRpe(n(84.1)).value, null);
  assert.deepEqual(codes(parseRpe(n(84.1))), ['rpe_out_of_range']);
  assert.equal(parseRpe(s('6.5.')).value, 6.5);
  assert.ok(codes(parseRpe(s('6.5.'))).includes('rpe_text_cleaned'));
  assert.equal(parseRpe(s('9 (140)')).value, 9);
  assert.ok(codes(parseRpe(s('9 (140)'))).includes('rpe_text_cleaned'));
  assert.ok(codes(parseRpe(n(7.3))).includes('rpe_not_half_step'));
});

test('loads retain units and ranges while reporting assumptions', () => {
  assert.deepEqual(parseLoad(n(140)).load, { value: 140, unit: 'kg', raw: 140 });
  assert.ok(codes(parseLoad(n(140))).includes('load_assumed_kg'));
  assert.equal(parseLoad(s('235 pounds')).load.unit, 'lb');
  assert.equal(parseLoad(s('30 kg')).load.value, 30);
  assert.equal(parseLoad(s('30 lg')).load.unit, 'kg');
  assert.ok(codes(parseLoad(s('30 lg'))).includes('load_unit_unknown'));
  assert.deepEqual(parseLoad(s('132.5-135')).loadRange, { min: 132.5, max: 135, unit: 'kg' });
  assert.ok(codes(parseLoad(s('132.5-135'))).includes('load_range'));
  assert.deepEqual(codes(parseLoad(n(0))), ['load_invalid']);
});

test('week target and athlete performance/body log parse separately', () => {
  assert.deepEqual(parseWeekLabel('Week 3 - 175/122.5/202.5 [500kg]'), {
    number: 3, target: { squat: 175, bench: 122.5, deadlift: 202.5, total: 500 },
  });
  const body = parseAthleteComment('Monday : 2000 Calories, 84.6 KG');
  assert.equal(body.bodyLog.length, 1);
  assert.deepEqual({ weekday: body.bodyLog[0].weekday, calories: body.bodyLog[0].calories, bodyweightKg: body.bodyLog[0].bodyweightKg },
    { weekday: 'Monday', calories: 2000, bodyweightKg: 84.6 });
  assert.deepEqual(parseAthleteComment('MONDAY').bodyLog, []);
  assert.equal(parseAthleteComment('did 140').actualLoad.value, 140);
  assert.equal(parseAthleteComment('did 140').actualLoad.unit, 'kg');
  assert.equal(parseAthleteComment('8 reps').actualReps, 8);
  assert.equal(parseAthleteComment('Did 200, RPE 8.5').actualRpe, 8.5);
});

test('catalogue classification handles cues, tempo, supersets and paused bench', async () => {
  const catalogue = JSON.parse(await readFile(new URL('../../data/exercises.json', import.meta.url)));
  assert.equal(classifyLabel('CHEST UP', catalogue).kind, 'cue');
  assert.equal(classifyLabel('SUPERSET', catalogue).kind, 'cue');
  assert.equal(classifyLabel('030', catalogue).kind, 'tempo');
  assert.deepEqual(classifyLabel('A1: Cable Tricep Pushdown', catalogue), {
    kind: 'exercise', exerciseId: 'cable_tricep_pushdown', name: 'Cable Tricep Pushdown', supersetGroup: 'A1',
  });
  assert.equal(classifyLabel('A2: Cable Bicep Curl', catalogue).supersetGroup, 'A2');
  assert.equal(classifyLabel('Paused on Chest', catalogue).exerciseId, 'paused_bench');
  assert.equal(classifyLabel('Unlisted Novel Lift', catalogue).exerciseId, null);
  assert.equal(classifyLabel('  incline   dumbell press  ', catalogue).exerciseId, 'incline_db_press');
  assert.equal(classifyLabel('1 set then 1 minute rest', catalogue).kind, 'cue');
});

test('parser boundaries reject invalid values without throwing or losing raw text', () => {
  for (const value of [0, -1, 101, 1.5, Infinity, NaN, true]) {
    assert.equal(parseReps(value).repsMin, null);
    assert.ok(codes(parseReps(value)).includes('reps_invalid'));
  }
  for (const value of ['-', '.', '', ' ', undefined]) {
    for (const parser of [parseReps, parseRpe, parseLoad]) assert.deepEqual(codes(parser(value)), []);
  }
  assert.equal(parseReps('6–10').repsMax, 10);
  assert.equal(parseRpe('11$').value, 11);
  assert.deepEqual(codes(parseRpe('11$')), ['rpe_text_cleaned', 'rpe_above_10']);
  assert.equal(parseLoad({ t: 'd', v: excelSerial(2025, 8, 4), date: { y: 2025, m: 8, d: 4 } }).load, null);
  assert.deepEqual(codes(parseLoad('35-30 kg')), ['load_invalid']);
  assert.equal(parseLoad('30 lbs').load.unit, 'lb');
  assert.equal(parseLoad('-5 kg').load, null);
  assert.equal(parseRpe('unknown').value, null);
  assert.equal(parseRpe(0).value, null);
  assert.equal(parseRpe(12).value, null);
});
