import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../../src/ui/state.js';
import { buildExampleProgramme } from '../../src/ui/example-data.js';
import { buildAthleteModel } from '../../src/core/athlete.js';
import { learnTemplate } from '../../src/core/template.js';
import { generateBlock, reviseBlock } from '../../src/core/generator.js';
import { interpretRequest } from '../../src/core/request.js';
import { planView } from '../../src/ui/views/plan.js';
import { coachReview, applyExtras } from '../../src/core/coach.js';

// End to end, without a browser: history -> athlete model -> template -> request -> generated block -> saved
// into the programme (through the sanitiser) -> revised later. Uses the synthetic example programme only.
globalThis.fetch = async (path) => {
  const text = await readFile(new URL('../../' + path, import.meta.url), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(text) };
};

async function readyApp() {
  const app = await createApp();
  const p = buildExampleProgramme();
  p.isExample = false; // pretend it is the athlete's own imported programme
  await app.setProgramme(p);
  return app;
}
const athleteOf = (app) => buildAthleteModel({ events: app.events(), catalogue: app.catalogue, programme: app.programme, dateFor: app.dateFor });
const templateOf = (app, athlete) => learnTemplate({ programme: app.programme, catalogue: app.catalogue, referenceE1rm: Object.fromEntries(['squat', 'bench', 'deadlift'].map((f) => [f, athlete.lifts[f].e1rmKg])), blockNumber: 1 });

test('Plan understands a top single request, binds its settings, and saves a revisable four-day block', async () => {
  const app = await readyApp();
  const ui = {};
  if (planView(app, ui).html.includes('Loading…')) await new Promise((resolve) => planView(app, ui).bind({ innerHTML: '' }, resolve));
  let view = planView(app, ui);
  const controls = new Map();
  const root = {
    querySelector(id) {
      if (!controls.has(id)) controls.set(id, { value: '', addEventListener(type, handler) { this[type] = handler; } });
      return controls.get(id);
    },
    querySelectorAll() { return []; },
  };
  view.bind(root, () => { view = planView(app, ui); });
  root.querySelector('#ask-text').value = 'top single block 4 days a week';
  controls.get('#ask').submit({ preventDefault() {} });
  assert.equal(ui.plan.focus, 'strength');
  assert.equal(ui.plan.style, 'top-single');
  assert.equal(ui.plan.days, 4);
  assert.match(view.html, /top single/i);
  assert.match(view.html, /Main-lift style/);
  assert.match(view.html, /Back-offs % lighter/);
  assert.match(view.html, /Settings · [^<]*top single/);
  assert.match(view.html, /data-edit="focus" aria-label="Edit Build strength"[^>]*>Build strength</);
  assert.match(view.html, /data-edit="daysPerWeek" aria-label="Edit 4 days\/week"[^>]*>4 days\/week</);
  assert.match(view.html, /data-edit="style" aria-label="Edit Top single \+ back-offs"[^>]*>Top single \+ back-offs</);
  assert.match(view.html, /<p class="small muted">[^<]*Strength block/);
  assert.match(view.html, /<details class="options mt-3"><summary>What I'm basing it on/);
  assert.equal(app.programme.blocks.some((b) => b.number === 2), false, 'building a draft does not save it');
  const result = ui.plan.result;
  assert.ok(result);
  assert.equal(result.block.weeks[0].days.length, 4);
  const top = result.block.weeks[0].days.flatMap((d) => d.entries).filter((e) => e.sets[0]?.gen?.kind === 'top');
  assert.deepEqual(new Set(top.map((e) => e.sets[0].gen.family)), new Set(['squat', 'bench', 'deadlift']));
  assert.ok(top.every((e) => e.sets[0].repsMin === 1 && e.sets[0].targetRpe === 8 && e.sets.slice(1).every((s) => s.gen.kind === 'backoff')));
  assert.match(ui.plan.understood.summary, /top single/i);
  assert.match(result.rationale.map((r) => r.text).join(' '), /top single/i);
  controls.clear();
  view.bind(root, () => { view = planView(app, ui); });
  const previousLocation = globalThis.location;
  const previousDocument = globalThis.document;
  globalThis.location = { hash: '' };
  globalThis.document = { querySelector() { return null; }, createElement() { return { setAttribute() {}, append() {}, remove() {} }; }, body: { append() {} } };
  try { await controls.get('#add').click({ target: { disabled: false } }); } finally { globalThis.location = previousLocation; globalThis.document = previousDocument; }
  await app.reload();
  const saved = app.programme.blocks.find((b) => b.number === result.block.number);
  assert.equal(saved.weeks[0].days.length, 4);
  assert.ok(saved.weeks[0].days.flatMap((d) => d.entries).some((e) => e.sets[0]?.gen?.kind === 'top'));
  assert.doesNotThrow(() => reviseBlock({ block: saved, athlete: app.athlete(), catalogue: app.catalogue, fromWeek: 2 }));
  controls.clear();
  view = planView(app, ui);
  view.bind(root, () => { view = planView(app, ui); });
  root.querySelector('#ask-text').value = '5x5 volume block, 3 back-offs at 90%';
  controls.get('#ask').submit({ preventDefault() {} });
  assert.doesNotMatch(view.html, /\[object Object\]/);
  assert.match(view.html, /Sets across: 5 × 5/);
  assert.match(view.html, /Back-offs: 3 sets, 10% lighter/);
});

test('Plan settings expose conditional style controls and preserve custom RPE caps', async () => {
  const app = await readyApp();
  const ui = {};
  if (planView(app, ui).html.includes('Loading…')) await new Promise((resolve) => planView(app, ui).bind({ innerHTML: '' }, resolve));
  const controls = new Map();
  const root = { querySelector(id) { if (!controls.has(id)) controls.set(id, { value: '', addEventListener(type, handler) { this[type] = handler; } }); return controls.get(id); }, querySelectorAll() { return []; } };
  let view;
  const bind = () => { controls.clear(); view = planView(app, ui); view.bind(root, () => { view = planView(app, ui); }); };
  bind();
  controls.get('#p-style').change({ target: { value: 'top-set' } });
  assert.match(view.html, /Top set reps/);
  bind();
  controls.get('#p-top-reps').change({ target: { value: '2' } });
  bind();
  controls.get('#p-top-rpe').change({ target: { value: '9.5' } });
  bind();
  controls.get('#p-backoff-sets').change({ target: { value: '4' } });
  bind();
  controls.get('#p-backoff-drop').change({ target: { value: '12.5' } });
  bind();
  controls.get('#p-rpe-cap').change({ target: { value: 'custom' } });
  bind();
  controls.get('#p-rpe-custom').change({ target: { value: '7.5' } });
  bind();
  ui.plan.extras = [{ exerciseId: 'standing_calf_raise', sets: 3, reps: [8, 12], rpe: 8 }];
  controls.get('#p-accessories').change({ target: { value: 'minimal' } });
  assert.deepEqual(ui.plan.extras, []);
  bind();
  controls.get('#p-variations').change({ target: { value: 'competition-only' } });
  assert.equal(ui.plan.topReps, 2);
  assert.equal(ui.plan.topRpe, 9.5);
  assert.deepEqual(ui.plan.backoff, { sets: 4, drop: 0.125 });
  assert.equal(ui.plan.rpeCap, 7.5);
  assert.match(view.html, /4 × auto back-offs, 12\.5% lighter/);
  assert.match(view.html, /RPE cap 7.5/);
  assert.match(view.html, /competition lifts only/);
  bind();
  controls.get('#ask').submit({ preventDefault() {} });
  assert.ok(ui.plan.result);
  const why = ui.plan.result.rationale.map((r) => r.text).join(' ');
  assert.match(why, /top set of 2 at RPE 9.5/i);
  assert.match(why, /4 back-off sets.*12.5% lighter/i);
  assert.match(why, /RPE cap 7.5/);
  assert.match(why, /Minimal accessories/);
  assert.match(why, /Competition lifts only/);
  bind();
  controls.get('#p-style').change({ target: { value: 'sets-across' } });
  assert.match(view.html, /Sets across: sets/);
  assert.doesNotMatch(view.html, /Back-off sets/);
});

test('Coach drafts show request warnings, an honest comparison, and editable understood choices', async () => {
  const app = await readyApp(), ui = {};
  if (planView(app, ui).html.includes('Loading…')) await new Promise((resolve) => planView(app, ui).bind({ innerHTML: '' }, resolve));
  const controls = new Map(), choices = new Map();
  const root = {
    querySelector(id) { if (!controls.has(id)) controls.set(id, { value: '', addEventListener(type, handler) { this[type] = handler; }, focus() { this.focused = true; } }); return controls.get(id); },
    querySelectorAll(selector) {
      if (selector !== '[data-edit]') return [];
      return (ui.plan.understood?.understood || []).map(({ key }) => {
        if (!choices.has(key)) choices.set(key, { dataset: { edit: key }, addEventListener(type, handler) { this[type] = handler; } });
        return choices.get(key);
      });
    },
  };
  let view;
  const bind = () => { controls.clear(); view = planView(app, ui); view.bind(root, () => { view = planView(app, ui); }); root.querySelector('#ask-text').value = ui.plan.text; };
  bind();
  root.querySelector('#ask-text').value = 'top single block 4 days a week, AMRAP';
  controls.get('#ask').submit({ preventDefault() {} });
  assert.ok(ui.plan.result, 'a supported partial request creates a draft');
  assert.equal(app.programme.blocks.some((b) => b.generated), false, 'a draft is not saved');
  assert.match(view.html, /<h1>Coach<\/h1>/);
  assert.match(view.html, /data-edit="style"/);
  assert.match(view.html, /Check before adding/);
  assert.match(view.html, /I can&#39;t build that yet/);
  assert.ok(view.html.indexOf('<h2>What changes from your last block') < view.html.indexOf('<h2>2. Review draft'));
  assert.match(view.html, /Training days\/week/);
  assert.match(view.html, /Sets\/week/);
  assert.match(view.html, /Max target RPE \(main lifts and variations\)/);
  assert.match(view.html, /typical week from your last block/);
  bind();
  choices.get('style').click();
  assert.equal(root.querySelector('#coach-settings details').open, true);
  assert.equal(root.querySelector('#p-style').focused, true);
  controls.get('#p-style').change({ target: { value: 'sets-across' } });
  assert.equal(ui.plan.result, null, 'editing settings invalidates the old draft');
  bind();
  controls.get('#ask').submit({ preventDefault() {} });
  assert.equal(ui.plan.style, 'sets-across', 'building unchanged request uses the edited setting');
  assert.ok(ui.plan.result);
  assert.match(view.html, /Sets across \(edited\)/);
  bind();
  root.querySelector('#ask-text').value = 'AMRAP';
  controls.get('#ask').submit({ preventDefault() {} });
  assert.equal(ui.plan.result, null, 'unsupported-only text cannot generate a guessed draft');
  assert.match(view.html, /Check your request/);
  assert.match(view.html, /I could not build from that request/);
});

test('Coach removes a draft while typing and rejects old Copy and Add actions', async () => {
  const app = await readyApp(), ui = {};
  if (planView(app, ui).html.includes('Loading…')) await new Promise((resolve) => planView(app, ui).bind({ innerHTML: '' }, resolve));
  const controls = new Map();
  const root = {
    querySelector(id) {
      if (!controls.has(id)) controls.set(id, { value: '', removed: false, remove() { this.removed = true; }, addEventListener(type, handler) { this[type] = handler; } });
      return controls.get(id);
    },
    querySelectorAll() { return []; },
  };
  let view = planView(app, ui), renders = 0;
  const bind = () => { controls.clear(); view.bind(root, () => { renders++; view = planView(app, ui); }); };
  bind();
  root.querySelector('#ask-text').value = 'top single block 4 days a week';
  root.querySelector('#ask').submit({ preventDefault() {} });
  assert.match(view.html, /id="draft-preview"/);
  bind();
  const oldCopy = root.querySelector('#copy'), oldAdd = root.querySelector('#add');
  const input = root.querySelector('#ask-text'), preview = root.querySelector('#draft-preview');
  const beforeTyping = renders;
  input.input({ target: { value: 'a different request' } });
  assert.equal(renders, beforeTyping, 'typing does not rerender or take focus from the input');
  assert.equal(preview.removed, true);
  assert.equal(ui.plan.result, null);
  const previousDocument = globalThis.document;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let copies = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { copies++; } } } });
  globalThis.document = { querySelector() { return null; }, createElement() { return { setAttribute() {}, append() {}, remove() {} }; }, body: { append() {} } };
  try {
    await oldCopy.click();
    await oldAdd.click({ target: { disabled: false } });
    assert.equal(copies, 0);
    assert.equal(app.programme.blocks.some((b) => b.generated), false);
  } finally {
    globalThis.document = previousDocument;
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
});

test('Coach rejects a draft after logged history or the programme changes', async () => {
  const app = await readyApp(), ui = {};
  if (planView(app, ui).html.includes('Loading…')) await new Promise((resolve) => planView(app, ui).bind({ innerHTML: '' }, resolve));
  const controls = new Map();
  const root = {
    querySelector(id) { if (!controls.has(id)) controls.set(id, { value: '', addEventListener(type, handler) { this[type] = handler; } }); return controls.get(id); },
    querySelectorAll() { return []; },
  };
  let view = planView(app, ui);
  const bind = () => { controls.clear(); view.bind(root, () => { view = planView(app, ui); }); };
  bind();
  root.querySelector('#ask-text').value = 'top single block 4 days a week';
  root.querySelector('#ask').submit({ preventDefault() {} });
  bind();
  const oldAdd = root.querySelector('#add');
  await app.logSet({ date: '2026-10-06', programmeRef: null, plannedRef: null, exerciseId: 'comp_bench', weight: { value: 90, unit: 'kg' }, reps: 5, rpe: 8 });
  const previousDocument = globalThis.document;
  globalThis.document = { querySelector() { return null; }, createElement() { return { setAttribute() {}, append() {}, remove() {} }; }, body: { append() {} } };
  try { await oldAdd.click({ target: { disabled: false } }); }
  finally { globalThis.document = previousDocument; }
  assert.equal(app.programme.blocks.some((b) => b.generated), false, 'old Add cannot save a draft based on earlier logged sets');
  assert.equal(ui.plan.result, null);
  assert.doesNotMatch(view.html, /id="draft-preview"/);
  bind();
  root.querySelector('#ask-text').value = 'top single block 4 days a week';
  root.querySelector('#ask').submit({ preventDefault() {} });
  assert.ok(ui.plan.result);
  await app.setProgramme(structuredClone(app.programme));
  view = planView(app, ui);
  assert.equal(ui.plan.result, null, 'reloading the programme invalidates a draft');
  assert.match(view.html, /Your training data changed/);
  assert.doesNotMatch(view.html, /id="draft-preview"/);
  bind();
  root.querySelector('#ask-text').value = 'top single block 4 days a week';
  root.querySelector('#ask').submit({ preventDefault() {} });
  ui.plan.overrides = { squat: { value: 200, unit: 'kg' } };
  view = planView(app, ui);
  assert.equal(ui.plan.result, null, 'changing the athlete estimate invalidates a draft');
});

test('Coach leads with one actionable finding and Apply to draft changes a preview only', async () => {
  const app = await readyApp(), ui = {};
  if (planView(app, ui).html.includes('Loading…')) await new Promise((resolve) => planView(app, ui).bind({ innerHTML: '' }, resolve));
  planView(app, ui);
  const noAction = { id: 'note', severity: 'high', title: 'Needs review', because: ['A synthetic pattern'], suggestion: 'Keep watching', confidence: 'low' };
  const action = { id: 'three-days', severity: 'medium', title: 'Make three days count', because: ['Missed one day'], suggestion: 'Use three days', confidence: 'medium', action: { type: 'days', value: 3, label: 'Use three days' } };
  const good = { id: 'good', severity: 'good', title: 'Bench is moving', because: [], suggestion: 'Keep it up', confidence: 'high' };
  ui.plan._rev.review = { asOf: '2026-10-01', headline: 'Synthetic review', priorities: [noAction, action], strengths: [good], notes: [], findings: [noAction, action, good] };
  const controls = new Map(), button = { dataset: { coach: action.id }, addEventListener(type, handler) { this[type] = handler; } };
  const root = {
    querySelector(id) { if (!controls.has(id)) controls.set(id, { value: '', addEventListener(type, handler) { this[type] = handler; } }); return controls.get(id); },
    querySelectorAll(selector) { return selector === '[data-coach]' ? [button] : []; },
  };
  let view = planView(app, ui);
  view.bind(root, () => { view = planView(app, ui); });
  assert.match(view.html, /Start here[\s\S]*Make three days count[\s\S]*Missed one day[\s\S]*Confidence: medium[\s\S]*Apply to draft/);
  assert.match(view.html, /Other findings \(2\)/);
  assert.ok(view.html.indexOf('Start here') < view.html.indexOf('Other findings'));
  button.click();
  assert.equal(ui.plan.days, 3);
  assert.equal(ui.plan.result.block.weeks[0].days.length, 3);
  assert.equal(app.programme.blocks.some((b) => b.generated), false);
  assert.match(view.html, /What changes from your last block[\s\S]*Training days\/week/);
  ui.plan._rev.review = { headline: 'No action needed', priorities: [noAction], strengths: [good], notes: [], findings: [noAction, good] };
  view = planView(app, ui);
  assert.match(view.html, /Changes stay as drafts until you add them to your programme/);
  assert.doesNotMatch(view.html, /diagnosis/);
});

test('the generator refuses to save into the example programme', async () => {
  const app = await createApp();
  assert.equal(app.usingExample, true);
  await assert.rejects(() => app.addBlock({ number: 2, name: 'x', weeks: [] }), /Import your workbook/);
});

test('undoing a coach action preserves a later accessory restriction', async () => {
  const app = await readyApp(), ui = {};
  if (planView(app, ui).html.includes('Loading…')) await new Promise((resolve) => planView(app, ui).bind({ innerHTML: '' }, resolve));
  planView(app, ui);
  ui.plan._rev.review.findings.push({ id: 'undo-progression', severity: 'medium', title: 'Slower progression', suggestion: 'Go slower', because: [], confidence: 'medium', action: { type: 'progression', value: 'conservative', label: 'Go slower' } });
  ui.plan.extras = [{ exerciseId: 'standing_calf_raise', sets: 3, reps: [8, 12], rpe: 8 }];
  const controls = new Map(), button = { dataset: { coach: 'undo-progression' }, addEventListener(type, handler) { this[type] = handler; } };
  const root = {
    querySelector(id) { if (!controls.has(id)) controls.set(id, { value: '', addEventListener(type, handler) { this[type] = handler; } }); return controls.get(id); },
    querySelectorAll(selector) { return selector === '[data-coach]' ? [button] : []; },
  };
  planView(app, ui).bind(root, () => {});
  button.click();
  assert.equal(ui.plan.progression, 'conservative');
  controls.get('#p-accessories').change({ target: { value: 'none' } });
  button.click();
  assert.equal(ui.plan.progression, 'standard');
  assert.equal(ui.plan.accessories, 'none');
  assert.deepEqual(ui.plan.extras, []);
});

test('request -> generate -> save: the block lands in the programme with its metadata intact', async () => {
  const app = await readyApp();
  const athlete = athleteOf(app);
  assert.ok(athlete.lifts.squat.e1rmKg > 100, 'the example history gives a squat e1RM');
  const template = templateOf(app, athlete);
  assert.ok(template && template.daysPerWeek === 4);
  const asked = interpretRequest('maintenance block, 3 days a week for 4 weeks');
  assert.deepEqual(asked.options, { focus: 'maintenance', weeks: 4, daysPerWeek: 3 });
  const res = generateBlock({ catalogue: app.catalogue, template, athlete, blockNumber: 2, ...asked.options, seed: 'a', now: () => new Date('2026-10-05T00:00:00Z') });
  assert.equal(res.block.weeks.length, 4);
  assert.equal(res.block.weeks[0].days.length, 3);
  const saved = await app.addBlock({ ...res.block, generated: { ...res.block.generated, rationale: res.rationale, warnings: res.warnings } });
  const b = saved.blocks.find((x) => x.number === 2);
  assert.equal(b.generated.focus, 'maintenance');
  assert.ok(b.generated.rationale.length > 0);
  const sets = b.weeks.flatMap((w) => w.days.flatMap((d) => d.entries.flatMap((e) => e.sets)));
  assert.ok(sets.length > 20 && sets.every((s) => s.gen && s.completed === false));
  assert.ok(sets.every((s) => s.load === null || s.load.value % 2.5 === 0));
  await assert.rejects(() => app.addBlock(res.block), /already exists/);
  // stored copy survives a reload through the sanitiser
  await app.reload();
  assert.equal(app.programme.blocks.find((x) => x.number === 2).weeks[0].days[0].entries[0].sets[0].gen.kind.length > 0, true);
});

test('revise: completed weeks are untouched, later weeks follow the new e1RM, and replace keeps logged history', async () => {
  const app = await readyApp();
  const athlete = athleteOf(app);
  const res = generateBlock({ catalogue: app.catalogue, template: templateOf(app, athlete), athlete, blockNumber: 2, weeks: 5, focus: 'strength', seed: 'a', now: () => new Date('2026-10-05T00:00:00Z') });
  await app.addBlock(res.block);
  // log week 1 of the new block through the normal path
  const block = app.programme.blocks.find((x) => x.number === 2);
  const first = block.weeks[0].days[0].entries[0].sets[0];
  await app.logSet({ date: '2026-10-06', programmeRef: { blockNumber: 2, weekNumber: 1, dayNumber: 1 }, plannedRef: { entryIndex: 0, setIndex: 0 }, exerciseId: block.weeks[0].days[0].entries[0].exerciseId, weight: first.load ?? { value: 100, unit: 'kg' }, reps: 3, rpe: 7 });
  const stronger = { ...athlete, lifts: Object.fromEntries(Object.entries(athlete.lifts).map(([k, v]) => [k, { ...v, e1rmKg: v.e1rmKg ? Math.round(v.e1rmKg * 1.05 * 10) / 10 : v.e1rmKg }])) };
  const r = reviseBlock({ block, athlete: stronger, catalogue: app.catalogue, fromWeek: 2 });
  assert.ok(r.changes.length > 0, 'a 5% stronger athlete moves some loads');
  assert.ok(r.changes.every((c) => c.week >= 2 && c.to > c.from));
  await app.replaceBlock(r.block);
  assert.equal(app.sets.length, 1, 'logged sets stay');
  assert.equal(app.loggedFor({ blockNumber: 2, weekNumber: 1, dayNumber: 1, entryIndex: 0, setIndex: 0 }).reps, 3);
  await app.removeBlock(2);
  assert.equal(app.programme.blocks.some((x) => x.number === 2), false);
  assert.equal(app.sets.length, 1, 'logged sets are still in the history after the block is removed');
  await assert.rejects(() => app.removeBlock(1), /Only generated blocks/);
});

test('coach review of the example history, applied extras, and no exceptions on a bare programme', async () => {
  const app = await readyApp();
  const athlete = athleteOf(app);
  const review = coachReview({ events: app.events(), programme: app.programme, catalogue: app.catalogue, athlete, bodyweight: app.bodyweightPoints() });
  assert.ok(review.headline.length > 10);
  for (const f of review.findings) { assert.ok(f.title && f.suggestion && Array.isArray(f.because)); }
  const gen = generateBlock({ catalogue: app.catalogue, template: templateOf(app, athlete), athlete, blockNumber: 2, seed: 'a', now: () => new Date('2026-10-05T00:00:00Z') });
  const extra = applyExtras(gen.block, [{ exerciseId: 'standing_calf_raise', sets: 2, reps: [10, 15], rpe: 9 }], app.catalogue);
  const calfSets = extra.block.weeks.flatMap((w) => w.days.flatMap((d) => d.entries.filter((e) => e.exerciseId === 'standing_calf_raise')));
  assert.ok(calfSets.length >= 1);
  const empty = coachReview({ events: [], programme: { blocks: [] }, catalogue: app.catalogue });
  assert.equal(empty.findings.length, 0);
});

test('stale or foreign revisions are refused; only generated blocks can be replaced', async () => {
  const app = await readyApp();
  const athlete = athleteOf(app);
  const mk = (seed) => generateBlock({ catalogue: app.catalogue, template: templateOf(app, athlete), athlete, blockNumber: 2, weeks: 4, seed, now: () => new Date('2026-10-05T00:00:00Z') });
  await app.addBlock(mk('a').block);
  const oldAt = app.blockToken(2);
  await assert.rejects(() => app.replaceBlock({ number: 1, name: 'x', weeks: [] }), /Only generated blocks can be replaced/);
  await assert.rejects(() => app.replaceBlock({ ...mk('a').block, generated: undefined }), /not a generated block/);
  // remove, add a different block 2, then try to apply the old revision against it
  await app.removeBlock(2);
  const second = mk('b').block; second.generated = { ...second.generated, at: '2026-10-06T00:00:00.000Z' };
  await app.addBlock(second);
  await assert.rejects(() => app.replaceBlock(mk('a').block, { expectedToken: oldAt }), /has changed since/);
});

test('two revisions made from the same block: the second one applied is refused, the first stays', async () => {
  const app = await readyApp();
  const athlete = athleteOf(app);
  await app.addBlock(generateBlock({ catalogue: app.catalogue, template: templateOf(app, athlete), athlete, blockNumber: 2, weeks: 5, seed: 'a', now: () => new Date('2026-10-05T00:00:00Z') }).block);
  const block = app.programme.blocks.find((b) => b.number === 2);
  const token = app.blockToken(2);
  const revise = (factor) => reviseBlock({ block, catalogue: app.catalogue, fromWeek: 2,
    athlete: { ...athlete, lifts: Object.fromEntries(Object.entries(athlete.lifts).map(([k, v]) => [k, { ...v, e1rmKg: v.e1rmKg ? Math.round(v.e1rmKg * factor * 10) / 10 : v.e1rmKg }])) } }).block;
  const stronger = revise(1.1), weaker = revise(0.9);
  await app.replaceBlock(stronger, { expectedToken: token });
  const loadNow = () => app.programme.blocks.find((b) => b.number === 2).weeks[2].days[0].entries[0].sets[0].load.value;
  const applied = loadNow();
  assert.notEqual(app.blockToken(2), token, 'a replacement moves the token');
  await assert.rejects(() => app.replaceBlock(weaker, { expectedToken: token }), /has changed since/);
  assert.equal(loadNow(), applied, 'the stale revision did not overwrite the newer one');
  await app.reload();
  assert.equal(app.blockToken(2), app.blockToken(2));
  assert.equal(app.programme.blocks.find((b) => b.number === 2).generated.rev, 1, 'the revision counter survives a reload');
});

test('saving keeps rep ranges in the generator metadata (accessories and ranged main lifts), so later revisions still work', async () => {
  const app = await readyApp();
  const athlete = athleteOf(app);
  const res = generateBlock({ catalogue: app.catalogue, template: templateOf(app, athlete), athlete, blockNumber: 2, weeks: 4, seed: 'a', now: () => new Date('2026-10-05T00:00:00Z') });
  const ranged = res.block.weeks[0].days.flatMap((d) => d.entries.flatMap((e) => e.sets)).filter((s) => Array.isArray(s.gen.reps));
  assert.ok(ranged.length > 0, 'the example template has accessories with a rep range');
  await app.addBlock(res.block);
  await app.reload();
  const saved = app.programme.blocks.find((b) => b.number === 2).weeks[0].days.flatMap((d) => d.entries.flatMap((e) => e.sets)).filter((s) => s.gen.kind === 'accessory');
  assert.ok(saved.length > 0 && saved.every((s) => Array.isArray(s.gen.reps) && s.gen.reps.length === 2 && s.gen.reps[0] <= s.gen.reps[1]));
});

test('removing a generated block detaches what was logged against it, so a later block with that number starts clean', async () => {
  const app = await readyApp();
  const athlete = athleteOf(app);
  const res = generateBlock({ catalogue: app.catalogue, template: templateOf(app, athlete), athlete, blockNumber: 2, weeks: 4, seed: 'a', now: () => new Date('2026-10-05T00:00:00Z') });
  await app.addBlock(res.block);
  const e = app.programme.blocks.find((b) => b.number === 2).weeks[0].days[0].entries[0];
  await app.logSet({ date: '2026-10-06', programmeRef: { blockNumber: 2, weekNumber: 1, dayNumber: 1 }, plannedRef: { entryIndex: 0, setIndex: 0 }, exerciseId: e.exerciseId, weight: { value: 100, unit: 'kg' }, reps: 5, rpe: 8 });
  await app.removeBlock(2);
  assert.equal(app.sets.length, 1);
  assert.equal(app.sets[0].plannedRef, null);
  assert.equal(app.sessions[0].programmeRef, null);
  await app.addBlock({ ...generateBlock({ catalogue: app.catalogue, template: templateOf(app, athlete), athlete, blockNumber: 2, weeks: 4, seed: 'z', now: () => new Date('2026-10-07T00:00:00Z') }).block });
  assert.equal(app.loggedFor({ blockNumber: 2, weekNumber: 1, dayNumber: 1, entryIndex: 0, setIndex: 0 }), null, 'the old log does not attach to the new block');
  assert.equal(app.events().filter((x) => x.source === 'logged').length, 1, 'but it still counts in your history');
});

test('sets logged in the app count as done for reviews and revisions, and the athlete model is cached', async () => {
  const app = await readyApp();
  const athlete = athleteOf(app);
  const res = generateBlock({ catalogue: app.catalogue, template: templateOf(app, athlete), athlete, blockNumber: 2, weeks: 4, seed: 'a', now: () => new Date('2026-10-05T00:00:00Z') });
  await app.addBlock(res.block);
  const e = app.programme.blocks.find((b) => b.number === 2).weeks[0].days[0].entries[0];
  await app.logSet({ date: '2026-10-06', programmeRef: { blockNumber: 2, weekNumber: 1, dayNumber: 1 }, plannedRef: { entryIndex: 0, setIndex: 0 }, exerciseId: e.exerciseId, weight: { value: 101, unit: 'kg' }, reps: 4, rpe: 8.5 });
  const merged = app.programmeMerged().blocks.find((b) => b.number === 2).weeks[0].days[0].entries[0].sets[0];
  assert.equal(merged.completed, true); assert.equal(merged.actualRpe, 8.5); assert.equal(merged.actualReps, 4); assert.equal(merged.actualLoad.value, 101);
  assert.equal(app.programme.blocks.find((b) => b.number === 2).weeks[0].days[0].entries[0].sets[0].completed, false, 'the stored programme is untouched');
  assert.equal(app.athlete(), app.athlete(), 'same object until the data changes');
  const before = app.athlete();
  await app.logSet({ date: '2026-10-06', programmeRef: null, plannedRef: null, exerciseId: 'comp_bench', weight: { value: 90, unit: 'kg' }, reps: 5, rpe: 8 });
  assert.notEqual(app.athlete(), before, 'rebuilt after the data changed');
});
