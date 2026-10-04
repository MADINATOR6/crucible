import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeProgramme, sanitizeSettings, isStrictDate } from '../../src/store/programme-schema.js';
import { validateBackup } from '../../src/store/backup.js';
import { buildExampleProgramme } from '../../src/ui/example-data.js';

const XSS = '<img src=x onerror=alert(1)>';

function leafStrings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) leafStrings(x, out);
  return out;
}
function leafTypes(v, path = '', out = []) {
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) leafTypes(x, `${path}.${k}`, out);
  else out.push([path, typeof v, v]);
  return out;
}

test('strict calendar dates', () => {
  for (const ok of ['2026-02-28', '2024-02-29', '2026-12-31']) assert.equal(isStrictDate(ok), true, ok);
  for (const bad of ['2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '26-01-01', '2026-1-1', '', null, 20260101]) assert.equal(isStrictDate(bad), false, String(bad));
});

test('the example programme survives sanitising unchanged (apart from raw text)', () => {
  const p = buildExampleProgramme();
  const clean = sanitizeProgramme(p);
  assert.equal(clean.blocks[0].weeks.length, p.blocks[0].weeks.length);
  const sets = (x) => x.blocks.flatMap((b) => b.weeks.flatMap((w) => w.days.flatMap((d) => d.entries.flatMap((e) => e.sets))));
  assert.equal(sets(clean).length, sets(p).length);
  assert.deepEqual(sets(clean).map((s) => [s.repsMin, s.repsMax, s.targetRpe, s.load?.value, s.actualRpe, s.completed]), sets(p).map((s) => [s.repsMin, s.repsMax, s.targetRpe, s.load?.value, s.actualRpe, s.completed]));
  assert.deepEqual(sanitizeProgramme(clean), clean, 'idempotent');
});

test('hostile programme fields are coerced to harmless values', () => {
  const p = buildExampleProgramme();
  const b = p.blocks[0];
  b.number = 7; b.name = XSS; b.weeks[0].number = 2;
  const s = b.weeks[0].days[0].entries[0].sets[0];
  s.repsMin = XSS; s.repsMax = { toString: XSS }; s.targetRpe = XSS; s.actualRpe = Infinity; s.actualReps = '5'; s.load = { value: XSS, unit: XSS };
  b.weeks[0].target = { total: XSS, squat: NaN };
  b.weeks[0].avgBodyweightKg = XSS;
  p.report.blocks = XSS; p.report.warningsByType = { rpe_above_10: XSS, '__proto__': 5, ok_code: 3, 'bad code<': 2 };
  const clean = sanitizeProgramme(JSON.parse(JSON.stringify(p)));
  const cs = clean.blocks[0].weeks[0].days[0].entries[0].sets[0];
  assert.deepEqual([cs.repsMin, cs.repsMax, cs.targetRpe, cs.actualRpe, cs.actualReps, cs.load], [null, null, null, null, null, null]);
  assert.equal(clean.blocks[0].weeks[0].target.total, null);
  assert.equal(clean.blocks[0].weeks[0].avgBodyweightKg, null);
  assert.equal(clean.report.blocks, 0);
  assert.deepEqual(clean.report.warningsByType, { ok_code: 3 });
  assert.equal({}.polluted, undefined);
  // Every number-typed field is a finite number or null; names stay text (the views escape text).
  for (const [path, type, value] of leafTypes(clean)) {
    if (/\.(repsMin|repsMax|targetRpe|actualRpe|actualReps|number|index|row|col|total|squat|bench|deadlift|avgCalories|avgBodyweightKg)$/.test(path)) {
      assert.ok(value === null || (type === 'number' && Number.isFinite(value)), `${path} = ${value}`);
    }
  }
});

test('a number field can never carry markup into a view, even as text', () => {
  const p = buildExampleProgramme();
  p.blocks[0].number = XSS;
  assert.equal(sanitizeProgramme(p).blocks.length, 0, 'a block without a numeric number is dropped');
  const q = buildExampleProgramme();
  q.blocks[0].weeks.forEach((w, i) => { if (i === 0) w.number = XSS; });
  assert.equal(sanitizeProgramme(q).blocks[0].weeks.length, q.blocks[0].weeks.length - 1);
  for (const s of leafStrings(sanitizeProgramme(q))) assert.ok(typeof s === 'string');
});

test('non-programmes are rejected and oversized lists are capped', () => {
  for (const bad of [null, 5, 'x', [], {}, { blocks: 'no' }]) assert.equal(sanitizeProgramme(bad), null);
  const big = buildExampleProgramme();
  big.blocks = Array.from({ length: 500 }, (_, i) => ({ ...big.blocks[0], number: i + 1 }));
  assert.equal(sanitizeProgramme(big).blocks.length, 100);
});

test('settings are whitelisted and coerced', () => {
  const s = sanitizeSettings({ unit: XSS, theme: 'neon', collar: 'yes', blockStarts: { 1: 'bad', 2: '2026-02-30', 3: '2026-03-02', x: '2026-03-02' }, dayWeekdays: { 1: 1.5, 2: 9, 3: 4 },
    programmeStart: '2026-13-01', barByUnit: { kg: XSS, lb: 'lb45' }, customBar: { kg: -5, lb: 12.5 }, plateCounts: { kg: { 25: 8, 20: -1, x: 4, 15: 1.5 } }, __proto__: { evil: 1 }, evil: 1 });
  assert.equal(s.unit, 'kg'); assert.equal(s.theme, 'system'); assert.equal(s.collar, true);
  assert.deepEqual(s.blockStarts, { 3: '2026-03-02' });
  assert.deepEqual(s.dayWeekdays, { 1: 1, 2: 2, 3: 4, 4: 5 });
  assert.equal(s.programmeStart, null);
  assert.deepEqual(s.barByUnit, { lb: 'lb45' });
  assert.deepEqual(s.customBar, { lb: 12.5 });
  assert.deepEqual(s.plateCounts, { kg: { 25: 8 } });
  assert.equal(s.evil, undefined);
  assert.deepEqual(sanitizeSettings(null).blockStarts, {});
});

const goodBackup = () => ({
  app: 'lifting-tracker', schemaVersion: 1, settings: { unit: 'kg' }, programme: null,
  sessions: [{ id: 's1', date: '2026-10-01', programmeRef: { blockNumber: 1, weekNumber: 1, dayNumber: 1 }, note: '' }],
  sets: [{ id: 'a', sessionId: 's1', exerciseId: 'comp_bench', order: 0, weight: { value: 100, unit: 'kg' }, reps: 5, rpe: 8, isWarmup: false, plannedRef: { entryIndex: 0, setIndex: 0 }, note: '' }],
  bodyweights: [],
});

test('restore rejects impossible dates, bad refs, duplicate planned sets and non-boolean flags', () => {
  const cases = {
    'impossible date': (b) => { b.sessions[0].date = '2026-02-30'; },
    'bad programmeRef': (b) => { b.sessions[0].programmeRef = { blockNumber: 'x' }; },
    'isWarmup type': (b) => { b.sets[0].isWarmup = 'no'; },
    'plannedRef shape': (b) => { b.sets[0].plannedRef = { entryIndex: -1 }; },
    'empty exercise': (b) => { b.sets[0].exerciseId = ''; },
    'duplicate planned': (b) => { b.sessions.push({ id: 's2', date: '2026-10-02', programmeRef: { blockNumber: 1, weekNumber: 1, dayNumber: 1 }, note: '' }); b.sets.push({ ...b.sets[0], id: 'b', sessionId: 's2' }); },
    'huge weight': (b) => { b.sets[0].weight.value = 1e9; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const b = goodBackup(); mutate(b);
    assert.equal(validateBackup(JSON.stringify(b)).ok, false, name);
  }
  assert.equal(validateBackup(JSON.stringify(goodBackup())).ok, true);
});

test('restore sanitises settings and programme instead of storing them raw', () => {
  const b = goodBackup();
  b.settings = { unit: XSS, blockStarts: { 1: 'bad' }, dayWeekdays: { 1: 1.5 }, evil: 1 };
  b.programme = buildExampleProgramme(); b.programme.blocks[0].name = XSS; b.programme.blocks[0].weeks[0].days[0].entries[0].sets[0].repsMin = XSS;
  const r = validateBackup(JSON.stringify(b));
  assert.equal(r.ok, true);
  const settings = r.snapshot.meta.find((m) => m.key === 'settings').value;
  assert.equal(settings.unit, 'kg'); assert.deepEqual(settings.blockStarts, {}); assert.equal(settings.evil, undefined);
  const prog = r.snapshot.meta.find((m) => m.key === 'programme').value;
  assert.equal(prog.blocks[0].weeks[0].days[0].entries[0].sets[0].repsMin, null);
});

test('restore refuses oversized input without parsing it', () => {
  assert.equal(validateBackup('x'.repeat(100 * 1024 * 1024 + 1)).ok, false);
  assert.equal(validateBackup(undefined).ok, false);
});

test('generator metadata on blocks and sets is kept, coerced and bounded', () => {
  const p = buildExampleProgramme();
  const s = p.blocks[0].weeks[0].days[0].entries[0].sets[0];
  s.gen = { slotId: 'd1s1', kind: 'top', family: 'squat', reps: 3, rpe: 7, e1rmRef: 180, k: 1, week: 1 };
  p.blocks[0].generated = { at: '2026-10-04T00:00:00Z', focus: 'maintenance', weeks: 4, daysPerWeek: 3, progression: 'standard', rotate: 0.5, seed: 's', deloadWeek: 'none', fromBlock: 13, athleteAsOf: '2026-10-01',
    e1rmStart: { squat: 180, bench: 130, deadlift: null }, confidence: { squat: 'high', bench: 'medium', deadlift: 'none' },
    rationale: [{ scope: 'block', text: 'Maintenance: keep intensity, cut volume.' }], warnings: ['bench e1RM is based on little data'] };
  const clean = sanitizeProgramme(JSON.parse(JSON.stringify(p)));
  const cs = clean.blocks[0].weeks[0].days[0].entries[0].sets[0];
  assert.deepEqual(cs.gen, { slotId: 'd1s1', kind: 'top', family: 'squat', reps: 3, rpe: 7, e1rmRef: 180, k: 1, week: 1 });
  assert.equal(clean.blocks[0].generated.focus, 'maintenance');
  assert.deepEqual(clean.blocks[0].generated.e1rmStart, { squat: 180, bench: 130, deadlift: null });
  assert.equal(clean.blocks[0].generated.rationale.length, 1);
  assert.deepEqual(sanitizeProgramme(clean), clean, 'idempotent');
  // hostile values
  s.gen = { slotId: XSS, kind: XSS, family: XSS, reps: XSS, rpe: Infinity, e1rmRef: XSS, k: NaN, week: XSS };
  p.blocks[0].generated.athleteAsOf = '2026-02-30'; p.blocks[0].generated.rationale = [{ scope: XSS, text: XSS }, 5, null]; p.blocks[0].generated.e1rmStart = { squat: XSS };
  const bad = sanitizeProgramme(JSON.parse(JSON.stringify(p)));
  const g = bad.blocks[0].weeks[0].days[0].entries[0].sets[0].gen;
  assert.deepEqual([g.family, g.reps, g.rpe, g.e1rmRef, g.k, g.week], [null, null, null, null, null, null]);
  assert.equal(bad.blocks[0].generated.athleteAsOf, null);
  assert.deepEqual(bad.blocks[0].generated.e1rmStart, { squat: null, bench: null, deadlift: null });
  assert.equal(bad.blocks[0].generated.rationale.length, 1);
  // sets without gen stay without it
  assert.equal('gen' in bad.blocks[0].weeks[1].days[0].entries[0].sets[0], false);
});