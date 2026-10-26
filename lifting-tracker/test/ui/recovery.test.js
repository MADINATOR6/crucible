import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../../src/ui/state.js';
import { buildExampleProgramme } from '../../src/ui/example-data.js';
import { planView } from '../../src/ui/views/plan.js';

globalThis.fetch = async (path) => ({ ok: true, status: 200, json: async () => JSON.parse(await readFile(new URL('../../' + path, import.meta.url), 'utf8')) });

async function readyApp() {
  const app = await createApp();
  const programme = buildExampleProgramme();
  programme.isExample = false;
  await app.setProgramme(programme);
  return app;
}

async function readyView(app, ui) {
  let view = planView(app, ui);
  if (view.html.includes('Loading…')) await new Promise((resolve) => view.bind({ innerHTML: '' }, resolve));
  return planView(app, ui);
}

function controls() {
  const map = new Map();
  const root = {
    querySelector(id) {
      if (!map.has(id)) map.set(id, { value: '', disabled: false, remove() {}, addEventListener(type, handler) { this[type] = handler; }, replaceChildren(value) { this.textContent = value; } });
      return map.get(id);
    },
    querySelectorAll: () => [],
  };
  return { root, map };
}

test('Coach restores only bounded editable inputs and rebuilds a preview from current data', async () => {
  const app = await readyApp(), ui = {};
  const first = await readyView(app, ui);
  const { root, map } = controls();
  let view = first;
  view.bind(root, () => { view = planView(app, ui); });
  root.querySelector('#ask-text').value = 'top single block, 4 days a week';
  map.get('#ask-text').input({ target: map.get('#ask-text') });
  root.querySelector('#p-days').value = '4';
  map.get('#p-days').change();
  await ui.plan._draftWrite;
  assert.equal(app.getDraft('coach').value.text, 'top single block, 4 days a week');
  assert.equal(app.getDraft('coach').value.settings.days, 4);
  assert.equal('result' in app.getDraft('coach').value, false);

  await app.reload();
  const restored = {}, recovered = await readyView(app, restored);
  assert.equal(restored.plan.text, 'top single block, 4 days a week');
  assert.equal(restored.plan.days, 4);
  assert.equal(restored.plan.result, null);
  assert.equal(restored.plan.understood, null);
  assert.match(recovered.html, /UNSAVED Coach inputs/);
  assert.match(recovered.html, /Build a fresh draft/);
  assert.doesNotMatch(recovered.html, /id="draft-preview"/);

  const next = controls();
  recovered.bind(next.root, () => {});
  next.root.querySelector('#ask-text').value = restored.plan.text;
  next.map.get('#ask').submit({ preventDefault() {} });
  assert.ok(restored.plan.result, 'explicit Build makes a fresh preview');
  assert.equal(app.programme.blocks.some((b) => b.generated), false, 'recovery never adds a block');
});

test('Coach rejects mismatched source and ignores saved preview-like fields', async () => {
  const app = await readyApp();
  await readyView(app, {});
  await app.saveDraft('coach', { source: 'another programme', unit: 'kg', text: 'peak', settings: {}, result: { generated: true } });
  const ui = {}, view = planView(app, ui);
  assert.equal(ui.plan.text, '');
  assert.equal(ui.plan.result, null);
  assert.match(view.html, /UNSAVED Coach inputs/);
  assert.match(view.html, /no longer match this programme/);
});

test('explicit Discard clears Coach inputs and the stored draft', async () => {
  const app = await readyApp(), ui = {};
  await readyView(app, ui);
  const initial = controls();
  planView(app, ui).bind(initial.root, () => {});
  initial.root.querySelector('#ask-text').value = 'maintenance';
  initial.map.get('#ask-text').input({ target: initial.map.get('#ask-text') });
  await ui.plan._draftWrite;
  const reloaded = {}, view = planView(app, reloaded);
  const next = controls();
  view.bind(next.root, () => {});
  await next.map.get('#discard-coach-draft').click({ currentTarget: next.map.get('#discard-coach-draft') });
  assert.equal(app.getDraft('coach'), null);
  assert.equal(reloaded.plan, null);
});
