import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { APP_VERSION, createUpdates } from '../../src/ui/updates.js';

function harness(waiting = null) {
  const listeners = {}, registration = { waiting, installing: null, addEventListener: (type, fn) => { listeners[type] = fn; }, update: async () => {} };
  let reloads = 0;
  const updates = createUpdates({ serviceWorker: { register: async () => registration, addEventListener: (type, fn) => { listeners[type] = fn; } }, reload: () => reloads++ });
  return { updates, registration, listeners, reloads: () => reloads };
}

test('waiting update requires explicit Apply and reloads only its requesting tab', async () => {
  const messages = [], h = harness({ postMessage: (m) => messages.push(m) });
  await h.updates.check();
  assert.equal(h.updates.status, 'available');
  h.listeners.controllerchange();
  assert.equal(h.reloads(), 0);
  assert.deepEqual(messages, []);
  h.updates.apply();
  assert.deepEqual(messages, [{ type: 'ACTIVATE_UPDATE' }]);
  assert.equal(h.reloads(), 0);
  h.listeners.controllerchange();
  h.listeners.controllerchange();
  assert.equal(h.reloads(), 1);
});

test('another tab activating an update offers an explicit reload and never reloads itself', async () => {
  const listeners = {}; let reloads = 0;
  const serviceWorker = { controller: {}, register: async () => ({ waiting: null, addEventListener() {}, update: async () => {} }),
    addEventListener: (type, fn) => { listeners[type] = fn; } };
  const state = createUpdates({ serviceWorker, reload: () => reloads++ });
  await state.check();
  listeners.controllerchange();
  assert.equal(state.status, 'reload'); assert.equal(reloads, 0);
  await state.check(); assert.equal(state.status, 'reload');
  state.apply(); assert.equal(reloads, 1);
});

test('checks distinguish current, installing, failed and offline states', async () => {
  const h = harness();
  await h.updates.check(); assert.equal(h.updates.status, 'current');
  let change;
  const worker = { state: 'installing', addEventListener: (type, fn) => { change = fn; } };
  h.registration.installing = worker;
  h.listeners.updatefound(); assert.equal(h.updates.status, 'checking');
  h.registration.installing = null; h.registration.waiting = worker; worker.state = 'installed'; change();
  assert.equal(h.updates.status, 'available');
  worker.state = 'redundant'; change();
  assert.equal(h.updates.status, 'available', 'a previously installed worker becoming obsolete is not a failed install');
  const failed = createUpdates({ serviceWorker: { addEventListener() {}, register: async () => { throw Error('network'); } } });
  await failed.check(); assert.equal(failed.status, 'error');
  const offline = createUpdates({ online: () => false, serviceWorker: { addEventListener() {}, register: async () => { throw Error('offline'); } } });
  await offline.check(); assert.equal(offline.status, 'offline');
  assert.equal(createUpdates().status, 'unsupported');
  assert.equal(createUpdates({ enabled: false }).status, 'development');
});

test('SW and UI versions agree, install waits, activation is message-driven', async () => {
  const source = await readFile(new URL('../../sw.js', import.meta.url), 'utf8');
  assert.equal(/const VERSION = '([^']+)'/.exec(source)[1], APP_VERSION);
  const handlers = {}; let skips = 0, cached = false;
  vm.runInNewContext(source, { self: { addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting: async () => { skips++; } },
    caches: { open: async () => ({ addAll: async () => { cached = true; } }) } });
  let pending;
  handlers.install({ waitUntil: (promise) => { pending = promise; } });
  await pending; assert.equal(cached, true); assert.equal(skips, 0);
  handlers.message({ data: { type: 'OTHER' }, waitUntil: (promise) => { pending = promise; } });
  assert.equal(skips, 0);
  handlers.message({ data: { type: 'ACTIVATE_UPDATE' }, waitUntil: (promise) => { pending = promise; } });
  await pending; assert.equal(skips, 1);
});
