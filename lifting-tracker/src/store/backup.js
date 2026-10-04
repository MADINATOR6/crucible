// JSON backup/restore and CSV export. Restore validates and sanitises everything first and applies in one
// transaction, so a bad or hostile file never leaves the database half-written or the app unable to start.
import { SCHEMA_VERSION } from './db.js';
import { isStrictDate, isObj, sanitizeProgramme, sanitizeSettings } from './programme-schema.js';

const APP = 'lifting-tracker';
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const MAX_RECORDS = 200000;

export async function buildBackup(store) {
  const [settings, programme, sessions, sets, bodyweights] = await Promise.all([
    store.get('meta', 'settings'), store.get('meta', 'programme'), store.getAll('sessions'), store.getAll('sets'), store.getAll('bodyweights'),
  ]);
  return {
    app: APP, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    settings: settings?.value ?? null, programme: programme?.value ?? null, sessions, sets, bodyweights,
  };
}

const isWeight = (w) => isObj(w) && typeof w.value === 'number' && Number.isFinite(w.value) && w.value < 1e5 && (w.unit === 'kg' || w.unit === 'lb');
const isRef3 = (r) => isObj(r) && ['blockNumber', 'weekNumber', 'dayNumber'].every((k) => Number.isInteger(r[k]) && r[k] >= 0 && r[k] < 1e6);
const isPlanned = (r) => isObj(r) && Number.isInteger(r.entryIndex) && r.entryIndex >= 0 && Number.isInteger(r.setIndex) && r.setIndex >= 0;
const refKey = (r) => `${r.blockNumber}:${r.weekNumber}:${r.dayNumber}`;
const shortText = (v, max) => v == null || (typeof v === 'string' && v.length <= max);

/** Returns { ok: true, snapshot, counts } or { ok: false, errors: [string] }. Never throws on bad input. */
export function validateBackup(text) {
  if (typeof text !== 'string') return { ok: false, errors: ['That file could not be read as text.'] };
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, errors: ['That file is too large to be a backup.'] };
  let json;
  try { json = JSON.parse(text); } catch { return { ok: false, errors: ['That file is not valid JSON.'] }; }
  const errors = [];
  if (!isObj(json) || json.app !== APP) return { ok: false, errors: ['This is not a Lifting Tracker backup (missing app marker).'] };
  if (!Number.isInteger(json.schemaVersion) || json.schemaVersion < 1) errors.push('Missing or invalid schemaVersion.');
  else if (json.schemaVersion > SCHEMA_VERSION) errors.push(`Backup is from a newer version (schema ${json.schemaVersion}); this app understands up to ${SCHEMA_VERSION}.`);
  for (const k of ['sessions', 'sets', 'bodyweights']) {
    if (!Array.isArray(json[k])) errors.push(`"${k}" must be a list.`);
    else if (json[k].length > MAX_RECORDS) errors.push(`"${k}" has too many records.`);
  }
  if (errors.length) return { ok: false, errors };

  const ids = new Set();
  const checkId = (r, kind, i) => {
    if (!isObj(r) || typeof r.id !== 'string' || !r.id || r.id.length > 100) { errors.push(`${kind} #${i + 1}: missing or invalid id.`); return false; }
    const k = kind + ':' + r.id;
    if (ids.has(k)) errors.push(`${kind} #${i + 1}: duplicate id.`);
    ids.add(k);
    return true;
  };
  const sessions = [];
  json.sessions.forEach((r, i) => {
    if (!checkId(r, 'session', i)) return;
    if (!isStrictDate(r.date)) errors.push(`session #${i + 1}: bad date.`);
    if (r.programmeRef != null && !isRef3(r.programmeRef)) errors.push(`session #${i + 1}: bad programmeRef.`);
    if (!shortText(r.note, 2000)) errors.push(`session #${i + 1}: note too long.`);
    sessions.push({ id: r.id, date: r.date, programmeRef: r.programmeRef == null ? null : { blockNumber: r.programmeRef.blockNumber, weekNumber: r.programmeRef.weekNumber, dayNumber: r.programmeRef.dayNumber },
      note: typeof r.note === 'string' ? r.note : '', createdAt: String(r.createdAt ?? ''), updatedAt: String(r.updatedAt ?? '') });
  });
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const plannedSeen = new Set();
  const sets = [];
  json.sets.forEach((r, i) => {
    if (!checkId(r, 'set', i)) return;
    const sess = sessionById.get(r.sessionId);
    if (!sess) errors.push(`set #${i + 1}: refers to a missing session.`);
    if (typeof r.exerciseId !== 'string' || !r.exerciseId || r.exerciseId.length > 120) errors.push(`set #${i + 1}: missing exerciseId.`);
    if (!isWeight(r.weight) || r.weight.value < 0) errors.push(`set #${i + 1}: bad weight.`);
    if (!Number.isInteger(r.reps) || r.reps < 0 || r.reps > 1000) errors.push(`set #${i + 1}: bad reps.`);
    if (r.rpe != null && !(typeof r.rpe === 'number' && Number.isFinite(r.rpe) && r.rpe >= 1 && r.rpe <= 11)) errors.push(`set #${i + 1}: bad rpe.`);
    if (typeof r.isWarmup !== 'boolean') errors.push(`set #${i + 1}: isWarmup must be true or false.`);
    if (r.order != null && !(Number.isInteger(r.order) && r.order >= 0)) errors.push(`set #${i + 1}: bad order.`);
    if (r.plannedRef != null) {
      if (!isPlanned(r.plannedRef)) errors.push(`set #${i + 1}: bad plannedRef.`);
      else if (sess?.programmeRef) {
        const key = `${refKey(sess.programmeRef)}:${r.plannedRef.entryIndex}:${r.plannedRef.setIndex}`;
        if (plannedSeen.has(key)) errors.push(`set #${i + 1}: a second logged set claims the same planned set.`);
        plannedSeen.add(key);
      }
    }
    if (!shortText(r.note, 2000)) errors.push(`set #${i + 1}: note too long.`);
    sets.push({ id: r.id, sessionId: r.sessionId, exerciseId: r.exerciseId, order: r.order ?? 0, weight: { value: r.weight?.value, unit: r.weight?.unit }, reps: r.reps, rpe: r.rpe ?? null,
      isWarmup: r.isWarmup === true, plannedRef: r.plannedRef == null ? null : { entryIndex: r.plannedRef.entryIndex, setIndex: r.plannedRef.setIndex }, note: typeof r.note === 'string' ? r.note : '',
      createdAt: String(r.createdAt ?? ''), updatedAt: String(r.updatedAt ?? '') });
  });
  const bodyweights = [];
  json.bodyweights.forEach((r, i) => {
    if (!checkId(r, 'bodyweight', i)) return;
    if (!isStrictDate(r.date)) errors.push(`bodyweight #${i + 1}: bad date.`);
    if (!isWeight(r.weight) || r.weight.value <= 0) errors.push(`bodyweight #${i + 1}: bad weight.`);
    if (r.calories != null && !(typeof r.calories === 'number' && Number.isFinite(r.calories) && r.calories >= 0 && r.calories < 1e5)) errors.push(`bodyweight #${i + 1}: bad calories.`);
    bodyweights.push({ id: r.id, date: r.date, weight: { value: r.weight?.value, unit: r.weight?.unit }, calories: r.calories ?? null, createdAt: String(r.createdAt ?? '') });
  });
  let programme = null;
  if (json.programme != null) {
    programme = sanitizeProgramme(json.programme);
    if (!programme) errors.push('programme is malformed.');
  }
  if (json.settings != null && !isObj(json.settings)) errors.push('settings is malformed.');
  if (errors.length) return { ok: false, errors: errors.slice(0, 20).concat(errors.length > 20 ? [`…and ${errors.length - 20} more.`] : []) };
  const settings = json.settings ? sanitizeSettings(json.settings) : null;
  const snapshot = {
    meta: [...(settings ? [{ key: 'settings', value: settings }] : []), ...(programme ? [{ key: 'programme', value: programme }] : [])],
    sessions, sets, bodyweights,
  };
  return { ok: true, snapshot, counts: { sessions: sessions.length, sets: sets.length, bodyweights: bodyweights.length, hasProgramme: !!programme } };
}

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function setsToCsv(sets, sessionsById) {
  const head = ['date', 'exercise_id', 'weight', 'unit', 'reps', 'rpe', 'warmup', 'note'];
  const rows = sets.map((s) => [sessionsById.get(s.sessionId)?.date ?? '', s.exerciseId, s.weight.value, s.weight.unit, s.reps, s.rpe ?? '', s.isWarmup ? 'yes' : 'no', s.note ?? '']);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
