// Small DOM helpers shared by the views.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

/** Open a modal bottom sheet. `html` is trusted markup built with esc(). Returns { el, close }. */
export function openSheet(html, { onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  const prevFocus = document.activeElement;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); onClose?.(); };
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
