import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, setsToCsv, backupReminder, BACKUP_VERSION } from '../../src/store/backup.js';
import { canShareBackup, saveBackup } from '../../src/ui/views/data.js';
import { todayIso } from '../../src/ui/dom.js';

test('backup sharing, cancellation and download fallback record only completed actions', async (t) => {
  let downloads = 0, shares = 0, patch = null;
  const element = () => ({ setAttribute() {}, append() {}, remove() {}, click() { downloads++; } });
  t.mock.method(globalThis, 'setTimeout', () => 0);
  globalThis.document = { querySelector() { return null; }, createElement: element, body: { append() {} } };
  navigator.canShare = () => true;
  navigator.share = async () => {};
  t.after(() => { delete globalThis.document; delete navigator.canShare; delete navigator.share; });
  t.mock.method(URL, 'createObjectURL', () => 'blob:backup');
  t.mock.method(navigator, 'canShare', () => true);
  t.mock.method(navigator, 'share', async ({ files, title }) => {
    shares++;
    assert.equal(title, 'Lifting Tracker backup');
    assert.equal(JSON.parse(await files[0].text()).app, 'lifting-tracker');
  });
  const app = { exportBackup: async () => good(), saveSettings: async (p) => { patch = p; } };
  await saveBackup(app, true);
  assert.deepEqual(patch, { lastBackupAt: todayIso(), backupSnoozeUntil: null });
  assert.equal(shares, 1); assert.equal(downloads, 0);
  patch = null;
  navigator.share.mock.mockImplementation(async () => { throw Object.assign(new Error(), { name: 'AbortError' }); });
  await saveBackup(app, true);
  assert.equal(patch, null); assert.equal(downloads, 0);
  navigator.share.mock.mockImplementation(async () => { throw new Error('refused'); });
  await saveBackup(app, true);
  assert.equal(downloads, 1); assert.equal(patch.lastBackupAt, todayIso());
  navigator.canShare.mock.mockImplementation(() => false);
  assert.equal(canShareBackup(), false);
  await saveBackup(app, true);
  assert.equal(downloads, 2);
});

test('backup reminder session, age and snooze boundaries', () => {
  const dates = ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'];
  const cases = [
    [null, 2, '2026-10-15', null, false],
    [null, 3, '2026-10-15', null, true],
    ['2026-10-01', 4, '2026-10-14', null, false],
    ['2026-10-01', 5, '2026-10-14', null, true],
    ['2026-10-01', 1, '2026-10-14', null, false],
    ['2026-10-01', 1, '2026-10-15', null, true],
    ['2026-10-01', 5, '2026-10-15', '2026-10-16', false],
    ['2026-10-01', 5, '2026-10-15', '2026-10-15', true],
    ['2026-10-01', 0, '2026-10-25', null, false],
  ];
  for (const [lastBackupAt, sessions, today, backupSnoozeUntil, due] of cases) {
    assert.deepEqual(backupReminder({ lastBackupAt, backupSnoozeUntil, today, loggedDates: dates.slice(0, sessions) }), { due, sessions });
  }
  assert.deepEqual(backupReminder({ lastBackupAt: '2026-10-02', backupSnoozeUntil: null, today: '2026-10-03', loggedDates: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-03'] }), { due: false, sessions: 1 });
});

test('older backups receive the new settings defaults', () => {
  const r = validateBackup(JSON.stringify(good()));
  const s = r.snapshot.meta.find((m) => m.key === 'settings').value;
  assert.deepEqual([s.keepAwake, s.vibrate, s.lastBackupAt, s.backupSnoozeUntil], [true, true, null, null]);
});

const good = () => ({
  app: 'lifting-tracker', schemaVersion: 1, exportedAt: '2026-10-04T00:00:00.000Z', settings: { unit: 'kg' }, programme: null,
  sessions: [{ id: 's1', date: '2026-10-01', programmeRef: null, note: '', createdAt: 'x', updatedAt: 'x' }],
  sets: [{ id: 'a', sessionId: 's1', exerciseId: 'comp_bench', order: 0, weight: { value: 100, unit: 'kg' }, reps: 5, rpe: 8, isWarmup: false, plannedRef: null, note: '' }],
  bodyweights: [{ id: 'b', date: '2026-10-01', weight: { value: 84.2, unit: 'kg' }, calories: null }],
});

test('a valid backup passes and yields a store snapshot with counts', () => {
  const r = validateBackup(JSON.stringify(good()));
  assert.equal(r.ok, true);
  assert.deepEqual(r.counts, { sessions: 1, sets: 1, bodyweights: 1, activities: 0, intake: 0, hasProgramme: false });
  assert.equal(r.snapshot.meta[0].key, 'settings');
});

test('cardio and work entries restore with the backup; a malformed entry rejects the file', () => {
  const b = good(); b.activities = [{ id: 'c1', date: '2026-10-01', kind: 'shift', minutes: 480, createdAt: 'x' }];
  const r = validateBackup(JSON.stringify(b));
  assert.equal(r.ok, true); assert.equal(r.counts.activities, 1);
  assert.deepEqual(r.snapshot.meta.find((m) => m.key === 'activities').value, b.activities);
  b.activities.push({ id: 'c2', date: '2026-10-01', kind: 'teleport', minutes: 30 });
  const bad = validateBackup(JSON.stringify(b));
  assert.equal(bad.ok, false); assert.match(bad.errors.join(' '), /1 activity entries are malformed/);
  b.activities = 'lots'; assert.equal(validateBackup(JSON.stringify(b)).ok, false);
  b.activities = [{ id: 'c1', date: '2026-10-01', kind: 'shift', minutes: 480 }, { id: 'c1', date: '2026-10-02', kind: 'walk', minutes: 30 }];
  assert.match(validateBackup(JSON.stringify(b)).errors.join(' '), /repeat an id/, 'duplicate ids would let one delete remove both');
  b.activities = Array.from({ length: 20001 }, (_, i) => ({ id: `a${i}`, date: '2026-10-01', kind: 'walk', minutes: 10 }));
  assert.match(validateBackup(JSON.stringify(b)).errors.join(' '), /more than 20000/);
});

test('backups are format 3 so older apps refuse them instead of dropping activities or food; 1 and 2 still restore', () => {
  assert.equal(BACKUP_VERSION, 3);
  for (const v of [1, 2, 3]) assert.equal(validateBackup(JSON.stringify({ ...good(), schemaVersion: v })).ok, true, `format ${v}`);
  assert.match(validateBackup(JSON.stringify({ ...good(), schemaVersion: 4 })).errors[0], /newer version/);
});

test('the food log restores with the backup; a malformed or duplicate entry rejects the file', () => {
  const b = good(); b.intake = [{ id: 'f1', date: '2026-10-01', label: 'Chicken & rice', kcal: 700, protein: 70, fat: 8, carbs: 84 }];
  const r = validateBackup(JSON.stringify(b));
  assert.equal(r.ok, true); assert.equal(r.counts.intake, 1);
  assert.deepEqual(r.snapshot.meta.find((m) => m.key === 'intake').value[0].kcal, 700);
  b.intake.push({ ...b.intake[0] });
  assert.match(validateBackup(JSON.stringify(b)).errors.join(' '), /food log entries are malformed or repeat an id/);
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
