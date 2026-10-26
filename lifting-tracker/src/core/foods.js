// "My meals": your usual foods with values from the Australian Food Composition Database, Release 3.0 (Food
// Standards Australia New Zealand; public food keys below), cooked as eaten. AFCD gives solids per 100 g and liquids
// (milk, coffee, honey) per 100 mL with a specific gravity; energy is "energy, with dietary fibre" in kJ, and
// kcal = kJ ÷ 4.184. Portions: an Australian tablespoon is 20 mL and a cup 250 mL.

const KJ_PER_KCAL = 4.184;
export const UNITS = { g: { label: 'g' }, ml: { label: 'mL' }, tbsp: { label: 'tbsp (20 mL)' }, cup: { label: 'cup (250 mL)' } };

const liquid = (sg, extra = {}) => ({ basis: 'ml', units: { ml: 1, g: 1 / sg, ...extra } });
// [AFCD key, name, kJ, protein, fat, carbs (per 100 g or 100 mL), group, liquid basis]
const AFCD = [
  ['F002593', 'Chicken breast, grilled', 598, 29.8, 2.5, 0, 'Meat'],
  ['F002804', 'Chicken thigh, baked', 733, 24.2, 8.7, 0, 'Meat'],
  ['F000738', 'Beef rump steak, lean, grilled', 710, 32, 4.5, 0, 'Meat'],
  ['F000559', 'Beef, diced, lean, casseroled (curry, stew)', 750, 36.5, 3.5, 0, 'Meat'],
  ['F000562', 'Beef, diced, untrimmed, casseroled (bulalo, stew)', 774, 36.2, 4.3, 0, 'Meat'],
  ['F000667', 'Beef mince, lower fat, cooked', 849, 32.3, 8.1, 0, 'Meat'],
  ['F000679', 'Beef mince, regular fat, cooked', 1108, 29.5, 16.4, 0, 'Meat'],
  ['F007017', 'Pork loin chop, lean, BBQ', 687, 30.6, 4.5, 0, 'Meat'],
  ['F006860', 'Pork belly, rind removed, baked', 1606, 27.4, 30.8, 0, 'Meat'],
  ['F007055', 'Pork mince, cooked', 929, 25.9, 13.2, 0, 'Meat'],
  ['F007661', 'White rice, boiled', 659, 3.1, 0.2, 34.7, 'Carbs'],
  ['F007641', 'Brown rice, boiled', 693, 4.1, 1.1, 33.5, 'Carbs'],
  ['F001463', 'Bread, white', 1050, 9.5, 2, 46.2, 'Carbs'],
  ['F001553', 'Bread, wholemeal', 993, 10.4, 2.5, 39.2, 'Carbs'],
  ['F001621', 'Bread, multigrain', 1078, 10.7, 4.5, 39.8, 'Carbs'],
  ['F001844', 'Weet-Bix', 1418, 11.9, 2.3, 61, 'Carbs'],
  ['F001701', 'Cornflakes', 1625, 7.9, 1.8, 81.8, 'Carbs'],
  ['F007320', 'Potato, boiled', 258, 1.5, 0.1, 12.1, 'Vegetables'],
  ['F002275', 'Carrot, boiled', 139, 1.1, 0.3, 5.1, 'Vegetables'],
  ['F002014', 'Cabbage, boiled', 105, 1.2, 0, 3.9, 'Vegetables'],
  ['F001988', 'Choy sum, boiled', 74, 1.4, 0.3, 0.9, 'Vegetables'],
  ['F001301', 'Bok choy', 79, 2.5, 0.2, 0.6, 'Vegetables'],
  ['F008763', 'Kangkong (water spinach)', 110, 2.9, 0.5, 1, 'Vegetables'],
  ['F003761', 'Eggplant', 85, 1, 0.2, 2.6, 'Vegetables'],
  ['F001973', 'Butter', 3069, 1.1, 82.2, 0.6, 'Extras'],
  ['F004380', 'Honey', 1662, 0.4, 0, 103.4, 'Extras', liquid(1.43, { tbsp: 20 })],
  ['F005634', 'Milk, full cream', 278, 3.4, 3.5, 5.5, 'Drinks', liquid(1.03, { cup: 250 })],
  ['F003065', 'Coffee, long black', 8, 0.3, 0.1, 0, 'Drinks', liquid(1, { cup: 250 })],
  ['F003017', 'Coffee, black, instant', 8, 0.2, 0, 0.2, 'Drinks', liquid(1, { cup: 250 })],
];
export const FOODS = Object.fromEntries(AFCD.map(([key, name, kJ, protein, fat, carbs, group, l]) =>
  [key, { name, group, kcal: kJ / KJ_PER_KCAL, protein, fat, carbs, basis: l?.basis ?? 'g', units: l?.units ?? { g: 1 }, source: 'AFCD' }]));
export const FOOD_GROUPS = [...new Set(AFCD.map((f) => f[6]))];

/** All foods: the built-in list plus your own (per 100 g from a label), keyed by id. */
export const allFoods = (custom = []) => ({ ...FOODS, ...Object.fromEntries(custom.map((f) => [f.id, { ...f, group: 'My foods', basis: 'g', units: { g: 1 } }])) });

/** Nutrition for `amount` of a unit of one food, or null when the food or unit is unknown. */
export function itemNutrition(food, amount, unit = 'g') {
  const perUnit = food?.units?.[unit];
  if (!perUnit || !(amount > 0)) return null;
  const k = (amount * perUnit) / 100; // values are per 100 g or 100 mL of the food's basis
  return { base: amount * perUnit, kcal: food.kcal * k, protein: food.protein * k, fat: food.fat * k, carbs: food.carbs * k };
}

/** Totals for a list of { food (id), amount, unit } items; unknown foods are skipped. */
export function mealTotal(items, foods) {
  const t = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const it of items) {
    const n = itemNutrition(foods[it.food], it.amount, it.unit);
    if (n) for (const k of Object.keys(t)) t[k] += n[k];
  }
  return t;
}
