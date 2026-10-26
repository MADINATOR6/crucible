import test from 'node:test';
import assert from 'node:assert/strict';
import { trainView } from '../../src/ui/views/train.js';
import { todayIso } from '../../src/ui/dom.js';
import { setDraftToken } from '../../src/ui/drafts.js';
import { stopRest } from '../../src/ui/rest-timer.js';

function fixture(draft = null) {
  const app = {
    programme: { blocks: [{ number: 1, name: 'Synthetic block', weeks: [{ number: 1, days: [{ number: 1, entries: [
      { exerciseId: 'squat', name: 'Squat', sets: [{ load: { value: 100, unit: 'kg' }, repsMin: 3, repsMax: 3, targetRpe: 8 }] },
    ] }] }] }] },
    settings: { unit: 'kg', keepAwake: false, lastBackupAt: todayIso() },
    catalogue: { exercises: [{ id: 'squat', name: 'Squat' }] },
    sets: [], sessions: [], usingExample: true,
    datesKnown: () => true, dateFor: () => '2020-01-06', nextSession: () => null,
    exercise: () => ({ name: 'Squat' }), loggedFor: () => null, getDraft: () => draft,
  };
  return { app, ui: {} };
}

function rootFor(controls = {}) {
  return {
    querySelector: (selector) => controls[selector] || null,
    querySelectorAll: (selector) => controls[selector] || [],
  };
}

function control(value = '') {
  return { value, disabled: false, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; },
    fire(type, detail = {}) { return this.listeners[type]?.({ target: this, currentTarget: this, ...detail }); },
    getAttribute: () => 'false' };
}

function sheetDocument() {
  let html = '';
  let toastAction = null;
  const fields = new Map();
  const field = (selector) => {
    if (!fields.has(selector)) fields.set(selector, { value: '', checked: false, textContent: '', disabled: false, innerHTML: '',
      listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, fire(type) { return this.listeners[type]?.({ target: this, currentTarget: this }); },
      focus() { this.focused = true; }, remove() {} });
    return fields.get(selector);
  };
  const sheet = { querySelector: field };
  const back = { set innerHTML(value) { html = value; }, get firstElementChild() { return sheet; },
    querySelector: () => null, setAttribute() {}, append() {}, addEventListener() {}, remove() {} };
  const rest = { classList: { add() {}, remove() {} }, querySelector: () => ({ textContent: '' }), remove() {} };
  const document = { activeElement: null, body: { append() {} }, addEventListener() {}, removeEventListener() {}, querySelector: () => null,
    getElementById: (id) => id === 'rest-timer' ? rest : null,
    createElement(tag) {
      if (tag === 'div') return back;
      return { setAttribute() {}, append() {}, addEventListener(type, fn) { if (this.className === 'toast-action') toastAction = fn; }, remove() {} };
    } };
  return { document, field, html: () => html, toastAction: () => toastAction };
}

test('new selected session date defaults to today, not the old planned date', () => {
  const { app, ui } = fixture();
  const { html } = trainView(app, ui);
  assert.equal(ui.train.actualDate, todayIso());
  assert.match(html, new RegExp(`id="session-date" type="date" value="${todayIso()}"`));
  assert.match(html, /Training today · Planned/);
  assert.match(html, /Planned Mon, 6 Jan|Planned/);
});

test('selected backdated and future dates are labelled explicitly, and Done uses the actual date', async () => {
  const { app, ui } = fixture();
  trainView(app, ui);
  ui.train.actualDate = '2000-01-01';
  assert.match(trainView(app, ui).html, /Backdated session/);
  ui.train.actualDate = '2099-01-01';
  assert.match(trainView(app, ui).html, /Future session/);

  const selected = control(todayIso()), status = { textContent: '' }, done = control();
  done.dataset = { done: '0:0' };
  let request;
  app.logAsPlanned = async (input) => { request = input; return { set: { id: 'synthetic' }, newPRs: [], undoToken: 'receipt' }; };
  const previousDocument = globalThis.document;
  globalThis.document = {
    querySelector: () => null,
    createElement: () => ({ setAttribute() {}, append() {}, addEventListener() {}, remove() {} }),
    body: { append() {} },
  };
  try {
    const view = trainView(app, ui);
    view.bind(rootFor({ '#session-date': selected, '#session-date-status': status, '[data-done]': [done] }), () => {});
    selected.value = '2000-01-01'; selected.fire('change');
    assert.equal(status.textContent.startsWith('Backdated session'), true);
    done.fire('click');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(request.date, '2000-01-01');
    assert.deepEqual(request.plannedRef, { entryIndex: 0, setIndex: 0 });
  } finally { globalThis.document = previousDocument; }
});

test('malformed saved set drafts cannot resume or attach to a planned set', () => {
  const { app, ui } = fixture({ value: { kind: 'planned', unit: 'lb', fields: {} }, savedAt: todayIso() });
  const { html } = trainView(app, ui);
  assert.match(html, /UNSAVED set inputs/);
  assert.match(html, /no longer matches/);
  assert.doesNotMatch(html, /id="resume-draft"/);
  assert.match(html, /id="discard-draft"/);
});

test('a bounded quick-log draft offers an explicit Resume without logging', () => {
  const fields = { w: '102.5', r: '5', e: '8.5', d: todayIso(), ex: 'squat', wu: false };
  const { app, ui } = fixture({ value: { kind: 'quick', unit: 'kg', exerciseId: 'squat', fields }, savedAt: todayIso() });
  const { html } = trainView(app, ui);
  assert.match(html, /UNSAVED set inputs/);
  assert.match(html, /Ready to resume; nothing was logged/);
  assert.match(html, /id="resume-draft"/);
  assert.equal(app.sets.length, 0);
});

test('planned set form keeps raw inputs, focuses an invalid field, and resumes only the same set', async () => {
  const { app, ui } = fixture();
  let saved = null;
  app.exerciseName = () => 'Squat';
  app.saveDraft = async (_kind, value) => { saved = { value, savedAt: new Date().toISOString() }; };
  app.getDraft = () => saved;
  app.clearDraft = async () => { saved = null; };
  const fake = sheetDocument(), prior = globalThis.document;
  globalThis.document = fake.document;
  try {
    const log = control(); log.dataset = { focusLog: '0:0' };
    const view = trainView(app, ui);
    view.bind(rootFor({ '[data-focus-log]': [log] }), () => {});
    log.fire('click');
    assert.match(fake.html(), new RegExp(`id="d" type="date" value="${todayIso()}"`));
    fake.field('#w').value = '111.5'; fake.field('#r').value = '3'; fake.field('#e').value = '8'; fake.field('#d').value = todayIso();
    fake.field('#w').fire('input');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(saved.value.fields.w, '111.5');
    assert.equal(saved.value.sourceToken, setDraftToken(app.programme, { blockNumber: 1, weekNumber: 1, dayNumber: 1 }, { entryIndex: 0, setIndex: 0 }));
    fake.field('#w').value = '';
    fake.field('#save').fire('click');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fake.field('#w').focused, true);
    assert.match(fake.field('[data-error="w"]').textContent, /realistic weight/);
    assert.equal(saved.value.fields.w, '111.5', 'failed validation does not overwrite a saved raw input until edited');

    const nextUi = {};
    const recovered = trainView(app, nextUi);
    assert.match(recovered.html, /UNSAVED set inputs/);
    assert.match(recovered.html, /id="resume-draft"/);
    const resume = control();
    recovered.bind(rootFor({ '#resume-draft': resume }), () => {});
    resume.fire('click');
    assert.match(fake.html(), /UNSAVED · recovered inputs/);
    assert.match(fake.html(), /id="w"[^>]*value="111.5"/);

    app.programme.blocks[0].weeks[0].days[0].entries[0].sets[0].repsMin = 4;
    assert.doesNotMatch(trainView(app, {}).html, /id="resume-draft"/, 'changed planned set cannot receive the old draft');
  } finally { globalThis.document = prior; }
});

test('editing a logged set keeps its stored date and ordinary Save exposes receipt Undo', async () => {
  const { app, ui } = fixture();
  const logged = { id: 'saved-set', sessionId: 'saved-session', reps: 3, weight: { value: 100, unit: 'kg' }, rpe: 8 };
  app.loggedFor = () => logged;
  app.sessions = [{ id: 'saved-session', date: '2020-02-03' }];
  app.exerciseName = () => 'Squat'; app.prs = () => [];
  app.getDraft = () => null; app.clearDraft = async () => {}; app.changed = () => {};
  let input, options, undone;
  app.logSet = async (i, o) => { input = i; options = o; return { set: logged, undoToken: 'edit-receipt' }; };
  app.undoSetChange = async (token) => { undone = token; };
  const fake = sheetDocument(), prior = globalThis.document;
  globalThis.document = fake.document;
  try {
    const row = control(); row.dataset = { set: '0:0' };
    trainView(app, ui).bind(rootFor({ '[data-set]': [row] }), () => {});
    row.fire('click');
    assert.match(fake.html(), /id="d" type="date" value="2020-02-03"/);
    fake.field('#w').value = '102.5'; fake.field('#r').value = '3'; fake.field('#e').value = '8.5'; fake.field('#d').value = '2020-02-03';
    fake.field('#save').fire('click');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(input.date, '2020-02-03');
    assert.deepEqual(options, { withUndo: true });
    assert.equal(typeof fake.toastAction(), 'function');
    fake.toastAction()();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(undone, 'edit-receipt');
  } finally { stopRest(); globalThis.document = prior; }
});
