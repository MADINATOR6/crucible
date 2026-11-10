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
  const isDone = (r) => { seen.push(r); return r.dayNumber === 1 && (r.entryIndex === 0 || r.setIndex === 0); }; // day 2 untouched
  assert.deepEqual(sessionProgress(d, ref, isDone), { done: 2, total: 3 });
  assert.deepEqual(seen, [{ ...ref, entryIndex: 0, setIndex: 0 }, { ...ref, entryIndex: 1, setIndex: 0 }, { ...ref, entryIndex: 1, setIndex: 1 }]);
  assert.deepEqual(nextSession({ blocks: [{ number: 1, weeks: [{ number: 1, days: [d, day(2)] }] }] }, isDone), ref);
});

test('gaps in older training are history: next is the first unfinished day from the last one trained', () => {
  const w = (number, sets) => ({ number, days: [day(1, sets), day(2, sets)] });
  const programme = { blocks: [{ number: 1, weeks: [w(1, [{}, {}]), w(2, [{}, {}]), w(3, [{}, {}])] }] };
  const done = (pattern) => (r) => pattern[`${r.weekNumber}.${r.dayNumber}`]?.[r.setIndex] ?? false;
  // Week 1 day 2 was cut short long ago; week 2 is complete; nothing since.
  const skipped = { '1.1': [true, true], '1.2': [true, false], '2.1': [true, true], '2.2': [true, true] };
  assert.deepEqual(nextSession(programme, done(skipped)), { ...ref, weekNumber: 3, dayNumber: 1 });
  // The latest day trained is only partly done: it stays next so it can be finished.
  assert.deepEqual(nextSession(programme, done({ ...skipped, '3.1': [true, false] })), { ...ref, weekNumber: 3, dayNumber: 1 });
  // A day skipped entirely between trained days is passed over.
  assert.deepEqual(nextSession(programme, done({ '1.1': [true, true], '2.1': [true, true] })), { ...ref, weekNumber: 2, dayNumber: 2 });
});

test('a day trained out of order postpones the one before it; older weeks stay history', () => {
  const week = (number) => ({ number, days: [day(1), day(2), day(3), day(4)] });
  const programme = { blocks: [{ number: 1, weeks: [week(1), week(2)] }] };
  const done = (...keys) => (r) => keys.includes(`${r.weekNumber}.${r.dayNumber}`);
  const at = (weekNumber, dayNumber) => ({ ...ref, weekNumber, dayNumber });
  // Day 3 was trained before day 2: day 2 is still owed, then day 4.
  assert.deepEqual(nextSession(programme, done('1.1', '1.3')), at(1, 2));
  assert.deepEqual(nextSession(programme, done('1.1', '1.3', '1.2')), at(1, 4));
  // Two postponed days come back in order.
  assert.deepEqual(nextSession(programme, done('1.4')), at(1, 1));
  assert.deepEqual(nextSession(programme, done('1.4', '1.1')), at(1, 2));
  // Once a later week has been started, the earlier week's gap is history.
  assert.deepEqual(nextSession(programme, done('1.1', '1.3', '2.1')), at(2, 2));
  // A partly done earlier day is not postponed: it was started, and stopped.
  const partly = { blocks: [{ number: 1, weeks: [{ number: 1, days: [day(1, [{}, {}]), day(2), day(3)] }] }] };
  assert.deepEqual(nextSession(partly, (r) => (r.dayNumber === 1 && r.setIndex === 0) || r.dayNumber === 2), at(1, 3));
});

test('a skipped day is closed: next moves on, and skipping counts as the latest activity', () => {
  const week = (number) => ({ number, days: [day(1, [{}, {}]), day(2), day(3)] });
  const programme = { blocks: [{ number: 1, weeks: [week(1), week(2)] }] };
  const done = (...keys) => (r) => keys.includes(`${r.weekNumber}.${r.dayNumber}.${r.setIndex}`);
  const skip = (...keys) => (r) => { assert.deepEqual(Object.keys(r), ['blockNumber', 'weekNumber', 'dayNumber']); return keys.includes(`${r.weekNumber}.${r.dayNumber}`); };
  const at = (weekNumber, dayNumber) => ({ ...ref, weekNumber, dayNumber });
  // Nothing trained yet: skipping day 1 moves to day 2.
  assert.deepEqual(nextSession(programme, done(), skip('1.1')), at(1, 2));
  // A postponed day that was skipped is not owed any more.
  assert.deepEqual(nextSession(programme, done('1.1.0', '1.1.1', '1.3.0'), skip('1.2')), at(2, 1));
  // "Skip the rest" closes a partly done day, which would otherwise stay next.
  assert.deepEqual(nextSession(programme, done('1.1.0')), at(1, 1));
  assert.deepEqual(nextSession(programme, done('1.1.0'), skip('1.1')), at(1, 2));
  // Skipping ahead makes the skipped day the anchor, like training it would.
  assert.deepEqual(nextSession(programme, done('1.1.0', '1.1.1'), skip('1.2', '1.3')), at(2, 1));
  // Everything left is skipped: the answer is the programme's last day.
  assert.deepEqual(nextSession(programme, done(), skip('1.1', '1.2', '1.3', '2.1', '2.2', '2.3')), at(2, 3));
  // Without the third argument nothing is skipped.
  assert.deepEqual(nextSession(programme, done()), at(1, 1));
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
