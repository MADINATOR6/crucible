import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklySummary } from '../../src/ui/summary.js';
import { sanitizeSettings } from '../../src/store/programme-schema.js';

const LIFT = { sq: 'squat', bp: 'bench' };
const fakeApp = (events) => ({ settings: { unit: 'kg' }, events: () => events, exercise: (id) => (LIFT[id] ? { lift: LIFT[id] } : null) });
const ev = (date, exerciseId, weightKg, reps, rpe) => ({ date, exerciseId, weightKg, reps, rpe, isWarmup: false });

test('weekly summary counts the last 7 days and names each lift with its trend', () => {
  const events = [];
  for (let w = 0; w < 6; w++) {
    const d = `2026-09-${String(1 + w * 7).padStart(2, '0')}`;
    events.push(ev(d, 'sq', 160 + w * 2.5, 3, 8), ev(d, 'bp', 100 + w, 5, 8));
  }
  events.push(ev('2026-10-08', 'sq', 175, 3, 8), ev('2026-10-08', 'sq', 150, 5, 7), ev('2026-10-10', 'bp', 107.5, 5, 8));
  const s = weeklySummary(fakeApp(events), '2026-10-10');
  assert.match(s.body, /^2 sessions, 3 working sets in the last 7 days\./);
  assert.match(s.body, /Squat \d+(\.\d)? \(\+[\d.]+\/wk\)/);
  assert.match(s.body, /Bench \d+/);
  assert.equal(s.lastSession, '2026-10-10');
});

test('weekly summary says so when nothing was logged', () => {
  const s = weeklySummary(fakeApp([ev('2026-08-01', 'sq', 150, 3, 8)]), '2026-10-10');
  assert.match(s.body, /^No sessions in the last 7 days\./);
});

test('share background and weekly summary settings are whitelisted', () => {
  assert.equal(sanitizeSettings({ shareBg: 'dark', weeklySummary: true }).shareBg, 'dark');
  assert.equal(sanitizeSettings({ shareBg: 'neon' }).shareBg, 'transparent');
  assert.equal(sanitizeSettings({ shareBarEnd: 'left' }).shareBarEnd, 'left');
  assert.equal(sanitizeSettings({ shareBarEnd: 'up' }).shareBarEnd, 'right');
  for (const bad of [['lose'], { toString: null }, '__proto__', 'constructor']) {
    const s = sanitizeSettings({ goal: bad, goalPace: bad, everyday: bad });
    assert.deepEqual([s.goal, s.goalPace, s.everyday], ['maintain', 'hold', 'mixed']);
  }
  assert.equal(sanitizeSettings({ goal: 'lose', goalPace: ['fast'] }).goalPace, 'gentle');
  assert.equal(sanitizeSettings({ weeklySummary: 'yes' }).weeklySummary, false);
});
