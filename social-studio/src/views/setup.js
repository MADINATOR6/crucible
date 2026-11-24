import { esc, setStatus, confirmDialog, formData } from '../ui.js';
import { saveProfile, saveKey, S as state } from '../app.js';
import * as db from '../db.js';
import { sampleData } from '../sample.js';
import { PLATFORMS, PLATFORM_LABEL } from '../importer.js';

export const GOALS = ['Grow followers', 'Engagement and community', 'Sales or leads', 'Build a personal brand'];
const list = s => String(s || '').split(/[\n,]/).map(x => x.trim()).filter(Boolean);

function render_(S) {
  const p = S.profile || { goals: GOALS, platforms: PLATFORMS, topics: [], competitors: [], voice: '', mainGoal: 'Sales or leads' };
  const first = !S.profile?.setupDone;
  const masked = S.apiKey ? `${S.apiKey.slice(0, 7)}…${S.apiKey.slice(-4)}` : '';
  const hasSample = ['findings', 'items', 'posts'].some(k => S[k].some(x => x.sample));
  return `
  <h1>${first ? 'Welcome to Social Studio' : 'Setup'}</h1>
  <p class="sub">${first ? 'Tell the team what you are aiming for. Everything stays on this device.' : 'Your goals, niche, brand voice and AI key.'}</p>
  <form data-form="profile" class="card" aria-label="Profile">
    <fieldset><legend>Goals (every idea is tied to one)</legend>
      ${GOALS.map(g => `<label class="check"><input type="checkbox" name="goal" value="${esc(g)}"${p.goals?.includes(g) ? ' checked' : ''}> ${esc(g)}</label>`).join('')}
    </fieldset>
    <label>Main goal
      <select name="mainGoal">${GOALS.map(g => `<option${g === p.mainGoal ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select>
    </label>
    <fieldset><legend>Platforms</legend>
      ${PLATFORMS.map(x => `<label class="check"><input type="checkbox" name="platform" value="${x}"${p.platforms?.includes(x) ? ' checked' : ''}> ${PLATFORM_LABEL[x]}</label>`).join('')}
    </fieldset>
    <label>Niche, topics or interests (comma separated; leave empty and use "Find niches" in Scout)
      <input name="topics" value="${esc((p.topics || []).join(', '))}" placeholder="e.g. budget cooking, AI tools">
    </label>
    <label>Competitors or creators to watch (handles or links, comma separated)
      <input name="competitors" value="${esc((p.competitors || []).join(', '))}" placeholder="@creator, https://…">
    </label>
    <label>Brand voice
      <input name="voice" value="${esc(p.voice || '')}" placeholder="e.g. direct, funny, no hype">
    </label>
    <button class="primary" type="submit">${first ? 'Save and start' : 'Save'}</button>
  </form>

  <form data-form="key" class="card" aria-label="Claude API key">
    <h2 style="margin-top:0">Claude API key (for AI scouting and drafts)</h2>
    <p class="small muted">Stored only in this browser on this device and sent only to api.anthropic.com. It is never included in backups. Each scout run is billed to your Anthropic account; the token count is shown after each run. Anyone with access to this device's browser profile could read it.</p>
    ${S.apiKey ? `<p>Saved key: <code>${esc(masked)}</code></p>` : '<p class="banner warn">No key yet: Scout and AI drafts are off until you add one. Everything else works.</p>'}
    <label>New key <input name="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…"></label>
    <div class="row"><button type="submit">Save key</button>${S.apiKey ? '<button type="button" class="danger" data-act="forgetKey">Forget key</button>' : ''}</div>
  </form>

  <section class="card" aria-label="Data">
    <h2 style="margin-top:0">Your data</h2>
    <p class="small muted">Only on this device. Export a backup now and then; clearing browser data deletes it.</p>
    <div class="row">
      <button type="button" data-act="export">Export backup</button>
      <label class="btn" style="margin:0">Import backup<input type="file" accept="application/json,.json" data-change="importBackup" class="sr"></label>
      ${hasSample ? '<button type="button" data-act="removeSample">Remove SAMPLE data</button>' : '<button type="button" data-act="loadSample">Load SAMPLE data to try it</button>'}
      <button type="button" class="danger" data-act="wipe">Delete everything</button>
    </div>
  </section>`;
}

const actions = {
  async profile(form) {
    const f = new FormData(form);
    const goals = f.getAll('goal'), platforms = f.getAll('platform');
    if (!goals.length) throw new Error('Pick at least one goal.');
    if (!platforms.length) throw new Error('Pick at least one platform.');
    const d = formData(form);
    const mainGoal = goals.includes(d.mainGoal) ? d.mainGoal : goals[0];
    const wasFirst = !state.profile?.setupDone;
    await saveProfile({ goals, platforms, mainGoal, topics: list(d.topics), competitors: list(d.competitors), voice: d.voice.trim(), setupDone: true });
    setStatus('Saved');
    if (wasFirst) { location.hash = '#scout'; return false; }
  },
  async key(form) {
    const k = formData(form).apiKey.trim();
    if (!k) throw new Error('Paste a key first.');
    if (!/^sk-ant-[\w-]{10,}$/.test(k)) throw new Error('That does not look like an Anthropic API key (it starts with sk-ant-).');
    await saveKey(k);
    setStatus('Key saved on this device');
  },
  async forgetKey() {
    if (!(await confirmDialog('Forget the API key?', 'Scout and AI drafts stop until you add a key again.', 'Forget key', true))) return false;
    await saveKey('');
    setStatus('Key removed');
  },
  async export() {
    const data = await db.exportAll();
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: `social-studio-backup-${new Date().toISOString().slice(0, 10)}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setStatus('Backup downloaded');
    return false;
  },
  async importBackup(input) {
    const file = input.files?.[0];
    if (!file) return false;
    let data;
    try { data = JSON.parse(await file.text()); } catch { throw new Error('That file is not valid JSON.'); }
    await db.importAll(data);
    location.reload();
    return false;
  },
  async loadSample(_, S) {
    const d = sampleData();
    for (const k of ['findings', 'items', 'posts']) for (const o of d[k]) { await db.put(k, o); S[k].push(o); }
    setStatus('SAMPLE data loaded. It is labelled everywhere and can be removed here.');
  },
  async removeSample(_, S) {
    for (const k of ['findings', 'items', 'posts']) {
      for (const o of S[k].filter(x => x.sample)) await db.del(k, o.id);
      S[k] = S[k].filter(x => !x.sample);
    }
    setStatus('SAMPLE data removed');
  },
  async wipe() {
    if (!(await confirmDialog('Delete everything?', 'This removes all research, content, results and your key from this device. It cannot be undone. Export a backup first if you might want it.', 'Delete everything', true))) return false;
    for (const st of ['findings', 'items', 'posts', 'imports', 'runs']) await db.clear(st);
    await db.setKv('profile', null); await db.setKv('apiKey', '');
    location.reload();
    return false;
  },
};

export default { render: render_, actions };
