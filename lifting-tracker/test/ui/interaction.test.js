import test from 'node:test';
import assert from 'node:assert/strict';
import { swipeDismiss, toast, captureView, restoreView, openSheet } from '../../src/ui/dom.js';
import { startRest, stopRest } from '../../src/ui/rest-timer.js';

class Element extends EventTarget {
  constructor(attrs = {}) {
    super(); this.attrs = attrs; this.children = []; this.dataset = {}; this.open = false; this.isConnected = true;
    const properties = new Map();
    this.style = { setProperty: (key, value) => properties.set(key, value), removeProperty: (key) => properties.delete(key), getPropertyValue: (key) => properties.get(key) };
    this.classList = { add() {}, remove() {} };
  }
  setAttribute(key, value) { this.attrs[key] = value; }
  hasAttribute(key) { return key in this.attrs; }
  getAttribute(key) { return this.attrs[key] ?? null; }
  append(child) { this.children.push(child); }
  remove() { this.isConnected = false; }
  focus(options) { this.focused = options; }
  querySelector() { return null; }
  setPointerCapture() {}
}
function pointer(el, type, x, y, over = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }, over);
  el.dispatchEvent(event); return event;
}
const drag = (el, x, y) => { pointer(el, 'pointerdown', 120, 120); pointer(el, 'pointermove', 120 + x, 120 + y); pointer(el, 'pointerup', 120 + x, 120 + y); };

test('horizontal swipes dismiss either way; vertical, short and cancelled drags do not', () => {
  for (const dx of [-90, 90]) {
    const el = new Element(); let dismissed = 0; swipeDismiss(el, () => dismissed++);
    drag(el, dx, 4); assert.equal(dismissed, 1);
    assert.equal(el.style.getPropertyValue('--swipe-x'), undefined);
    const click = new Event('click', { cancelable: true }); el.dispatchEvent(click);
    assert.equal(click.defaultPrevented, true, 'drag must not activate a nested action');
  }
  for (const [dx, dy] of [[20, 0], [0, 90], [80, 90]]) {
    const el = new Element(); let dismissed = 0; swipeDismiss(el, () => dismissed++);
    drag(el, dx, dy); assert.equal(dismissed, 0);
  }
  const el = new Element(); let dismissed = 0; swipeDismiss(el, () => dismissed++);
  pointer(el, 'pointerdown', 0, 0); pointer(el, 'pointermove', 100, 0); pointer(el, 'pointercancel', 100, 0); pointer(el, 'pointerup', 100, 0);
  assert.equal(dismissed, 0); assert.equal(el.style.getPropertyValue('--swipe-x'), undefined);
  const accessibleAfterCancel = new Event('click', { cancelable: true }); el.dispatchEvent(accessibleAfterCancel);
  assert.equal(accessibleAfterCancel.defaultPrevented, false);
  drag(el, 30, 0);
  const keyboard = new Event('click', { cancelable: true }); Object.assign(keyboard, { detail: 0 }); el.dispatchEvent(keyboard);
  assert.equal(keyboard.defaultPrevented, false, 'keyboard and assistive activation work after an aborted drag');
  pointer(el, 'pointerdown', 0, 0); pointer(el, 'pointerup', 0, 0);
  const tap = new Event('click', { cancelable: true }); el.dispatchEvent(tap);
  assert.equal(tap.defaultPrevented, false, 'a later ordinary tap still works');
});

function documentHarness() {
  const nodes = [], text = new Element(), prev = globalThis.document;
  globalThis.document = { activeElement: null, body: { append: (el) => nodes.push(el) }, addEventListener() {}, removeEventListener() {},
    querySelector: (selector) => nodes.findLast((el) => el.isConnected && selector === '.' + el.className) || null,
    querySelectorAll: () => [], getElementById: (id) => nodes.findLast((el) => el.isConnected && el.id === id) || null,
    createElement: () => { const el = new Element(); el.querySelector = () => text; el.firstElementChild = text; return el; } };
  return { nodes, restore: () => { globalThis.document = prev; } };
}

test('swiping or closing a toast dismisses it without running Undo; tapping Undo still runs it', () => {
  const h = documentHarness(); let undos = 0;
  try {
    toast('Saved', 1, { label: 'Undo', onClick: () => undos++ });
    const message = h.nodes.at(-1); drag(message, -90, 0);
    assert.equal(message.isConnected, false); assert.equal(undos, 0);
    toast('Saved', 1, { label: 'Undo', onClick: () => undos++ });
    const next = h.nodes.at(-1), close = next.children.find((el) => el.getAttribute?.('aria-label') === 'Dismiss message');
    assert.ok(close); close.onclick(); assert.equal(next.isConnected, false); assert.equal(undos, 0);
    toast('Saved', 1, { label: 'Undo', onClick: () => undos++ });
    h.nodes.at(-1).children.find((el) => el.textContent === 'Undo').dispatchEvent(new Event('click'));
    assert.equal(undos, 1);
  } finally { h.restore(); }
});

test('timer swiping uses its close action; vertical scrolling leaves it running', () => {
  const h = documentHarness();
  try {
    startRest(90, { vibrate: false });
    const timer = h.nodes.at(-1); drag(timer, 0, 90); assert.equal(timer.isConnected, true);
    drag(timer, 90, 0); assert.equal(timer.isConnected, false);
    startRest(90, { vibrate: false }); assert.equal(h.nodes.at(-1).isConnected, true);
  } finally { stopRest(); h.restore(); }
});

test('rerender restores open and closed disclosure states and matching focus without scrolling', () => {
  const prev = globalThis.document;
  const before = new Element({ 'data-done': '0:1' }), after = new Element({ 'data-done': '0:1' });
  const workout = { dataset: { keepOpen: 'workout-1:1:1' }, open: true };
  const report = { dataset: { keepOpen: 'report' }, open: false };
  let details = [workout, report], focus = before;
  const root = { contains: (el) => el === before, querySelectorAll: (selector) => selector.startsWith('details') ? details : [focus] };
  globalThis.document = { activeElement: before };
  try {
    const saved = captureView(root);
    details = [{ dataset: workout.dataset, open: false }, { dataset: report.dataset, open: true }, { dataset: { keepOpen: 'workout-1:1:2' }, open: false }];
    focus = after; restoreView(root, saved);
    assert.deepEqual(details.map((el) => el.open), [true, false, false]);
    assert.deepEqual(after.focused, { preventScroll: true });
    restoreView(root, null); assert.equal(details[2].open, false);
  } finally { globalThis.document = prev; }
});

test('closing a sheet focuses a replacement control, never a detached node or a scrolling focus', () => {
  const h = documentHarness(), before = new Element({ id: 'edit' }), after = new Element({ id: 'edit' });
  try {
    document.activeElement = before; document.querySelectorAll = () => [after];
    const sheet = openSheet('<p>Example</p>'); before.isConnected = false; sheet.close();
    assert.equal(before.focused, undefined); assert.deepEqual(after.focused, { preventScroll: true });
  } finally { h.restore(); }
});
