// Crucible Cockpit frontend. All data is rendered with textContent; nothing from a source becomes HTML.
const token = document.querySelector('meta[name="cockpit-token"]').content;
const $ = (id) => document.getElementById(id);
let view = null;
let receivedAt = 0;

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const fill = (el, ...nodes) => { el.replaceChildren(...nodes.flat().filter(Boolean)); };

function ago(input) {
  let seconds;
  if (typeof input === 'number') seconds = input + (Date.now() - receivedAt) / 1000;
  else { const t = Date.parse(input); if (Number.isNaN(t)) return 'n/a'; seconds = (Date.now() - t) / 1000; }
  seconds = Math.max(0, Math.round(seconds));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 172800) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
const num = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : 'n/a');
const na = (reason) => h('span', { class: 'na', text: `n/a — ${reason}` });

function renderTop(v) {
  const t = v.task;
  $('task-title').textContent = t?.title || 'n/a — TASK.md unavailable or has no # heading';
  fill($('task-meta'),
    t ? h('span', { class: 'mono' }, t.id ? `ID ${t.id}` : 'no Task ID') : null,
    t?.mode ? h('span', { class: 'pill' }, `mode ${t.mode}`) : null,
    t ? h('span', { class: 'muted' }, `TASK.md changed ${ago(t.ageSeconds)}`) : null);
  fill($('allowlist'), t?.allowlist?.length ? t.allowlist.map((p) => h('span', { class: 'chip mono', title: 'Safe to modify (TASK.md write allowlist)' }, p)) : [na('no allowlist heading in TASK.md')]);

  const b = v.budget;
  if (b.available) {
    const pct = Math.max(0, Math.min(100, (b.used / b.target) * 100));
    const level = pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'ok';
    fill($('budget'),
      h('div', { class: 'label' }, `Token budget · ${b.taskId} (${b.class})`),
      h('div', { class: `gauge ${level}`, role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(b.target), 'aria-valuenow': String(b.used), 'aria-label': 'Effective tokens used' }, h('span', { style: null, class: 'gauge-fill', 'data-pct': String(Math.round(pct)) })),
      h('div', { class: 'budget-nums mono' }, `${num(b.remaining)} left of ${num(b.target)}`, h('span', { class: 'muted' }, ` · dispatches ${b.dispatchesUsed ?? 'n/a'}/${b.maxDispatches ?? 'n/a'}`)),
      h('div', { class: 'fine' }, b.unit));
    $('budget').querySelector('.gauge-fill').style.width = `${pct}%`;
  } else {
    fill($('budget'), h('div', { class: 'label' }, 'Token budget'), h('div', { class: 'gauge empty' }), h('div', { class: 'fine' }, `n/a — ${b.reason}`));
  }
}

function roleTag(agent, role, status) {
  return h('span', { class: `role role-${(status || 'none').replace(/\s/g, '-')}` }, `${agent.toUpperCase()}: [${role || 'NO ROLE'}]`);
}

function renderAgents(v) {
  fill($('agents'), v.agents.map((a) => h('article', { class: `card agent agent-${a.name.toLowerCase()} ${a.status === 'active' ? 'is-active' : ''}` },
    h('div', { class: 'agent-head' },
      h('div', { class: 'avatar', 'aria-hidden': 'true' }, a.name[0]),
      h('div', {}, h('div', { class: 'agent-name' }, a.name), h('div', { class: 'agent-status' }, a.status === 'active' ? `active · ${a.phase}` : a.status === 'next' ? `next · ${a.phase}` : a.status)),
      roleTag(a.name, a.role, a.status)),
    a.roles.length ? h('ul', { class: 'agent-roles' }, a.roles.map((r) => h('li', { class: `st-${r.status}` }, h('span', { class: 'mono' }, `P${r.n}`), ` ${r.name} `, h('span', { class: 'mono muted' }, `[${r.role}] ${r.status}`)))) : h('p', { class: 'fine' }, 'No role lines for this agent in COLLAB.md.'),
    a.waitingFor.length ? h('div', { class: 'agent-wait' }, `Waiting on ${a.name}: ${a.waitingFor.join(', ')}`) : null,
    h('div', { class: 'agent-branches' },
      h('div', { class: 'label' }, `${a.name.toLowerCase()}/* branches · newest commit`),
      a.branches.length ? a.branches.map((b) => h('div', { class: 'branch mono small' },
        h('span', { class: 'branch-name' }, b.name),
        h('span', { class: 'muted' }, ` ${b.sha} · ${ago(b.committedAt)}`),
        b.worktree ? h('span', { class: 'pill' }, 'worktree') : null)) : h('div', { class: 'fine' }, 'none'),
      h('div', { class: 'fine' }, 'Commit times are evidence of past work, not proof an agent is editing now.'),
      a.lastDispatch ? h('div', { class: 'fine' }, `Last ccx dispatch recorded ${ago(a.lastDispatch)}`) : null))));
  const g = v.git;
  fill($('git'),
    h('div', {}, `${g.branch || 'n/a'} @ ${g.head || 'n/a'}`),
    g.upstream ? h('div', { class: g.upstream.ahead ? 'warn-text' : 'muted' }, `${g.upstream.ahead} ahead · ${g.upstream.behind} behind ${g.upstream.name}`) : h('div', { class: 'muted' }, 'no upstream'));
}

function renderLoop(v) {
  const l = v.loop;
  $('loop-summary').textContent = l.summary;
  $('loop-phase').textContent = v.collab ? `${v.collab.title || 'COLLAB.md'} · Phase: ${v.collab.phase || 'n/a'} · COLLAB.md changed ${ago(v.collab.ageSeconds)}` : 'n/a — handoffs/COLLAB.md unavailable';
  fill($('pipeline'), l.phases.length ? l.phases.map((p, i) => h('li', { class: `node st-${p.status} agent-${(p.agent || 'x').toLowerCase()}` },
    i ? h('span', { class: 'link', 'aria-hidden': 'true' }) : null,
    h('div', { class: 'node-box' },
      h('div', { class: 'node-top' }, h('span', { class: 'mono muted' }, `PHASE ${p.n}`), h('span', { class: `state st-${p.status}` }, p.status)),
      h('div', { class: 'node-name' }, p.name),
      h('div', { class: 'node-who mono' }, `${p.agent} [${p.role}]`)))) : [h('li', { class: 'empty' }, na('no role lines in the cockpit format in COLLAB.md'))]);

  fill($('flags'), v.flags.length ? v.flags.map((f) => h('div', { class: `flag sev-${f.severity}`, role: f.severity === 'error' ? 'alert' : null }, h('span', { class: 'flag-kind mono' }, f.kind.toUpperCase()), ' ', f.text)) : [h('div', { class: 'flag sev-ok' }, h('span', { class: 'flag-kind mono' }, 'CLEAR'), ' No silence, deadlock or waiting questions detected')]);

  const items = v.task?.items || [];
  const open = items.filter((i) => !i.done);
  $('queue-count').textContent = items.length ? `${items.length - open.length}/${items.length} done${v.task.unassigned ? ` · ${v.task.unassigned} unassigned` : ''}` : '';
  fill($('tasks'), items.length ? [...open, ...items.filter((i) => i.done)].map((i) => h('li', { class: `${i.done ? 'done' : ''} ${!i.done && !i.owner ? 'unassigned' : ''}` },
    h('span', { class: 'box', 'aria-hidden': 'true' }, i.done ? '✓' : ''),
    h('span', { class: `owner owner-${(i.owner || 'none').toLowerCase()}` }, i.owner || 'unassigned'),
    h('span', { class: 'task-text' }, i.text))) : [h('li', {}, na('no Done When / Acceptance checklist in TASK.md'))]);
  fill($('decisions'), v.collab?.decisions.length ? v.collab.decisions.map((d) => h('li', {}, d)) : [h('li', {}, na('no Decisions list'))]);
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cockpit-Token': token }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const drafts = new Map(); // keep typed notes across re-renders
function renderReview(v) {
  const items = v.review.items;
  const pending = items.filter((i) => !i.decision);
  $('review-count').textContent = pending.length ? `${pending.length} waiting` : 'clear';
  $('review-count').className = `badge ${pending.length ? 'badge-warn' : 'badge-ok'}`;
  fill($('review'), items.length ? items.map((it) => {
    const note = h('textarea', { rows: '2', maxlength: '2000', placeholder: 'Note for the agents (optional)', 'aria-label': `Note for ${it.title}` });
    note.value = drafts.get(it.key) || '';
    note.addEventListener('input', () => drafts.set(it.key, note.value));
    const msg = h('span', { class: 'form-msg', role: 'status' });
    const decide = (decision) => async (e) => {
      e.target.disabled = true;
      try {
        const r = await post('/api/approvals', { key: it.key, decision, item: it.title, note: note.value });
        drafts.delete(it.key);
        msg.textContent = `Recorded ${r.id} in ${r.file}`;
        e.target.blur(); // let the next snapshot redraw this pane
      } catch (error) { msg.textContent = `Not recorded: ${error.message}`; e.target.disabled = false; }
    };
    return h('div', { class: `review-item ${it.decision ? 'decided' : ''}` },
      h('div', { class: 'review-top' }, h('span', { class: 'pill' }, it.kind), it.level ? h('span', { class: 'pill pill-warn' }, it.level) : null, h('span', { class: 'mono muted small' }, it.source)),
      h('div', { class: 'review-title' }, it.title),
      it.note ? h('div', { class: 'fine' }, it.note) : null,
      it.command ? h('div', { class: 'fine' }, 'ccx itself still needs: ', h('code', {}, it.command)) : null,
      it.decision ? h('div', { class: `decision dec-${it.decision.decision}` }, `${it.decision.id} ${it.decision.decision} · ${it.decision.at || ''}${it.decision.note && it.decision.note !== '(none)' ? ` · ${it.decision.note}` : ''}`) : null,
      note,
      h('div', { class: 'review-actions' }, msg,
        h('button', { type: 'button', class: 'secondary', onclick: decide('changes-requested') }, 'Request changes'),
        h('button', { type: 'button', onclick: decide('approved') }, 'Approve')));
  }) : [h('p', { class: 'fine' }, 'Nothing is waiting for you: no pending ccx approvals, [WAITING FOR HUMAN] tags, questions addressed to Human, or unpushed commits.')]);
  fill($('decision-log'), v.review.decisions.length ? v.review.decisions.map((d) => h('li', {}, `${d.id} [${d.decision}] ${d.key} · ${d.at || ''}`)) : [h('li', {}, 'No decisions recorded yet')]);
}

function renderFeed(v) {
  const q = v.queue;
  $('qa-meta').textContent = `${q.open} open · QUEUE.md changed ${q.ageSeconds === null ? 'n/a' : ago(q.ageSeconds)}${q.malformed ? ` · ${q.malformed} heading(s) not in the queue format` : ''}`;
  fill($('feed'), q.entries.length ? q.entries.map((e) => h('div', { class: `msg from-${e.from.toLowerCase()} st-${e.state}` },
    h('div', { class: 'msg-head mono small' }, h('span', { class: 'msg-id' }, e.id), ` ${e.from} → ${e.to} `, h('span', { class: `state st-${e.state === 'open' ? 'active' : 'done'}` }, e.state)),
    h('div', { class: 'msg-title' }, e.title),
    e.body.length ? h('div', { class: 'msg-body' }, e.body.join(' ')) : null,
    e.answers.map((a) => h('div', { class: `answer from-${a.by.toLowerCase()}` }, h('span', { class: 'mono small' }, `${a.by}: `), a.text)))) : [h('p', { class: 'fine' }, 'No questions in handoffs/QUEUE.md')]);
}

function renderHealth(v) {
  fill($('health'), v.health.map((s) => h('span', { class: `hchip h-${['ok'].includes(s.status) ? 'ok' : ['missing', 'partial'].includes(s.status) ? 'warn' : 'bad'}`, title: `${s.path}${s.detail ? ' — ' + s.detail : ''}` }, `${s.name}: ${s.status}`)),
    h('span', { class: 'muted small' }, `snapshot ${new Date(v.generatedAt).toLocaleTimeString()} · silence threshold ${v.silenceMinutes} min`));
}

function render() {
  if (!view) return;
  // Do not wipe a note the user is typing: skip the approval pane while one of its fields has focus.
  const typing = document.activeElement && document.activeElement.closest('#review');
  for (const fn of [renderTop, renderAgents, renderLoop, renderFeed, renderHealth, ...(typing ? [] : [renderReview])]) {
    try { fn(view); } catch (error) { console.error(fn.name, error); }
  }
}

function setLive(state, text) {
  $('live').className = `live live-${state}`;
  $('live-text').textContent = text;
}

$('ask-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const r = await post('/api/questions', { to: form.to.value, title: form.title.value, body: form.body.value });
    $('ask-msg').textContent = `Added ${r.id} to ${r.file}`;
    form.title.value = ''; form.body.value = '';
  } catch (error) { $('ask-msg').textContent = `Not added: ${error.message}`; }
  button.disabled = false;
});

// ---------- prompt console ----------
const runs = new Map(); // id -> run, newest last
let availability = {};
const openRuns = new Set(); // run ids whose details the user expanded or that are newest

function fmtDuration(run) {
  const end = run.endedAt ? Date.parse(run.endedAt) : Date.now();
  const s = Math.max(0, Math.round((end - Date.parse(run.startedAt)) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const openActivity = new Set();
function activityBlock(r) {
  const block = h('details', { class: 'run-activity', open: openActivity.has(r.id) }, h('summary', {}, `Activity (${r.activity.length})`), h('pre', { class: 'mono small' }, r.activity.join('\n')));
  block.addEventListener('toggle', () => { if (block.open) openActivity.add(r.id); else openActivity.delete(r.id); });
  return block;
}

function renderRuns() {
  const list = [...runs.values()].reverse();
  const active = list.find((r) => r.status === 'running');
  $('prompt-cancel').hidden = !active;
  $('prompt-run').disabled = Boolean(active);
  const agent = document.querySelector('input[name="agent"]:checked').value;
  const a = availability[agent];
  $('console-avail').textContent = a ? (a.available ? `${agent} ready` : `${agent} unavailable — ${a.reason}`) : '';
  fill($('runs'), list.length ? list.map((r, i) => {
    const meta = [r.meta.model ? `model ${r.meta.model}` : null, fmtDuration(r), Number.isFinite(r.meta.costUsd) ? `$${r.meta.costUsd.toFixed(4)} reported` : null, r.meta.usage && Number.isFinite(r.meta.usage.output) ? `${num(r.meta.usage.output)} output tokens` : null, r.exitCode !== null && r.exitCode !== undefined ? `exit ${r.exitCode}` : null].filter(Boolean).join(' · ');
    const details = h('details', { class: `run run-${r.agent.toLowerCase()} rs-${r.status}`, open: openRuns.has(r.id) },
      h('summary', {},
        h('span', { class: 'mono msg-id' }, r.id), ' ',
        h('span', { class: `owner owner-${r.agent.toLowerCase()}` }, r.agent), ' ',
        h('span', { class: `state st-${r.status === 'running' ? 'active' : r.status === 'done' ? 'done' : 'blocked'}` }, r.status), ' ',
        h('span', { class: 'run-prompt' }, r.prompt.length > 140 ? r.prompt.slice(0, 139) + '…' : r.prompt)),
      h('div', { class: 'run-meta mono small muted' }, meta),
      r.prompt.length > 140 ? h('div', { class: 'run-full-prompt' }, r.prompt) : null,
      h('div', { class: 'run-reply' }, r.reply || (r.status === 'running' ? 'Waiting for the reply…' : '(no reply text)')),
      r.activity.length ? activityBlock(r) : null);
    details.addEventListener('toggle', () => { if (details.open) openRuns.add(r.id); else openRuns.delete(r.id); });
    return details;
  }) : [h('p', { class: 'fine' }, 'No runs yet. Replies are kept in this server session only (the last 20), not written to the repo.')]);
}

$('prompt-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = $('prompt').value;
  const agent = document.querySelector('input[name="agent"]:checked').value;
  if (!prompt.trim()) { $('prompt-msg').textContent = 'Type a prompt first'; return; }
  $('prompt-run').disabled = true;
  try {
    const r = await post('/api/runs', { agent, prompt });
    openRuns.add(r.run.id);
    runs.set(r.run.id, r.run);
    $('prompt').value = '';
    $('prompt-msg').textContent = `${r.run.id} started`;
  } catch (error) { $('prompt-msg').textContent = `Not started: ${error.message}`; }
  renderRuns();
});
$('prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('prompt-form').requestSubmit(); }
});
$('prompt-cancel').addEventListener('click', async () => {
  const active = [...runs.values()].find((r) => r.status === 'running');
  if (!active) return;
  try { await post(`/api/runs/${active.id}/cancel`, {}); $('prompt-msg').textContent = `Cancelling ${active.id}…`; } catch (error) { $('prompt-msg').textContent = `Cancel failed: ${error.message}`; }
});
for (const radio of document.querySelectorAll('input[name="agent"]')) radio.addEventListener('change', renderRuns);

const events = new EventSource('/events');
events.addEventListener('runs', (e) => {
  const data = JSON.parse(e.data);
  availability = data.availability || {};
  runs.clear();
  for (const r of [...data.runs].reverse()) runs.set(r.id, r);
  if (data.runs[0]) openRuns.add(data.runs[0].id);
  renderRuns();
});
events.addEventListener('run', (e) => {
  const r = JSON.parse(e.data);
  if (!runs.has(r.id)) openRuns.add(r.id); // a new run starts expanded
  runs.set(r.id, r);
  while (runs.size > 20) runs.delete(runs.keys().next().value);
  renderRuns();
});
events.addEventListener('snapshot', (e) => {
  view = JSON.parse(e.data);
  receivedAt = Date.now();
  render();
  setLive('on', `live · ${new Date().toLocaleTimeString()}`);
});
events.addEventListener('problem', (e) => setLive('warn', `refresh failed: ${JSON.parse(e.data).error}`));
events.onerror = () => setLive('off', 'reconnecting…');
setInterval(render, 15000); // keep "x ago" labels current between snapshots
setInterval(() => { if ([...runs.values()].some((r) => r.status === 'running')) renderRuns(); }, 1000); // live duration
