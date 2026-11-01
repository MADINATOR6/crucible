import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreRest, stopRest, startRest } from '../../src/ui/rest-timer.js';

test('rest resumes from its wall-clock deadline and rejects expired or invalid recovery', (t) => {
  const oldDoc = globalThis.document, oldStorage = globalThis.sessionStorage;
  const data = new Map(); let el = null;
  globalThis.sessionStorage = { getItem: (k) => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const time = {}, label = {};
  globalThis.document = {
    getElementById: () => el,
    createElement: () => ({ setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {} },
      querySelector: (s) => s === '.rt-time' ? time : label, remove() { el = null; } }),
    body: { append: (value) => { el = value; } },
  };
  t.mock.method(globalThis, 'setInterval', () => 1);
  t.mock.method(globalThis, 'clearInterval', () => {});
  t.mock.method(Date, 'now', () => 100000);
  try {
    startRest(90, { vibrate: false });
    const saved = data.get('lifting-tracker-rest');
    assert.equal(JSON.parse(saved).end, 190000);
    stopRest(); assert.equal(data.size, 0);
    data.set('lifting-tracker-rest', saved);
    restoreRest(); assert.equal(time.textContent, '1:30');
    stopRest();
    for (const value of ['{"end":99999}', '{"end":"invalid"}', '{"end":999999999}', 'broken']) {
      data.set('lifting-tracker-rest', value); restoreRest(); assert.equal(el, null);
    }
    globalThis.sessionStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    assert.doesNotThrow(() => { restoreRest(); startRest(30); stopRest(); });
  } finally {
    stopRest(); globalThis.document = oldDoc;
    if (oldStorage === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = oldStorage;
  }
});
