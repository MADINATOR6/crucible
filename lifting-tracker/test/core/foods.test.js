import test from 'node:test';
import assert from 'node:assert/strict';
import { FOODS, allFoods, itemNutrition, mealTotal } from '../../src/core/foods.js';
import { sanitizeSettings, sanitizeIntake } from '../../src/store/programme-schema.js';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('AFCD values per 100 g; kcal = kJ ÷ 4.184', () => {
  near(FOODS.F002593.kcal, 598 / 4.184); // chicken breast, grilled
  assert.equal(FOODS.F002593.protein, 29.8);
  near(FOODS.F007641.kcal, 693 / 4.184); assert.equal(FOODS.F007641.carbs, 33.5); // brown rice, boiled
});

test('portions: grams; honey, milk and coffee per 100 mL as AFCD lists them, with tablespoons, cups and grams', () => {
  const chicken = itemNutrition(FOODS.F002593, 200, 'g');
  near(chicken.kcal, 2 * 598 / 4.184); near(chicken.protein, 59.6);
  const honey = itemNutrition(FOODS.F004380, 1, 'tbsp');
  near(honey.base, 20); near(honey.kcal, 0.2 * 1662 / 4.184); // about 79 kcal
  near(itemNutrition(FOODS.F004380, 28.6, 'g').kcal, 0.2 * 1662 / 4.184); // 28.6 g of honey is 20 mL at SG 1.43
  near(itemNutrition(FOODS.F005634, 1, 'cup').kcal, 2.5 * 278 / 4.184); // a cup of full cream milk
  near(itemNutrition(FOODS.F003065, 1, 'cup').kcal, 2.5 * 8 / 4.184);
  assert.equal(itemNutrition(FOODS.F002593, 1, 'tbsp'), null, 'no tablespoon for chicken');
  assert.equal(itemNutrition(FOODS.F002593, 0, 'g'), null);
});

test('a meal totals its items, including your own foods, and skips unknown ones', () => {
  const foods = allFoods([{ id: 'c1', name: 'Protein bar', kcal: 380, protein: 30, fat: 12, carbs: 35 }]);
  const t = mealTotal([{ food: 'F002593', amount: 200, unit: 'g' }, { food: 'F007641', amount: 250, unit: 'g' }, { food: 'c1', amount: 60, unit: 'g' }, { food: 'gone', amount: 100, unit: 'g' }], foods);
  near(t.kcal, (2 * 598 + 2.5 * 693) / 4.184 + 0.6 * 380);
  near(t.protein, 59.6 + 10.25 + 18); near(t.carbs, 83.75 + 21);
});

test('saved meals, custom foods and food log entries are sanitised', () => {
  const s = sanitizeSettings({
    customFoods: [{ id: 'c1', name: 'Bar', kcal: 380, protein: 30, fat: 12, carbs: 35 }, { id: 'c1', name: 'Dup', kcal: 1, protein: 1, fat: 1, carbs: 1 }, { id: 'c2', name: '', kcal: 1, protein: 1, fat: 1, carbs: 1 }],
    meals: [{ id: 'm1', name: 'Chicken & rice', items: [{ food: 'F002593', amount: 200, unit: 'g' }, { food: 'F007641', amount: 250, unit: ['g'] }] }, { id: 'm2', name: 'Empty', items: [] }],
  });
  assert.deepEqual(s.customFoods.map((f) => f.id), ['c1']);
  assert.deepEqual(s.meals.map((m) => [m.id, m.items.length]), [['m1', 1]]);
  const log = sanitizeIntake([{ id: 'a', date: '2026-10-26', label: 'Lunch', kcal: 700, protein: 60, fat: 10, carbs: 80 }, { id: 'a', date: '2026-10-26', label: 'Dup', kcal: 1, protein: 0, fat: 0, carbs: 0 }, { id: 'b', date: 'today', label: 'x', kcal: 1, protein: 0, fat: 0, carbs: 0 }]);
  assert.deepEqual(log.map((e) => e.id), ['a']);
});
