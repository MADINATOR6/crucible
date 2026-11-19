import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../src/store/db.js';
import { createApp } from '../../src/ui/state.js';
import { readFile } from 'node:fs/promises';

// Two connections share one database. Readwrite transactions hold a store lock through
// the get callback and its following put, as IndexedDB does; reads outside that lock race.
function indexedDbHarness() {
  const tables = new Map();
  const waiting = [];
  let locked = false;
  const pump = () => {
    if (locked || !waiting.length) return;
    locked = true;
    const tx = waiting.shift();
    tx.active = true;
    tx.run();
  };
  const database = {
    objectStoreNames: { contains: (name) => tables.has(name) },
    createObjectStore(name, { keyPath }) { tables.set(name, { keyPath, records: new Map() }); },
    transaction(name, mode = 'readonly') {
      const tx = { active: false, requests: [], error: null, aborted: false, oncomplete: null, onabort: null, onerror: null };
      const names = Array.isArray(name) ? name : [name];
      tx.objectStore = (store) => {
        assert.ok(names.includes(store));
        const table = tables.get(store);
        const request = (operation) => {
          const r = { result: undefined, error: null, onsuccess: null, onerror: null };
          tx.requests.push({ operation, r });
          if (tx.active) tx.run();
          return r;
        };
        return {
          get: (key) => request(() => structuredClone(table.records.get(key))),
          getAll: () => request(() => structuredClone([...table.records.values()])),
          put: (value) => { assert.equal(mode, 'readwrite'); return request(() => { table.records.set(value[table.keyPath], structuredClone(value)); }); },
          delete: (key) => request(() => { table.records.delete(key); }),
          clear: () => request(() => { table.records.clear(); }),
        };
      };
      let scheduled = false;
      tx.run = () => {
        if (scheduled || !tx.active || tx.aborted) return;
        scheduled = true;
        setTimeout(() => {
          scheduled = false;
          if (tx.aborted) return;
          const item = tx.requests.shift();
          if (item) {
            try { item.r.result = item.operation(); item.r.onsuccess?.(); }
            catch (e) { tx.error = e; item.r.error = e; item.r.onerror?.(); tx.abort(); return; }
            tx.run();
          } else {
            tx.active = false;
            tx.oncomplete?.();
            locked = false; pump();
          }
        }, 0);
      };
      tx.abort = () => { tx.aborted = true; tx.onerror?.(); tx.onabort?.(); if (tx.active) { locked = false; pump(); } };
      waiting.push(tx); pump();
      return tx;
    },
  };
  return { open() {
    const request = { result: database, error: null };
    queueMicrotask(() => { request.onupgradeneeded?.(); request.onsuccess?.(); });
    return request;
  } };
}

test('two IndexedDB connections serialize list and settings read-modify-write; rejected update writes nothing', async () => {
  const previous = globalThis.indexedDB;
  globalThis.indexedDB = indexedDbHarness();
  try {
    const [a, b] = await Promise.all([openStore(), openStore()]);
    assert.equal(a.persistent && b.persistent, true);
    await Promise.all([
      a.updateMeta('intake', (v) => [...(v || []), { id: 'a' }]),
      b.updateMeta('intake', (v) => [...(v || []), { id: 'b' }]),
    ]);
    assert.deepEqual((await a.get('meta', 'intake')).value.map((v) => v.id), ['a', 'b']);
    await Promise.all([
      a.updateMeta('settings', (v) => ({ ...v, theme: 'dark' })),
      b.updateMeta('settings', (v) => ({ ...v, unit: 'lb' })),
    ]);
    assert.deepEqual((await b.get('meta', 'settings')).value, { theme: 'dark', unit: 'lb' });
    await assert.rejects(() => a.updateMeta('intake', () => { throw new Error('invalid'); }), /invalid/);
    assert.equal((await b.get('meta', 'intake')).value.length, 2);
  } finally { globalThis.indexedDB = previous; }
});

test('whole-programme replacement rejects a stale connection and keeps its drafts', async () => {
  const previous = globalThis.indexedDB;
  globalThis.indexedDB = indexedDbHarness();
  try {
    const [a, b] = await Promise.all([openStore(), openStore()]);
    await a.put('meta', { key: 'programme', value: { blocks: [1] } });
    await a.put('meta', { key: 'draft:set', value: { text: 'pending' } });
    const old = JSON.stringify((await b.get('meta', 'programme')).value);
    await a.updateMeta('programme', (value) => ({ blocks: [...value.blocks, 2] }));
    await assert.rejects(() => b.replaceProgramme(old, { blocks: [3] }, ['draft:set']), { code: 'STALE_DATA' });
    assert.deepEqual((await a.get('meta', 'programme')).value.blocks, [1, 2]);
    assert.ok(await a.get('meta', 'draft:set'));
  } finally { globalThis.indexedDB = previous; }
});

test('two app instances preserve food, settings and independently added programme blocks', async () => {
  const previousDb = globalThis.indexedDB, previousFetch = globalThis.fetch, previousChannel = globalThis.BroadcastChannel;
  globalThis.indexedDB = indexedDbHarness();
  globalThis.BroadcastChannel = undefined; // Exercise the transaction guard without notification timing.
  globalThis.fetch = async (path) => ({ ok: true, json: async () => JSON.parse(await readFile(new URL('../../' + path, import.meta.url), 'utf8')) });
  try {
    const [a, b] = await Promise.all([createApp(), createApp()]);
    await a.setProgramme({ blocks: [] });
    await b.reload();
    await Promise.all([
      a.addIntake('2026-10-01', 'Meal A', { kcal: 100, protein: 10, fat: 2, carbs: 15 }),
      b.addIntake('2026-10-01', 'Meal B', { kcal: 200, protein: 20, fat: 4, carbs: 30 }),
    ]);
    assert.deepEqual((await a.store.get('meta', 'intake')).value.map((e) => e.label), ['Meal A', 'Meal B']);
    await Promise.all([a.addActivity('2026-10-01', 'walk', 20), b.addActivity('2026-10-01', 'walk-brisk', 30)]);
    assert.equal((await b.store.get('meta', 'activities')).value.length, 2);
    await Promise.all([a.saveSettings({ theme: 'dark' }), b.saveSettings({ unit: 'lb' })]);
    const settings = (await a.store.get('meta', 'settings')).value;
    assert.equal(settings.theme, 'dark'); assert.equal(settings.unit, 'lb');
    await Promise.all([a.addBlock({ number: 1, weeks: [] }), b.addBlock({ number: 2, weeks: [] })]);
    assert.deepEqual((await a.store.get('meta', 'programme')).value.blocks.map((block) => block.number).sort(), [1, 2]);
    await b.reload();
    const backup = JSON.stringify(await b.exportBackup());
    await a.addIntake('2026-10-02', 'New meal', { kcal: 300, protein: 30, fat: 6, carbs: 45 });
    await assert.rejects(() => b.importBackup(backup), { code: 'STALE_DATA' });
    await a.addIntake('2026-10-03', 'Another meal', { kcal: 300, protein: 30, fat: 6, carbs: 45 });
    await assert.rejects(() => b.resetAll(), { code: 'STALE_DATA' });
    assert.equal((await a.store.get('meta', 'intake')).value.length, 4);
  } finally { globalThis.indexedDB = previousDb; globalThis.fetch = previousFetch; globalThis.BroadcastChannel = previousChannel; }
});

test('stale set, delete, Undo and block removal refuse foreign writes before touching storage', async () => {
  const previousDb = globalThis.indexedDB, previousFetch = globalThis.fetch, previousChannel = globalThis.BroadcastChannel;
  globalThis.indexedDB = indexedDbHarness(); globalThis.BroadcastChannel = undefined;
  globalThis.fetch = async (path) => ({ ok: true, json: async () => JSON.parse(await readFile(new URL('../../' + path, import.meta.url), 'utf8')) });
  const input = (date) => ({ date, exerciseId: 'low_bar_squat', weight: { value: 100, unit: 'kg' }, reps: 5 });
  try {
    const [a, b] = await Promise.all([createApp(), createApp()]);
    await a.setProgramme({ blocks: [] }); await b.reload();
    const first = await a.logSet(input('2026-10-01'));
    await assert.rejects(() => b.logSet(input('2026-10-02')), { code: 'STALE_DATA', message: /refreshed/ });
    assert.equal((await a.store.getAll('sets')).length, 1);
    await b.logSet(input('2026-10-02'));
    assert.equal((await a.store.getAll('sets')).length, 2, 'retry keeps the foreign set');
    await b.reload();
    await a.addIntake('2026-10-01', 'Meal', { kcal: 100, protein: 10, fat: 2, carbs: 15 });
    await assert.rejects(() => b.deleteSet(first.id), { code: 'STALE_DATA' });
    assert.equal((await a.store.getAll('sets')).length, 2);
    await b.reload();
    const change = await b.logSet(input('2026-10-02'), { withUndo: true });
    await a.addBodyweight('2026-10-02', { value: 80, unit: 'kg' });
    await assert.rejects(() => b.undoSetChange(change.undoToken), { code: 'STALE_DATA' });
    assert.equal((await a.store.getAll('sets')).length, 3);
    await a.addBlock({ number: 1, weeks: [], generated: { at: '2026-10-02' } });
    await b.reload();
    await a.addIntake('2026-10-02', 'Second meal', { kcal: 100, protein: 10, fat: 2, carbs: 15 });
    await assert.rejects(() => b.removeBlock(1), { code: 'STALE_DATA' });
    assert.equal((await a.store.get('meta', 'programme')).value.blocks.length, 1);
  } finally { globalThis.indexedDB = previousDb; globalThis.fetch = previousFetch; globalThis.BroadcastChannel = previousChannel; }
});

test('settings merges saved-list additions with other deletions and nested map edits', async () => {
  const previousDb = globalThis.indexedDB, previousFetch = globalThis.fetch, previousChannel = globalThis.BroadcastChannel;
  globalThis.indexedDB = indexedDbHarness(); globalThis.BroadcastChannel = undefined;
  globalThis.fetch = async (path) => ({ ok: true, json: async () => JSON.parse(await readFile(new URL('../../' + path, import.meta.url), 'utf8')) });
  const meal = (id) => ({ id, name: id, items: [{ food: id, amount: 100, unit: 'g' }] });
  const food = (id) => ({ id, name: id, kcal: 100, protein: 10, fat: 2, carbs: 15 });
  try {
    const [a, b] = await Promise.all([createApp(), createApp()]);
    await a.saveSettings({ meals: [meal('keep'), meal('remove')], customFoods: [food('keep'), food('remove')], blockStarts: { 1: '2026-10-05', 2: '2026-10-12' } });
    await b.reload();
    await Promise.all([
      a.saveSettings({ meals: [...a.settings.meals, meal('new')], customFoods: [...a.settings.customFoods, food('new')], blockStarts: { ...a.settings.blockStarts, 3: '2026-10-19' } }),
      b.saveSettings({ meals: b.settings.meals.filter((x) => x.id !== 'remove'), customFoods: b.settings.customFoods.filter((x) => x.id !== 'remove'), blockStarts: { 1: '2026-10-05' } }),
    ]);
    const settings = (await a.store.get('meta', 'settings')).value;
    assert.deepEqual(settings.meals.map((x) => x.id).sort(), ['keep', 'new']);
    assert.deepEqual(settings.customFoods.map((x) => x.id).sort(), ['keep', 'new']);
    assert.deepEqual(settings.blockStarts, { 1: '2026-10-05', 3: '2026-10-19' });
  } finally { globalThis.indexedDB = previousDb; globalThis.fetch = previousFetch; globalThis.BroadcastChannel = previousChannel; }
});
