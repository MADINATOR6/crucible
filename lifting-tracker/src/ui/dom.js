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
export function openSheet(html, { onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  const prevFocus = document.activeElement;
  const prevKey = focusKey(prevFocus);
  const close = () => {
    back.remove(); document.removeEventListener('keydown', onKey);
    const target = prevFocus?.isConnected === false ? findFocus(document, prevKey) : prevFocus;
    target?.focus?.({ preventScroll: true }); onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  back.querySelector('input,select,button')?.focus?.();
  return { el: back.firstElementChild, close };
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
