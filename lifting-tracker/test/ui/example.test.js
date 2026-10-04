import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildExampleProgramme } from '../../src/ui/example-data.js';
import { fromProgrammeSets, workingSets } from '../../src/core/sets.js';
import { detectPRs } from '../../src/core/prs.js';
import { rpeDeltas } from '../../src/core/rpe.js';
import { weeklyHardSets } from '../../src/core/muscles.js';
import { runningBests } from '../../src/core/lifts.js';
import { addDays } from '../../src/core/weeks.js';

const catalogue = JSON.parse(await readFile(new URL('../../data/exercises.json', import.meta.url)));
const ids = new Set(catalogue.exercises.map((e) => e.id));
const start = '2026-01-05'; // a Monday
const dateFor = ({ weekNumber, dayNumber }) => addDays(start, 7 * (weekNumber - 1) + ({ 1: 0, 2: 1, 3: 3, 4: 4 }[dayNumber]));

test('the example programme only uses catalogue exercises and is labelled as an example', () => {
  const p = buildExampleProgramme();
  assert.equal(p.isExample, true);
  assert.match(p.blocks[0].name, /EXAMPLE/);
  for (const w of p.blocks[0].weeks) for (const d of w.days) for (const e of d.entries) assert.ok(ids.has(e.exerciseId), e.exerciseId);
});

test('the example programme flows through core logic without errors', () => {
  const p = buildExampleProgramme();
  const events = fromProgrammeSets(p, dateFor);
  assert.ok(events.length > 40);
  assert.ok(workingSets(events).length === events.length);
  assert.ok(detectPRs(events).length > 0);
  const bests = runningBests(events, catalogue).at(-1);
  assert.ok(bests.total > 400);
  const week1 = weeklyHardSets(events, catalogue, start);
  assert.ok(week1.muscles.quads.sets > 0 && week1.muscles.chest.sets > 0);
  assert.deepEqual(week1.unknownExerciseIds, []);
  const rpe = rpeDeltas(p);
  assert.ok(Object.keys(rpe.perExercise).includes('low_bar_squat'));
  // Week 4 is planned only: nothing completed, so nothing counted.
  assert.equal(weeklyHardSets(events, catalogue, addDays(start, 21)).muscles.quads.sets, 0);
});
