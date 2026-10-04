import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../../src/ui/state.js';
import { buildExampleProgramme } from '../../src/ui/example-data.js';
import { buildAthleteModel } from '../../src/core/athlete.js';
import { learnTemplate } from '../../src/core/template.js';
import { generateBlock, reviseBlock } from '../../src/core/generator.js';
import { interpretRequest } from '../../src/core/request.js';
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

test('the generator refuses to save into the example programme', async () => {
  const app = await createApp();
  assert.equal(app.usingExample, true);
  await assert.rejects(() => app.addBlock({ number: 2, name: 'x', weeks: [] }), /Import your workbook/);
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