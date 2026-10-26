import test from 'node:test';
import assert from 'node:assert/strict';
import { maintenance, target, KCAL_PER_KG } from '../../src/core/targets.js';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const iso = (d) => new Date(Date.UTC(2026, 9, d)).toISOString().slice(0, 10); // synthetic October 2026

test('estimated maintenance is the mean of recent daily estimates', () => {
  const m = maintenance({ days: [{ date: iso(24), kcal: 3000 }, { date: iso(25), kcal: 3200 }, { date: iso(26), kcal: null }], intake: [], weights: [], today: iso(26) });
  assert.equal(m.estimated, 3100); assert.equal(m.estimatedDays, 2); assert.equal(m.measured, null); assert.equal(m.kcal, 3100);
});

test('measured maintenance = mean intake minus the weight trend × 7,700 kcal/kg, once there is enough data', () => {
  // 28 days eating 2,800 kcal while losing 0.1 kg a day: maintenance is 2,800 + 770.
  const intake = Array.from({ length: 28 }, (_, i) => ({ date: iso(i + 1), kcal: 2800 }));
  const weights = Array.from({ length: 28 }, (_, i) => ({ x: iso(i + 1), y: 90 - 0.1 * i }));
  const m = maintenance({ days: [{ date: iso(28), kcal: 3000 }], intake, weights, today: iso(28) });
  near(m.measured.kcal, 2800 + 0.1 * KCAL_PER_KG); near(m.measured.kgPerWeek, -0.7);
  near(m.kcal, m.measured.kcal, 1e-9);
  const few = maintenance({ days: [], intake: intake.slice(0, 10), weights, today: iso(28) });
  assert.equal(few.measured, null, 'fewer than 14 days of intake');
});

test('goal target: pace as % of bodyweight per week at 7,700 kcal/kg, with protein, fat and carbs', () => {
  const t = target({ maintenanceKcal: 3000, weightKg: 80, goal: 'lose', pace: 'steady', restKcal: 1900, sex: 'male' });
  near(t.change, -(0.4 * KCAL_PER_KG) / 7); // 0.5% of 80 kg = 0.4 kg a week
  near(t.kgPerWeek, -0.4);
  near(t.protein.lo, 128); near(t.protein.hi, 176); // 1.6–2.2 g/kg without a body fat %
  near(t.fat.g, (0.25 * t.kcal) / 9);
  near(t.carbs.g, (t.kcal - t.protein.g * 4 - t.fat.g * 9) / 4);
  const g = target({ maintenanceKcal: 3000, weightKg: 80, goal: 'gain', pace: 'lean' });
  near(g.change, (0.2 * KCAL_PER_KG) / 7); near(g.fat.g, 80);
  const lean = target({ maintenanceKcal: 3000, weightKg: 80, goal: 'lose', pace: 'steady', bodyFatPct: 15 });
  near(lean.protein.lo, 2.3 * 68); near(lean.protein.hi, 3.1 * 68);
  assert.equal(target({ maintenanceKcal: 3000, weightKg: 80, goal: 'maintain', pace: 'hold' }).change, 0);
});

test('never below resting burn or the 1,500 / 1,200 kcal floor', () => {
  const t = target({ maintenanceKcal: 2000, weightKg: 80, goal: 'lose', pace: 'fast', restKcal: 1800, sex: 'male' });
  assert.equal(t.kcal, 1800); assert.equal(t.floored, true);
  near(t.kgPerWeek, (-200 * 7) / KCAL_PER_KG);
  assert.equal(target({ maintenanceKcal: 1500, weightKg: 55, goal: 'lose', pace: 'fast', sex: 'female' }).kcal, 1200);
  assert.equal(target({ maintenanceKcal: null, weightKg: 80, goal: 'lose', pace: 'steady' }), null);
});
