// Defensive normalisation for data that did not come straight from this app's own code: a restored backup,
// or anything read back from storage. It rebuilds the programme and settings from known fields only, coerces
// every value to its expected type (numbers stay finite numbers, text stays capped text) and drops what does
// not fit. The views rely on this: a restored file can never smuggle markup or a thrown error into them.

const LIMITS = { blocks: 100, weeks: 200, days: 14, entries: 120, sets: 120, cues: 20, items: 500 };
const TEXT_MAX = 2000;

export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e9 ? v : null);
const int = (v) => (Number.isInteger(v) && Math.abs(v) < 1e9 ? v : null);
const str = (v, max = TEXT_MAX) => (typeof v === 'string' ? v.slice(0, max) : v == null ? null : String(v).slice(0, max));
const text = (v, max = TEXT_MAX) => str(v, max) ?? '';
const bool = (v) => v === true;
const unit = (v) => (v === 'lb' ? 'lb' : 'kg');

/** 'YYYY-MM-DD' that is a real calendar date (rejects 2026-02-30). */
export function isStrictDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const weight = (w) => (isObj(w) && num(w.value) !== null && w.value > 0 ? { value: w.value, unit: unit(w.unit), raw: str(w.raw, 100) } : null);

function cleanSet(s, index) {
  if (!isObj(s)) return null;
  const range = isObj(s.loadRange) && num(s.loadRange.min) !== null && num(s.loadRange.max) !== null
    ? { min: s.loadRange.min, max: s.loadRange.max, unit: unit(s.loadRange.unit) } : null;
  const al = isObj(s.actualLoad) && num(s.actualLoad.value) !== null && s.actualLoad.value > 0 ? { value: s.actualLoad.value, unit: unit(s.actualLoad.unit) } : null;
  return {
    index: int(s.index) ?? index + 1,
    repsMin: int(s.repsMin), repsMax: int(s.repsMax), repsRaw: str(s.repsRaw, 100),
    targetRpe: num(s.targetRpe), load: weight(s.load), loadRange: range,
    actualRpe: num(s.actualRpe), actualReps: int(s.actualReps), actualLoad: al,
    coachComment: str(s.coachComment), athleteComment: str(s.athleteComment),
    completed: bool(s.completed),
    source: isObj(s.source) ? { sheet: text(s.source.sheet, 100), row: int(s.source.row) ?? 0, col: int(s.source.col) ?? 0 } : { sheet: '', row: 0, col: 0 },
    warnings: arr(s.warnings, 30).map((w) => text(w, 60)),
    ...(isObj(s.gen) ? { gen: cleanGen(s.gen) } : {}),
  };
}

// Metadata the block generator attaches to each planned set so unfinished weeks can be re-loaded later.
function cleanGen(g) {
  return { slotId: text(g.slotId, 20), kind: text(g.kind, 20), family: ['squat', 'bench', 'deadlift'].includes(g.family) ? g.family : null,
    reps: int(g.reps), rpe: num(g.rpe), e1rmRef: num(g.e1rmRef), k: num(g.k), week: int(g.week) };
}

const FAMILIES = ['squat', 'bench', 'deadlift'];
const famNums = (o) => Object.fromEntries(FAMILIES.map((f) => [f, isObj(o) ? num(o[f]) : null]));
const famText = (o) => Object.fromEntries(FAMILIES.map((f) => [f, isObj(o) ? str(o[f], 12) : null]));
function cleanGenerated(g) {
  return {
    at: text(g.at, 40), focus: text(g.focus, 20), weeks: int(g.weeks) ?? 0, daysPerWeek: int(g.daysPerWeek) ?? 0, progression: text(g.progression, 20),
    rotate: num(g.rotate) ?? 0, seed: text(g.seed, 60), deloadWeek: text(g.deloadWeek, 10), fromBlock: int(g.fromBlock), athleteAsOf: isStrictDate(g.athleteAsOf) ? g.athleteAsOf : null,
    e1rmStart: famNums(g.e1rmStart), confidence: famText(g.confidence),
    rationale: arr(g.rationale, 120).filter(isObj).map((r) => ({ scope: text(r.scope, 12), text: text(r.text, 400) })),
    warnings: arr(g.warnings, 60).map((w) => text(w, 300)),
  };
}

function cleanEntry(e) {
  if (!isObj(e)) return null;
  return {
    exerciseId: str(e.exerciseId, 100), name: text(e.name, 200), rawName: text(e.rawName, 200),
    supersetGroup: str(e.supersetGroup, 10), tempo: str(e.tempo, 10), cues: arr(e.cues, LIMITS.cues).map((c) => text(c, 300)),
    sets: arr(e.sets, LIMITS.sets).map(cleanSet).filter(Boolean),
  };
}

function cleanWeek(w) {
  if (!isObj(w) || int(w.number) === null) return null;
  const t = isObj(w.target) ? { squat: num(w.target.squat), bench: num(w.target.bench), deadlift: num(w.target.deadlift), total: num(w.target.total) } : null;
  return {
    number: w.number, label: text(w.label, 300), target: t, avgCalories: num(w.avgCalories), avgBodyweightKg: num(w.avgBodyweightKg),
    bodyLog: arr(w.bodyLog, 31).filter(isObj).map((b) => ({ weekday: str(b.weekday, 12), bodyweightKg: num(b.bodyweightKg), calories: num(b.calories), raw: text(b.raw, 300) })),
    days: arr(w.days, LIMITS.days).filter((d) => isObj(d) && int(d.number) !== null).map((d) => ({ number: d.number, entries: arr(d.entries, LIMITS.entries).map(cleanEntry).filter(Boolean) })),
  };
}

function cleanReport(r) {
  const rep = isObj(r) ? r : {};
  const byType = {};
  if (isObj(rep.warningsByType)) for (const [k, v] of Object.entries(rep.warningsByType)) if (/^[a-z0-9_]{1,40}$/.test(k) && int(v) !== null) byType[k] = v;
  const n = (k) => int(rep[k]) ?? 0;
  return {
    blocks: n('blocks'), weeks: n('weeks'), days: n('days'), entries: n('entries'), sets: n('sets'), completedSets: n('completedSets'),
    placeholders: n('placeholders'), dateRepsConverted: n('dateRepsConverted'), assumedKgLoads: n('assumedKgLoads'), numericCommentsAsReps: n('numericCommentsAsReps'),
    warningsByType: byType,
    warnings: arr(rep.warnings, LIMITS.items).filter(isObj).map((w) => ({ code: text(w.code, 40), sheet: text(w.sheet, 100), ref: str(w.ref, 20), raw: text(w.raw, 200) })),
    unparsedCells: arr(rep.unparsedCells, LIMITS.items).filter(isObj).map((c) => ({ sheet: text(c.sheet, 100), ref: text(c.ref, 20), raw: text(c.raw, 200), reason: text(c.reason, 200) })),
  };
}

/** Returns a clean programme, or null when `p` is not a programme at all. */
export function sanitizeProgramme(p) {
  if (!isObj(p) || !Array.isArray(p.blocks)) return null;
  const blocks = arr(p.blocks, LIMITS.blocks).filter((b) => isObj(b) && int(b.number) !== null).map((b) => ({
    id: text(b.id, 20) || `b${b.number}`, number: b.number, name: text(b.name, 200), goal: text(b.goal, 1000), instructions: text(b.instructions, 1000),
    weeks: arr(b.weeks, LIMITS.weeks).map(cleanWeek).filter(Boolean),
    ...(isObj(b.generated) ? { generated: cleanGenerated(b.generated) } : {}),
  }));
  const results = isObj(p.overview) ? arr(p.overview.results, 200).filter(isObj).map((r) => ({
    date: isStrictDate(r.date) ? r.date : null, squat: num(r.squat), bench: num(r.bench), deadlift: num(r.deadlift), totalText: text(r.totalText, 40), comment: text(r.comment, 300),
  })) : [];
  return {
    schema: 1, isExample: bool(p.isExample), importedAt: text(p.importedAt, 40),
    source: { fileName: text(isObj(p.source) ? p.source.fileName : '', 200), sheetCount: int(isObj(p.source) ? p.source.sheetCount : 0) ?? 0 },
    overview: { results }, blocks, report: cleanReport(p.report),
  };
}

export const DEFAULT_SETTINGS = Object.freeze({
  unit: 'kg', theme: 'system', barByUnit: {}, customBar: {}, collar: true, plateCounts: null, programmeStart: null, blockStarts: {},
  dayWeekdays: { 1: 1, 2: 2, 3: 4, 4: 5 },
});

/** Whitelist and coerce settings (never trust stored or restored values). */
export function sanitizeSettings(s) {
  const out = { ...DEFAULT_SETTINGS, barByUnit: {}, customBar: {}, blockStarts: {}, dayWeekdays: { ...DEFAULT_SETTINGS.dayWeekdays } };
  if (!isObj(s)) return out;
  if (s.unit === 'kg' || s.unit === 'lb') out.unit = s.unit;
  if (['system', 'dark', 'light'].includes(s.theme)) out.theme = s.theme;
  out.collar = s.collar !== false;
  if (isObj(s.barByUnit)) for (const u of ['kg', 'lb']) if (typeof s.barByUnit[u] === 'string' && /^[a-z0-9_-]{1,20}$/i.test(s.barByUnit[u])) out.barByUnit[u] = s.barByUnit[u];
  if (isObj(s.customBar)) for (const u of ['kg', 'lb']) if (num(s.customBar[u]) !== null && s.customBar[u] > 0 && s.customBar[u] < 500) out.customBar[u] = s.customBar[u];
  if (isObj(s.plateCounts)) {
    out.plateCounts = {};
    for (const u of ['kg', 'lb']) if (isObj(s.plateCounts[u])) {
      out.plateCounts[u] = {};
      for (const [k, v] of Object.entries(s.plateCounts[u])) if (/^\d+(\.\d+)?$/.test(k) && Number.isInteger(v) && v >= 0 && v <= 200) out.plateCounts[u][k] = v;
    }
  }
  out.programmeStart = isStrictDate(s.programmeStart) ? s.programmeStart : null;
  if (isObj(s.blockStarts)) for (const [k, v] of Object.entries(s.blockStarts)) if (/^\d{1,3}$/.test(k) && isStrictDate(v)) out.blockStarts[k] = v;
  if (isObj(s.dayWeekdays)) for (const [k, v] of Object.entries(s.dayWeekdays)) if (/^\d{1,2}$/.test(k) && Number.isInteger(v) && v >= 1 && v <= 7) out.dayWeekdays[k] = v;
  return out;
}
