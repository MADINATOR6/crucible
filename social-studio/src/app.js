// App shell: loads state from IndexedDB, routes by hash, delegates clicks/forms to the views.
import * as db from './db.js';
import { esc, setStatus, closeDialog } from './ui.js';
import setup from './views/setup.js';
import scout from './views/scout.js';
import plan from './views/plan.js';
import pipeline from './views/pipeline.js';
import results from './views/results.js';

const VIEWS = { setup, scout, plan, pipeline, results };
const main = document.getElementById('main');

export const S = { profile: null, apiKey: '', findings: [], items: [], posts: [], imports: [], runs: [], ui: {} };

async function load() {
  S.profile = (await db.getKv('profile')) || null;
  S.apiKey = (await db.getKv('apiKey')) || '';
  for (const s of ['findings', 'items', 'posts', 'imports', 'runs']) S[s] = await db.all(s);
}

// Saves a record and updates in-memory state only after the write commits.
export async function save(store, obj) {
  try {
    await db.put(store, obj);
  } catch (e) {
    throw new Error(`Could not save: ${e?.message || e}. Your last change was not stored.`);
  }
  const list = S[store], i = list.findIndex(x => x.id === obj.id);
  if (i >= 0) list[i] = obj; else list.push(obj);
  return obj;
}

export async function remove(store, id) {
  await db.del(store, id);
  S[store] = S[store].filter(x => x.id !== id);
}

export async function saveProfile(profile) { await db.setKv('profile', profile); S.profile = profile; }
export async function saveKey(key) { await db.setKv('apiKey', key); S.apiKey = key; }

export function newItem(fields) {
  const t = new Date().toISOString();
  return { id: db.uid(), created: t, updated: t, stage: 'idea', priority: 'medium', trendIds: [], brief: {}, hook: '', draft: '', caption: '', hashtags: '', scheduledFor: '', postUrl: '', format: '', ...fields };
}

export function showError(msg) {
  const el = document.createElement('div');
  el.className = 'banner error'; el.setAttribute('role', 'alert'); el.textContent = msg;
  const dlg = document.getElementById('dialog');
  if (dlg.open) { dlg.querySelector('.banner.error')?.remove(); dlg.prepend(el); } else { main.prepend(el); window.scrollTo(0, 0); }
}

function route() {
  const name = location.hash.slice(1).split('?')[0];
  if (!S.profile?.setupDone && name !== 'setup') return 'setup';
  return VIEWS[name] ? name : 'scout';
}

export function render({ focus = false } = {}) {
  const name = route();
  if (`#${name}` !== location.hash) history.replaceState(null, '', `#${name}`);
  for (const a of document.querySelectorAll('.nav a')) {
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  const y = window.scrollY;
  main.innerHTML = VIEWS[name].render(S);
  document.title = `${name[0].toUpperCase()}${name.slice(1)} · Social Studio`;
  if (focus) { main.focus(); window.scrollTo(0, 0); } else window.scrollTo(0, y);
}

async function dispatch(e, kind) {
  const sel = { submit: 'form[data-form]', click: '[data-act]', change: '[data-change]' }[kind];
  const el = e.target.closest(sel);
  if (!el) return;
  const view = VIEWS[route()];
  const name = kind === 'submit' ? el.dataset.form : kind === 'change' ? el.dataset.change : el.dataset.act;
  const handler = view.actions?.[name];
  if (!handler) return;
  if (kind === 'submit') e.preventDefault();
  try {
    const out = await handler(el, S, e);
    if (out !== false) render();
  } catch (err) {
    const dlgOpen = document.getElementById('dialog').open;
    if (!dlgOpen) render();
    showError(err?.message || String(err));
  }
}

for (const root of [main, document.getElementById('dialog')]) {
  root.addEventListener('click', e => dispatch(e, 'click'));
  root.addEventListener('submit', e => dispatch(e, 'submit'));
  root.addEventListener('change', e => dispatch(e, 'change'));
}
document.getElementById('dialog').addEventListener('close', () => { document.getElementById('dialog').innerHTML = ''; });
addEventListener('hashchange', () => { closeDialog(); render({ focus: true }); });

load().then(() => render()).catch(err => {
  main.innerHTML = `<div class="banner error" role="alert"><b>Storage is not available.</b> ${esc(err?.message || err)}. Private browsing or a full device can block it; Social Studio needs it to keep your work.</div>`;
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline install unavailable; app still works online */ });
}
