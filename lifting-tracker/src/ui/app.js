// App bootstrap: hash router, shell, theme, and re-rendering when data changes.
import { createApp } from './state.js';
import { trainView } from './views/train.js';
import { musclesView } from './views/muscles.js';
import { progressView } from './views/progress.js';
import { platesView } from './views/plates.js';
import { dataView } from './views/data.js';
import { esc, toast, download, todayIso } from './dom.js';
import { openStore } from '../store/db.js';
import { buildBackup } from '../store/backup.js';

const ICON = {
  train: '<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>',
  muscles: '<circle cx="12" cy="5" r="2.2"/><path d="M6 9.5l6-1.5 6 1.5M8 10l-2 5M16 10l2 5M10 20l1-7h2l1 7"/>',
  progress: '<path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6"/>',
  plates: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/>',
  data: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
};
const TABS = [['train', 'Train', trainView], ['muscles', 'Muscles', musclesView], ['progress', 'Progress', progressView], ['plates', 'Plates', platesView], ['data', 'Data', dataView]];

const brandMark = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="var(--accent)"/><path d="M6 12v8M9.5 9v14M22.5 9v14M26 12v8M9.5 16h13" stroke="var(--accent-ink)" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>';

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark' || theme === 'light') root.dataset.theme = theme; else delete root.dataset.theme;
}

/** Recovery tools that do not depend on any parsed data, shown whenever the app cannot render. */
function emergencyHtml() {
  return `<div class="card" style="margin-top:14px"><h2>Recovery</h2><p class="muted small">Your data is untouched. You can save a raw copy of it, or delete it and start fresh.</p><div class="row"><button class="btn" id="em-export">Download raw data</button><button class="btn" id="em-wipe" style="border-color:var(--bad);color:var(--bad)">Delete all data</button></div></div>`;
}
function bindEmergency(root) {
  root.querySelector('#em-export')?.addEventListener('click', async () => { try { const s = await openStore(); download(`lifting-tracker-raw-${todayIso()}.json`, JSON.stringify(await buildBackup(s))); } catch (err) { toast('Could not read storage: ' + (err.message || err)); } });
  root.querySelector('#em-wipe')?.addEventListener('click', async () => { if (!confirm('Delete everything stored by this app on this device?')) return; try { const s = await openStore(); await s.clearAll(); location.reload(); } catch (err) { toast('Could not delete: ' + (err.message || err)); } });
}

async function main() {
  const mount = document.getElementById('app');
  let app;
  try { app = await createApp(); } catch (err) {
    mount.innerHTML = `<main class="main"><div class="card"><h1>Could not start</h1><p>${esc(err.message || err)}</p><p class="muted small">If you opened this file directly, serve the folder over http (see README).</p></div>${emergencyHtml()}</main>`;
    bindEmergency(mount);
    return;
  }
  const ui = {};
  applyTheme(app.settings.theme);
  const nav = (cls) => TABS.map(([id, label]) => `<a class="tab" href="#${id}" data-tab="${id}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[id]}</svg><span>${label}</span></a>`).join('');
  mount.innerHTML = `<div class="shell">
    <nav class="rail" aria-label="Main"><div class="brand">${brandMark}<span>Lifting<small>Tracker</small></span></div>${nav()}</nav>
    <div><main class="main" id="view" tabindex="-1"></main></div>
    <nav class="tabbar" aria-label="Main">${nav()}</nav></div>`;
  const view = document.getElementById('view');

  const current = () => { const id = location.hash.replace('#', ''); return TABS.find((t) => t[0] === id) || TABS[0]; };
  let skip = false;
  function render({ keepScroll = true } = {}) {
    if (skip) return;
    const [id, label, fn] = current();
    document.title = `${label} · Lifting Tracker`;
    document.querySelectorAll('[data-tab]').forEach((a) => (a.dataset.tab === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    const y = window.scrollY;
    let out;
    try { out = fn(app, ui); } catch (err) { console.error(err); out = { html: `<div class="card"><h2>Something went wrong</h2><p class="muted">${esc(err.message || err)}</p></div>${emergencyHtml()}`, bind: bindEmergency }; }
    const storageWarning = app.store.persistent ? '' : '<div class="banner" role="alert" style="margin-bottom:14px"><span><b>Storage is unavailable</b> (private window or blocked site data). Anything you log will be lost when you close this tab. Use a normal window and export backups.</span></div>';
    view.innerHTML = storageWarning + out.html;
    try { out.bind(view, () => render()); } catch (err) { console.error(err); }
    if (keepScroll) window.scrollTo(0, y);
  }
  window.addEventListener('hashchange', () => { render({ keepScroll: false }); window.scrollTo(0, 0); });
  app.subscribe(() => { applyTheme(app.settings.theme); render(); });
  render({ keepScroll: false });

  // The service worker is skipped on localhost while developing, unless asked for with ?sw=1.
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && (!isLocal || location.search.includes('sw=1'))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // Friendly messages for rejected writes (for example a validation error from logging a set).
  window.addEventListener('unhandledrejection', (e) => {
    e.preventDefault();
    const err = e.reason;
    console.error(err);
    toast(err instanceof RangeError ? err.message : `Could not save: ${err?.message || err}`, 4200);
  });
  if (isLocal || location.search.includes('debug=1')) window.__app = app; // handy in the console while developing
}
main();
