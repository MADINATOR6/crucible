import { esc, badge, link, setStatus, openDialog, closeDialog, formData, opt, fmtNum } from '../ui.js';
import { save, newItem } from '../app.js';
import { importCsv, PLATFORM_LABEL, METRIC_LABEL, engagementRate } from '../importer.js';
import { matchPost, move } from '../pipeline.js';
import { buildInsights, choosePosts } from '../insights.js';
import { uid } from '../db.js';

// Items used for hypotheses follow the same rule as posts: SAMPLE only while no real data exists.
const itemsFor = (S, plat, usingSample) => S.items.filter(i => i.platform === plat && i.metrics && !!i.sample === usingSample);

const pct = r => (r == null ? '—' : `${(r * 100).toFixed(1)}%`);

function table(posts) {
  if (!posts.length) return '';
  return `<div class="table-wrap"><table><thead><tr><th scope="col">Post</th><th scope="col">Views</th><th scope="col">Eng. rate</th><th scope="col">New followers</th><th scope="col">Clicks</th></tr></thead><tbody>
    ${posts.map(p => `<tr><td>${p.sample ? badge('SAMPLE', 'sample') + ' ' : ''}${p.url ? link(p.url, p.title || p.url) : esc(p.title)}${p.date ? ` <span class="muted small">${esc(p.date)}</span>` : ''}</td><td>${fmtNum(p.metrics.views)}</td><td>${pct(engagementRate(p.metrics))}</td><td>${fmtNum(p.metrics.follows)}</td><td>${fmtNum(p.metrics.clicks)}</td></tr>`).join('')}</tbody></table></div>`;
}

function render_(S) {
  const ui = S.ui.results ||= {};
  const chosen = choosePosts(S.posts);
  const platforms = [...new Set(chosen.map(p => p.platform))];
  const plat = platforms.includes(ui.platform) ? ui.platform : platforms[0];
  const posts = chosen.filter(p => p.platform === plat);
  const r = buildInsights(posts, itemsFor(S, plat, chosen.usingSample));
  const lastImports = [...S.imports].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  // Revenue is only added up within one currency; mixed currencies are listed separately.
  const byCur = new Map();
  for (const p of posts) if (p.metrics.revenue != null) byCur.set(p.currency || 'no currency', (byCur.get(p.currency || 'no currency') || 0) + p.metrics.revenue);
  const revenueKpi = byCur.size > 1
    ? `<span class="muted small">Revenue (mixed currencies)</span><b class="small">${[...byCur].map(([c, v]) => `${fmtNum(v)} ${esc(c)}`).join('<br>')}</b>`
    : `<span class="muted small">Revenue${byCur.size ? ` (${esc([...byCur.keys()][0])})` : ''}</span><b>${byCur.size ? fmtNum([...byCur.values()][0]) : '—'}</b>`;
  return `
  <h1>Results</h1>
  <p class="sub">What worked, what did not, and what to try next. Numbers come only from files you import.</p>
  <form data-form="import" class="card" aria-label="Import analytics">
    <h2 style="margin-top:0">Import an analytics export (CSV)</h2>
    <p class="small muted">TikTok Studio, Instagram (Meta Business Suite) and YouTube Studio can each export post analytics as CSV. Columns are matched by name; anything not recognised is listed, never guessed. Re-importing a newer export updates each post instead of adding to it.</p>
    <div class="row"><label style="margin:0">Platform <select name="platform" required>${S.profile.platforms.map(p => opt(p, PLATFORM_LABEL[p], ui.importPlatform)).join('')}</select></label>
      <label style="margin:0;flex:1;min-width:200px">File <input type="file" name="file" accept=".csv,text/csv,text/comma-separated-values,application/csv,application/vnd.ms-excel,text/plain" required></label>
      <button class="primary" type="submit">Import</button></div>
  </form>
  ${ui.report ? `<div class="banner ${ui.report.errors?.length ? 'error' : 'info'}" role="status">${ui.report.html}</div>` : ''}
  ${lastImports.length ? `<details class="card"><summary>Import history (${S.imports.length})</summary><ul class="small">${lastImports.map(x => `<li>${esc(x.at.slice(0, 16).replace('T', ' '))} · ${esc(PLATFORM_LABEL[x.platform])} · ${esc(x.filename)} · ${esc(x.count)} posts, ${esc(x.linked)} linked${x.unmatched?.length ? ` · unrecognised: ${esc(x.unmatched.join(', '))}` : ''}</li>`).join('')}</ul></details>` : ''}
  ${!S.posts.length ? '<p class="empty">No results yet. Import a CSV above, or load SAMPLE data in Setup to see how this page works.</p>' : `
  ${chosen.usingSample ? '<div class="banner warn"><b>SAMPLE data.</b> These numbers are made up to show the layout. Import your own CSV to replace them.</div>' : ''}
  <div class="row" role="tablist" aria-label="Platform">${platforms.map(p => `<button type="button" role="tab" aria-selected="${p === plat}" data-act="plat" data-p="${esc(p)}" ${p === plat ? 'class="primary"' : ''}>${esc(PLATFORM_LABEL[p] || p)}</button>`).join('')}</div>
  <p class="small muted">Rankings compare ${esc(PLATFORM_LABEL[plat] || plat)} posts only, by views.</p>
  ${r.summary ? `<div class="kpis">
    <div class="kpi"><span class="muted small">Posts with views</span><b>${posts.filter(p => p.metrics.views != null).length}</b></div>
    <div class="kpi"><span class="muted small">Total views</span><b>${fmtNum(r.summary.views)}</b></div>
    <div class="kpi"><span class="muted small">Median views</span><b>${fmtNum(r.summary.medianViews)}</b></div>
    <div class="kpi"><span class="muted small">New followers</span><b>${fmtNum(r.summary.follows)}</b></div>
    <div class="kpi"><span class="muted small">Link clicks</span><b>${fmtNum(r.summary.clicks)}</b></div>
    <div class="kpi">${revenueKpi}</div>
  </div>
  <h2>Observations <span class="small muted">facts from your data</span></h2>
  <ul>${r.observations.map(o => `<li>${esc(o.text)}</li>`).join('')}</ul>
  <h2>Hypotheses <span class="small muted">guesses to test, not facts</span></h2>
  ${r.hypotheses.length ? `<ul>${r.hypotheses.map(h => `<li>${esc(h.text)} ${badge(`${h.sample} post${h.sample > 1 ? 's' : ''}, ${h.confidence} confidence`)}</li>`).join('')}</ul>` : '<p class="small muted">None yet. Hypotheses need posts that are linked to planned items (mark items posted with their link, then import).</p>'}
  <h2>Try next</h2>
  ${r.actions.length ? r.actions.map((a, n) => `<div class="card row between"><div>${esc(a.text)}<br><span class="small muted">Why: ${esc(a.reason)}</span></div><button type="button" class="primary" data-act="toIdea" data-n="${n}">Turn into idea</button></div>`).join('') : '<p class="small muted">No recommendations from this data yet.</p>'}
  <h2>Top posts</h2>${table(r.top)}
  ${r.bottom.length ? `<h2>Lowest posts</h2>${table(r.bottom)}` : ''}` : '<p class="empty">These posts have no view counts, so nothing can be ranked. Import an export that includes views.</p>'}`}`;
}

const actions = {
  plat(el, S) { S.ui.results.platform = el.dataset.p; },
  async import(form, S) {
    const ui = S.ui.results;
    const platform = form.platform.value, file = form.file.files?.[0];
    ui.importPlatform = platform;
    if (!file) throw new Error('Choose a CSV file.');
    if (file.size > 20e6) throw new Error('That file is over 20 MB. Export a shorter date range.');
    const text = await file.text();
    const r = importCsv(text, platform);
    if (S.imports.some(x => x.hash === r.hash && x.platform === platform)) { ui.report = { html: `<b>Already imported.</b> ${esc(file.name)} is identical to an earlier import; nothing changed.` }; return; }
    if (r.errors.length) { ui.report = { errors: r.errors, html: `<b>Not imported.</b><ul>${r.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>${r.unmatched.length ? `Columns not recognised: ${esc(r.unmatched.join(', '))}` : ''}` }; return; }
    let linked = 0;
    for (const p of r.posts) {
      const item = matchPost(S.items, p);
      await save('posts', { ...p, itemId: item?.id || null });
      if (item) {
        linked++;
        const patched = { ...item, metrics: p.metrics, measuredBy: p.id };
        const m = item.stage === 'posted' ? move(patched, 'measured') : { ok: true, item: patched };
        await save('items', m.ok ? m.item : patched);
      }
    }
    const mapped = Object.entries(r.mapping).map(([k, h]) => `${METRIC_LABEL[k] || k} ← "${h}"`).join(', ');
    await save('imports', { id: uid(), at: new Date().toISOString(), platform, filename: file.name, hash: r.hash, count: r.posts.length, linked, skipped: r.skipped, unmatched: r.unmatched, mapping: r.mapping });
    ui.platform = platform;
    ui.report = { html: `<b>Imported ${r.posts.length} ${esc(PLATFORM_LABEL[platform])} posts</b>, ${linked} linked to your pipeline${r.skipped ? `, ${r.skipped} summary/empty rows skipped` : ''}.<br><span class="small">Columns used: ${esc(mapped)}</span>${r.unmatched.length ? `<br><span class="small">Not recognised (ignored): ${esc(r.unmatched.join(', '))}</span>` : ''}${r.warnings.map(w => `<br><span class="small">⚠ ${esc(w)}</span>`).join('')}` };
    setStatus('Import done');
  },
  toIdea(el, S) {
    const chosen = choosePosts(S.posts), ui = S.ui.results;
    const plat = [...new Set(chosen.map(p => p.platform))].includes(ui.platform) ? ui.platform : chosen[0]?.platform;
    const r = buildInsights(chosen.filter(p => p.platform === plat), itemsFor(S, plat, chosen.usingSample));
    const a = r.actions[Number(el.dataset.n)];
    if (!a) return;
    ui.pending = { ...a, platform: plat, sample: chosen.usingSample };
    openDialog(`<form data-form="createFromResult"><h2 id="dialog-title">Turn into idea</h2>
      <p class="small muted">From Results: ${esc(a.reason)}</p>
      <label>Idea <input name="title" required value="${esc(a.text)}"></label>
      <label>Goal it serves <select name="goal" required>${S.profile.goals.map(g => opt(g, g, S.profile.mainGoal)).join('')}</select></label>
      <div class="row"><button class="primary" type="submit">Create idea</button><button type="button" data-act="close">Cancel</button></div></form>`);
    return false;
  },
  async createFromResult(form, S) {
    const p = S.ui.results.pending, d = formData(form);
    if (!d.title.trim() || !d.goal) throw new Error('An idea needs a title and a goal.');
    await save('items', newItem({ title: d.title.trim(), goal: d.goal, platform: p.platform, format: p.format || '', fromResult: { reason: p.reason, postId: p.post?.id || null }, sample: !!p.sample }));
    closeDialog(); setStatus('Idea added to Plan');
  },
  close() { closeDialog(); return false; },
};

export default { render: render_, actions };
