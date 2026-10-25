import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Coach has its own primary tab and Data remains reachable from the persistent settings button', async () => {
  const previous = Object.fromEntries(['document', 'window', 'location', 'fetch', 'matchMedia'].map((key) => [key, globalThis[key]]));
  const events = new Map(), controls = new Map();
  const links = ['train', 'plan', 'progress', 'muscles', 'plates', 'data'].map((id) => ({
    dataset: { tab: id }, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; },
  }));
  let rendered;
  const ready = new Promise((resolve) => { rendered = resolve; });
  const mount = { innerHTML: '' };
  const view = {
    set innerHTML(value) { this.html = value; rendered(); },
    querySelector(selector) {
      if (!controls.has(selector)) controls.set(selector, { addEventListener() {}, value: '' });
      return controls.get(selector);
    },
    querySelectorAll: () => [],
  };
  globalThis.fetch = async (path) => ({ ok: true, json: async () => JSON.parse(await readFile(new URL('../../' + path, import.meta.url), 'utf8')) });
  globalThis.location = { hash: '#train', protocol: 'http:', hostname: 'localhost', search: '' };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.window = { addEventListener(type, handler) { events.set(type, handler); }, scrollTo() {} };
  globalThis.document = { documentElement: { dataset: {} }, getElementById: (id) => id === 'app' ? mount : view, querySelectorAll: () => links };
  try {
    await import('../../src/ui/app.js');
    await ready;
    const mobile = mount.innerHTML.match(/<nav class="tabbar"[^>]*>([\s\S]*?)<\/nav>/)[1];
    assert.deepEqual([...mobile.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]), ['train', 'plan', 'progress', 'muscles', 'plates']);
    assert.match(mount.innerHTML, /href="#data"[^>]*aria-label="Data and settings"/);
    globalThis.location.hash = '#plan';
    events.get('hashchange')();
    assert.equal(document.title, 'Coach · Lifting Tracker');
    assert.equal(links.find((a) => a.dataset.tab === 'plan').attributes['aria-current'], 'page');
    assert.equal(links.find((a) => a.dataset.tab === 'train').attributes['aria-current'], undefined);
    globalThis.location.hash = '#data';
    events.get('hashchange')();
    assert.equal(document.title, 'Data and settings · Lifting Tracker');
    assert.equal(links.find((a) => a.dataset.tab === 'data').attributes['aria-current'], 'page');
    assert.match(view.html, /Import/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
