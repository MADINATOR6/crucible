import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, setsToCsv } from '../../src/store/backup.js';

const good = () => ({
  app: 'lifting-tracker', schemaVersion: 1, exportedAt: '2026-10-04T00:00:00.000Z', settings: { unit: 'kg' }, programme: null,
  sessions: [{ id: 's1', date: '2026-10-01', programmeRef: null, note: '', createdAt: 'x', updatedAt: 'x' }],
  sets: [{ id: 'a', sessionId: 's1', exerciseId: 'comp_bench', order: 0, weight: { value: 100, unit: 'kg' }, reps: 5, rpe: 8, isWarmup: false, plannedRef: null, note: '' }],
  bodyweights: [{ id: 'b', date: '2026-10-01', weight: { value: 84.2, unit: 'kg' }, calories: null }],
});

test('a valid backup passes and yields a store snapshot with counts', () => {
  const r = validateBackup(JSON.stringify(good()));
  assert.equal(r.ok, true);
  assert.deepEqual(r.counts, { sessions: 1, sets: 1, bodyweights: 1, hasProgramme: false });
  assert.equal(r.snapshot.meta[0].key, 'settings');
});

test('rejects non-JSON, foreign files and newer schemas without throwing', () => {
  assert.equal(validateBackup('not json').ok, false);
  assert.equal(validateBackup('{"hello":1}').ok, false);
  const newer = good(); newer.schemaVersion = 99;
  const r = validateBackup(JSON.stringify(newer));
  assert.equal(r.ok, false); assert.match(r.errors[0], /newer version/);
});

test('reports every kind of bad record and never produces a snapshot', () => {
  const b = good();
  b.sets[0].sessionId = 'missing'; b.sets[0].weight = { value: 'x', unit: 'st' }; b.sets[0].reps = -1; b.sets[0].rpe = 99;
  b.sessions[0].date = '01/10/2026'; b.bodyweights[0].weight.value = 0;
  b.sets.push({ ...good().sets[0] }); b.sets.push({ ...good().sets[0] }); // duplicate ids
  const r = validateBackup(JSON.stringify(b));
  assert.equal(r.ok, false);
  const text = r.errors.join('\n');
  for (const frag of ['missing session', 'bad weight', 'bad reps', 'bad rpe', 'bad date', 'duplicate id']) assert.match(text, new RegExp(frag));
  assert.equal(r.snapshot, undefined);
});

test('CSV export escapes quotes and neutralises spreadsheet formulas', () => {
  const sessions = new Map([['s1', { date: '2026-10-01' }]]);
  const sets = [{ sessionId: 's1', exerciseId: '=HYPERLINK("x")', weight: { value: 100, unit: 'kg' }, reps: 5, rpe: null, isWarmup: true, note: 'a "b", c' }];
  const csv = setsToCsv(sets, sessions);
  const [head, row] = csv.trim().split('\r\n');
  assert.equal(head, 'date,exercise_id,weight,unit,reps,rpe,warmup,note');
  assert.ok(row.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(row.endsWith('yes,"a ""b"", c"'));
});
