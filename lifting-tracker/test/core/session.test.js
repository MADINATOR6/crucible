import test from 'node:test';
import assert from 'node:assert/strict';
import { nextSession, sessionProgress, plannedValues } from '../../src/core/session.js';

const day = (number, sets = [{}]) => ({ number, entries: [{ sets }] });
const ref = { blockNumber: 1, weekNumber: 1, dayNumber: 1 };

test('next session sorts blocks, weeks and days without changing array order', () => {
  const programme = { blocks: [
    { number: 2, weeks: [{ number: 1, days: [day(1)] }] },
    { number: 1, weeks: [
      { number: 2, days: [day(1)] },
      { number: 1, days: [day(2), day(1)] },
    ] },
  ] };
  const original = structuredClone(programme);
  const refs = [ref, { ...ref, dayNumber: 2 }, { ...ref, weekNumber: 2 }, { ...ref, blockNumber: 2 }];
  for (let i = 0; i < refs.length; i++) {
    const done = new Set(refs.slice(0, i).map((r) => JSON.stringify(r)));
    assert.deepEqual(nextSession(programme, ({ entryIndex, setIndex, ...r }) => done.has(JSON.stringify(r))), refs[i]);
  }
  assert.deepEqual(nextSession(programme, () => true), refs.at(-1));
  assert.deepEqual(programme, original);
});

test('a partly logged day stays selected and progress passes the original set indices', () => {
  const d = { number: 1, entries: [{ sets: [{}] }, { sets: [{}, {}] }] };
  const seen = [];
  const isDone = (r) => { seen.push(r); return r.entryIndex === 0 || r.setIndex === 0; };
  assert.deepEqual(sessionProgress(d, ref, isDone), { done: 2, total: 3 });
  assert.deepEqual(seen, [{ ...ref, entryIndex: 0, setIndex: 0 }, { ...ref, entryIndex: 1, setIndex: 0 }, { ...ref, entryIndex: 1, setIndex: 1 }]);
  assert.deepEqual(nextSession({ blocks: [{ number: 1, weeks: [{ number: 1, days: [d, day(2)] }] }] }, isDone), ref);
});

test('empty programmes return null, empty days are skipped, and all-done uses the last day', () => {
  for (const programme of [null, { blocks: [] }, { blocks: [{ number: 1, weeks: [{ number: 1, days: [] }] }] }]) {
    assert.equal(nextSession(programme, () => false), null);
  }
  const programme = { blocks: [{ number: 1, weeks: [{ number: 1, days: [day(1, []), day(2), day(3, [])] }] }] };
  assert.deepEqual(sessionProgress(day(1, []), ref, () => assert.fail('empty day')), { done: 0, total: 0 });
  assert.deepEqual(nextSession(programme, () => false), { ...ref, dayNumber: 2 });
  assert.deepEqual(nextSession(programme, () => true), { ...ref, dayNumber: 3 });
});

test('planned values use fixed or minimum reps, fixed or minimum load, and optional RPE', () => {
  const weight = { value: 100, unit: 'kg' };
  assert.deepEqual(plannedValues({ load: weight, repsMin: 5, repsMax: 5, targetRpe: 8 }), { weight, reps: 5, rpe: 8 });
  assert.deepEqual(plannedValues({ load: weight, repsMin: 8, repsMax: 12 }), { weight, reps: 8, rpe: null });
  assert.deepEqual(plannedValues({ loadRange: { min: 80, max: 100, unit: 'lb' }, repsMin: 0 }), { weight: { value: 80, unit: 'lb' }, reps: 0, rpe: null });
  assert.deepEqual(plannedValues({ load: weight, loadRange: { min: 80, max: 100, unit: 'lb' }, repsMin: 5 }), { weight, reps: 5, rpe: null });
  assert.equal(plannedValues({ repsMin: 5 }), null);
  assert.equal(plannedValues({ load: weight }), null);
  assert.equal(plannedValues({ load: weight, repsMin: '5' }), null);
});
