import test from 'node:test';
import assert from 'node:assert/strict';
import { trainView } from '../../src/ui/views/train.js';

function fixture({ completed = [], logged = [], entries = true } = {}) {
  const sets = entries ? [
    { load: { value: 100, unit: 'kg' }, repsMin: 3, repsMax: 3, targetRpe: 8, completed: completed.includes(0) },
    { load: { value: 105, unit: 'kg' }, repsMin: 2, repsMax: 2, targetRpe: 8.5, completed: completed.includes(1) },
    { repsMin: 5, repsMax: 5, completed: completed.includes(2) },
  ] : [];
  const day = { number: 1, entries: entries ? [
    { exerciseId: 'squat', name: 'Squat', sets: sets.slice(0, 2) },
    { exerciseId: 'bench', name: 'Bench', sets: sets.slice(2) },
  ] : [] };
  const app = {
    programme: { blocks: [{ number: 1, name: 'Synthetic block', weeks: [{ number: 1, days: [day] }] }] },
    settings: { unit: 'kg', keepAwake: false, lastBackupAt: '2026-10-24' },
    usingExample: true, sets: [], sessions: [],
    datesKnown: () => false, nextSession: () => null,
    exercise: (id) => ({ name: id === 'squat' ? 'Squat' : 'Bench' }),
    loggedFor: ({ entryIndex, setIndex }) => logged.includes(entryIndex === 0 ? setIndex : 2) ? { reps: 3, weight: { value: 100, unit: 'kg' } } : null,
  };
  return { app, ui: {} };
}

test('Train focuses the first unfinished set with its prescription and next context', () => {
  const { app, ui } = fixture();
  const { html } = trainView(app, ui);
  assert.match(html, /Current set · 3 remaining/);
  assert.match(html, /Squat · Set 1/);
  assert.match(html, /100 kg × 3 reps<small>RPE 8<\/small>/);
  assert.match(html, /Next: Squat, set 2/);
  assert.match(html, /<details class="train-overview" >/);
  assert.equal((html.match(/data-focus-log="0:0"/g) || []).length, 2, 'card and sticky action use the same set');
  assert.match(html, /id="pick"/);
  assert.match(html, /id="quick"/);
  assert.match(html, /data-warm="0"/);
  assert.match(html, /data-set="0:0"/);
});

test('Train advances after workbook completion and app logging', () => {
  const { app, ui } = fixture({ completed: [0], logged: [1] });
  const { html } = trainView(app, ui);
  assert.match(html, /Current set · 1 remaining/);
  assert.match(html, /Bench · Set 1/);
  assert.match(html, /Weight not set × 5 reps/);
  assert.match(html, /Last set of this session/);
  assert.match(html, /data-focus-log="1:0"/);
  assert.doesNotMatch(html, /data-focus-log="0:0"/);
});

test('Train reports complete and empty sessions without a logging action', () => {
  for (const [input, expected] of [
    [{ completed: [0, 1, 2] }, 'Session complete'],
    [{ entries: false }, 'No sets planned'],
  ]) {
    const { app, ui } = fixture(input);
    const { html } = trainView(app, ui);
    assert.match(html, new RegExp(expected));
    assert.doesNotMatch(html, /data-focus-log=/);
    assert.match(html, /<details class="train-overview" open>/);
  }
});

test('both focus actions bind to the existing log-sheet action', () => {
  const { app, ui } = fixture();
  const { bind } = trainView(app, ui);
  const buttons = Array.from({ length: 2 }, () => ({ dataset: { focusLog: '0:0' }, addEventListener(type, handler) { this.type = type; this.handler = handler; } }));
  const root = {
    querySelector: () => null,
    querySelectorAll: (selector) => selector === '[data-focus-log]' ? buttons : [],
  };
  bind(root, () => {});
  assert.ok(buttons.every((button) => button.type === 'click' && typeof button.handler === 'function'));
});
