// Small DOM helpers. All user and AI text goes through esc(); links only for http(s).
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : null);
export const link = (u, text) => { const s = safeUrl(u); return s ? `<a href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(text || hostOf(s))}</a>` : esc(text || u || ''); };
export const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
export const badge = (text, cls = '') => `<span class="badge ${esc(cls)}">${esc(text)}</span>`;
export const sampleBadge = x => (x?.sample ? badge('SAMPLE', 'sample') : '');
export const fmtNum = n => (n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2));
export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
export const opt = (value, label, sel) => `<option value="${esc(value)}"${value === sel ? ' selected' : ''}>${esc(label)}</option>`;

export function setStatus(msg) {
  const el = document.getElementById('status');
  el.textContent = msg;
  clearTimeout(setStatus.t);
  if (msg) setStatus.t = setTimeout(() => { el.textContent = ''; }, 5000);
}

export function evidenceList(evidence = []) {
  if (!evidence.length) return '<p class="small muted">No sources.</p>';
  return `<ul class="evidence">${evidence.map(e => `<li>${link(e.url, e.title || hostOf(e.url))}${e.date ? ` <span class="muted">(page dated ${esc(e.date)})</span>` : ' <span class="muted">(date not shown)</span>'}${e.quote ? ` — ${esc(e.quote)}` : ''}</li>`).join('')}</ul>`;
}

const dlg = () => document.getElementById('dialog');
export function openDialog(html) {
  const d = dlg();
  d.innerHTML = html;
  if (!d.open) d.showModal();
  d.querySelector('[autofocus], input, select, textarea, button')?.focus();
}
export function closeDialog() { const d = dlg(); if (d.open) d.close(); d.innerHTML = ''; }

// Two-step confirm inside our own dialog (native confirm() is blocked in some installed PWAs).
export function confirmDialog(title, body, okLabel = 'Confirm', danger = false) {
  return new Promise(resolve => {
    openDialog(`<h2 id="dialog-title">${esc(title)}</h2><p>${body}</p>
      <div class="row"><button type="button" class="${danger ? 'danger' : 'primary'}" data-confirm="yes">${esc(okLabel)}</button><button type="button" data-confirm="no" autofocus>Cancel</button></div>`);
    const d = dlg();
    const done = v => { d.removeEventListener('click', onClick); d.removeEventListener('close', onClose); closeDialog(); resolve(v); };
    const onClick = e => { const b = e.target.closest('[data-confirm]'); if (b) done(b.dataset.confirm === 'yes'); };
    const onClose = () => done(false);
    d.addEventListener('click', onClick);
    d.addEventListener('close', onClose);
  });
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
  const ta = Object.assign(document.createElement('textarea'), { value: text });
  ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

export const formData = form => Object.fromEntries(new FormData(form).entries());
