// Small DOM helpers shared by the views.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Horizontal drags dismiss floating controls; vertical drags remain page scrolling. */
export function swipeDismiss(el, dismiss) {
  let start = null, dragged = false;
  const reset = () => { start = null; el.style.removeProperty('--swipe-x'); };
  el.addEventListener?.('pointerdown', (e) => {
    if (e.isPrimary === false || e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId }; dragged = false;
  });
  el.addEventListener?.('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!dragged && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { reset(); return; }
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      dragged = true; el.setPointerCapture?.(e.pointerId);
      el.style.setProperty('--swipe-x', `${dx}px`);
    }
  });
  el.addEventListener?.('pointerup', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    const done = dragged && Math.abs(dx) >= 64 && Math.abs(dx) > Math.abs(dy) * 1.5;
    reset(); if (done) dismiss();
  });
  el.addEventListener?.('pointercancel', () => { reset(); dragged = false; });
  el.addEventListener?.('click', (e) => {
    if (dragged && e.detail !== 0) { e.preventDefault(); e.stopImmediatePropagation(); }
    dragged = false;
  }, true);
}

const focusAttributes = ['id', 'data-set', 'data-done', 'data-block-start', 'data-setting', 'data-unit', 'data-theme', 'data-focus-log'];
const focusKey = (el) => {
  const attr = focusAttributes.find((name) => el?.hasAttribute?.(name));
  return attr ? [attr, el.getAttribute(attr)] : null;
};
const findFocus = (root, key) => key && [...root.querySelectorAll(`[${key[0]}]`)].find((el) => el.getAttribute(key[0]) === key[1]);

export function captureView(root) {
  return { open: new Map([...root.querySelectorAll('details[data-keep-open]')].map((el) => [el.dataset.keepOpen, el.open])),
    focus: root.contains?.(document.activeElement) ? focusKey(document.activeElement) : null };
}
export function restoreView(root, saved) {
  if (!saved) return;
  root.querySelectorAll('details[data-keep-open]').forEach((el) => {
    if (saved.open.has(el.dataset.keepOpen)) el.open = saved.open.get(el.dataset.keepOpen);
  });
  findFocus(root, saved.focus)?.focus({ preventScroll: true });
}

/** Short message at the bottom of the screen. `action` ({ label, onClick }) adds one button, for example Undo. */
export function toast(message, ms = 2600, action = null) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status');
  el.append(Object.assign(document.createElement('span'), { textContent: message }));
  if (action) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'toast-action', textContent: action.label });
    b.addEventListener('click', () => { el.remove(); action.onClick(); }, { once: true });
    el.append(b);
  }
  const close = Object.assign(document.createElement('button'), { type: 'button', className: 'toast-action toast-dismiss', textContent: '×' });
  close.setAttribute('aria-label', 'Dismiss message');
  close.onclick = () => el.remove(); el.append(close);
  swipeDismiss(el, () => el.remove());
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

/** Open a modal bottom sheet. `html` is trusted markup built with esc(). Returns { el, close }. */
let sheetId = 0;
const openSheets = [];
export function openSheet(html, { onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Dialog" tabindex="-1">${html}</div>`;
  const dialog = back.firstElementChild;
  const prevFocus = document.activeElement;
  const prevKey = focusKey(prevFocus);
  const nameDialog = () => {
    const heading = dialog.querySelector('h1,h2,h3');
    if (!heading) return;
    if (!heading.id) heading.id = `sheet-title-${++sheetId}`;
    dialog.setAttribute('aria-labelledby', heading.id);
    dialog.removeAttribute?.('aria-label');
  };
  nameDialog();
  // Some sheets populate their content immediately after openSheet returns.
  const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(nameDialog);
  observer?.observe(dialog, { childList: true, subtree: true });
  const focusable = () => [...(dialog.querySelectorAll?.('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') || [])]
    .filter((el) => el.getClientRects().length && !el.closest('[hidden],[inert]'));
  // Android's back gesture closes the top sheet instead of navigating the page behind it and leaving the sheet open
  // over the wrong view. Chrome-only API; iPhone has no system back, and Escape is handled by onKey below.
  const watcher = typeof CloseWatcher === 'function' ? new CloseWatcher() : null;
  let closed = false;
  const close = () => {
    if (closed) return;
    const wasTop = openSheets.at(-1) === back;
    closed = true; observer?.disconnect(); watcher?.destroy(); back.remove(); document.removeEventListener('keydown', onKey);
    openSheets.splice(openSheets.indexOf(back), 1);
    const target = prevFocus?.isConnected === false ? findFocus(document, prevKey) : prevFocus;
    const parent = openSheets.at(-1)?.firstElementChild;
    if (wasTop) (parent && target && !parent.contains?.(target) ? parent : target || parent)?.focus?.({ preventScroll: true });
    onClose?.();
  };
  const onKey = (e) => {
    if (openSheets.at(-1) !== back) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) { e.preventDefault(); dialog.focus(); return; }
    const first = items[0], last = items.at(-1), active = document.activeElement;
    if (e.shiftKey && (active === first || !dialog.contains?.(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !dialog.contains?.(active))) { e.preventDefault(); first.focus(); }
  };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  if (watcher) watcher.onclose = close;
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  openSheets.push(back);
  (focusable()[0] || dialog).focus?.();
  return { el: dialog, close };
}

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
