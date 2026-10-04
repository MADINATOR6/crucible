// JSON backup/restore and CSV export. Restore validates everything first and applies in one
// transaction, so a bad file never leaves the database half-written.
import { SCHEMA_VERSION } from './db.js';

const APP = 'lifting-tracker';

export async function buildBackup(store) {
  const [settings, programme, sessions, sets, bodyweights] = await Promise.all([
    store.get('meta', 'settings'), store.get('meta', 'programme'), store.getAll('sessions'), store.getAll('sets'), store.getAll('bodyweights'),
  ]);
  return {
    app: APP, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    settings: settings?.value ?? null, programme: programme?.value ?? null, sessions, sets, bodyweights,
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isWeight = (w) => isObj(w) && Number.isFinite(w.value) && (w.unit === 'kg' || w.unit === 'lb');

/** Returns { ok: true, snapshot, counts } or { ok: false, errors: [string] }. Never throws on bad input. */
export function validateBackup(text) {
  let json;
  try { json = JSON.parse(text); } catch { return { ok: false, errors: ['That file is not valid JSON.'] }; }
  const errors = [];
  if (!isObj(json) || json.app !== APP) return { ok: false, errors: ['This is not a Lifting Tracker backup (missing app marker).'] };
  if (!Number.isInteger(json.schemaVersion) || json.schemaVersion < 1) errors.push('Missing or invalid schemaVersion.');
  else if (json.schemaVersion > SCHEMA_VERSION) errors.push(`Backup is from a newer version (schema ${json.schemaVersion}); this app understands up to ${SCHEMA_VERSION}.`);
  for (const k of ['sessions', 'sets', 'bodyweights']) if (!Array.isArray(json[k])) errors.push(`"${k}" must be a list.`);
  if (errors.length) return { ok: false, errors };
  const ids = new Set();
  const checkId = (r, kind, i) => {
    if (!isObj(r) || typeof r.id !== 'string' || !r.id) { errors.push(`${kind} #${i + 1}: missing id.`); return false; }
    const k = kind + ':' + r.id;
    if (ids.has(k)) errors.push(`${kind} #${i + 1}: duplicate id.`);
    ids.add(k);
    return true;
  };
  json.sessions.forEach((r, i) => { if (checkId(r, 'session', i) && !isDate(r.date)) errors.push(`session #${i + 1}: bad date.`); });
  const sessionIds = new Set(json.sessions.map((s) => s?.id));
  json.sets.forEach((r, i) => {
    if (!checkId(r, 'set', i)) return;
    if (!sessionIds.has(r.sessionId)) errors.push(`set #${i + 1}: refers to a missing session.`);
    if (typeof r.exerciseId !== 'string') errors.push(`set #${i + 1}: missing exerciseId.`);
    if (!isWeight(r.weight) || r.weight.value < 0) errors.push(`set #${i + 1}: bad weight.`);
    if (!Number.isInteger(r.reps) || r.reps < 0 || r.reps > 1000) errors.push(`set #${i + 1}: bad reps.`);
    if (r.rpe != null && !(Number.isFinite(r.rpe) && r.rpe >= 1 && r.rpe <= 11)) errors.push(`set #${i + 1}: bad rpe.`);
  });
  json.bodyweights.forEach((r, i) => { if (checkId(r, 'bodyweight', i)) { if (!isDate(r.date)) errors.push(`bodyweight #${i + 1}: bad date.`); if (!isWeight(r.weight) || r.weight.value <= 0) errors.push(`bodyweight #${i + 1}: bad weight.`); } });
  if (json.programme != null && !(isObj(json.programme) && Array.isArray(json.programme.blocks))) errors.push('programme is malformed.');
  if (json.settings != null && !isObj(json.settings)) errors.push('settings is malformed.');
  if (errors.length) return { ok: false, errors: errors.slice(0, 20).concat(errors.length > 20 ? [`…and ${errors.length - 20} more.`] : []) };
  const snapshot = {
    meta: [
      ...(json.settings ? [{ key: 'settings', value: json.settings }] : []),
      ...(json.programme ? [{ key: 'programme', value: json.programme }] : []),
    ],
    sessions: json.sessions, sets: json.sets, bodyweights: json.bodyweights,
  };
  return { ok: true, snapshot, counts: { sessions: json.sessions.length, sets: json.sets.length, bodyweights: json.bodyweights.length, hasProgramme: !!json.programme } };
}

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function setsToCsv(sets, sessionsById) {
  const head = ['date', 'exercise_id', 'weight', 'unit', 'reps', 'rpe', 'warmup', 'note'];
  const rows = sets.map((s) => [sessionsById.get(s.sessionId)?.date ?? '', s.exerciseId, s.weight.value, s.weight.unit, s.reps, s.rpe ?? '', s.isWarmup ? 'yes' : 'no', s.note ?? '']);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
