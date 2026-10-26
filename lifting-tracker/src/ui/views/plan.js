// Plan view: tell the app what you need ("maintenance block, 3 days") and it builds the next block from your
// own recent training. Everything it proposes is editable afterwards; it is a planning aid, not coaching advice.
import { convert, formatWeight, round1, toKg } from '../../core/units.js';
import { esc, toast, todayIso } from '../dom.js';
import { renderHeatmap, renderLegend, renderMuscleList, fmtSets } from '../heatmap.js';
import { coachReview, applyExtras, blockVolume } from '../../core/coach.js';

let mods = null; // the planning modules are loaded on first use, so the rest of the app never depends on them
async function loadMods() {
  if (mods) return mods;
  const [athlete, template, generator, request] = await Promise.all([
    import('../../core/athlete.js'), import('../../core/template.js'), import('../../core/generator.js'), import('../../core/request.js'),
  ]);
  mods = { ...athlete, ...template, ...generator, ...request };
  return mods;
}

const FOCI = [
  { id: 'maintenance', label: 'Maintain', blurb: 'Hold your strength with less volume and fatigue.' },
  { id: 'strength', label: 'Build strength', blurb: 'Progress the main lifts week to week.' },
  { id: 'volume', label: 'Build size', blurb: 'More sets, steady loads.' },
  { id: 'return', label: 'Back from a break', blurb: 'Ease back in after time off.' },
  { id: 'peak', label: 'Peak for a meet', blurb: 'Sharpen towards heavy singles.' },
  { id: 'specialise', label: 'Bring up a lift', blurb: 'Extra work on one lift.' },
  { id: 'deload', label: 'Deload', blurb: 'An easy block to recover.' },
];
const LIFTS = ['squat', 'bench', 'deadlift'];
const coachSource = (programme) => JSON.stringify([programme.importedAt, programme.blocks.map((b) => [b.id, b.number, b.weeks.length])]);
const oneOf = (v, values) => values.includes(v);
const optionalNumber = (v, lo, hi, integer = false) => v === null || (Number.isFinite(v) && v >= lo && v <= hi && (!integer || Number.isInteger(v)));

function coachInputs(app, p) {
  return { source: coachSource(app.programme), unit: app.settings.unit, text: p.text.slice(0, 5000), settings: {
    focus: p.focus, weeks: p.weeks, days: p.days, progression: p.progression, rotate: p.rotate, stance: p.stance,
    emphasis: p.emphasis, layoffWeeks: p.layoffWeeks, checkIn: p.checkIn, deloadWeek: p.deloadWeek,
    style: p.style, topReps: p.topReps, topRpe: p.topRpe, backoff: { ...p.backoff }, setsAcross: { ...p.setsAcross },
    rpeCap: p.rpeCap, accessories: p.accessories, variations: p.variations, overrides: { ...p.overrides },
  } };
}

function recoveredCoachInputs(app, saved) {
  const v = saved?.value, s = v?.settings;
  if (!v || v.source !== coachSource(app.programme) || v.unit !== app.settings.unit || typeof v.text !== 'string' || v.text.length > 5000 || !s || typeof s !== 'object') return null;
  if (!oneOf(s.focus, FOCI.map((x) => x.id)) || !optionalNumber(s.weeks, 3, 8, true) || !optionalNumber(s.days, 1, 7, true) ||
      !oneOf(s.progression, ['standard', 'conservative', 'aggressive']) || !oneOf(s.rotate, [null, 0, 0.3, 0.7]) ||
      !oneOf(s.stance, ['auto', 'sumo', 'conventional']) || !oneOf(s.emphasis, LIFTS) || !optionalNumber(s.layoffWeeks, 1, 52, true) ||
      typeof s.checkIn !== 'boolean' || !oneOf(s.deloadWeek, ['auto', 'none', 'last', 'all']) ||
      !oneOf(s.style, ['auto', 'top-single', 'top-set', 'sets-across', 'singles', 'heavy-light']) ||
      !optionalNumber(s.topReps, 1, 6, true) || !optionalNumber(s.topRpe, 7, 9.5) || (s.topRpe != null && s.topRpe * 2 !== Math.round(s.topRpe * 2)) ||
      !optionalNumber(s.rpeCap, 6, 10) || !oneOf(s.accessories, ['normal', 'more', 'minimal', 'none']) ||
      !oneOf(s.variations, ['keep', 'competition-only']) || !s.backoff || typeof s.backoff !== 'object' || !s.setsAcross || typeof s.setsAcross !== 'object') return null;
  const backoff = {}, setsAcross = {}, overrides = {};
  for (const [key, lo, hi, integer] of [['sets', 1, 6, true], ['reps', 1, 10, true], ['drop', 0.03, 0.30, false]]) {
    if (s.backoff[key] != null) { if (!optionalNumber(s.backoff[key], lo, hi, integer)) return null; backoff[key] = s.backoff[key]; }
  }
  for (const [key, lo, hi] of [['sets', 2, 10], ['reps', 1, 12]]) {
    if (s.setsAcross[key] != null) { if (!optionalNumber(s.setsAcross[key], lo, hi, true)) return null; setsAcross[key] = s.setsAcross[key]; }
  }
  if (!s.overrides || typeof s.overrides !== 'object') return null;
  for (const lift of LIFTS) {
    const o = s.overrides[lift];
    if (!o) continue;
    if (!Number.isFinite(o.value) || !oneOf(o.unit, ['kg', 'lb']) || convert(o.value, o.unit, 'kg') < 20 || convert(o.value, o.unit, 'kg') > 600) return null;
    overrides[lift] = { value: o.value, unit: o.unit };
  }
  return { text: v.text, focus: s.focus, weeks: s.weeks, days: s.days, progression: s.progression, rotate: s.rotate, stance: s.stance,
    emphasis: s.emphasis, layoffWeeks: s.layoffWeeks, checkIn: s.checkIn, deloadWeek: s.deloadWeek, style: s.style,
    topReps: s.topReps, topRpe: s.topRpe, backoff, setsAcross, rpeCap: s.rpeCap, accessories: s.accessories,
    variations: s.variations, overrides };
}

function optionText({ key, value }) {
  if (value == null) return 'Automatic';
  if (key === 'focus') return FOCI.find((f) => f.id === value)?.label ?? String(value);
  if (key === 'weeks') return `${value} weeks`;
  if (key === 'daysPerWeek') return `${value} days/week`;
  if (key === 'style') return ({ auto: 'Like my last block', 'top-single': 'Top single + back-offs', 'top-set': 'Top set + back-offs', 'sets-across': 'Sets across', singles: 'Singles', 'heavy-light': 'Heavy and light' })[value] ?? String(value);
  if (key === 'topReps') return `Top set: ${value} reps`;
  if (key === 'topRpe') return `Start at RPE ${value}`;
  if (key === 'setsAcross') return `Sets across: ${value.sets ?? 'auto'} × ${value.reps ?? 'auto'}`;
  if (key === 'backoff') return `Back-offs: ${[value.sets != null ? `${value.sets} sets` : '', value.reps != null ? `${value.reps} reps` : '', value.drop != null ? `${+(value.drop * 100).toFixed(2)}% lighter` : ''].filter(Boolean).join(', ') || 'automatic'}`;
  if (key === 'rpeCap') return `RPE cap ${value}`;
  if (key === 'accessories') return `${value[0].toUpperCase()}${value.slice(1)} accessories`;
  if (key === 'variations') return value === 'competition-only' ? 'Competition lifts only' : 'Keep variations';
  if (key === 'emphasis') return `Bring up ${value}`;
  if (key === 'deadliftStance') return `${value[0].toUpperCase()}${value.slice(1)} deadlift`;
  if (key === 'progression') return `${value[0].toUpperCase()}${value.slice(1)} progression`;
  if (key === 'rotate') return value === 0 ? 'Keep exercises' : 'More variety';
  if (key === 'deloadWeek') return ({ none: 'No deload', last: 'Deload last week', all: 'Deload every week', auto: 'Automatic deload' })[value] ?? String(value);
  if (key === 'checkIn') return value ? 'Heavy single check-in' : 'No check-in';
  if (key === 'layoffWeeks') return `Back after ${value} weeks`;
  return String(value);
}

function choiceValue(p, key) {
  return ({ focus: p.focus, weeks: p.weeks, daysPerWeek: p.days, progression: p.progression, rotate: p.rotate,
    deadliftStance: p.stance, deloadWeek: p.deloadWeek, emphasis: p.emphasis, layoffWeeks: p.layoffWeeks,
    checkIn: p.checkIn, style: p.style, topReps: p.topReps, topRpe: p.topRpe, backoff: p.backoff,
    setsAcross: p.setsAcross, rpeCap: p.rpeCap, accessories: p.accessories, variations: p.variations })[key];
}

const EDIT_CONTROL = {
  focus: '[data-focus]', weeks: '#p-weeks', daysPerWeek: '#p-days', progression: '#p-prog', rotate: '#p-rot',
  deadliftStance: '#p-stance', deloadWeek: '#p-deload', emphasis: '#p-emph', layoffWeeks: '#p-layoff', checkIn: '#p-checkin',
  style: '#p-style', topReps: '#p-top-reps', topRpe: '#p-top-rpe', rpeCap: '#p-rpe-cap',
  accessories: '#p-accessories', variations: '#p-variations',
};

function comparisonHtml(template, result, style) {
  const weekSets = result.block.weeks.map((w) => w.days.reduce((n, d) => n + d.entries.reduce((sum, e) => sum + e.sets.length, 0), 0));
  const templateSets = template.days.flatMap((d) => d.slots).map((s) => s.sets).filter(Number.isFinite);
  const templateRpes = template.days.flatMap((d) => d.slots).filter((s) => s.role === 'main' || s.role === 'variation').map((s) => s.rpe).filter(Number.isFinite);
  const draftRpes = result.block.weeks.flatMap((w) => w.days.flatMap((d) => d.entries.flatMap((e) => e.sets.filter((s) => s.gen?.family).map((s) => s.targetRpe)))).filter(Number.isFinite);
  const range = (values) => values.length ? `${Math.min(...values)}${Math.min(...values) === Math.max(...values) ? '' : `–${Math.max(...values)}`}` : '—';
  const schemes = [...new Set(template.days.flatMap((d) => d.slots).filter((s) => s.role === 'main').map((s) => ({ 'top-backoff': 'Top set + back-offs', straight: 'Sets across', singles: 'Singles' })[s.scheme] || s.scheme))];
  const oldStyle = schemes.length ? schemes.join(' / ') : 'No main lifts';
  const draftStyle = ({ 'top-single': 'Top single + back-offs', 'top-set': 'Top set + back-offs', 'sets-across': 'Sets across', singles: 'Singles', 'heavy-light': 'Heavy and light' })[style] || oldStyle;
  return `<div class="card mt-4"><div class="card-h"><h2>What changes from your last block</h2></div>
    <div class="scroll-x"><table class="plain"><thead><tr><th></th><th>Last block template</th><th>Draft</th></tr></thead><tbody>
    <tr><th>Training days/week</th><td>${template.days.length}</td><td>${result.block.weeks[0]?.days.length ?? '—'}</td></tr>
    <tr><th>Sets/week</th><td>${templateSets.length ? templateSets.reduce((n, x) => n + x, 0) : '—'}</td><td>${range(weekSets)}</td></tr>
    <tr><th>Main-lift style</th><td>${esc(oldStyle)}</td><td>${esc(draftStyle)}</td></tr>
    <tr><th>Max target RPE (main lifts and variations)</th><td>${range(templateRpes.length ? [Math.max(...templateRpes)] : [])}</td><td>${range(draftRpes.length ? [Math.max(...draftRpes)] : [])}</td></tr>
    </tbody></table></div><p class="small muted mt-2">Sets/week includes every exercise; a range shows weeks that differ, including a deload. RPE excludes accessories.</p></div>`;
}

function pickTemplateBlock(programme) {
  const blocks = [...programme.blocks].sort((a, b) => a.number - b.number);
  const doneWeeks = (b) => b.weeks.filter((w) => w.days.some((d) => d.entries.some((e) => e.sets.some((s) => s.completed)))).length;
  const withDone = blocks.filter((b) => doneWeeks(b) >= 2);
  return (withDone.at(-1) || blocks.filter((b) => b.weeks.length).at(-1) || null)?.number ?? null;
}

function nextBlockNumber(programme) { return Math.max(0, ...programme.blocks.map((b) => b.number)) + 1; }

/** Athlete model with the user's own e1RM entries applied on top. */
function athleteFor(app, ui) {
  const model = app.athlete(); // cached by the app until the data changes
  const o = ui.plan.overrides || {};
  const key = JSON.stringify(o);
  const c = ui.plan._ath;
  if (c && c.model === model && c.key === key) return c.athlete;
  const lifts = { ...model.lifts };
  for (const f of LIFTS) {
    const e = o[f]; // { value, unit }: stored with its unit so changing the display unit never changes the number
    const kg = e && Number.isFinite(e.value) && (e.unit === 'kg' || e.unit === 'lb') ? convert(e.value, e.unit, 'kg') : null;
    if (kg != null && kg >= 20 && kg <= 600) lifts[f] = { ...lifts[f], e1rmKg: round1(kg), confidence: 'high', basis: 'entered by you', n: lifts[f]?.n ?? 0 };
  }
  const athlete = { ...model, lifts };
  ui.plan._ath = { model, key, athlete };
  return athlete;
}

function templateFor(app, athlete, ui) {
  const c = ui.plan._tpl;
  if (c && c.programme === app.programme && c.athlete === athlete) return c.template;
  const template = learnTemplateFor(app, athlete);
  ui.plan._tpl = { programme: app.programme, athlete, template };
  return template;
}

function learnTemplateFor(app, athlete) {
  const m = mods;
  const blockNumber = pickTemplateBlock(app.programme);
  if (blockNumber == null) return null;
  // The athlete's e1RM when that block was run: events up to the end of the block, else today's numbers.
  const block = app.programme.blocks.find((b) => b.number === blockNumber);
  const lastWeek = block?.weeks.at(-1);
  const end = lastWeek ? app.dateFor({ blockNumber, weekNumber: lastWeek.number, dayNumber: lastWeek.days.at(-1)?.number ?? 1 }) : null;
  let reference = Object.fromEntries(LIFTS.map((f) => [f, athlete.lifts[f]?.e1rmKg ?? null]));
  if (end) {
    const then = m.buildAthleteModel({ events: app.events().filter((e) => e.date <= end), catalogue: app.catalogue, asOf: end });
    reference = Object.fromEntries(LIFTS.map((f) => [f, then.lifts[f]?.e1rmKg ?? reference[f]]));
  }
  return m.learnTemplate({ programme: app.programme, catalogue: app.catalogue, referenceE1rm: reference, blockNumber });
}

function optionsFrom(p) {
  const o = { focus: p.focus };
  if (p.weeks) o.weeks = p.weeks;
  if (p.days) o.daysPerWeek = p.days;
  if (p.progression && p.progression !== 'standard') o.progression = p.progression;
  if (p.rotate != null) o.rotate = p.rotate;
  if (p.stance && p.stance !== 'auto') o.deadliftStance = p.stance;
  if (p.deloadWeek && p.deloadWeek !== 'auto' && p.focus !== 'deload') o.deloadWeek = p.deloadWeek; // a deload block is a deload every week
  if (p.focus === 'specialise') o.emphasis = p.emphasis || 'bench';
  if (p.focus === 'return') o.layoffWeeks = p.layoffWeeks || 4;
  if (p.focus === 'maintenance') o.checkIn = p.checkIn !== false;
  if (p.style && p.style !== 'auto') o.style = p.style;
  if (p.style === 'top-set' && p.topReps != null) o.topReps = p.topReps;
  if (['top-single', 'top-set', 'heavy-light'].includes(p.style)) {
    if (p.topRpe != null) o.topRpe = p.topRpe;
    if (Object.keys(p.backoff || {}).length) o.backoff = { ...p.backoff };
  }
  if (p.style === 'sets-across' && Object.keys(p.setsAcross || {}).length) o.setsAcross = { ...p.setsAcross };
  if (p.rpeCap != null) o.rpeCap = p.rpeCap;
  if (p.accessories && p.accessories !== 'normal') o.accessories = p.accessories;
  if (p.variations && p.variations !== 'keep') o.variations = p.variations;
  return o;
}

function blockAsText(block, unit) {
  const lines = [`${block.name} (generated)`, ''];
  for (const w of block.weeks) {
    lines.push(w.label);
    for (const d of w.days) {
      lines.push(`  Day ${d.number}`);
      for (const e of d.entries) {
        lines.push(`    ${e.name}: ` + e.sets.map((s) => `${s.repsRaw ?? (s.repsMin === s.repsMax ? s.repsMin : s.repsMin + '-' + s.repsMax)}${s.targetRpe != null ? '@' + s.targetRpe : ''}${s.load ? ' ' + formatWeight(s.load, unit) : ''}`).join(', '));
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function planView(app, ui) {
  const unit = app.settings.unit;
  const keptMessage = app.store?.persistent === false ? 'Inputs are temporary and will be lost when you close this tab.' : 'Inputs kept on this device; no block was added.';
  ui.plan ||= { text: '', interpretedText: null, editedAfterRequest: false, settingsOpen: false, focus: 'strength', weeks: null, days: null, progression: 'standard', rotate: null, stance: 'auto', emphasis: 'bench', layoffWeeks: 4, checkIn: true, deloadWeek: 'auto', style: 'auto', topReps: null, topRpe: null, backoff: {}, setsAcross: {}, rpeCap: null, accessories: 'normal', variations: 'keep', seed: 'a', overrides: {}, understood: null, result: null, error: '', week: 1, revise: null, extras: [], applied: [] };
  const p = ui.plan;
  if (!p.draftChecked && !app.usingExample) {
    p.draftChecked = true;
    const saved = app.getDraft?.('coach');
    if (saved) {
      const inputs = recoveredCoachInputs(app, saved);
      if (inputs) { Object.assign(p, inputs); p.draftStatus = 'recovered'; }
      else p.draftStatus = 'stale';
    }
  }
  if (p.revise) { // an old revision must never be applied to a block that has since been removed or replaced
    const cur = app.programme.blocks.find((b) => b.number === p.revise.number);
    if (!cur?.generated || app.blockToken(p.revise.number) !== p.revise.baseToken) p.revise = null;
  }
  if (app.usingExample) {
    return { html: `<div class="topbar"><div><h1>Coach</h1></div><span class="pill example">Example data</span></div>
      <div class="card empty"><h2>Import your workbook first</h2><p>The block generator learns from your own recent training, so it needs your programme. Import your coach's workbook in Data, then come back.</p><a class="btn primary" href="#data">Go to Data</a></div>`, bind() {} };
  }
  if (!mods) return { html: '<div class="topbar"><div><h1>Coach</h1></div></div><p class="muted">Loading…</p>', bind(root, rerender) { loadMods().then(rerender).catch((err) => { root.innerHTML = `<div class="card"><h2>Could not load the planner</h2><p class="muted">${esc(err.message || err)}</p></div>`; }); } };

  let athlete, template, err = '';
  try { athlete = athleteFor(app, ui); template = templateFor(app, athlete, ui); } catch (e) { err = e.message || String(e); }
  if (err || !template) {
    return { html: `<div class="topbar"><div><h1>Coach</h1></div></div><div class="card empty"><h2>Not enough to learn from yet</h2><p>${esc(err || 'No block with training days was found in your programme.')}</p></div>`, bind() {} };
  }
  const draftSource = () => ({ programme: app.programme, events: app.events(), athlete: athleteFor(app, ui), template: templateFor(app, athleteFor(app, ui), ui), catalogue: app.catalogue });
  const draftIsCurrent = () => {
    const saved = p.resultSource;
    if (!saved) return false;
    const current = draftSource();
    return Object.keys(current).every((key) => saved[key] === current[key]);
  };
  if (p.result && !draftIsCurrent()) { p.result = null; p.resultSource = null; p.error = 'Your training data changed. Build a fresh draft before adding it.'; }
  if (!p._rev || p._rev.events !== app.events() || p._rev.athlete !== athlete) {
    let review = null;
    try { review = coachReview({ events: app.events(), programme: app.programmeMerged(), catalogue: app.catalogue, athlete, bodyweight: app.bodyweightPoints(), unit }); } catch { review = null; }
    p._rev = { events: app.events(), athlete, review };
  }
  const review = p._rev.review;
  const R = p.result;
  const wk = R ? R.block.weeks.find((w) => w.number === p.week) || R.block.weeks[0] : null;
  const generatedBlocks = app.programme.blocks.filter((b) => b.generated);
  const focusInfo = FOCI.find((f) => f.id === p.focus);

  const settingsSummary = [
    p.weeks ? `${p.weeks} weeks` : '', p.days ? `${p.days} days/week` : '',
    p.progression !== 'standard' ? p.progression : '',
    p.rotate != null ? ({ 0: 'keep my exercises', 0.3: 'change a few', 0.7: 'change lots' })[p.rotate] : '',
    p.stance !== 'auto' ? p.stance : '', p.deloadWeek !== 'auto' ? `deload: ${p.deloadWeek}` : '',
    p.focus === 'specialise' ? p.emphasis : '', p.focus === 'return' ? `${p.layoffWeeks} weeks off` : '',
    p.focus === 'maintenance' ? (p.checkIn ? 'heavy single check-in' : 'no check-in') : '',
    p.style !== 'auto' ? ({ 'top-single': 'top single', 'top-set': 'top set', 'sets-across': 'sets across', singles: 'singles', 'heavy-light': 'heavy and light' })[p.style] : '',
    p.style === 'top-set' && p.topReps != null ? `top set of ${p.topReps}` : '',
    ['top-single', 'top-set', 'heavy-light'].includes(p.style) && p.topRpe != null ? `starting RPE ${p.topRpe}` : '',
    ['top-single', 'top-set', 'heavy-light'].includes(p.style) && Object.keys(p.backoff || {}).length ? `${p.backoff.sets ?? 'auto'} × ${p.backoff.reps ?? 'auto'} back-offs${p.backoff.drop != null ? `, ${Number((p.backoff.drop * 100).toFixed(2))}% lighter` : ''}` : '',
    p.style === 'sets-across' && Object.keys(p.setsAcross || {}).length ? `${p.setsAcross.sets ?? 'auto'} × ${p.setsAcross.reps ?? 'auto'} sets across` : '',
    p.rpeCap != null ? `RPE cap ${p.rpeCap}` : '',
    p.accessories !== 'normal' ? `${p.accessories} accessories` : '',
    p.variations !== 'keep' ? 'competition lifts only' : '',
  ].filter(Boolean);
  const liftRows = LIFTS.map((f) => {
    const l = athlete.lifts[f] || {};
    return `<tr><td><b>${f[0].toUpperCase() + f.slice(1)}</b>${f === 'deadlift' && l.stance ? ` <span class="muted small">(${l.stance})</span>` : ''}<br><small class="muted">${esc(l.basis || '')}</small></td>
      <td class="num">${l.e1rmKg != null ? formatWeight({ value: l.e1rmKg, unit: 'kg' }, unit) : '–'}</td>
      <td><span class="pill ${l.confidence === 'high' ? 'pr' : ''}">${esc(l.confidence || 'none')}</span></td>
      <td><input type="number" inputmode="decimal" step="0.5" min="0" data-ovr="${f}" value="${p.overrides[f] ? round1(convert(p.overrides[f].value, p.overrides[f].unit, unit)) : ''}" placeholder="${l.e1rmKg != null ? round1(convert(l.e1rmKg, 'kg', unit)) : ''}" aria-label="Enter your own ${f} e1RM in ${unit}" class="input-narrow"></td></tr>`;
  }).join('');

  const html = `
    <div class="topbar"><div><h1>Coach</h1><p class="muted small">Describe what you need, review a draft built from your training, then choose whether to add it.</p></div></div>
    ${p.draftStatus ? `<div class="banner mb-4" role="status"><span id="coach-draft-status"><b>UNSAVED Coach inputs</b> · ${p.draftStatus === 'stale' ? 'Saved inputs no longer match this programme.' : p.draftStatus === 'recovered' ? 'Recovered inputs. Build a fresh draft from current training data.' : p.draftStatus === 'error' ? 'Could not keep unsaved inputs on this device.' : keptMessage}</span><button class="btn small ghost" id="discard-coach-draft">Discard</button></div>` : '<p id="coach-draft-status" class="small muted" role="status"></p>'}
    <p class="small muted">1 Describe → 2 Review draft → 3 Add to programme</p>

    ${coachCard(review, p)}
    <div class="card mt-4">
      <div class="card-h"><h2>1. Describe the block</h2></div>
      <form id="ask" class="row end"><label class="field grow"><span>In your own words</span><input id="ask-text" value="${esc(p.text)}" placeholder='e.g. "top single block, 4 days a week, 6 weeks"' autocomplete="off"></label><button class="btn primary" id="gen" type="submit">Build draft</button></form>
      ${p.understood ? `<div class="mt-3"><p class="small muted">${esc(p.understood.summary || 'Here is what I understood')}</p>${p.editedAfterRequest ? '<p class="small muted">You changed the settings below; the draft uses those current choices.</p>' : ''}${p.understood.understood.length ? '<div class="chips mt-2" role="group" aria-label="Understood choices">' + p.understood.understood.map((u) => { const value = choiceValue(p, u.key); const label = optionText({ key: u.key, value }); return `<button class="chip" type="button" data-edit="${esc(u.key)}" aria-label="Edit ${esc(label)}" title="${esc(u.because)}">${esc(label)}${JSON.stringify(value) !== JSON.stringify(u.value) ? ' (edited)' : ''}</button>`; }).join('') + '</div><p class="small muted">Tap a choice to edit it in Settings.</p>' : ''}${p.understood.unclear.length ? `<div class="banner block mt-2"><b>Check your request</b><ul class="bullets">${p.understood.unclear.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></div>` : ''}</div>` : ''}
      <div class="chips mt-3" role="group" aria-label="Quick goals">${FOCI.map((f) => `<button class="chip" data-focus="${f.id}" aria-pressed="${p.focus === f.id}" title="${esc(f.blurb)}">${esc(f.label)}</button>`).join('')}</div>
      <p class="small muted">${esc(focusInfo?.blurb || '')}</p>
      <div id="coach-settings"><details class="options mt-3"${p.settingsOpen ? ' open' : ''}><summary>Settings · ${esc(settingsSummary.join(', ') || 'all automatic')}</summary><div class="options-body">
      <span class="muted small">leave blank to let the app choose</span>
      <div class="grid cols-2">
        <label class="field"><span>Weeks (3-8)</span><input id="p-weeks" type="number" min="3" max="8" step="1" value="${esc(p.weeks ?? '')}" placeholder="auto"></label>
        <label class="field"><span>Days per week</span><input id="p-days" type="number" min="1" max="7" step="1" value="${esc(p.days ?? '')}" placeholder="auto (${template.daysPerWeek} in your last block)"></label>
        <label class="field"><span>Progression</span><select id="p-prog">${['conservative', 'standard', 'aggressive'].map((x) => `<option ${p.progression === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Exercise rotation</span><select id="p-rot"><option value="" ${p.rotate == null ? 'selected' : ''}>auto</option><option value="0" ${p.rotate === 0 ? 'selected' : ''}>keep my exercises</option><option value="0.3" ${p.rotate === 0.3 ? 'selected' : ''}>change a few</option><option value="0.7" ${p.rotate === 0.7 ? 'selected' : ''}>change lots</option></select></label>
        <label class="field"><span>Deadlift stance</span><select id="p-stance">${['auto', 'sumo', 'conventional'].map((x) => `<option ${p.stance === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Deload week</span><select id="p-deload">${['auto', 'none', 'last', 'all'].map((x) => `<option ${p.deloadWeek === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Main-lift style</span><select id="p-style">${[['auto', 'Auto (like my last block)'], ['top-single', 'Top single + back-offs'], ['top-set', 'Top set + back-offs'], ['sets-across', 'Sets across'], ['singles', 'Singles'], ['heavy-light', 'Heavy and light']].map(([value, label]) => `<option value="${value}" ${p.style === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        ${p.style === 'top-set' ? `<label class="field"><span>Top set reps</span><input id="p-top-reps" type="number" min="1" max="6" step="1" value="${esc(p.topReps ?? '')}" placeholder="3"></label>` : ''}
        ${['top-single', 'top-set', 'heavy-light'].includes(p.style) ? `<label class="field"><span>Starting top-set RPE</span><input id="p-top-rpe" type="number" min="7" max="9.5" step="0.5" value="${esc(p.topRpe ?? '')}" placeholder="8"></label>
        <label class="field"><span>Back-off sets</span><input id="p-backoff-sets" type="number" min="1" max="6" step="1" value="${esc(p.backoff?.sets ?? '')}" placeholder="3"></label>
        <label class="field"><span>Back-off reps</span><input id="p-backoff-reps" type="number" min="1" max="10" step="1" value="${esc(p.backoff?.reps ?? '')}" placeholder="auto"></label>
        <label class="field"><span>Back-offs % lighter</span><input id="p-backoff-drop" type="number" min="3" max="30" step="any" value="${esc(p.backoff?.drop != null ? p.backoff.drop * 100 : '')}" placeholder="auto"></label>` : ''}
        ${p.style === 'sets-across' ? `<label class="field"><span>Sets across: sets</span><input id="p-across-sets" type="number" min="2" max="10" step="1" value="${esc(p.setsAcross?.sets ?? '')}" placeholder="4"></label>
        <label class="field"><span>Sets across: reps</span><input id="p-across-reps" type="number" min="1" max="12" step="1" value="${esc(p.setsAcross?.reps ?? '')}" placeholder="5"></label>` : ''}
        <label class="field"><span>RPE cap</span><select id="p-rpe-cap"><option value="" ${p.rpeCap == null ? 'selected' : ''}>None</option>${[8, 8.5, 9].map((x) => `<option value="${x}" ${p.rpeCap === x ? 'selected' : ''}>${x}</option>`).join('')}<option value="custom" ${p.rpeCap != null && ![8, 8.5, 9].includes(p.rpeCap) ? 'selected' : ''}>Custom</option></select></label>
        ${p.rpeCap != null && ![8, 8.5, 9].includes(p.rpeCap) ? `<label class="field"><span>Custom RPE cap (6–10)</span><input id="p-rpe-custom" type="number" min="6" max="10" step="any" value="${esc(p.rpeCap)}"></label>` : ''}
        <label class="field"><span>Accessories</span><select id="p-accessories">${[['normal', 'Normal'], ['more', 'More'], ['minimal', 'Minimal'], ['none', 'None']].map(([value, label]) => `<option value="${value}" ${p.accessories === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label class="field"><span>Variations</span><select id="p-variations"><option value="keep" ${p.variations === 'keep' ? 'selected' : ''}>Keep</option><option value="competition-only" ${p.variations === 'competition-only' ? 'selected' : ''}>Competition lifts only</option></select></label>
        ${p.focus === 'specialise' ? `<label class="field"><span>Lift to bring up</span><select id="p-emph">${LIFTS.map((x) => `<option ${p.emphasis === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>` : ''}
        ${p.focus === 'return' ? `<label class="field"><span>Weeks since proper training</span><input id="p-layoff" type="number" min="1" max="52" step="1" value="${esc(p.layoffWeeks)}"></label>` : ''}
        ${p.focus === 'maintenance' ? `<label class="row"><input id="p-checkin" type="checkbox" ${p.checkIn ? 'checked' : ''}> Heavy single check-in in the last week</label>` : ''}
      </div></div></details></div>
    </div>

    <details class="options mt-3"><summary>What I'm basing it on · Block ${template.fromBlock} ${esc(template.blockName)}</summary><div class="options-body">
      <p class="small muted">${template.daysPerWeek} days in your last block. Estimated from your RPE-rated sets in the last 8 weeks with the RPE chart. If a number looks wrong, enter your own e1RM.</p>
      <div class="scroll-x"><table class="plain"><thead><tr><th>Lift</th><th>Working e1RM</th><th>Confidence</th><th>Your e1RM (${esc(unit)})</th></tr></thead><tbody>${liftRows}</tbody></table></div>
    </div></details>
    ${p.error ? `<p class="tone-bad mt-3">${esc(p.error)}</p>` : ''}

    ${R ? `<div id="draft-preview">${comparisonHtml(template, R, p.style)}${previewHtml(app, p, R, wk, unit)}</div>` : ''}

    ${generatedBlocks.length ? `<div class="card mt-4"><div class="card-h"><h2>Your generated blocks</h2></div><ol class="list">${generatedBlocks.map((b) => `<li class="list-row"><span class="main"><b>Block ${b.number}</b> ${esc(b.name)} <small>${esc(b.generated.focus)}, ${b.weeks.length} weeks</small></span><span class="row"><button class="btn small" data-revise="${b.number}">Re-load remaining weeks</button><button class="btn small ghost" data-remove="${b.number}">Remove</button></span></li>`).join('')}</ol>${p.revise ? reviseHtml(p.revise, unit) : ''}</div>` : ''}`;

  function bind(root, rerender) {
    const persist = () => {
      if (!app.saveDraft) { p.draftStatus = 'error'; root.querySelector('#coach-draft-status').textContent = 'Could not keep unsaved inputs on this device.'; return; }
      const value = coachInputs(app, p);
      p._draftWrite = (p._draftWrite || Promise.resolve()).then(() => app.saveDraft('coach', value))
        .then(() => { p.draftStatus = 'unsaved'; root.querySelector('#coach-draft-status')?.replaceChildren?.('UNSAVED Coach inputs · ' + keptMessage); })
        .catch(() => { p.draftStatus = 'error'; root.querySelector('#coach-draft-status')?.replaceChildren?.('Could not keep unsaved inputs on this device.'); });
    };
    const set = (patch) => {
      if (['minimal', 'none'].includes(patch.accessories)) {
        patch.extras = [];
        patch.applied = p.applied.filter((id) => review?.findings.find((f) => f.id === id)?.action?.type !== 'addExercise');
      }
      Object.assign(p, patch); rerender();
    };
    const edit = (patch) => { p.text = root.querySelector('#ask-text')?.value ?? p.text; if (p.understood) p.editedAfterRequest = true; set({ ...patch, result: null, error: '' }); persist(); };
    root.querySelector('#discard-coach-draft')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { await p._draftWrite; await app.clearDraft('coach'); ui.plan = null; rerender(); }
      catch (err) { toast(`Could not discard unsaved inputs: ${err?.message || err}`, 4200); e.currentTarget.disabled = false; }
    });
    root.querySelector('#coach-settings details').addEventListener('toggle', (e) => { p.settingsOpen = e.target.open; });
    root.querySelector('#ask-text').addEventListener('input', (e) => { p.text = e.target.value; p.result = null; p.resultSource = null; root.querySelector('#draft-preview')?.remove(); persist(); });
    root.querySelector('#ask').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = root.querySelector('#ask-text').value.trim();
      p.text = text;
      if (!text) { p.understood = null; p.interpretedText = null; p.editedAfterRequest = false; persist(); generate(); return; }
      if (text !== p.interpretedText || !p.understood) {
        const r = mods.interpretRequest(text), o = r.options;
        p.understood = r; p.interpretedText = text; p.editedAfterRequest = false;
        if (!r.understood.length) { set({ result: null, error: 'I could not build from that request. Reword it, or clear the box and build from Settings.' }); return; }
        Object.assign(p, { focus: o.focus ?? p.focus, weeks: o.weeks ?? p.weeks, days: o.daysPerWeek ?? p.days, progression: o.progression ?? p.progression, rotate: o.rotate ?? p.rotate,
          stance: o.deadliftStance ?? p.stance, deloadWeek: o.deloadWeek ?? p.deloadWeek, emphasis: o.emphasis ?? p.emphasis, layoffWeeks: o.layoffWeeks ?? p.layoffWeeks, checkIn: o.checkIn ?? p.checkIn,
          style: o.style ?? p.style, topReps: o.topReps ?? p.topReps, topRpe: o.topRpe ?? p.topRpe,
          backoff: o.backoff ? { ...p.backoff, ...o.backoff } : p.backoff, setsAcross: o.setsAcross ? { ...p.setsAcross, ...o.setsAcross } : p.setsAcross,
          rpeCap: o.rpeCap ?? p.rpeCap, accessories: o.accessories ?? p.accessories, variations: o.variations ?? p.variations });
        if (['minimal', 'none'].includes(p.accessories)) { p.extras = []; p.applied = p.applied.filter((id) => review?.findings.find((f) => f.id === id)?.action?.type !== 'addExercise'); }
      }
      persist();
      generate();
    });
    root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const key = b.dataset.edit;
      const selector = key === 'focus' ? `[data-focus="${p.focus}"]` : key === 'backoff' ? (p.style === 'auto' ? '#p-style' : '#p-backoff-sets')
        : key === 'setsAcross' ? (p.style === 'sets-across' ? '#p-across-sets' : '#p-style') : EDIT_CONTROL[key];
      const settings = root.querySelector('#coach-settings details');
      if (key !== 'focus') { settings.open = true; p.settingsOpen = true; }
      root.querySelector(selector || '#p-style')?.focus?.();
    }));
    root.querySelectorAll('[data-coach]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.coach;
      const f = review?.findings.find((x) => x.id === id);
      if (!f?.action) return;
      const a = f.action;
      const FIELDS = { emphasis: ['focus', 'emphasis'], focus: ['focus'], progression: ['progression'], days: ['days'],
        deloadWeek: ['deloadWeek'], rotate: ['rotate'], addExercise: ['extras', 'accessories'] }[a.type] || [];
      p.undo ||= {};
      if (p.applied.includes(id)) { // undo: put every setting this action touched back as it was
        Object.assign(p, p.undo[id] || {}); delete p.undo[id];
        p.applied = p.applied.filter((x) => x !== id); if (p.understood) p.editedAfterRequest = true; persist(); generate(); return;
      }
      // Actions that set the block's focus exclude each other; the newest one wins and the older one is dropped.
      const group = (x) => (x.type === 'emphasis' || x.type === 'focus' ? 'focus' : x.type === 'addExercise' ? `x:${x.exerciseId}` : x.type);
      for (const other of p.applied.slice()) {
        const of = review.findings.find((y) => y.id === other);
        if (of?.action && group(of.action) === group(a)) p.applied = p.applied.filter((y) => y !== other);
      }
      p.undo[id] = Object.fromEntries(FIELDS.map((k) => [k, structuredClone(p[k])]));
      p.applied = [...p.applied, id];
      if (a.type === 'emphasis') { p.focus = 'specialise'; p.emphasis = a.lift; }
      else if (a.type === 'focus') p.focus = a.focus;
      else if (a.type === 'progression') p.progression = a.value;
      else if (a.type === 'days') p.days = a.value;
      else if (a.type === 'deloadWeek') p.deloadWeek = a.value;
      else if (a.type === 'rotate') p.rotate = a.value;
      else if (a.type === 'addExercise') { p.accessories = 'normal'; p.extras = [...p.extras.filter((x) => x.exerciseId !== a.exerciseId), { exerciseId: a.exerciseId, sets: a.sets, reps: a.reps, rpe: a.rpe }]; }
      if (p.understood) p.editedAfterRequest = true;
      persist();
      generate();
    }));
    root.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () => edit({ focus: b.dataset.focus, applied: [], extras: [] })));
    const changed = () => { p.result = null; p.error = ''; p.text = root.querySelector('#ask-text')?.value ?? p.text; if (p.understood) p.editedAfterRequest = true; persist(); rerender(); };
    const num = (id) => { const v = parseInt(root.querySelector(id)?.value, 10); return Number.isFinite(v) ? v : null; };
    root.querySelector('#p-weeks').addEventListener('change', () => { const v = num('#p-weeks'); p.weeks = v == null ? null : Math.min(8, Math.max(3, v)); changed(); });
    root.querySelector('#p-days').addEventListener('change', () => { p.days = num('#p-days'); changed(); });
    root.querySelector('#p-prog').addEventListener('change', (e) => { p.progression = e.target.value; changed(); });
    root.querySelector('#p-rot').addEventListener('change', (e) => { p.rotate = e.target.value === '' ? null : Number(e.target.value); changed(); });
    root.querySelector('#p-stance').addEventListener('change', (e) => { p.stance = e.target.value; changed(); });
    root.querySelector('#p-deload').addEventListener('change', (e) => { p.deloadWeek = e.target.value; changed(); });
    root.querySelector('#p-style').addEventListener('change', (e) => edit({ style: e.target.value }));
    const optionalInt = (id, lo, hi, update) => root.querySelector(id)?.addEventListener('change', (e) => {
      const v = e.target.value === '' ? null : Number(e.target.value);
      if (v == null || (Number.isInteger(v) && v >= lo && v <= hi)) update(v); else toast(`Enter a whole number from ${lo} to ${hi}`);
      changed();
    });
    optionalInt('#p-top-reps', 1, 6, (v) => { p.topReps = v; });
    optionalInt('#p-backoff-sets', 1, 6, (v) => { p.backoff = { ...p.backoff, sets: v }; if (v == null) delete p.backoff.sets; });
    optionalInt('#p-backoff-reps', 1, 10, (v) => { p.backoff = { ...p.backoff, reps: v }; if (v == null) delete p.backoff.reps; });
    root.querySelector('#p-backoff-drop')?.addEventListener('change', (e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v == null || (v >= 3 && v <= 30)) { p.backoff = { ...p.backoff, drop: v / 100 }; if (v == null) delete p.backoff.drop; } else toast('Enter a back-off drop from 3% to 30%'); changed(); });
    optionalInt('#p-across-sets', 2, 10, (v) => { p.setsAcross = { ...p.setsAcross, sets: v }; if (v == null) delete p.setsAcross.sets; });
    optionalInt('#p-across-reps', 1, 12, (v) => { p.setsAcross = { ...p.setsAcross, reps: v }; if (v == null) delete p.setsAcross.reps; });
    root.querySelector('#p-top-rpe')?.addEventListener('change', (e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v == null || (v >= 7 && v <= 9.5 && v * 2 === Math.round(v * 2))) p.topRpe = v; else toast('Enter an RPE from 7 to 9.5 in 0.5 steps'); changed(); });
    root.querySelector('#p-rpe-cap').addEventListener('change', (e) => { p.rpeCap = e.target.value === 'custom' ? 7 : e.target.value === '' ? null : Number(e.target.value); changed(); });
    root.querySelector('#p-rpe-custom')?.addEventListener('change', (e) => { const v = Number(e.target.value); if (v >= 6 && v <= 10) p.rpeCap = v; else toast('Enter an RPE cap from 6 to 10'); changed(); });
    root.querySelector('#p-accessories').addEventListener('change', (e) => edit({ accessories: e.target.value }));
    root.querySelector('#p-variations').addEventListener('change', (e) => edit({ variations: e.target.value }));
    root.querySelector('#p-emph')?.addEventListener('change', (e) => { p.emphasis = e.target.value; changed(); });
    root.querySelector('#p-layoff')?.addEventListener('change', () => { p.layoffWeeks = Math.min(52, Math.max(1, num('#p-layoff') ?? 4)); changed(); });
    root.querySelector('#p-checkin')?.addEventListener('change', (e) => { p.checkIn = e.target.checked; changed(); });
    root.querySelectorAll('[data-ovr]').forEach((i) => i.addEventListener('change', () => {
      const v = parseFloat(i.value);
      const next = { ...p.overrides };
      const kg = Number.isFinite(v) ? convert(v, unit, 'kg') : NaN;
      if (kg >= 20 && kg <= 600) next[i.dataset.ovr] = { value: v, unit }; else { delete next[i.dataset.ovr]; if (i.value !== '') toast('Enter an e1RM between 20 and 600 kg'); }
      p.overrides = next; changed();
    }));

    const generate = (seedSuffix = '') => {
      try {
        const res = mods.generateBlock({ catalogue: app.catalogue, template, athlete, blockNumber: nextBlockNumber(app.programme), ...optionsFrom(p), seed: p.seed + seedSuffix, now: () => new Date() });
        let out = res;
        if (p.extras.length && !['minimal', 'none'].includes(p.accessories)) {
          const x = applyExtras(res.block, p.extras, app.catalogue);
          const missed = p.extras.filter((e) => !x.block.weeks.some((w) => w.days.some((d) => d.entries.some((en) => en.exerciseId === e.exerciseId && en.sets.some((s) => s.gen?.slotId === `x-${e.exerciseId}`)))))
            .map((e) => `${app.exerciseName(e.exerciseId)} was not added: there is no free day in the working weeks.`);
          // The volume map and numbers must include what was added.
          out = { ...res, block: x.block, rationale: [...res.rationale, ...x.rationale], warnings: [...res.warnings, ...missed],
            volume: { ...res.volume, perWeek: blockVolume(x.block, app.catalogue) } };
        }
        if (['maintenance', 'return'].includes(p.focus)) out = { ...out, warnings: out.warnings.filter((w) => !/volume changes from/.test(w)) };
        set({ result: out, resultSource: draftSource(), week: 1, error: '', revise: null });
      } catch (e) { set({ error: e instanceof RangeError ? e.message : `Could not generate: ${e.message || e}`, result: null, resultSource: null }); }
    };
    root.querySelector('#again')?.addEventListener('click', () => { if (p.result !== R || !draftIsCurrent()) return; p.seed = p.seed + 'x'; generate(); });
    root.querySelectorAll('[data-pweek]').forEach((b) => b.addEventListener('click', () => set({ week: Number(b.dataset.pweek) })));
    root.querySelector('#copy')?.addEventListener('click', async () => { if (p.result !== R || !draftIsCurrent()) return; try { await navigator.clipboard.writeText(blockAsText(R.block, unit)); toast('Plan copied'); } catch { toast('Could not copy'); } });
    root.querySelector('#add')?.addEventListener('click', async (e) => {
      if (p.result !== R || !draftIsCurrent()) { p.result = null; p.resultSource = null; toast('Build the draft again after changing your request, settings, or training data'); rerender(); return; }
      e.target.disabled = true;
      try {
        const block = { ...R.block, generated: { ...R.block.generated, rationale: R.rationale, warnings: R.warnings } };
        await app.addBlock(block);
        await p._draftWrite;
        let cleared = true; try { await app.clearDraft('coach'); } catch { cleared = false; }
        if (cleared) p.draftStatus = null;
        ui.train = { block: block.number, week: 1, day: 1 }; ui.plan.result = null;
        toast(`Block ${block.number} added to your programme${cleared ? '' : ' · unsaved inputs could not be cleared'}`);
        location.hash = '#train';
      } catch (err) { toast(err.message || String(err), 4200); e.target.disabled = false; }
    });
    root.querySelectorAll('[data-revise]').forEach((b) => b.addEventListener('click', () => {
      const number = Number(b.dataset.revise);
      const original = app.programme.blocks.find((x) => x.number === number);
      // Sets logged in the app count as done, so revision starts after the last week you trained.
      const merged = app.programmeMerged().blocks.find((x) => x.number === number);
      const firstOpen = merged?.weeks.find((w) => !w.days.some((d) => d.entries.some((e) => e.sets.some((s) => s.completed))));
      if (!original || !firstOpen) { toast('Every week already has training logged'); return; }
      try {
        const r = mods.reviseBlock({ block: merged, athlete, catalogue: app.catalogue, fromWeek: firstOpen.number });
        // Keep the stored completion state: revision changes loads only.
        const keep = structuredClone(r.block);
        keep.weeks.forEach((w, wi) => w.days.forEach((d, di) => d.entries.forEach((e, ei) => e.sets.forEach((s, si) => {
          const o = original.weeks[wi]?.days[di]?.entries[ei]?.sets[si];
          if (o) { s.completed = o.completed; s.actualRpe = o.actualRpe; s.actualReps = o.actualReps; s.actualLoad = o.actualLoad; }
        }))));
        set({ revise: { number, fromWeek: firstOpen.number, block: keep, changes: r.changes, baseToken: app.blockToken(number) } });
      } catch (err) { toast(err.message || String(err), 4200); }
    }));
    root.querySelector('#apply-revise')?.addEventListener('click', async () => {
      try { await app.replaceBlock({ ...p.revise.block }, { expectedToken: p.revise.baseToken }); toast('Remaining weeks updated'); p.revise = null; rerender(); } catch (err) { toast(err.message || String(err), 4200); p.revise = null; rerender(); }
    });
    root.querySelector('#cancel-revise')?.addEventListener('click', () => set({ revise: null }));
    root.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(`Remove generated block ${b.dataset.remove}? Sets you logged stay in your history.`)) return;
      try { p.revise = null; await app.removeBlock(Number(b.dataset.remove)); toast('Block removed'); } catch (err) { toast(err.message || String(err), 4200); }
    }));
    root.querySelectorAll('.hm-region').forEach((el) => el.addEventListener('click', () => { p.sel = p.sel === el.dataset.muscle ? null : el.dataset.muscle; rerender(); }));
    root.querySelectorAll('.hm-row').forEach((el) => el.addEventListener('click', () => { p.sel = p.sel === el.dataset.muscle ? null : el.dataset.muscle; rerender(); }));
    root.querySelectorAll('[data-pview]').forEach((b) => b.addEventListener('click', () => set({ view: b.dataset.pview })));
  }
  return { html, bind };
}

const SEV_LABEL = { high: 'Fix first', medium: 'Worth fixing', low: 'Note', good: 'Going well' };

function findingHtml(f, p, open = false, lead = false) {
  const applied = p.applied.includes(f.id);
  return `<details class="coach-find sev-${f.severity}" ${open ? 'open' : ''}>
    <summary><b>${esc(f.title)}</b><span class="pill ${f.severity === 'good' ? 'pr' : f.severity === 'high' ? 'accent' : ''}">${esc(SEV_LABEL[f.severity])}</span></summary>
    ${f.because.length ? `<ul class="small muted mt-2 bullets">${f.because.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <p class="mt-2"><b>Do this:</b> ${esc(f.suggestion)}</p>
    <div class="row spread mt-2"><span class="small muted">Confidence: ${esc(f.confidence)}</span>
      ${f.action ? `<button class="btn small" data-coach="${esc(f.id)}" aria-pressed="${applied}">${applied ? 'Undo for draft' : lead ? 'Apply to draft' : esc(f.action.label)}</button>` : ''}</div>
  </details>`;
}

function coachCard(review, p) {
  if (!review) return '';
  const findings = review.findings || [...(review.priorities || []), ...(review.strengths || []), ...(review.notes || [])];
  const unique = [...new Map(findings.map((f) => [f.id, f])).values()];
  const lead = (review.priorities || []).find((f) => f.action) || unique.find((f) => f.action);
  const others = unique.filter((f) => f.id !== lead?.id);
  return `<div class="card coach">
    <div class="card-h"><h2>Coach's review</h2><span class="muted small">${review.asOf ? 'from your training up to ' + esc(review.asOf) : ''}</span></div>
    <p class="coach-headline">${esc(review.headline)}</p>
    ${lead ? `<h3>Start here</h3>${findingHtml(lead, p, true, true)}` : '<p class="small muted">No specific change is suggested from this history yet.</p>'}
    ${others.length ? `<details class="options mt-3"><summary>Other findings (${others.length})</summary><div class="options-body">${others.map((f) => findingHtml(f, p)).join('')}</div></details>` : ''}
    <p class="small muted mt-3">${lead ? 'Applying a finding rebuilds the draft; review it before adding it to your programme.' : 'Changes stay as drafts until you add them to your programme.'}</p>
  </div>`;
}

function previewHtml(app, p, R, wk, unit) {
  const b = R.block;
  const vol = R.volume.perWeek.find((x) => x.week === wk.number)?.muscles || {};
  const typical = R.volume.typical || null;
  const view = p.view || 'front';
  return `<div class="card mt-4">
    <div class="card-h"><h2>2. Review draft: ${esc(b.name)}</h2><span class="pill accent">${esc(b.generated.focus)} · ${b.weeks.length} weeks · ${b.weeks[0].days.length} days</span></div>
    <p class="muted small">${esc(b.goal)}</p>
    <div class="chips" role="group" aria-label="Week">${b.weeks.map((w) => `<button class="chip" data-pweek="${w.number}" aria-pressed="${w.number === wk.number}">${esc(w.label.length > 26 ? 'Week ' + w.number : w.label)}</button>`).join('')}</div>
    ${wk.days.map((d) => `<section class="entry"><h3>Day ${d.number}</h3>${d.entries.map((e) => `<div class="mt-2 mb-3"><b>${esc(e.name)}</b>${e.supersetGroup ? ` <span class="pill">${esc(e.supersetGroup)}</span>` : ''}${e.tempo ? ` <span class="muted small">tempo ${esc(e.tempo)}</span>` : ''}
      <table class="sets"><tbody>${e.sets.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.repsRaw ?? (s.repsMin === s.repsMax ? String(s.repsMin) : s.repsMin + '-' + s.repsMax))} reps${s.targetRpe != null ? ` @ ${s.targetRpe}` : ''}</td><td class="num">${s.load ? esc(formatWeight(s.load, unit)) : '<span class="muted">find a load</span>'}</td><td class="muted small">${s.gen?.kind === 'top' ? 'top set' : s.gen?.kind === 'backoff' ? 'back-off' : s.gen?.kind === 'single' ? 'single' : ''}</td></tr>`).join('')}</tbody></table>
      ${e.cues?.length ? `<p class="cue">${e.cues.map(esc).join(' · ')}</p>` : ''}</div>`).join('')}</section>`).join('')}
  </div>
  <div class="card mt-4"><div class="card-h"><h2>Weekly volume, week ${wk.number}</h2><div class="seg hm-view-toggle" role="group" aria-label="Body view"><button data-pview="front" aria-pressed="${view === 'front'}">Front</button><button data-pview="back" aria-pressed="${view === 'back'}">Back</button></div></div>
    ${renderHeatmap(vol, { selected: p.sel || null, view, prev: typical })}${renderLegend()}
    <p class="small muted mt-2">Arrows compare with a typical week from your last block. Tap a muscle to highlight it.</p>
    <div class="mt-3">${renderMuscleList(vol, p.sel || null, typical)}</div></div>
  <div class="card mt-4"><div class="card-h"><h2>Why it looks like this</h2></div>
    <ul class="bullets">${R.rationale.map((r) => `<li class="small">${esc(r.text)}</li>`).join('')}</ul>
    ${R.warnings.length || p.understood?.unclear.length ? `<div class="banner mt-3 block"><b>Check before adding</b><ul class="mt-2 bullets">${[...(p.understood?.unclear || []), ...R.warnings].map((w) => `<li class="small">${esc(w)}</li>`).join('')}</ul></div>` : ''}
    <div class="actions mt-4"><button class="btn primary" id="add">3. Add to programme</button><button class="btn" id="again">Another version</button><button class="btn ghost" id="copy">Copy as text</button></div>
    <p class="small muted mt-2">These are suggestions built from your numbers. Change anything that does not fit when you log it, and tell your coach if you have one.</p></div>`;
}

function reviseHtml(r, unit) {
  return `<div class="mt-3 panel"><b>Block ${r.number}: from week ${r.fromWeek}</b>
    ${r.changes.length ? `<ul class="small bullets">${r.changes.slice(0, 40).map((c) => `<li>Week ${c.week} day ${c.day}: ${esc(c.exerciseId)} set ${c.setIndex}: ${esc(formatWeight({ value: c.from, unit: 'kg' }, unit))} → <b>${esc(formatWeight({ value: c.to, unit: 'kg' }, unit))}</b></li>`).join('')}</ul>${r.changes.length > 40 ? `<p class="small muted">…and ${r.changes.length - 40} more</p>` : ''}` : '<p class="small muted">Your numbers have not moved enough to change any load.</p>'}
    <div class="row"><button class="btn primary small" id="apply-revise" ${r.changes.length ? '' : 'disabled'}>Apply</button><button class="btn ghost small" id="cancel-revise">Cancel</button></div></div>`;
}
