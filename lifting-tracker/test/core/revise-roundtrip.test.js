import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateBlock, reviseBlock } from '../../src/core/generator.js';
import { buildAthleteModel } from '../../src/core/athlete.js';
import { learnTemplate } from '../../src/core/template.js';
import { fromProgrammeSets } from '../../src/core/sets.js';
import { sanitizeProgramme } from '../../src/store/programme-schema.js';
import { buildExampleProgramme } from '../../src/ui/example-data.js';
import { addDays } from '../../src/core/weeks.js';

// Saving a generated block (through the sanitiser) and revising it with the same numbers must change nothing,
// for every focus. This catches metadata lost on save (exposure, layoff weeks) and revise formulas that drift
// from the generation formulas.
const catalogue = JSON.parse(await readFile(new URL('../../data/exercises.json', import.meta.url), 'utf8'));
const programme = buildExampleProgramme();
const start = '2026-01-05';
const dateFor = ({ weekNumber, dayNumber }) => addDays(start, 7 * (weekNumber - 1) + dayNumber - 1);
const events = fromProgrammeSets(programme, dateFor);
const athlete = buildAthleteModel({ events, catalogue, programme, dateFor });
const referenceE1rm = Object.fromEntries(['squat', 'bench', 'deadlift'].map((f) => [f, athlete.lifts[f].e1rmKg]));
const template = learnTemplate({ programme, catalogue, referenceE1rm, blockNumber: 1 });
const now = () => new Date('2026-10-05T00:00:00Z');

for (const [focus, extra] of [['strength', {}], ['volume', {}], ['peak', {}], ['maintenance', {}], ['return', { layoffWeeks: 20 }], ['specialise', { emphasis: 'bench' }], ['deload', {}]]) {
  test(`${focus}: save + revise with unchanged numbers changes no load`, () => {
    const res = generateBlock({ catalogue, template, athlete, blockNumber: 2, focus, weeks: 5, seed: 'a', now, ...extra });
    const saved = sanitizeProgramme({ ...programme, blocks: [res.block] }).blocks[0];
    const noSets = saved.weeks.flatMap((w) => w.days.flatMap((d) => d.entries.flatMap((e) => e.sets))).filter((s) => !s.gen);
    assert.equal(noSets.length, 0, 'every set keeps its gen metadata');
    // From week 1 the formulas are the generation formulas: no change. Later, the athlete's e1RM is taken to be
    // "now" (the start of that week), so with no gain since generation the projected loads can only come down.
    const flat = ['maintenance', 'return'].includes(focus); // no projected drift: never any change
    for (const fromWeek of [1, 2, 3]) {
      const r = reviseBlock({ block: saved, athlete, catalogue, fromWeek });
      if (fromWeek === 1 || flat) assert.deepEqual(r.changes, [], `fromWeek ${fromWeek}`);
      else for (const c of r.changes) assert.ok(c.to < c.from && c.from - c.to <= 5, `fromWeek ${fromWeek}: ${JSON.stringify(c)}`);
    }
  });
}

test('revising a return block keeps the ramp (not a jump to full loads)', () => {
  const res = generateBlock({ catalogue, template, athlete, blockNumber: 2, focus: 'return', layoffWeeks: 20, weeks: 4, seed: 'a', now });
  const saved = sanitizeProgramme({ ...programme, blocks: [res.block] }).blocks[0];
  const stronger = { ...athlete, lifts: Object.fromEntries(Object.entries(athlete.lifts).map(([k, v]) => [k, { ...v, e1rmKg: v.e1rmKg ? v.e1rmKg + 10 : v.e1rmKg }])) };
  const r = reviseBlock({ block: saved, athlete: stronger, catalogue, fromWeek: 2 });
  assert.ok(r.changes.length > 0);
  // week 2 of a 4-week return block after 20 weeks off: start fraction 0.8, so week 2 is at 0.8 + 0.2 / 3 = 86.7% of the e1RM, not 100%
  const week2 = r.block.weeks[1].days.flatMap((d) => d.entries.flatMap((e) => e.sets.filter((s) => s.gen?.family === 'squat' && s.gen.exposure === 'primary' && s.load)));
  assert.ok(week2.length > 0);
  for (const s of week2) assert.ok(s.load.value < 0.9 * stronger.lifts.squat.e1rmKg, `week 2 squat top set ${s.load.value} is a ramp load`);
});
