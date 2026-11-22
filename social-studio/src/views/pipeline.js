import { esc, setStatus, openDialog, closeDialog, formData, confirmDialog, copyText, fmtNum } from '../ui.js';
import { save } from '../app.js';
import { STAGES, STAGE_LABEL, move, isApproved, postIdentity } from '../pipeline.js';
import { PLATFORM_LABEL } from '../importer.js';
import { itemCard, editorActions } from './plan.js';

const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

function buttons(i) {
  const b = (act, label, cls = '') => `<button type="button" ${cls ? `class="${cls}"` : ''} data-act="${act}" data-id="${esc(i.id)}">${label}</button>`;
  switch (i.stage) {
    case 'idea': return b('toDrafting', 'Start draft');
    case 'drafting': return b('toReady', 'Send to review', 'primary');
    case 'ready': return b('approve', 'Approve…', 'primary') + b('back', 'Back to drafting');
    case 'approved':
      if (!isApproved(i)) return b('reapprove', 'Approve again…', 'primary') + b('back', 'Back to drafting');
      return (canShare() ? b('share', 'Share…') : '') + b('copy', 'Copy caption') + b('posted', 'Mark posted…', 'primary') + b('back', 'Unapprove');
    case 'posted': return `<a class="btn" href="#results">Import results</a>`;
    case 'measured': return i.metrics?.views != null ? `<span class="small">${fmtNum(i.metrics.views)} views</span>` : '';
    default: return '';
  }
}

function render_(S) {
  const filter = S.ui.pipeline?.platform || 'all';
  const items = S.items.filter(i => filter === 'all' || i.platform === filter);
  return `
  <h1>Pipeline</h1>
  <p class="sub">Every item shows its next action. Nothing is posted for you: you approve, post it yourself, then paste the link.</p>
  <label style="max-width:240px">Platform <select data-change="platform">${['all', ...S.profile.platforms].map(p => `<option value="${esc(p)}"${p === filter ? ' selected' : ''}>${esc(p === 'all' ? 'All platforms' : PLATFORM_LABEL[p] || p)}</option>`).join('')}</select></label>
  ${S.items.length ? '' : '<p class="empty">No content yet. Ideas you create in Scout or Plan appear here.</p>'}
  <div class="board">${STAGES.map(st => {
    const col = items.filter(i => i.stage === st);
    return `<section class="col" aria-label="${STAGE_LABEL[st]}"><h2>${STAGE_LABEL[st]} <span class="muted">(${col.length})</span></h2>
      ${col.map(i => itemCard(S, i, buttons(i))).join('') || '<p class="small muted">Empty</p>'}</section>`;
  }).join('')}</div>`;
}

const get = (S, el) => S.items.find(i => i.id === el.dataset.id);
async function step(S, item, to, patch) {
  const r = move(item, to, patch);
  if (!r.ok) throw new Error(r.error);
  await save('items', r.item);
  setStatus(`${item.title}: ${STAGE_LABEL[to]}`);
}

async function approveFlow(el, S, title) {
  const i = get(S, el);
  const preview = `<b>${esc(PLATFORM_LABEL[i.platform])}</b> · goal: ${esc(i.goal)}<br><b>Hook:</b> ${esc(i.hook) || '<i>none</i>'}<br><b>Caption:</b> ${esc(i.caption) || '<i>none</i>'}<br><b>Hashtags:</b> ${esc(i.hashtags) || '<i>none</i>'}${i.aiDraft ? '<br><span class="badge ai">AI draft: check every fact</span>' : ''}`;
  if (!(await confirmDialog(title, `${preview}<br><br>Approve exactly this content? Any later edit will need approval again.`, 'Approve'))) return false;
  // reapprove: an approved item whose content changed goes back to Ready, then is approved again
  const base = i.stage === 'approved' ? { ...i, stage: 'ready' } : i;
  await step(S, base, 'approved');
}

const actions = {
  ...editorActions,
  platform(el, S) { (S.ui.pipeline ||= {}).platform = el.value; },
  async toDrafting(el, S) { await step(S, get(S, el), 'drafting'); editorActions.edit(el, S); return false; },
  async toReady(el, S) { await step(S, get(S, el), 'ready'); },
  approve: (el, S) => approveFlow(el, S, 'Approve for posting'),
  reapprove: (el, S) => approveFlow(el, S, 'Content changed: approve again'),
  async back(el, S) { await step(S, get(S, el), 'drafting'); },
  async copy(el, S) {
    const i = get(S, el);
    const ok = await copyText([i.caption, i.hashtags].filter(Boolean).join('\n\n'));
    setStatus(ok ? 'Caption copied' : 'Copy failed: open the item and copy it by hand');
    return false;
  },
  async share(el, S) {
    const i = get(S, el);
    try { await navigator.share({ text: [i.caption, i.hashtags].filter(Boolean).join('\n\n') }); setStatus('Shared. Paste the post link here once it is live.'); }
    catch (e) { if (e?.name !== 'AbortError') setStatus('Sharing failed: use Copy caption instead'); }
    return false;
  },
  posted(el, S) {
    const i = get(S, el);
    openDialog(`<form data-form="markPosted" data-id="${esc(i.id)}"><h2 id="dialog-title">Mark as posted</h2>
      <p>Post it yourself on ${esc(PLATFORM_LABEL[i.platform])}, then paste the link to the live post. Social Studio never posts for you.</p>
      <label>Post link <input name="postUrl" type="url" required placeholder="https://…" autofocus></label>
      <div class="row"><button class="primary" type="submit">Mark posted</button><button type="button" data-act="close">Cancel</button></div></form>`);
    return false;
  },
  async markPosted(form, S) {
    const i = S.items.find(x => x.id === form.dataset.id);
    await step(S, i, 'posted', { postUrl: formData(form).postUrl.trim(), postedAt: new Date().toISOString() });
    closeDialog();
    // Results imported before the link was pasted: link them now.
    const posted = S.items.find(x => x.id === i.id), identity = postIdentity(posted.platform, posted.postUrl);
    const m = S.posts.find(p => p.platform === posted.platform && p.identity === identity && !p.sample);
    if (m) {
      const r = move({ ...posted, metrics: m.metrics, measuredBy: m.id }, 'measured');
      if (r.ok) { await save('items', r.item); await save('posts', { ...m, itemId: posted.id }); setStatus(`${posted.title}: already in your imported results, now Measured`); }
    }
  },
};

export default { render: render_, actions };
