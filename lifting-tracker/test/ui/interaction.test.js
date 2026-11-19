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
  removeAttribute(key) { delete this.attrs[key]; }
  hasAttribute(key) { return key in this.attrs; }
  getAttribute(key) { return this.attrs[key] ?? null; }
  append(child) { this.children.push(child); }
  remove() { this.isConnected = false; }
  focus(options) { this.focused = options; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  contains(el) { return this.children.includes(el); }
  getClientRects() { return [1]; }
  closest() { return null; }
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
  const listeners = new Map();
  globalThis.document = { activeElement: null, body: { append: (el) => nodes.push(el) },
    addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: (type) => listeners.delete(type),
    querySelector: (selector) => nodes.findLast((el) => el.isConnected && selector === '.' + el.className) || null,
    querySelectorAll: () => [], getElementById: (id) => nodes.findLast((el) => el.isConnected && el.id === id) || null,
    createElement: () => { const el = new Element(); el.querySelector = () => text; el.firstElementChild = text; return el; } };
  return { nodes, text, listeners, restore: () => { globalThis.document = prev; } };
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

test('sheet traps Tab in both directions, gives an empty sheet a focus target, and Escape restores focus', () => {
  const h = documentHarness(), before = new Element(), first = new Element(), last = new Element();
  try {
    document.activeElement = before;
    h.text.querySelectorAll = () => [first, last];
    h.text.children = [first, last];
    first.focus = () => { document.activeElement = first; };
    last.focus = () => { document.activeElement = last; };
    const sheet = openSheet('<button>First</button><button>Last</button>');
    assert.equal(document.activeElement, first);
    const key = (keyName, shiftKey = false) => { const e = new Event('keydown', { cancelable: true }); Object.assign(e, { key: keyName, shiftKey }); h.listeners.get('keydown')(e); return e; };
    document.activeElement = last; assert.equal(key('Tab').defaultPrevented, true); assert.equal(document.activeElement, first);
    assert.equal(key('Tab', true).defaultPrevented, true); assert.equal(document.activeElement, last);
    document.activeElement = before; assert.equal(key('Tab').defaultPrevented, true); assert.equal(document.activeElement, first);
    assert.equal(key('Escape').defaultPrevented, true); assert.equal(h.nodes.at(-1).isConnected, false);
    assert.deepEqual(before.focused, { preventScroll: true });
    sheet.close(); assert.equal(h.listeners.has('keydown'), false);
    h.text.querySelectorAll = () => [];
    let focusedEmpty = 0;
    h.text.focus = () => { focusedEmpty++; };
    const empty = openSheet('<div id="picker"></div>');
    assert.equal(focusedEmpty, 1);
    empty.close();
  } finally { h.restore(); }
});

test("Android's back gesture closes only the top sheet, and a sheet closed another way lets go of the gesture", () => {
  const h = documentHarness(), prior = globalThis.CloseWatcher, watchers = [];
  globalThis.CloseWatcher = class { constructor() { watchers.push(this); } destroy() { this.destroyed = true; } };
  try {
    const outer = openSheet('<p>Outer</p>'), outerBack = h.nodes.at(-1);
    openSheet('<p>Inner</p>'); const innerBack = h.nodes.at(-1);
    watchers[1].onclose();
    assert.equal(innerBack.isConnected, false); assert.equal(outerBack.isConnected, true);
    assert.equal(watchers[1].destroyed, true); assert.notEqual(watchers[0].destroyed, true);
    outer.close(); assert.equal(watchers[0].destroyed, true);
  } finally { globalThis.CloseWatcher = prior; h.restore(); }
});

test('sheet uses its heading as the accessible dialog name', () => {
  const h = documentHarness(), heading = new Element();
  try {
    h.text.querySelector = () => heading;
    const sheet = openSheet('<h2>Edit set</h2>');
    assert.equal(h.text.getAttribute('aria-labelledby'), heading.id);
    assert.equal(h.text.getAttribute('aria-label'), null);
    sheet.close();
  } finally { h.restore(); }
});

test('a sheet populated after opening gains the new heading as its name', () => {
  const h = documentHarness(), prior = globalThis.MutationObserver, heading = new Element();
  let changed, disconnected = false;
  globalThis.MutationObserver = class { constructor(fn) { changed = fn; } observe() {} disconnect() { disconnected = true; } };
  try {
    const sheet = openSheet('<div id="picker"></div>');
    h.text.querySelector = () => heading;
    changed();
    assert.equal(h.text.getAttribute('aria-labelledby'), heading.id);
    sheet.close(); assert.equal(disconnected, true);
  } finally { globalThis.MutationObserver = prior; h.restore(); }
});

test('only the top nested sheet handles keyboard input and closing it restores focus inside its parent', () => {
  const previous = globalThis.document, listeners = new Set(), backs = [];
  const before = new Element(), outerButton = new Element(), innerButton = new Element();
  let outerFocuses = 0;
  outerButton.focus = () => { outerFocuses++; document.activeElement = outerButton; };
  innerButton.focus = () => { document.activeElement = innerButton; };
  before.focus = () => { document.activeElement = before; };
  globalThis.document = { activeElement: before, body: { append() {} },
    addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn),
    createElement: () => {
      const back = new Element(), dialog = new Element(), button = backs.length ? innerButton : outerButton;
      dialog.children = [button]; dialog.querySelectorAll = () => [button];
      back.firstElementChild = dialog;
      back.remove = () => { back.isConnected = false; dialog.isConnected = false; };
      backs.push(back); return back;
    } };
  const key = (name) => { const e = new Event('keydown', { cancelable: true }); Object.assign(e, { key: name, shiftKey: false });
    for (const fn of [...listeners]) fn(e); return e; };
  try {
    openSheet('<button>Outer</button>');
    openSheet('<button>Inner</button>');
    assert.equal(document.activeElement, innerButton);
    key('Tab'); assert.equal(outerFocuses, 1, 'parent must not handle inner Tab');
    key('Escape'); assert.deepEqual(backs.map((b) => b.isConnected), [true, false]);
    assert.equal(document.activeElement, outerButton);
    key('Escape'); assert.deepEqual(backs.map((b) => b.isConnected), [false, false]);
    assert.equal(document.activeElement, before); assert.equal(listeners.size, 0);
  } finally { globalThis.document = previous; }
});
