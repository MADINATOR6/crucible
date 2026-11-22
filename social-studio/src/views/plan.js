import { esc, badge, sampleBadge, link, setStatus, openDialog, closeDialog, formData, opt, today, confirmDialog } from '../ui.js';
import { save, remove, newItem } from '../app.js';
import { draftContent } from '../scout.js';
import { STAGE_LABEL, nextAction, isApproved } from '../pipeline.js';
import { PLATFORM_LABEL } from '../importer.js';

const PRI = { high: 0, medium: 1, low: 2 };
const dayKey = d => d.toLocaleDateString('en-CA');

export function evidenceFor(S, item) {
  return (item.trendIds || []).map(id => S.findings.find(f => f.id === id)).filter(Boolean);
}

export function itemCard(S, i, extra = '') {
  const ev = evidenceFor(S, i);
  return `<article class="card" aria-label="${esc(i.title)}">
    <div class="row between"><h3>${esc(i.title)}</h3><span class="row">${sampleBadge(i)}${badge(PLATFORM_LABEL[i.platform] || i.platform)}${badge(STAGE_LABEL[i.stage])}</span></div>
    <p class="row small">${badge(i.goal, 'goal')}${i.format ? badge(i.format) : ''}${badge(`Priority: ${i.priority}`)}${i.scheduledFor ? badge(`📅 ${i.scheduledFor}`) : ''}</p>
    <p class="next"><span class="sr">Next action: </span>→ ${esc(nextAction(i))}</p>
    ${ev.length ? `<p class="small muted">Because of: ${ev.map(f => `${esc(f.title)}${f.evidence?.[0] ? ` (${link(f.evidence[0].url)})` : ''}`).join('; ')}</p>` : '<p class="small muted">Your own idea (no linked research).</p>'}
    <div class="row"><button type="button" data-act="edit" data-id="${esc(i.id)}">Open</button>${extra}</div></article>`;
}

function week(S, offset) {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
  const days = [...Array(7)].map((_, n) => { const d = new Date(start); d.setDate(d.getDate() + n); return d; });
  return `<div class="week" role="list" aria-label="Week of ${dayKey(days[0])}">${days.map(d => {
    const k = dayKey(d), its = S.items.filter(i => i.scheduledFor === k);
    return `<div class="day${k === today() ? ' today' : ''}" role="listitem"><h3>${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</h3>
      ${its.map(i => `<button type="button" class="chip link" data-act="edit" data-id="${esc(i.id)}">${esc(PLATFORM_LABEL[i.platform]?.[0] || '')} · ${esc(i.title)}</button>`).join('') || '<span class="muted small">—</span>'}</div>`;
  }).join('')}</div>`;
}

function render_(S) {
  const ui = S.ui.plan ||= { week: 0 };
  const open = S.items.filter(i => ['idea', 'drafting', 'ready'].includes(i.stage))
    .sort((a, b) => PRI[a.priority] - PRI[b.priority] || (a.created || '').localeCompare(b.created || ''));
  const byGoal = S.profile.goals.map(g => [g, S.items.filter(i => i.goal === g).length]);
  return `
  <h1>Plan</h1>
  <p class="sub">Ideas tied to goals and evidence, briefs, platform drafts and your week.</p>
  <div class="row"><button type="button" class="primary" data-act="newIdea">New idea</button>
    <span class="small muted">Content per goal: ${byGoal.map(([g, n]) => `${esc(g)} ${n}`).join(' · ')}</span></div>
  <h2>This ${ui.week ? 'other ' : ''}week</h2>
  <div class="row" style="margin-bottom:8px"><button type="button" data-act="week" data-d="-1" aria-label="Previous week">← Prev</button><button type="button" data-act="week" data-d="0">This week</button><button type="button" data-act="week" data-d="1" aria-label="Next week">Next →</button></div>
  ${week(S, ui.week)}
  <h2>Ideas and drafts (${open.length})</h2>
  ${open.length ? `<div class="grid">${open.map(i => itemCard(S, i)).join('')}</div>` : '<p class="empty">No ideas yet. Make one from a Scout finding (it keeps the sources), or start your own with "New idea".</p>'}`;
}

export function editor(S, i) {
  const p = S.profile, ev = evidenceFor(S, i), locked = isApproved(i) && ['approved', 'posted', 'measured'].includes(i.stage);
  return `<form data-form="saveItem" data-id="${esc(i.id)}"><h2 id="dialog-title">${esc(i.title || 'New idea')} ${sampleBadge(i)}</h2>
    <p class="next">→ ${esc(nextAction(i))}</p>
    ${locked ? '<p class="banner info small">This content is approved. Editing the hook, script, caption or hashtags will need approval again.</p>' : ''}
    <label>Idea <input name="title" required value="${esc(i.title)}"></label>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <label>Goal <select name="goal" required>${p.goals.map(g => opt(g, g, i.goal)).join('')}</select></label>
      <label>Platform <select name="platform" ${i.stage === 'posted' || i.stage === 'measured' ? 'disabled' : ''}>${p.platforms.concat(p.platforms.includes(i.platform) ? [] : [i.platform]).map(x => opt(x, PLATFORM_LABEL[x], i.platform)).join('')}</select></label>
      <label>Priority <select name="priority">${['high', 'medium', 'low'].map(x => opt(x, x, i.priority)).join('')}</select></label>
      <label>Post date <input name="scheduledFor" type="date" value="${esc(i.scheduledFor)}"></label>
    </div>
    <label>Format <input name="format" value="${esc(i.format)}" placeholder="Tutorial, Story, List, Reaction…"></label>
    <fieldset><legend>Brief</legend>
      <label>Audience <input name="audience" value="${esc(i.brief?.audience)}"></label>
      <label>Angle <input name="angle" value="${esc(i.brief?.angle)}"></label>
      <label>Call to action (serves the goal) <input name="cta" value="${esc(i.brief?.cta)}"></label>
    </fieldset>
    <fieldset><legend>Draft ${i.aiDraft ? badge('AI draft: check facts before approving', 'ai') : ''}</legend>
      <label>Hook (first 2 seconds) <input name="hook" value="${esc(i.hook)}"></label>
      <label>Script <textarea name="draft" rows="6">${esc(i.draft)}</textarea></label>
      <label>Caption <textarea name="caption" rows="3">${esc(i.caption)}</textarea></label>
      <label>Hashtags <input name="hashtags" value="${esc(i.hashtags)}"></label>
      <input type="hidden" name="aiDraft" value="${i.aiDraft ? '1' : ''}">
      <button type="button" data-act="aiDraft" ${S.apiKey ? '' : 'disabled title="Add your API key in Setup"'}>✨ Draft with AI</button>
      <span class="small muted" id="draft-status" role="status" aria-live="polite"></span>
    </fieldset>
    <p class="small muted">Evidence: ${ev.length ? ev.map(f => `${esc(f.title)} ${f.evidence?.map(e => link(e.url)).join(', ') || ''}`).join('; ') : 'none (your own idea)'}</p>
    <div class="row"><button class="primary" type="submit">Save</button><button type="button" data-act="close">Close</button>
      <button type="button" data-act="copyToPlatform" data-id="${esc(i.id)}">Copy to another platform</button>
      <button type="button" class="danger" data-act="del" data-id="${esc(i.id)}">Delete</button></div></form>`;
}

// Shared by Plan and Pipeline.
export const editorActions = {
  edit(el, S) { const i = S.items.find(x => x.id === el.dataset.id); if (i) openDialog(editor(S, i)); return false; },
  close() { closeDialog(); return false; },
  async saveItem(form, S) {
    const i = S.items.find(x => x.id === form.dataset.id);
    const d = formData(form);
    if (!d.title.trim()) throw new Error('The idea needs a title.');
    const next = { ...i, title: d.title.trim(), goal: d.goal, platform: d.platform || i.platform, priority: d.priority, scheduledFor: d.scheduledFor, format: d.format.trim(),
      brief: { audience: d.audience.trim(), angle: d.angle.trim(), cta: d.cta.trim() }, hook: d.hook, draft: d.draft, caption: d.caption, hashtags: d.hashtags, aiDraft: d.aiDraft === '1', updated: new Date().toISOString() };
    if (next.stage === 'idea' && (next.draft.trim() || next.hook.trim())) next.stage = 'drafting';
    if (next.platform !== i.platform && i.approvedKey) next.approvedKey = null; // approval was for the old platform
    await save('items', next);
    closeDialog(); setStatus('Saved');
  },
  async aiDraft(el, S) {
    const form = el.closest('form'), status = form.querySelector('#draft-status');
    const i = S.items.find(x => x.id === form.dataset.id);
    const d = formData(form);
    el.disabled = true; status.textContent = 'Writing a draft…';
    try {
      const { apiKey } = S;
      const r = await draftContent({ apiKey, profile: S.profile, item: { ...i, title: d.title, goal: d.goal, platform: d.platform || i.platform, format: d.format, brief: { angle: d.angle } }, trend: evidenceFor(S, i)[0] });
      form.hook.value = r.hook; form.draft.value = r.script; form.caption.value = r.caption; form.hashtags.value = r.hashtags.join(' ');
      if (r.cta && !form.cta.value) form.cta.value = r.cta;
      form.aiDraft.value = '1';
      status.textContent = 'AI draft filled in. Review it, then Save.';
    } catch (e) { status.textContent = e.message; }
    el.disabled = false;
    return false;
  },
  copyToPlatform(el, S) {
    const i = S.items.find(x => x.id === el.dataset.id);
    const others = S.profile.platforms.filter(p => p !== i.platform);
    if (!others.length) { setStatus('Add another platform in Setup first'); return false; }
    openDialog(`<form data-form="doCopy" data-id="${esc(i.id)}"><h2 id="dialog-title">Copy "${esc(i.title)}"</h2>
      <label>To platform <select name="platform">${others.map(p => opt(p, PLATFORM_LABEL[p])).join('')}</select></label>
      <p class="small muted">The copy starts as a draft with its own approval and post link.</p>
      <div class="row"><button class="primary" type="submit">Copy</button><button type="button" data-act="close">Cancel</button></div></form>`);
    return false;
  },
  async doCopy(form, S) {
    const i = S.items.find(x => x.id === form.dataset.id);
    const { id, created, updated, stage, approvedAt, approvedKey, postUrl, postedAt, measuredBy, metrics, ...rest } = i;
    await save('items', newItem({ ...rest, platform: formData(form).platform, stage: rest.draft?.trim() ? 'drafting' : 'idea', siblingOf: i.id }));
    closeDialog(); setStatus('Copied as a new draft');
  },
  async del(el, S) {
    const i = S.items.find(x => x.id === el.dataset.id);
    if (!(await confirmDialog('Delete this item?', `"${esc(i.title)}" and its draft will be removed. Imported results stay.`, 'Delete', true))) return false;
    await remove('items', i.id); setStatus('Deleted');
  },
};

const actions = {
  ...editorActions,
  newIdea(_, S) {
    const p = S.profile;
    openDialog(`<form data-form="createOwn"><h2 id="dialog-title">New idea</h2>
      <label>Idea <input name="title" required></label>
      <label>Goal it serves <select name="goal" required>${p.goals.map(g => opt(g, g, p.mainGoal)).join('')}</select></label>
      <label>Platform <select name="platform">${p.platforms.map(x => opt(x, PLATFORM_LABEL[x])).join('')}</select></label>
      <div class="row"><button class="primary" type="submit">Create</button><button type="button" data-act="close">Cancel</button></div></form>`);
    return false;
  },
  async createOwn(form) {
    const d = formData(form);
    if (!d.title.trim()) throw new Error('Give the idea a title.');
    await save('items', newItem({ title: d.title.trim(), goal: d.goal, platform: d.platform }));
    closeDialog(); setStatus('Idea added');
  },
  week(el, S) { const v = Number(el.dataset.d); S.ui.plan.week = v === 0 ? 0 : S.ui.plan.week + v; },
};

export default { render: render_, actions };
