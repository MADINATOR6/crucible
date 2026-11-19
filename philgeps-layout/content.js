// PhilGEPS Print Layout Helper v2 — sidebar with saved fill-in fields per format.
// Runs only in the blank popup tab PhilGEPS opens for printable formats; the normal site is left alone.
(() => {
  'use strict';
  if (location.href !== 'about:blank' || !window.opener || window.top !== window) return;

  const HOST_ID = 'pa-sidebar-host', STYLE_ID = 'pa-style', PAGE_ID = 'pa-page';
  const SIDEBAR_W = 300;
  const PAPERS = { 'A4': 'A4', 'Letter': 'letter', 'Legal': 'legal', 'Long bond 8.5×13': '8.5in 13in' };
  const MARGINS = ['auto', '0', '5', '10', '15', '20', '25'];
  const BLOCK_SEL = 'tr, p, li, h1, h2, h3, h4, h5, h6, table, section, article, div';
  const STORE_PREFIX = 'prof:';
  const END_AREAS_KEY = 'end:areas', END_DAY_PREFIX = 'end:day:'; // one key per day, so popups never overwrite each other
  const Calc = self.EndDateCalc;

  // ---------- state ----------
  const S = {
    editing: true, open: true, loaded: false,
    profiles: {},   // format key -> profile (saved setup)
    key: null,      // format key in use for this tab
    picked: null,   // format key chosen manually in the dropdown
    end: { proceed: '', areas: [], custom: [] }, // end-date calculator; areas and custom are saved
  };
  const originals = new Map(); // field id -> DocumentFragment of the page's original content
  const found = new Map();     // field id -> located in this page?
  const sizedEls = new Set();
  const applied = new WeakSet();
  let ui = null, lastRange = null, lastAnchor = null;
  let msgTimer = 0, saveTimer = 0, syncTimer = 0, lastLen = -1, lastChange = Date.now();

  const blankProfile = () => ({ fields: [], breaks: [], hidden: [], sizes: [], paper: 'auto', orient: 'auto', margin: 'auto' });
  const isEmptyProfile = p => !p.fields.length && !p.breaks.length && !p.hidden.length && !p.sizes.length &&
    p.paper === 'auto' && p.orient === 'auto' && p.margin === 'auto';
  const prof = () => (S.key ? (S.profiles[S.key] ||= blankProfile()) : null);
  const isField = n => !!n && n.nodeType === 1 && n.classList.contains('pa-field');
  const samePath = (a, b) => a.join(',') === b.join(',');
  const trunc = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

  // ---------- page CSS ----------
  const BASE_CSS = `
html.pa-editing body, html.pa-editing body * { cursor: text !important; caret-color: #d00 !important; }
.pa-break { break-before: page !important; page-break-before: always !important; }
@media screen {
  html.pa-sb-open { margin-right: ${SIDEBAR_W}px !important; }
  .pa-field { background: #fff3a8 !important; box-shadow: 0 0 0 1px #e0b800 !important; border-radius: 2px; }
  .pa-break { box-shadow: 0 -3px 0 #d00 !important; }
  tr.pa-break > td, tr.pa-break > th { border-top: 3px dashed #d00 !important; }
  .pa-hidden { opacity: .25 !important; outline: 2px dashed #888 !important; }
  .pa-flash { outline: 3px solid #1a73e8 !important; outline-offset: 1px !important; }
}
@media print {
  #${HOST_ID} { display: none !important; }
  .pa-hidden { display: none !important; }
  .pa-flash { outline: none !important; }
}`;

  function pageCss(p) {
    if (!p) return '';
    const rules = [];
    const paper = PAPERS[p.paper];
    const o = p.orient === 'auto' ? '' : p.orient;
    if (paper) {
      if (paper.includes(' ')) {
        const [w, h] = paper.split(' ');
        rules.push(`size: ${o === 'landscape' ? `${h} ${w}` : paper};`);
      } else rules.push(`size: ${paper}${o ? ' ' + o : ''};`);
    } else if (o) rules.push(`size: ${o};`);
    if (p.margin !== 'auto') rules.push(`margin: ${p.margin}mm;`);
    return rules.length ? `@page { ${rules.join(' ')} }` : '';
  }

  // ---------- keep everything applied (the site rewrites the tab after it opens) ----------
  function ensure() {
    const root = document.documentElement;
    if (!root) return;
    root.classList.toggle('pa-editing', S.editing);
    root.classList.toggle('pa-sb-open', S.open);

    const body = document.body;
    if (body) {
      const want = S.editing ? 'true' : 'false';
      if (body.getAttribute('contenteditable') !== want) body.setAttribute('contenteditable', want);
    }
    if (!document.getElementById(STYLE_ID)) {
      const s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = BASE_CSS;
      root.appendChild(s);
    }
    let pg = document.getElementById(PAGE_ID);
    if (!pg) {
      pg = document.createElement('style');
      pg.id = PAGE_ID;
      root.appendChild(pg);
    }
    const css = pageCss(S.key ? prof() : null);
    if (pg.textContent !== css) pg.textContent = css;

    if (body && !document.getElementById(HOST_ID)) buildSidebar(root);

    // Same function references, so these are never added twice.
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('selectionchange', onSel);
    document.addEventListener('input', onPageInput, true);

    maybeApply(body);
  }

  // Apply the saved setup once the page has finished being written.
  function maybeApply(body) {
    if (!body || !S.loaded || applied.has(body)) return;
    const len = body.textContent.length;
    if (len !== lastLen) { lastLen = len; lastChange = Date.now(); }
    const quiet = Date.now() - lastChange > (document.readyState === 'complete' ? 600 : 2000);
    if (!quiet || len === 0) return;
    applied.add(body);
    S.key = S.picked || detectKey();
    applyProfile();
  }

  // Identifies the type of format: page title (or first line of text) + the PhilGEPS page that opened it.
  // Digits are replaced with # so reference numbers and dates don't create a new format each time.
  function detectKey() {
    let path = '';
    try { path = window.opener.location.pathname; } catch (_) { /* opener gone or cross-origin */ }
    let name = (document.title || '').trim();
    if (!name && document.body) name = (document.body.innerText || '').trim().split('\n')[0] || '';
    name = trunc(name.replace(/\s+/g, ' ').replace(/\d+/g, '#'), 60) || '(untitled)';
    return `${name} — ${path || '?'}`;
  }

  function applyProfile() {
    unwrapAll();
    clearMarks();
    const p = prof();
    for (const f of p.fields) {
      const r = locate(f);
      found.set(f.id, !!r);
      if (r) wrap(r, f);
    }
    for (const f of p.fields) if (found.get(f.id)) showValue(f);
    for (const path of p.breaks) { const el = followPath(path); if (el) el.classList.add('pa-break'); }
    for (const path of p.hidden) { const el = followPath(path); if (el) el.classList.add('pa-hidden'); }
    for (const { path, px } of p.sizes) {
      const el = followPath(path);
      if (el) { el.style.setProperty('font-size', px + 'px', 'important'); sizedEls.add(el); }
    }
    ensure();
    render();
  }

  function clearMarks() {
    const body = document.body;
    if (!body) return;
    body.querySelectorAll('.pa-break, .pa-hidden').forEach(el => el.classList.remove('pa-break', 'pa-hidden'));
    sizedEls.forEach(el => el.style.removeProperty('font-size'));
    sizedEls.clear();
  }

  // ---------- locating text (paths ignore our own field wrappers) ----------
  function kids(el) {
    const out = [];
    for (const c of el.children) { if (isField(c)) out.push(...kids(c)); else out.push(c); }
    return out;
  }
  function realParent(el) {
    let p = el.parentElement;
    while (p && isField(p)) p = p.parentElement;
    return p;
  }
  function pathOf(el) {
    const body = document.body, path = [];
    while (el && el !== body) {
      const p = realParent(el);
      if (!p) return null;
      path.unshift(kids(p).indexOf(el));
      el = p;
    }
    return el === body ? path : null;
  }
  function followPath(path) {
    let el = document.body;
    for (const i of path) { el = el && kids(el)[i]; if (!el) return null; }
    return el;
  }

  // Text of a node as the page originally had it (fields count as their original text).
  function origText(node) {
    if (node.nodeType === 3) return node.data;
    if (isField(node)) return node.dataset.orig || '';
    if (node.nodeType !== 1 && node.nodeType !== 11) return '';
    let t = '';
    for (const c of node.childNodes) t += origText(c);
    return t;
  }

  // Character offsets (original-text space) -> DOM Range. Refuses ranges that overlap an existing field.
  function rangeFromOffsets(E, s, e) {
    const r = document.createRange();
    let pos = 0, started = false, bad = false;
    const walk = node => {
      for (const c of node.childNodes) {
        if (c.nodeType === 3) {
          const end = pos + c.data.length;
          if (!started && s <= end) { r.setStart(c, s - pos); started = true; }
          if (started && e <= end) { r.setEnd(c, e - pos); return true; }
          pos = end;
        } else if (isField(c)) {
          const end = pos + (c.dataset.orig || '').length;
          if (s < end && e > pos) { bad = true; return true; }
          pos = end;
        } else if (c.nodeType === 1) {
          if (walk(c)) return true;
        }
      }
      return false;
    };
    if (walk(E)) return bad ? null : r;
    if (s === e && s === pos) { r.selectNodeContents(E); r.collapse(false); return r; }
    return null;
  }

  function matchContext(full, before, after) {
    const lead = full.length - full.trimStart().length;
    const tail = full.trimEnd().length;
    const sizes = L => (L ? [...new Set([L, 20, 12, 6].map(n => Math.min(n, L)))].sort((a, b) => b - a) : [0]);
    const starts = [];
    if (!before.trim()) starts.push(lead);
    else for (const n of sizes(before.length)) {
      const i = full.indexOf(before.slice(-n));
      if (i >= 0) starts.push(i + n);
    }
    for (const s of starts) {
      if (!after.trim()) { if (tail >= s) return [s, tail]; continue; }
      for (const n of sizes(after.length)) {
        const e = full.indexOf(after.slice(0, n), s);
        if (e >= s) return [s, e];
      }
    }
    return null;
  }

  function locate(f) {
    const E = followPath(f.path);
    if (!E) return null;
    const full = origText(E);
    if (f.mode === 'whole') {
      const s = full.length - full.trimStart().length, e = full.trimEnd().length;
      if (e <= s) { const r = document.createRange(); r.selectNodeContents(E); r.collapse(true); return r; }
      return rangeFromOffsets(E, s, e);
    }
    const m = matchContext(full, f.before, f.after);
    return m ? rangeFromOffsets(E, m[0], m[1]) : null;
  }

  // Turn the current highlight into a saved locator.
  function locFromSelection() {
    const body = document.body;
    const r = lastRange;
    if (!r || r.collapsed || !body || !body.contains(r.commonAncestorContainer)) {
      say('Highlight some text in the page first.');
      return null;
    }
    for (const sp of body.querySelectorAll('.pa-field')) {
      if (r.intersectsNode(sp)) { say('That overlaps an existing field (yellow). Highlight a different spot.'); return null; }
    }
    let E = r.commonAncestorContainer;
    if (E.nodeType !== 1) E = E.parentElement;
    while (isField(E)) E = E.parentElement;
    const path = pathOf(E);
    if (!path) { say('Could not place that highlight. Try highlighting inside one cell or line.'); return null; }

    const full = origText(E);
    const pre = document.createRange();
    pre.setStart(E, 0);
    pre.setEnd(r.startContainer, r.startOffset);
    let s = origText(pre.cloneContents()).length;
    let e = s + origText(r.cloneContents()).length;
    while (s < e && /\s/.test(full[s])) s++;
    while (e > s && /\s/.test(full[e - 1])) e--;
    if (s === e) { say('Highlight some text, not just spaces.'); return null; }

    const range = rangeFromOffsets(E, s, e);
    if (!range) { say('Could not place that highlight.'); return null; }
    const mode = !full.slice(0, s).trim() && !full.slice(e).trim() ? 'whole' : 'part';
    return {
      range,
      loc: { path, mode, before: full.slice(Math.max(0, s - 30), s), after: full.slice(e, e + 30) },
    };
  }

  // ---------- field wrappers ----------
  const spanOf = id => document.querySelector(`.pa-field[data-pa-id="${id}"]`);

  function wrap(range, f) {
    const frag = range.extractContents();
    originals.set(f.id, frag.cloneNode(true));
    const sp = document.createElement('span');
    sp.className = 'pa-field';
    sp.dataset.paId = f.id;
    sp.dataset.orig = origText(frag);
    sp.appendChild(frag);
    range.insertNode(sp);
    return sp;
  }

  function unwrapSpan(sp) {
    const frag = originals.get(sp.dataset.paId);
    sp.replaceWith(frag ? frag.cloneNode(true) : document.createTextNode(sp.dataset.orig || ''));
  }

  function unwrapAll() {
    document.querySelectorAll('.pa-field').forEach(unwrapSpan);
    originals.clear();
    found.clear();
  }

  function showValue(f) {
    const sp = spanOf(f.id);
    if (!sp) return;
    if (f.value) sp.textContent = f.value;
    else {
      const frag = originals.get(f.id);
      sp.replaceChildren(frag ? frag.cloneNode(true) : document.createTextNode(sp.dataset.orig || ''));
    }
  }

  // ---------- actions ----------
  function addField() {
    const name = ui.newName.value.trim();
    if (!name) { say('Type a name for the field first.'); ui.newName.focus(); return; }
    if (!S.key) { say('Page is still loading — try again in a moment.'); return; }
    const got = locFromSelection();
    if (!got) return;
    const f = { id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, ...got.loc, value: '' };
    prof().fields.push(f);
    wrap(got.range, f);
    found.set(f.id, true);
    lastRange = null;
    ui.newName.value = '';
    save();
    render();
    say(`Added “${name}”. Type in its box to change it.`);
    const inp = ui.fields.querySelector(`[data-id="${f.id}"] input`);
    if (inp) inp.focus();
  }

  function repickField(f) {
    const got = locFromSelection();
    if (!got) return;
    const old = spanOf(f.id);
    if (old) unwrapSpan(old);
    originals.delete(f.id);
    Object.assign(f, got.loc);
    wrap(got.range, f);
    found.set(f.id, true);
    showValue(f);
    lastRange = null;
    save();
    render();
    say(`Moved “${f.name}”.`);
  }

  function deleteField(f) {
    if (!confirm(`Delete the field “${f.name}”? The page goes back to its original text there.`)) return;
    const sp = spanOf(f.id);
    if (sp) unwrapSpan(sp);
    originals.delete(f.id);
    found.delete(f.id);
    const p = prof();
    p.fields = p.fields.filter(x => x !== f);
    save();
    render();
  }

  function anchorEl() {
    const body = document.body;
    let el = lastAnchor;
    while (isField(el)) el = el.parentElement;
    return el && body && el !== body && body.contains(el) ? el : null;
  }

  function toggleMark(cls, list, label) {
    const a = anchorEl();
    if (!a) return say('Click inside the page first, then press the button.');
    const p = prof();
    if (!p) return;
    const existing = a.closest('.' + cls);
    if (existing) {
      existing.classList.remove(cls);
      const path = pathOf(existing);
      if (path) p[list] = p[list].filter(x => !samePath(x, path));
      flash(existing);
      say(`Removed ${label}.`);
    } else {
      const el = a.closest(BLOCK_SEL);
      const path = el && pathOf(el);
      if (!path) return say('No block found at the cursor.');
      el.classList.add(cls);
      p[list].push(path);
      flash(el);
      say(`Added ${label}. Click the same spot and press again to undo.`);
    }
    save();
  }

  function resizeText(dir) {
    const el = anchorEl();
    const p = prof();
    if (!el || !p) return say('Click inside the text first.');
    const path = pathOf(el);
    if (!path) return;
    const px = Math.max(4, (parseFloat(getComputedStyle(el).fontSize) || 12) + dir);
    el.style.setProperty('font-size', px + 'px', 'important');
    sizedEls.add(el);
    p.sizes = p.sizes.filter(x => !samePath(x.path, path));
    p.sizes.push({ path, px });
    flash(el);
    say(`Text size ${px}px`);
    save();
  }

  function flash(el) {
    el.classList.add('pa-flash');
    setTimeout(() => el.classList.remove('pa-flash'), 700);
  }

  function say(text) {
    if (!ui) return;
    ui.msg.textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { if (ui) ui.msg.textContent = ''; }, 4000);
  }

  // ---------- events ----------
  function onKey(e) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === 'KeyE') { e.preventDefault(); S.editing = !S.editing; ensure(); render(); }
    else if (e.code === 'KeyT') { e.preventDefault(); S.open = !S.open; ensure(); render(); }
  }

  // Remember the last highlight/cursor in the page, so clicking the sidebar doesn't lose it.
  function onSel() {
    const sel = document.getSelection();
    const body = document.body;
    if (!sel || !sel.rangeCount || !body) return;
    const n = sel.anchorNode;
    if (!n || !body.contains(n)) return;
    lastAnchor = n.nodeType === 1 ? n : n.parentElement;
    const r = sel.getRangeAt(0);
    lastRange = !r.collapsed && body.contains(r.commonAncestorContainer) ? r.cloneRange() : null;
    renderPreview();
  }

  // Typing straight into a yellow field in the page also updates its saved value.
  function onPageInput(e) {
    const body = document.body;
    if (!body || !(e.target instanceof Node) || !body.contains(e.target)) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncFromPage, 300);
  }

  function syncFromPage() {
    const p = S.key && S.profiles[S.key];
    if (!p) return;
    let changed = false;
    for (const f of p.fields) {
      const sp = spanOf(f.id);
      if (!sp) continue;
      const t = sp.textContent;
      const v = t === sp.dataset.orig ? '' : t;
      if (v !== f.value) {
        f.value = v;
        changed = true;
        const inp = ui && ui.fields.querySelector(`[data-id="${f.id}"] input`);
        if (inp) inp.value = v;
      }
    }
    if (changed) save();
  }

  // ---------- storage ----------
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const key = S.key, p = key && S.profiles[key];
      if (!p) return;
      try {
        if (isEmptyProfile(p)) chrome.storage.local.remove(STORE_PREFIX + key);
        else chrome.storage.local.set({ [STORE_PREFIX + key]: p });
      } catch (_) { say('Could not save — reload the extension and this tab.'); }
    }, 300);
  }

  function storeEnd(run) {
    try { run(chrome.storage.local); } catch (_) { say('Could not save — reload the extension and this tab.'); }
  }

  const cleanAreas = v => (Array.isArray(v) ? v : []).filter(c => self.EndDateHolidays.AREAS[c]);

  // Apply saved values given as { storage key: value }. A value of undefined means the key was removed.
  function applyEnd(entries) {
    let custom = S.end.custom;
    for (const [k, v] of Object.entries(entries)) {
      if (k === END_AREAS_KEY) S.end.areas = cleanAreas(v);
      else if (k.startsWith(END_DAY_PREFIX)) {
        const date = k.slice(END_DAY_PREFIX.length);
        custom = custom.filter(x => x.date !== date);
        if (v !== undefined) custom = [...custom, { date, name: v }];
      }
    }
    S.end.custom = Calc.sanitizeCustom(custom);
  }

  function load() {
    const done = () => { S.loaded = true; ensure(); render(); };
    try {
      chrome.storage.local.get(null, all => {
        for (const [k, v] of Object.entries(all || {})) {
          if (k.startsWith(STORE_PREFIX) && v && Array.isArray(v.fields)) {
            S.profiles[k.slice(STORE_PREFIX.length)] = Object.assign(blankProfile(), v);
          }
        }
        applyEnd(all || {});
        done();
      });
    } catch (_) { done(); }
  }

  // ---------- sidebar ----------
  function buildSidebar(root) {
    const host = document.createElement('div');
    host.id = HOST_ID;
    const sh = host.attachShadow({ mode: 'open' });
    const opt = (v, label) => `<option value="${v}">${label}</option>`;
    sh.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; }
  .wrap { font: 13px/1.35 system-ui, -apple-system, Segoe UI, sans-serif; color: #222; cursor: default; }
  .sb { position: fixed; top: 0; right: 0; width: ${SIDEBAR_W}px; height: 100vh; z-index: 2147483647;
    display: flex; flex-direction: column; background: #fafafa; border-left: 1px solid #ccc;
    box-shadow: -2px 0 8px rgba(0,0,0,.12); }
  .tab { position: fixed; top: 40%; right: 0; z-index: 2147483647; writing-mode: vertical-rl;
    padding: 10px 5px; border-radius: 6px 0 0 6px; border: 1px solid #1a73e8; background: #1a73e8; color: #fff; }
  .wrap.closed .sb { display: none; }
  .wrap:not(.closed) .tab { display: none; }
  header { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid #ddd; background: #fff; }
  header b { font-size: 14px; }
  .body { flex: 1; overflow: auto; padding: 0 12px 12px; }
  section { padding: 10px 0; border-bottom: 1px solid #e3e3e3; }
  section:last-child { border-bottom: 0; }
  .h { font-weight: 600; margin-bottom: 6px; }
  .hint { font-size: 12px; color: #666; margin-top: 4px; }
  .sp { flex: 1; }
  .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .row + .row { margin-top: 6px; }
  button, select, input { font: inherit; border: 1px solid #bbb; border-radius: 5px; background: #fff; color: #222; }
  button, select { padding: 4px 8px; cursor: pointer; }
  button:hover { background: #f0f0f0; }
  button.primary { background: #1a73e8; border-color: #1a73e8; color: #fff; }
  button.on { background: #e7f0fe; border-color: #1a73e8; color: #174ea6; }
  button.icon { padding: 2px 6px; font-size: 12px; }
  input { padding: 5px 7px; width: 100%; cursor: text; }
  select { max-width: 100%; }
  .newrow input { flex: 1; width: auto; }
  .preview { font-size: 12px; color: #555; background: #fff; border: 1px dashed #ccc; border-radius: 5px; padding: 5px 7px; margin-bottom: 6px; word-break: break-word; }
  .preview.has { border-color: #e0b800; background: #fffbe0; color: #222; }
  .field { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; }
  .field.missing { border-color: #e8a0a0; background: #fff6f6; }
  .frow { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
  .name { font-weight: 600; word-break: break-word; }
  .badge { font-size: 11px; color: #b00; }
  .empty { color: #777; font-size: 12px; }
  .msg { padding: 6px 12px; font-size: 12px; color: #174ea6; background: #eef4fe; border-top: 1px solid #d6e4fc; }
  .msg:empty { display: none; }
  footer { display: flex; gap: 6px; padding: 10px 12px; border-top: 1px solid #ddd; background: #fff; }
  footer .primary { flex: 1; }
  label { display: block; margin-bottom: 6px; }
  label.chk { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  input[type=checkbox] { width: auto; margin: 0; }
  summary { cursor: pointer; margin-top: 8px; }
  .endbox { margin-top: 8px; }
  .enddate { font-size: 15px; font-weight: 700; }
  .endbox ul { margin: 4px 0 0; padding-left: 16px; font-size: 12px; }
  .warn { margin-top: 6px; padding: 5px 7px; font-size: 12px; color: #5c4300; background: #fff5d6; border: 1px solid #e2c464; border-radius: 5px; }
  .warn b { display: block; }
  .added { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 12px; word-break: break-word; }
  .added span { flex: 1; }
</style>
<div class="wrap">
  <button class="tab" data-act="open" title="Show sidebar (Alt+T)">Fields ◂</button>
  <aside class="sb">
    <header><b>Fields</b><span class="sp"></span>
      <button class="icon" data-act="reapply" title="Re-apply this format's saved setup">↻</button>
      <button class="icon" data-act="close" title="Hide sidebar (Alt+T)">▸</button>
    </header>
    <div class="body">
      <section>
        <div class="h">Format</div>
        <select data-ui="format" style="width:100%"></select>
        <div class="hint" data-ui="keyinfo"></div>
      </section>
      <section>
        <div class="h">Add a field</div>
        <div class="preview" data-ui="preview"></div>
        <div class="row newrow"><input data-ui="newname" placeholder="Name, e.g. Date"><button class="primary" data-act="add">Add</button></div>
      </section>
      <section data-ui="fields"></section>
      <section>
        <div class="h">Layout (saved for this format)</div>
        <div class="row">
          <select data-set="paper" title="Paper">${opt('auto', 'Paper: auto')}${Object.keys(PAPERS).map(k => opt(k, k)).join('')}</select>
          <select data-set="orient" title="Orientation">${opt('auto', 'Orientation: auto')}${opt('portrait', 'Portrait')}${opt('landscape', 'Landscape')}</select>
          <select data-set="margin" title="Margins">${MARGINS.map(m => opt(m, m === 'auto' ? 'Margins: auto' : m + ' mm margins')).join('')}</select>
        </div>
        <div class="row">
          <button data-act="break" title="New page starts at the block where your cursor is. Press again there to remove.">Page break</button>
          <button data-act="hide" title="Leave the block where your cursor is out of the printout. Press again there to bring it back.">Hide block</button>
          <button data-act="smaller" title="Smaller text where your cursor is">A−</button>
          <button data-act="bigger" title="Bigger text where your cursor is">A+</button>
        </div>
      </section>
      <section>
        <div class="h">End date</div>
        <label>Proceed date<input type="date" data-end="proceed"></label>
        <label class="chk"><input type="checkbox" data-end="ncr">Include Metro Manila (NCR) only days</label>
        <div class="endbox" data-ui="endresult"></div>
        <details>
          <summary>Add a non-working day</summary>
          <label style="margin-top:6px">Date<input type="date" data-ui="adddate"></label>
          <label>Name (optional)<input type="text" maxlength="80" data-ui="addname"></label>
          <button data-act="addday">Add day</button>
          <div data-ui="addedlist"></div>
        </details>
      </section>
      <section>
        <button data-act="clear" title="Remove all saved fields and layout for this format">Clear this format's setup</button>
      </section>
    </div>
    <div class="msg" data-ui="msg"></div>
    <footer>
      <button data-act="edit" title="Turn typing in the page on/off (Alt+E)"></button>
      <button class="primary" data-act="print">Print</button>
    </footer>
  </aside>
</div>`;

    // Clicking buttons must not steal the highlight/cursor from the page.
    sh.addEventListener('mousedown', e => {
      if (!['INPUT', 'SELECT', 'OPTION'].includes(e.target.tagName)) e.preventDefault();
    });
    sh.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act) act(b.dataset.act);
      else if (b.dataset.fact) fieldAct(b.dataset.fact, b.closest('.field').dataset.id);
      else if (b.dataset.delday) removeDay(b.dataset.delday);
    });
    sh.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.end === 'ncr') {
        S.end.areas = t.checked ? ['NCR'] : [];
        storeEnd(s => s.set({ [END_AREAS_KEY]: S.end.areas }));
        renderEndDate();
      }
      else if (t.dataset.set && prof()) { prof()[t.dataset.set] = t.value; save(); ensure(); }
      else if (t.dataset.ui === 'format') switchFormat(t.value);
    });
    sh.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.end === 'proceed') { S.end.proceed = t.value; renderEndDate(); return; }
      const box = t.closest && t.closest('.field');
      if (!box || t.tagName !== 'INPUT') return;
      const f = prof().fields.find(x => x.id === box.dataset.id);
      if (!f) return;
      f.value = t.value;
      showValue(f);
      save();
    });
    sh.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.dataset.ui === 'newname') { e.preventDefault(); addField(); }
      if (e.key === 'Enter' && e.target.dataset.ui === 'addname') { e.preventDefault(); addDay(); }
    });

    root.appendChild(host);
    const q = s => sh.querySelector(s);
    ui = {
      wrap: q('.wrap'), format: q('[data-ui="format"]'), keyinfo: q('[data-ui="keyinfo"]'),
      preview: q('[data-ui="preview"]'), newName: q('[data-ui="newname"]'), fields: q('[data-ui="fields"]'),
      msg: q('[data-ui="msg"]'), edit: q('[data-act="edit"]'), selects: [...sh.querySelectorAll('select[data-set]')],
      endProceed: q('[data-end="proceed"]'), endNcr: q('[data-end="ncr"]'), endResult: q('[data-ui="endresult"]'),
      addDate: q('[data-ui="adddate"]'), addName: q('[data-ui="addname"]'), addedList: q('[data-ui="addedlist"]'),
    };
    ui.endProceed.value = S.end.proceed; // the site's rewrite rebuilds the sidebar; keep the date already entered
    render();
  }

  // ---------- end-date calculator ----------
  function fmtDate(iso, style) {
    const opts = style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
      : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
    return Calc.parseDate(iso).toLocaleDateString('en-PH', opts);
  }

  function endWarning(title, text) {
    const box = document.createElement('div');
    box.className = 'warn';
    const b = document.createElement('b');
    b.textContent = title;
    box.append(b, text);
    return box;
  }

  function renderEndDate() {
    if (!ui) return;
    ui.endNcr.checked = S.end.areas.includes('NCR');
    const r = S.end.proceed ? Calc.calculate(S.end.proceed, { areas: S.end.areas, custom: S.end.custom }) : null;
    const nodes = [];
    if (!r || r.error) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = r ? r.error : 'Same date next month, moved to the next working day.';
      nodes.push(hint);
    } else {
      const date = document.createElement('div');
      date.className = 'enddate';
      date.textContent = fmtDate(r.end, 'long');
      const basis = document.createElement('div');
      basis.className = 'hint';
      basis.textContent = (r.clamped
        ? `The month after ${fmtDate(r.proceed)} has no such date, so it uses that month's last day: ${fmtDate(r.nominal)}.`
        : `One month after ${fmtDate(r.proceed)} is ${fmtDate(r.nominal)}.`)
        + (r.skipped.length ? ' Skipped:' : ' That is a working day.');
      nodes.push(date, basis);
      if (r.skipped.length) {
        const ul = document.createElement('ul');
        for (const s of r.skipped) {
          const li = document.createElement('li');
          li.textContent = `${fmtDate(s.date)}: ${s.reason}`;
          ul.append(li);
        }
        nodes.push(ul);
      }
      for (const year of r.unconfirmedYears) {
        nodes.push(endWarning('Not confirmed', `No holiday list is loaded for ${year}, so only weekends and days you added were excluded.`));
      }
      for (const p of r.pending) {
        nodes.push(endWarning(`${p.year} Eid dates not declared yet`, `${p.names.join(' and ')} are not in the list. Add them below once they are proclaimed.`));
      }
      for (const n of r.areaNotes) {
        nodes.push(endWarning(`Non-working in ${n.label}`, `This date is a holiday there (${n.source}). Tick the ${n.code} box if that applies to you.`));
      }
    }
    ui.endResult.replaceChildren(...nodes);

    ui.addedList.replaceChildren(...S.end.custom.map(item => {
      const row = document.createElement('div');
      row.className = 'added';
      const text = document.createElement('span');
      text.textContent = `${fmtDate(item.date)}: ${item.name}`;
      const del = document.createElement('button');
      del.className = 'icon';
      del.dataset.delday = item.date;
      del.textContent = '✕';
      del.title = 'Remove this day';
      row.append(text, del);
      return row;
    }));
  }

  function addDay() {
    if (!Calc.parseDate(ui.addDate.value)) { say('Pick a date to add first.'); return; }
    const [item] = Calc.sanitizeCustom([{ date: ui.addDate.value, name: ui.addName.value }]);
    S.end.custom = Calc.sanitizeCustom([item, ...S.end.custom]);
    ui.addDate.value = '';
    ui.addName.value = '';
    storeEnd(s => s.set({ [END_DAY_PREFIX + item.date]: item.name }));
    renderEndDate();
  }

  function removeDay(date) {
    S.end.custom = S.end.custom.filter(x => x.date !== date);
    storeEnd(s => s.remove(END_DAY_PREFIX + date));
    renderEndDate();
  }

  function act(a) {
    if (a === 'add') addField();
    else if (a === 'addday') addDay();
    else if (a === 'open') { S.open = true; ensure(); render(); }
    else if (a === 'close') { S.open = false; ensure(); render(); }
    else if (a === 'edit') { S.editing = !S.editing; ensure(); render(); }
    else if (a === 'print') window.print();
    else if (a === 'reapply') { if (S.key) { applyProfile(); say('Re-applied.'); } }
    else if (a === 'break') toggleMark('pa-break', 'breaks', 'page break');
    else if (a === 'hide') toggleMark('pa-hidden', 'hidden', 'hidden block');
    else if (a === 'smaller') resizeText(-1);
    else if (a === 'bigger') resizeText(1);
    else if (a === 'clear') {
      if (!S.key || !confirm('Remove all saved fields and layout settings for this format?')) return;
      unwrapAll();
      clearMarks();
      S.profiles[S.key] = blankProfile();
      save();
      ensure();
      render();
      say('Cleared.');
    }
  }

  function fieldAct(a, id) {
    const f = prof() && prof().fields.find(x => x.id === id);
    if (!f) return;
    if (a === 'find') {
      const sp = spanOf(id);
      if (!sp) return say('Not found in this page. Highlight the right text and press ✎ to move it.');
      sp.scrollIntoView({ block: 'center', behavior: 'smooth' });
      flash(sp);
    } else if (a === 'repick') repickField(f);
    else if (a === 'del') deleteField(f);
  }

  function switchFormat(key) {
    S.picked = key;
    S.key = key;
    applyProfile();
    say('Using the setup saved for that format.');
  }

  function renderPreview() {
    if (!ui) return;
    const t = lastRange ? lastRange.toString().replace(/\s+/g, ' ').trim() : '';
    ui.preview.classList.toggle('has', !!t);
    ui.preview.textContent = t
      ? `Highlighted: “${trunc(t, 80)}”`
      : 'Highlight text in the page, type a name, then press Add. Or highlight text and press ✎ on a field to move it there.';
  }

  function render() {
    if (!ui) return;
    ui.wrap.classList.toggle('closed', !S.open);
    ui.edit.textContent = S.editing ? 'Typing: ON' : 'Typing: OFF';
    ui.edit.classList.toggle('on', S.editing);
    renderPreview();
    renderEndDate();

    // Format dropdown
    ui.format.replaceChildren();
    const detected = S.loaded && document.body ? detectKey() : null;
    const keys = new Set(Object.keys(S.profiles).filter(k => !isEmptyProfile(S.profiles[k])));
    if (S.key) keys.add(S.key);
    if (detected) keys.add(detected);
    if (!keys.size) {
      ui.format.append(new Option('Waiting for the page…', ''));
    }
    for (const k of [...keys].sort()) {
      const label = trunc(k, 70) + (k === detected ? '  (this page)' : '');
      const o = new Option(label, k);
      o.title = k;
      ui.format.append(o);
    }
    if (S.key) ui.format.value = S.key;
    ui.format.disabled = !S.key;

    const p = S.key ? prof() : null;
    ui.keyinfo.textContent = !p ? 'Loading…'
      : S.key !== detected && detected ? 'Using a setup from a different format (picked manually).'
      : p.fields.length ? `Saved setup applied automatically each time this format opens.`
      : 'Nothing saved for this format yet.';

    // Fields list
    ui.fields.replaceChildren();
    const h = document.createElement('div');
    h.className = 'h';
    h.textContent = p && p.fields.length ? `Fields (${p.fields.length})` : 'Fields';
    ui.fields.append(h);
    if (!p || !p.fields.length) {
      const d = document.createElement('div');
      d.className = 'empty';
      d.textContent = 'No fields yet for this format.';
      ui.fields.append(d);
    } else {
      for (const f of p.fields) {
        const ok = found.get(f.id);
        const box = document.createElement('div');
        box.className = 'field' + (ok ? '' : ' missing');
        box.dataset.id = f.id;
        const row = document.createElement('div');
        row.className = 'frow';
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = f.name;
        row.append(name);
        if (!ok) {
          const b = document.createElement('span');
          b.className = 'badge';
          b.textContent = 'not found here';
          row.append(b);
        }
        const sp = document.createElement('span');
        sp.className = 'sp';
        row.append(sp);
        for (const [fact, icon, title] of [
          ['find', '⌖', 'Show it in the page'],
          ['repick', '✎', 'Move this field to the text you have highlighted'],
          ['del', '✕', 'Delete this field'],
        ]) {
          const b = document.createElement('button');
          b.className = 'icon';
          b.dataset.fact = fact;
          b.textContent = icon;
          b.title = title;
          row.append(b);
        }
        const inp = document.createElement('input');
        inp.value = f.value || '';
        const span = spanOf(f.id);
        inp.placeholder = span ? `Original: ${trunc((span.dataset.orig || '').replace(/\s+/g, ' ').trim() || '(blank)', 40)}` : '';
        inp.disabled = !ok;
        box.append(row, inp);
        ui.fields.append(box);
      }
    }

    ui.selects.forEach(s => { s.value = p ? p[s.dataset.set] : 'auto'; s.disabled = !p; });
  }

  // ---------- start ----------
  ensure();
  load();
  // Keep other open popups current, so one saving its copy cannot erase a day added in another.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const entries = {};
      for (const [k, c] of Object.entries(changes)) entries[k] = c.newValue;
      applyEnd(entries);
      renderEndDate();
    });
  } catch (_) { /* extension reloaded; this tab keeps what it has */ }
  new MutationObserver(ensure).observe(document, { childList: true });
  setInterval(ensure, 400);
})();
