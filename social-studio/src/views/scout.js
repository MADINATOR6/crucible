import { esc, badge, sampleBadge, evidenceList, link, setStatus, openDialog, closeDialog, formData, safeUrl, opt, today } from '../ui.js';
import { save, remove, newItem, render } from '../app.js';
import { runScout, MODEL } from '../scout.js';
import { uid } from '../db.js';
import { PLATFORM_LABEL } from '../importer.js';

const KIND_LABEL = { trend: 'Trend', niche: 'Niche', question: 'Audience question', note: 'Research note' };

function card(f) {
  const ai = f.source === 'ai';
  const head = `<div class="row between"><h3>${esc(f.title)}</h3><span class="row">${sampleBadge(f)}${ai ? badge('AI-assessed', 'ai') : f.sample ? '' : badge('Added by you')}${badge(KIND_LABEL[f.kind] || f.kind)}${f.status === 'saved' ? badge('Saved', 'goal') : ''}</span></div>`;
  let body = '';
  if (f.kind === 'trend') {
    body = `<p>${esc(f.why)}</p>
      <p class="row small">${(f.platforms || []).map(p => badge(PLATFORM_LABEL[p] || p)).join('')}${f.format ? badge(f.format) : ''}
        ${badge(`Momentum: ${f.momentum}`, f.momentum)}${badge(`Fit: ${f.fit}`, f.fit)}</p>
      ${f.momentumBasis ? `<p class="small muted">Momentum basis: ${esc(f.momentumBasis)}</p>` : '<p class="small muted">Momentum unknown: no source showed it.</p>'}
      ${f.fitReason ? `<p class="small"><b>Fit:</b> ${esc(f.fitReason)}</p>` : ''}
      ${f.monetization ? `<p class="small"><b>Money angle:</b> ${esc(f.monetization)}</p>` : ''}
      ${(f.ideas || []).length ? `<p class="small"><b>Idea starters:</b> ${f.ideas.map(esc).join(' · ')}</p>` : ''}`;
  } else if (f.kind === 'niche') {
    body = `${f.demand ? `<p class="small"><b>Demand:</b> ${esc(f.demand)}</p>` : ''}${f.monetization ? `<p class="small"><b>Money:</b> ${esc(f.monetization)}</p>` : ''}${f.competition ? `<p class="small"><b>Competition:</b> ${esc(f.competition)}</p>` : ''}`;
  } else if (f.note) body = `<p>${esc(f.note)}</p>`;
  return `<article class="card" aria-label="${esc(f.title)}">${head}${body}
    <details><summary class="small">Sources (${(f.evidence || []).length})${f.retrievedAt ? ` · found ${esc(f.retrievedAt.slice(0, 10))}` : ''}</summary>${evidenceList(f.evidence)}</details>
    <div class="row" style="margin-top:8px">
      <button type="button" class="primary" data-act="makeIdea" data-id="${esc(f.id)}">Make idea</button>
      ${f.status === 'saved' ? `<button type="button" data-act="unsave" data-id="${esc(f.id)}">Unsave</button>` : `<button type="button" data-act="keep" data-id="${esc(f.id)}">Save</button>`}
      <button type="button" data-act="dismiss" data-id="${esc(f.id)}" aria-label="Dismiss ${esc(f.title)}">Dismiss</button>
    </div></article>`;
}

function render_(S) {
  const ui = S.ui.scout ||= { filter: 'all' };
  const visible = S.findings.filter(f => f.status !== 'dismissed' && (ui.filter === 'all' || f.kind === ui.filter || (ui.filter === 'saved' && f.status === 'saved')))
    .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  const lastRun = [...S.runs].sort((a, b) => b.started.localeCompare(a.started))[0];
  const topics = S.profile?.topics?.join(', ');
  const tabs = ['all', 'trend', 'niche', 'question', 'note', 'saved'];
  return `
  <h1>Scout</h1>
  <p class="sub">Research, trends and niches, each with its sources. ${topics ? `Niche: <b>${esc(topics)}</b>.` : 'No niche set: try "Find niches".'}</p>
  ${!S.apiKey ? '<div class="banner warn">AI scouting needs your Claude API key. <a href="#setup">Add it in Setup</a>. You can still add research by hand below.</div>' : ''}
  ${!navigator.onLine ? '<div class="banner warn">You are offline. Scouting needs a connection; saved research is still here.</div>' : ''}
  ${ui.error ? `<div class="banner error" role="alert"><b>Scout failed.</b> ${esc(ui.error)} <button type="button" class="link" data-act="run" data-kind="${esc(ui.lastKind || 'trends')}">Try again</button></div>` : ''}
  <div class="card">
    <div class="row">
      <button type="button" class="primary" data-act="run" data-kind="trends" ${ui.running || !S.apiKey ? 'disabled' : ''}>Scout trends</button>
      <button type="button" data-act="run" data-kind="niches" ${ui.running || !S.apiKey ? 'disabled' : ''}>Find niches that pay</button>
      <button type="button" data-act="addNote">Add research by hand</button>
    </div>
    <p class="small muted" style="margin-bottom:0">Uses ${esc(MODEL)} with web search on your key. Only claims with a source the search actually returned are kept; the rest are dropped and counted.
    ${lastRun ? `<br>Last run ${esc(lastRun.started.slice(0, 16).replace('T', ' '))}: ${lastRun.error ? `failed (${esc(lastRun.error)})` : `${lastRun.kept} kept, ${lastRun.dropped} unsupported dropped, ${lastRun.usage?.web_searches ?? 0} searches, ${(lastRun.usage?.input_tokens ?? 0).toLocaleString()} in / ${(lastRun.usage?.output_tokens ?? 0).toLocaleString()} out tokens`}${lastRun.searchErrors?.length ? `, search errors: ${esc(lastRun.searchErrors.join(', '))}` : ''}.` : ''}</p>
  </div>
  ${ui.running ? `<div role="status" aria-live="polite" class="card"><span class="spinner" aria-hidden="true"></span> Researching ${ui.lastKind === 'niches' ? 'niches' : 'trends'}… this can take a minute. <button type="button" data-act="cancel">Cancel</button></div><div class="skeleton"></div><div class="skeleton"></div>` : ''}
  <div class="row" role="tablist" aria-label="Filter">${tabs.map(t => `<button type="button" role="tab" aria-selected="${ui.filter === t}" data-act="filter" data-f="${t}" ${ui.filter === t ? 'class="primary"' : ''}>${t === 'all' ? 'All' : t === 'saved' ? 'Saved' : KIND_LABEL[t] + 's'}</button>`).join('')}</div>
  <div style="margin-top:12px">${visible.length ? `<div class="grid">${visible.map(card).join('')}</div>` : `<p class="empty">${S.findings.length ? 'Nothing in this filter.' : 'No research yet. Run the scout, or add something you found yourself. Results show up here with their sources.'}</p>`}</div>`;
}

const find = (S, el) => S.findings.find(f => f.id === el.dataset.id);

const actions = {
  filter(el, S) { S.ui.scout.filter = el.dataset.f; },
  async run(el, S) {
    const ui = S.ui.scout;
    if (ui.running) return false;
    ui.running = true; ui.error = ''; ui.lastKind = el.dataset.kind;
    ui.ctrl = new AbortController();
    render();
    const run = { id: uid(), kind: ui.lastKind, started: new Date().toISOString(), model: MODEL };
    try {
      const { apiKey } = S;
      const r = await runScout({ apiKey, profile: S.profile, kind: ui.lastKind, signal: ui.ctrl.signal });
      const created = new Date().toISOString();
      const items = [
        ...r.trends.map(t => ({ kind: 'trend', ...t })),
        ...r.niches.map(n => ({ kind: 'niche', title: n.name, ...n })),
        ...r.questions.map(q => ({ kind: 'question', title: q.question, evidence: [{ url: q.url, date: '', quote: '' }] })),
      ];
      for (const f of items) await save('findings', { id: uid(), source: 'ai', status: 'new', created, runId: run.id, retrievedAt: r.retrievedAt, ...f });
      Object.assign(run, { finished: created, kept: items.length, dropped: r.droppedEvidence, usage: r.usage, searchErrors: r.searchErrors, notes: r.notes });
      setStatus(items.length ? `${items.length} finding${items.length === 1 ? "" : "s"} with sources` : 'No findings with sources this time');
      if (!items.length) ui.error = `Nothing came back with a verifiable source${r.searchErrors.length ? ` (search errors: ${r.searchErrors.join(', ')})` : ''}. Try again or change your topics in Setup.`;
    } catch (e) {
      run.error = e.message; run.finished = new Date().toISOString();
      ui.error = e.message;
    } finally {
      ui.running = false; ui.ctrl = null;
      await save('runs', run).catch(() => {});
    }
  },
  cancel(_, S) { S.ui.scout.ctrl?.abort(); return false; },
  async keep(el, S) { await save('findings', { ...find(S, el), status: 'saved' }); },
  async unsave(el, S) { await save('findings', { ...find(S, el), status: 'new' }); },
  async dismiss(el, S) { const f = find(S, el); if (f.source === 'manual' && !f.sample) await remove('findings', f.id); else await save('findings', { ...f, status: 'dismissed' }); setStatus('Dismissed'); },
  addNote() {
    openDialog(`<form data-form="saveNote"><h2 id="dialog-title">Add research</h2>
      <label>Type <select name="kind">${opt('note', 'Research note')}${opt('trend', 'Trend I noticed')}${opt('question', 'Audience question')}${opt('niche', 'Niche idea')}</select></label>
      <label>Title <input name="title" required maxlength="200"></label>
      <label>Source link <input name="url" type="url" placeholder="https://…"></label>
      <label>Source date <input name="date" type="date" max="${today()}"></label>
      <label>What it shows / why it matters <textarea name="note"></textarea></label>
      <div class="row"><button class="primary" type="submit">Save</button><button type="button" data-act="close">Cancel</button></div></form>`);
    return false;
  },
  async saveNote(form) {
    const d = formData(form);
    if (!d.title.trim()) throw new Error('Give it a title.');
    if (d.url && !safeUrl(d.url)) throw new Error('The source link must start with http:// or https://');
    const evidence = d.url ? [{ url: d.url, date: d.date, quote: '' }] : [];
    await save('findings', { id: uid(), kind: d.kind, source: 'manual', status: 'saved', created: new Date().toISOString(), title: d.title.trim(), note: d.note.trim(), why: d.note.trim(), evidence, platforms: [], momentum: 'unknown', fit: 'unknown' });
    closeDialog(); setStatus('Saved to your research log');
  },
  close() { closeDialog(); return false; },
  makeIdea(el, S) {
    const f = find(S, el);
    const p = S.profile;
    openDialog(`<form data-form="createIdea" data-id="${esc(f.id)}"><h2 id="dialog-title">New idea from "${esc(f.title)}"</h2>
      <label>Idea <input name="title" required value="${esc(f.ideas?.[0] || f.title.replace(/^SAMPLE: /, ''))}"></label>
      <label>Goal it serves <select name="goal" required>${p.goals.map(g => opt(g, g, p.mainGoal)).join('')}</select></label>
      <label>Platform <select name="platform">${p.platforms.map(x => opt(x, PLATFORM_LABEL[x], f.platforms?.[0])).join('')}</select></label>
      <label>Format <input name="format" value="${esc(f.format || '')}" placeholder="e.g. Tutorial, Story, List"></label>
      <p class="small muted">Linked evidence: ${(f.evidence || []).map(e => link(e.url)).join(', ') || 'none'}</p>
      <div class="row"><button class="primary" type="submit">Create idea</button><button type="button" data-act="close">Cancel</button></div></form>`);
    return false;
  },
  async createIdea(form, S) {
    const d = formData(form);
    const f = S.findings.find(x => x.id === form.dataset.id);
    if (!d.title.trim() || !d.goal) throw new Error('An idea needs a title and a goal.');
    await save('items', newItem({ title: d.title.trim(), goal: d.goal, platform: d.platform, format: d.format.trim(), trendIds: f ? [f.id] : [], sample: !!f?.sample }));
    if (f && f.status !== 'saved') await save('findings', { ...f, status: 'saved' });
    closeDialog(); setStatus('Idea added to Plan');
  },
};

export default { render: render_, actions };
