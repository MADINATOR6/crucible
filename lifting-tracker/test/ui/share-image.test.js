import test from 'node:test';
import assert from 'node:assert/strict';
import { shareOut, saveButton } from '../../src/ui/share-image.js';

// Synthetic browser: a phone that can share files, with every created element recorded.
function phone() {
  const made = [], shared = [], prev = { document: globalThis.document, navigator: globalThis.navigator, URL: globalThis.URL.createObjectURL };
  const el = (tag) => { const e = { tag, clicked: 0, setAttribute() {}, append() {}, remove() {}, addEventListener() {}, style: {}, click() { e.clicked++; } }; made.push(e); return e; };
  globalThis.document = { createElement: el, querySelector: () => null, body: { append() {} } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { canShare: () => true, share: async (data) => { shared.push(data); } } });
  globalThis.URL.createObjectURL = () => 'blob:test';
  const canvas = { toBlob: (cb, type) => cb(new Blob(['png'], { type })) };
  return { made, shared, canvas, restore() {
    globalThis.document = prev.document; globalThis.URL.createObjectURL = prev.URL;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: prev.navigator });
  } };
}

test('Share image uses the share sheet; Save image always downloads a PNG instead', async () => {
  const p = phone();
  try {
    await shareOut(p.canvas, 'bar-100kg.png', '100 kg');
    assert.equal(p.shared.length, 1); assert.equal(p.shared[0].files[0].type, 'image/png');
    assert.equal(p.made.filter((e) => e.tag === 'a').length, 0, 'sharing does not also download');

    await shareOut(p.canvas, 'bar-100kg.png', '100 kg', true);
    assert.equal(p.shared.length, 1, 'saving never opens the share sheet');
    const a = p.made.find((e) => e.tag === 'a');
    assert.equal(a.download, 'bar-100kg.png'); assert.equal(a.clicked, 1);
  } finally { p.restore(); }
});

test('Save image button carries the caller attributes and disables with its Share button', () => {
  assert.match(saveButton('data-act="save"'), /<button class="btn ghost small" data-act="save" >Save image<\/button>/);
  assert.match(saveButton('data-act="save"', true), /disabled/);
});
