import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../../src/ui/state.js';
import { buildExampleProgramme } from '../../src/ui/example-data.js';
import { dataView } from '../../src/ui/views/data.js';
import { makeXlsx } from '../helpers/make-xlsx.js';

globalThis.fetch = async (path) => {
  const text = await readFile(new URL('../../' + path, import.meta.url), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(text) };
};

async function readyApp() {
  const app = await createApp();
  const programme = buildExampleProgramme(); programme.isExample = false;
  await app.setProgramme(programme);
  return app;
}

function syntheticWorkbook() {
  const c = (r, col, v) => ({ r, c: col, v });
  return makeXlsx({ sheets: [{ name: 'Block 2 - Synthetic', cells: [
    c(0, 0, 'Week 1'), c(3, 0, 'Day 1'), c(4, 1, 'Reps'), c(4, 2, 'Target RPE'), c(4, 3, 'Load'),
    c(5, 0, 'Competition Bench Press'), c(5, 1, 5), c(5, 2, 7.5), c(5, 3, 80),
  ] }] });
}

function fakeDom() {
  const previous = globalThis.document;
  const sheets = [];
  const element = () => ({ disabled: false, value: '', textContent: '', addEventListener(type, fn) { this[type] = fn; }, setAttribute() {}, append() {}, remove() { this.removed = true; }, click() {}, focus() {} });
  globalThis.document = {
    querySelector() { return null; },
    createElement() {
      const controls = new Map();
      const sheet = {
        innerHTML: '', removed: false, addEventListener() {}, setAttribute() {}, append() {}, click() {}, remove() { this.removed = true; },
        querySelector(selector) { if (!controls.has(selector)) controls.set(selector, element()); return controls.get(selector); },
      };
      sheet.firstElementChild = sheet;
      sheets.push(sheet);
      return sheet;
    },
    addEventListener() {}, removeEventListener() {},
    body: { append() {} }, activeElement: null,
  };
  return { sheets, restore() { globalThis.document = previous; } };
}

function bindData(app, ui = {}) {
  const controls = new Map();
  const root = { querySelector(selector) { if (!controls.has(selector)) controls.set(selector, { value: '', files: null, addEventListener(type, fn) { this[type] = fn; } }); return controls.get(selector); }, querySelectorAll() { return []; } };
  let renders = 0;
  const view = dataView(app, ui);
  view.bind(root, () => { renders++; });
  return { view, root, controls, get renders() { return renders; } };
}

test('workbook preview separates planned and logged sets; Cancel and backup leave data intact', async () => {
  const dom = fakeDom();
  try {
    const app = await readyApp(), ui = {}, bound = bindData(app, ui);
    const before = app.programme;
    const bytes = syntheticWorkbook();
    const input = bound.root.querySelector('#xlsx');
    input.files = [{ name: 'synthetic.xlsx', arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }];
    await input.change({ target: input });
    const sheet = dom.sheets.at(-1);
    assert.match(sheet.innerHTML, /Planned programme:/);
    assert.match(sheet.innerHTML, /Kept:<\/b> 0 logged sets/);
    assert.match(sheet.innerHTML, /Warnings:/);
    assert.strictEqual(app.programme, before, 'preview does not import');
    await sheet.querySelector('#review-backup').click({ currentTarget: sheet.querySelector('#review-backup') });
    assert.equal(sheet.removed, false, 'backup leaves review open');
    assert.strictEqual(app.programme, before);
    sheet.querySelector('#review-cancel').click();
    assert.equal(sheet.removed, true);
    assert.strictEqual(app.programme, before);
    const bad = Uint8Array.of(1, 2, 3);
    input.files = [{ name: 'bad.xlsx', arrayBuffer: async () => bad.buffer }];
    await input.change({ target: input });
    assert.match(bound.root.querySelector('#import-status').innerHTML, /Could not import/);
    assert.strictEqual(app.programme, before);
  } finally { dom.restore(); }
});

test('workbook Apply writes once; a changed source makes a preview stale', async () => {
  const dom = fakeDom();
  try {
    const app = await readyApp(), ui = {}, bound = bindData(app, ui), bytes = syntheticWorkbook();
    const input = bound.root.querySelector('#xlsx');
    const file = { name: 'synthetic.xlsx', arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    input.files = [file]; await input.change({ target: input });
    let sheet = dom.sheets.at(-1);
    await sheet.querySelector('#review-apply').click();
    assert.equal(sheet.removed, true);
    assert.equal(app.programme.blocks[0].number, 2);
    const after = app.programme;
    input.files = [file]; await input.change({ target: input });
    sheet = dom.sheets.at(-1);
    await app.logSet({ date: '2026-10-26', programmeRef: null, plannedRef: null, exerciseId: 'comp_bench', weight: { value: 80, unit: 'kg' }, reps: 5, rpe: 8 });
    await sheet.querySelector('#review-apply').click();
    assert.strictEqual(app.programme, after);
    assert.equal(sheet.querySelector('#review-apply').disabled, true);
    assert.match(sheet.querySelector('#review-error').textContent, /changed since this preview/);
  } finally { dom.restore(); }
});

test('Apply ignores a second click while the workbook write is pending', async () => {
  const dom = fakeDom();
  try {
    const app = await readyApp(), bound = bindData(app), bytes = syntheticWorkbook();
    const input = bound.root.querySelector('#xlsx');
    input.files = [{ name: 'synthetic.xlsx', arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }];
    await input.change({ target: input });
    const sheet = dom.sheets.at(-1), button = sheet.querySelector('#review-apply');
    let release, writes = 0, expectedRevision;
    const original = app.setProgramme;
    app.setProgramme = async (programme, options) => { writes++; expectedRevision = options?.expectedRevision; await new Promise((resolve) => { release = resolve; }); return original(programme, options); };
    const first = button.click();
    await button.click();
    assert.equal(button.disabled, true);
    assert.equal(writes, 1);
    assert.equal(expectedRevision, app.dataRevision);
    release(); await first;
    assert.equal(sheet.removed, true);
  } finally { dom.restore(); }
});

test('backup preview validates before Apply, and handles cancellation and failed writes', async () => {
  const dom = fakeDom();
  try {
    const app = await readyApp(), ui = {}, bound = bindData(app, ui);
    const text = JSON.stringify(await app.exportBackup());
    const input = bound.root.querySelector('#import-json');
    input.files = [{ name: 'invalid.json', size: 2, text: async () => '{}' }];
    await input.change({ target: input });
    assert.match(bound.root.querySelector('#restore-status').innerHTML, /Could not preview backup/);
    input.files = [{ name: 'backup.json', size: text.length, text: async () => text }];
    await input.change({ target: input });
    let sheet = dom.sheets.at(-1);
    assert.match(sheet.innerHTML, /passed backup validation/);
    assert.match(sheet.innerHTML, /No current logged records are kept/);
    sheet.querySelector('#review-cancel').click();
    assert.equal(sheet.removed, true);
    input.files = [{ name: 'backup.json', size: text.length, text: async () => text }];
    await input.change({ target: input });
    sheet = dom.sheets.at(-1);
    await app.logSet({ date: '2026-10-26', programmeRef: null, plannedRef: null, exerciseId: 'comp_bench', weight: { value: 80, unit: 'kg' }, reps: 5, rpe: 8 });
    await sheet.querySelector('#review-apply').click();
    assert.match(sheet.querySelector('#review-error').textContent, /changed since this preview/);
    assert.equal(app.sets.length, 1);
    const original = app.importBackup;
    app.importBackup = async () => { throw new Error('synthetic storage failure'); };
    input.files = [{ name: 'backup.json', size: text.length, text: async () => text }];
    await input.change({ target: input });
    sheet = dom.sheets.at(-1);
    const before = app.programme;
    await sheet.querySelector('#review-apply').click();
    assert.match(sheet.querySelector('#review-error').textContent, /synthetic storage failure/);
    assert.equal(sheet.removed, false);
    assert.strictEqual(app.programme, before);
    app.importBackup = original;
    await sheet.querySelector('#review-apply').click();
    assert.equal(sheet.removed, true);
    assert.equal(app.sets.length, 0, 'validated backup replaces existing logged sets only after Apply');
  } finally { dom.restore(); }
});

test('Data shows version and leaves update activation to an explicit action', async () => {
  const dom = fakeDom();
  try {
    const app = await readyApp();
    let checks = 0, activations = 0;
    const updates = { status: 'available', version: 'lt-v99', async check() { checks++; }, async apply() { activations++; } };
    const bound = bindData(app, { updates });
    assert.match(bound.view.html, /App version/);
    assert.match(bound.view.html, /An update is ready/);
    assert.match(bound.view.html, /Apply update and reload/);
    assert.equal(activations, 0);
    await bound.root.querySelector('#check-update').click();
    assert.equal(checks, 1);
    assert.equal(activations, 0);
    await bound.root.querySelector('#apply-update').click();
    assert.equal(activations, 1);
  } finally { dom.restore(); }
});
