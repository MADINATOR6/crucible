import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importProgramme } from '../../src/import/programme.js';

test('opt-in real workbook structure', async (t) => {
  const path = process.env.LT_REAL_WORKBOOK;
  if (!path) return t.skip('LT_REAL_WORKBOOK is unset');
  const catalogue = JSON.parse(await readFile(new URL('../../data/exercises.json', import.meta.url)));
  const programme = await importProgramme(await readFile(path), {
    catalogue, fileName: path, now: () => new Date('2026-01-02T03:04:05Z'),
  });
  assert.ok(programme.report.dateRepsConverted > 0);
  assert.ok(programme.blocks.every((block) => block.weeks.length >= 1));
  console.log(JSON.stringify({
    sheets: programme.source.sheetCount,
    blocks: programme.report.blocks,
    weeks: programme.report.weeks,
    days: programme.report.days,
    sets: programme.report.sets,
    dateRepsConverted: programme.report.dateRepsConverted,
  }));
});
