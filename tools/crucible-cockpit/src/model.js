// Cockpit view model: pure functions from collected data to what the UI shows. No I/O.
// Reading and the shared parsers come from crucible-monitor (reviewed, committed at 4c1f21d).
import { createHash } from 'node:crypto';
import { parseTask, budgetFor, effectiveTokens, dispatchRecords } from '../../crucible-monitor/src/panels.js';
import { clean, toDate } from '../../crucible-monitor/src/text.js';

export const AGENTS = ['Claude', 'Codex'];
const ROLE = /^Phase\s+(\d+)\s+(.+?):\s*(Claude|Codex|Human)\s*\[(PLAN|IMPLEMENT|REVIEW|RESEARCH|VERIFY)\]\s*(?:\((done|active|pending|blocked)\))?\s*$/i;
const QUESTION = /^###\s+(Q-\d+)\s+\[(open|answered)\]\s+(\S+)\s*->\s*([^:]+?)\s*:\s*(.*)$/i;
const ANSWER = /^Answer\s*\(([^,)]+)[^)]*\)\s*:?\s*(.*)$/i;
const DECISION = /^###\s+(AP-\d+)\s+\[(approved|changes-requested)\]\s+(\S+)\s*$/i;
const WAITING = /\[WAITING FOR HUMAN\]/i;

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const agentName = (v) => AGENTS.find((a) => a.toLowerCase() === String(v || '').trim().toLowerCase()) || (String(v || '').trim().toLowerCase() === 'human' ? 'Human' : null);
const iso = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);
const hash = (text) => createHash('sha1').update(text).digest('hex').slice(0, 10);

// The newest task is the first `# ` section of COLLAB.md.
export function topSection(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const start = lines.findIndex((l) => /^#\s/.test(l));
  if (start < 0) return { title: null, text };
  const next = lines.findIndex((l, i) => i > start && /^#\s/.test(l));
  return { title: lines[start].replace(/^#\s+/, '').trim(), text: lines.slice(start, next < 0 ? undefined : next).join('\n') };
}

function bulletsUnder(text, headingRe) {
  const out = [];
  let inside = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (/^#{1,6}\s/.test(line)) { inside = headingRe.test(line.replace(/^#+\s*/, '')); continue; }
    if (inside && /^\s*[-*]\s+/.test(line)) out.push(line.replace(/^\s*[-*]\s+/, '').trim());
  }
  return out;
}

export function parseCollabSection(text) {
  const top = topSection(text);
  const value = (re) => { const m = re.exec(top.text); return m ? m[1].trim() : null; };
  const roleLines = bulletsUnder(top.text, /^roles\b/i);
  const phases = [];
  const other = [];
  for (const line of roleLines) {
    const m = ROLE.exec(line);
    if (m) phases.push({ n: Number(m[1]), name: clean(m[2], 80), agent: agentName(m[3]), role: m[4].toUpperCase(), status: (m[5] || 'unknown').toLowerCase() });
    else other.push(clean(line, 200));
  }
  phases.sort((a, b) => a.n - b.n);
  return {
    title: top.title ? clean(top.title, 120) : null,
    phase: value(/^Phase:\s*(.+)$/m),
    participants: value(/^Participants:\s*(.+)$/m),
    phases,
    unparsedRoles: other,
    decisions: bulletsUnder(top.text, /^decisions\b/i).map((d) => clean(d, 300)),
    review: bulletsUnder(top.text, /^review/i).map((d) => clean(d, 300)),
  };
}

export function parseQueueFeed(text) {
  const entries = [];
  let current = null;
  let malformed = 0;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('### ')) {
      const m = QUESTION.exec(line);
      if (m) entries.push(current = { id: m[1], state: m[2].toLowerCase(), from: clean(m[3], 20), to: clean(m[4], 20), title: clean(m[5], 200), body: [], answers: [] });
      else { malformed++; current = null; }
      continue;
    }
    if (!current || !line.trim() || /^#{1,2}\s/.test(line)) continue;
    const a = ANSWER.exec(line.trim());
    if (a) current.answers.push({ by: clean(a[1], 20), text: clean(a[2], 1000) });
    else if (current.answers.length) current.answers[current.answers.length - 1].text += ' ' + clean(line.trim(), 1000);
    else current.body.push(clean(line.trim(), 1000));
  }
  return { entries, malformed };
}

export function parseDecisions(text) {
  const decisions = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const m = DECISION.exec(line);
    if (m) { decisions.push(current = { id: m[1], decision: m[2].toLowerCase(), key: m[3], at: null, item: null, note: null }); continue; }
    if (line.startsWith('#')) { current = null; continue; }
    const f = /^-?\s*(At|Item|Note):\s*(.*)$/.exec(line.trim());
    if (current && f) current[f[1].toLowerCase()] = clean(f[2], 1000);
  }
  return decisions;
}

function taskItems(text) {
  const parsed = parseTask(text);
  const items = [];
  for (const raw of parsed.done ? parsed.done.lines : []) {
    const m = /^\s*[-*]\s+\[([ xX])\]\s*(?:\((Claude|Codex|Human)\)\s*)?(.*)$/i.exec(raw);
    if (m) items.push({ done: m[1] !== ' ', owner: m[2] ? agentName(m[2]) : null, text: clean(m[3], 240) });
  }
  const allow = [];
  for (const line of parsed.allow ? parsed.allow.lines : []) {
    const ticks = [...line.matchAll(/`([^`]+)`/g)].map((x) => x[1]);
    if (ticks.length) allow.push(...ticks.map((t) => clean(t, 80)));
    else if (/^\s*[-*]\s+\S/.test(line)) allow.push(clean(line.replace(/^\s*[-*]\s+/, ''), 80));
  }
  return { parsed, items, allow };
}

function reviewItems(d, extras, decisions, queue) {
  const items = [];
  for (const a of Object.values(obj(d.state?.approvals))) {
    if (!a || a.status !== 'pending' || typeof a.id !== 'string' || !/^[A-Za-z0-9-]{1,20}$/.test(a.id)) continue;
    items.push({
      key: `ccx:${a.id}`, kind: 'ccx approval', title: `${clean(a.action, 40)} ${clean(a.target, 60)}`.trim(), level: clean(a.level, 4), at: clean(a.requested, 30),
      source: 'ccx state (pending approval)',
      command: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\ccx.ps1 approve -Id ${a.id}`,
    });
  }
  const scan = [
    ['TASK.md', d.task?.text],
    ['handoffs/COLLAB.md', d.collab?.text],
    ['handoffs/QUEUE.md', d.queue?.text],
    ...d.handoffs.filter((h) => h.text && h.name.toLowerCase() !== 'approvals.md').map((h) => [`handoffs/${h.name}`, h.text]),
  ];
  for (const [file, text] of scan) {
    if (!text) continue;
    text.split('\n').forEach((raw, i) => {
      const line = raw.replace(/\r$/, '').trim();
      if (!WAITING.test(line)) return;
      items.push({ key: `tag:${hash(file + '\n' + line)}`, kind: 'waiting tag', title: clean(line.replace(WAITING, '').replace(/^[-*#\s]+/, ''), 200) || '(no text)', source: `${file}:${i + 1}`, at: null });
    });
  }
  for (const q of queue.entries) {
    if (q.state === 'open' && agentName(q.to) === 'Human') items.push({ key: `qa:${q.id}`, kind: 'question for you', title: `${q.id} ${q.title}`, source: 'handoffs/QUEUE.md', at: null });
  }
  if (extras.upstream && extras.upstream.ahead > 0 && d.git.branch && d.git.head) {
    items.push({
      key: `push:${clean(d.git.branch, 60)}@${clean(d.git.head, 20)}`, kind: 'unpushed commits', title: `${clean(d.git.branch, 60)} is ${extras.upstream.ahead} commit(s) ahead of ${clean(extras.upstream.name, 60)}`,
      source: 'git rev-list', at: null, note: 'A push is L4: it still needs ccx gate and your approval in chat.',
    });
  }
  const latest = new Map();
  for (const dec of decisions) latest.set(dec.key, dec);
  return items.map((it) => ({ ...it, decision: latest.get(it.key) || null }));
}

export function buildCockpit(d, extras, now, { silenceMinutes = 30 } = {}) {
  const task = d.task?.text ? taskItems(d.task.text) : null;
  const collab = d.collab?.text ? parseCollabSection(d.collab.text) : null;
  const queue = d.queue?.text ? parseQueueFeed(d.queue.text) : { entries: [], malformed: 0 };
  const decisions = extras.approvalsText ? parseDecisions(extras.approvalsText) : [];

  // Budget: only when the TASK.md task is registered in ccx with usage and a compatible target.
  let budget = { available: false, reason: 'TASK.md is unavailable' };
  const taskId = task?.parsed.taskId || null;
  if (taskId) {
    const t = obj(d.state?.tasks)[taskId];
    if (!d.policy) budget = { available: false, reason: 'ccx/policy.json is unavailable' };
    else if (!d.state) budget = { available: false, reason: 'ccx state is unavailable' };
    else if (!t) budget = { available: false, reason: `task ${clean(taskId, 40)} is not registered in ccx, so no usage is recorded for it` };
    else {
      const b = budgetFor(d.policy, t);
      const used = effectiveTokens(t.tokens);
      if (!b || !Number.isFinite(b.tokenTarget) || used === null) budget = { available: false, reason: 'class, risk or token record not usable' };
      else {
        const dispatchesUsed = Number.isFinite(t.dispatches) ? t.dispatches - (Number.isFinite(t.attemptBase) ? t.attemptBase : 0) : null;
        budget = { available: true, taskId: clean(taskId, 40), class: b.cls, used, target: b.tokenTarget, remaining: b.tokenTarget - used, unit: 'effective tokens (input − cached + output)', dispatchesUsed, maxDispatches: Number.isFinite(b.maxDispatches) ? b.maxDispatches : null };
      }
    }
  } else if (task) budget = { available: false, reason: 'TASK.md states no Task ID' };

  const phases = collab?.phases || [];
  const current = phases.find((p) => p.status === 'active') || null;
  const lastDone = [...phases].reverse().find((p) => p.status === 'done' && (!current || p.n < current.n)) || null;
  const next = phases.find((p) => p.status === 'pending' && (!current || p.n > current.n)) || null;

  const openTo = (agent) => queue.entries.filter((q) => q.state === 'open' && agentName(q.to) === agent);
  const branches = extras.branches || [];
  const worktreeBranches = new Set((d.git.worktrees || []).map((w) => w.branch).filter(Boolean));
  const dispatches = dispatchRecords(d.telemetry.records).records;
  const agents = AGENTS.map((agent) => {
    const mine = phases.filter((p) => p.agent === agent);
    const active = mine.find((p) => p.status === 'active') || null;
    const upcoming = mine.find((p) => p.status === 'pending') || null;
    const prefix = agent.toLowerCase() + '/';
    const own = branches.filter((b) => b.name.startsWith(prefix)).slice(0, 5).map((b) => ({ ...b, worktree: worktreeBranches.has(b.name) }));
    const lastDispatch = agent === 'Codex' ? dispatches.map((r) => toDate(r.at)).filter(Boolean).sort((a, b) => b - a)[0] || null : null;
    return {
      name: agent,
      status: active ? 'active' : upcoming ? 'next' : mine.length ? 'idle' : 'no role declared',
      role: active ? active.role : upcoming ? upcoming.role : null,
      phase: active ? active.name : upcoming ? upcoming.name : null,
      roles: mine,
      waitingFor: openTo(agent).map((q) => `${q.id} from ${q.from}`),
      branches: own,
      lastDispatch: iso(lastDispatch),
    };
  });

  const flags = [];
  const handoffFiles = [
    ['TASK.md', d.task?.mtime],
    ['handoffs/COLLAB.md', d.collab?.mtime],
    ['handoffs/QUEUE.md', d.queue?.mtime],
    ...d.handoffs.filter((h) => /^notes-/i.test(h.name)).map((h) => [`handoffs/${h.name}`, h.mtime]),
  ].filter(([, m]) => toDate(m));
  const newest = handoffFiles.sort((a, b) => toDate(b[1]) - toDate(a[1]))[0] || null;
  const workOpen = phases.length ? phases.some((p) => p.status !== 'done') : true;
  if (newest && workOpen) {
    const minutes = Math.floor((now - toDate(newest[1])) / 60000);
    if (minutes >= silenceMinutes) flags.push({ kind: 'silence', severity: 'warn', text: `No handoff file has changed for ${minutes} min (threshold ${silenceMinutes} min; newest: ${newest[0]})` });
  }
  const claudeWaits = openTo('Claude').filter((q) => agentName(q.from) === 'Codex');
  const codexWaits = openTo('Codex').filter((q) => agentName(q.from) === 'Claude');
  if (claudeWaits.length && codexWaits.length) flags.push({ kind: 'deadlock', severity: 'error', text: `Possible deadlock: Claude has ${claudeWaits.map((q) => q.id).join(', ')} open from Codex while Codex has ${codexWaits.map((q) => q.id).join(', ')} open from Claude` });
  for (const agent of AGENTS) {
    const waiting = openTo(agent);
    if (waiting.length) flags.push({ kind: 'waiting', severity: 'info', text: `${waiting.length} open question(s) waiting on ${agent}: ${waiting.map((q) => q.id).join(', ')}` });
  }
  for (const p of phases.filter((x) => x.status === 'blocked')) flags.push({ kind: 'blocked', severity: 'error', text: `Phase ${p.n} ${p.name} (${p.agent} ${p.role}) is marked blocked` });
  if (collab && !phases.length) flags.push({ kind: 'format', severity: 'info', text: 'COLLAB.md declares no role lines in the cockpit format, so the handoff loop is unknown' });

  const review = reviewItems(d, extras, decisions, queue);

  const sourceAge = (m) => (toDate(m) ? Math.max(0, Math.floor((now - toDate(m)) / 1000)) : null);
  return {
    generatedAt: now.toISOString(),
    repo: clean(d.repo.split(/[\\/]/).pop(), 60),
    silenceMinutes,
    task: task ? {
      title: task.parsed.title ? clean(task.parsed.title.replace(/^Task:\s*/i, ''), 160) : null,
      id: taskId ? clean(taskId, 60) : null,
      mode: (() => { const m = /\bMode:?\s+`?([A-Za-z-]+)/.exec(d.task.text); return m ? clean(m[1], 20) : null; })(),
      allowlist: task.allow,
      items: task.items,
      unassigned: task.items.filter((i) => !i.done && !i.owner).length,
      ageSeconds: sourceAge(d.task.mtime),
    } : null,
    budget,
    collab: collab ? { title: collab.title, phase: collab.phase ? clean(collab.phase, 120) : null, participants: collab.participants ? clean(collab.participants, 200) : null, decisions: collab.decisions.slice(-6).reverse(), review: collab.review, unparsedRoles: collab.unparsedRoles, ageSeconds: sourceAge(d.collab.mtime) } : null,
    loop: {
      phases,
      current,
      lastDone,
      next,
      summary: current
        ? `${lastDone ? `${lastDone.agent} ${pastTense(lastDone.role)} → ` : ''}${current.agent} ${presentTense(current.role)}${next ? ` → next: ${next.agent} (${next.name})` : ''}`
        : phases.length && phases.every((p) => p.status === 'done') ? 'All declared phases are done' : 'No active phase declared',
    },
    agents,
    flags,
    queue: { entries: queue.entries.slice(-30).reverse(), malformed: queue.malformed, open: queue.entries.filter((q) => q.state === 'open').length, ageSeconds: sourceAge(d.queue?.mtime) },
    review: { items: review, decisions: decisions.slice(-10).reverse() },
    git: { branch: d.git.branch ? clean(d.git.branch, 60) : null, head: d.git.head ? clean(d.git.head, 20) : null, upstream: extras.upstream || null },
    health: [...d.health, ...(extras.health || [])].map((h) => ({ name: clean(h.name, 30), path: clean(h.path, 80), status: clean(h.status, 15), detail: clean(h.detail, 160) })),
  };
}

const pastTense = (role) => ({ PLAN: 'planned', IMPLEMENT: 'implemented', REVIEW: 'reviewed', RESEARCH: 'researched', VERIFY: 'verified' }[role] || role.toLowerCase());
const presentTense = (role) => ({ PLAN: 'planning', IMPLEMENT: 'implementing', REVIEW: 'reviewing', RESEARCH: 'researching', VERIFY: 'verifying' }[role] || role.toLowerCase());
