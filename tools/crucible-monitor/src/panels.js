// Turns collected data into eight panels of display lines. Pure: no I/O.
import { clean as c, num, pad, stamp, age, toDate, cut } from './text.js';

export const PANEL_TITLES = ['Agents & Models', 'Usage', 'Task', 'Handoffs', 'Collaboration', 'Budget & Limits', 'Verification & Approvals', 'Health'];
const CLOSED = new Set(['done', 'abandoned']);
const STATUS_ORDER = ['active', 'verifying', 'blocked', 'planned'];

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' && v ? v : null);
const int = (v) => (Number.isFinite(v) ? v : null);
const ownsOf = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : str(v) ? [v] : []);
const na = (reason) => `n/a (${reason})`;
const src = (label, mtime, now) => `source: ${label}${mtime ? `, modified ${stamp(mtime)} (${age(mtime, now)})` : ''}`;

// ---------- Markdown helpers (task files, handoffs, COLLAB.md, QUEUE.md) ----------

export function sections(text) {
  const out = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) out.push(current = { heading: m[2].trim(), level: m[1].length, lines: [] });
    else if (current) current.lines.push(line);
  }
  return out;
}

const findSection = (secs, re) => secs.find((s) => s.level >= 2 && re.test(s.heading));
const contentLines = (sec) => sec.lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('```'));
const bullets = (sec) => sec.lines.map((l) => l.trim()).filter((l) => /^[-*]\s+/.test(l)).map((l) => l.replace(/^[-*]\s+/, ''));
const lineValue = (text, re) => { const m = re.exec(text); return m ? m[1].trim() : null; };

export function parseTask(text) {
  const secs = sections(text);
  const allow = findSection(secs, /allowlist/i);
  const done = findSection(secs, /done when|acceptance/i);
  const stop = findSection(secs, /stop condition/i);
  const boxes = done ? done.lines.map((l) => /^\s*[-*]\s+\[([ xX])\]/.exec(l)).filter(Boolean) : [];
  return {
    title: lineValue(text, /^#\s+(.+)$/m),
    taskId: lineValue(text, /Task ID:?\s*`?([A-Za-z0-9._-]+)/),
    mode: lineValue(text, /\bMode:?\s+`?(Dispatch|Parallel)\b/i),
    allow, done, stop,
    checked: boxes.filter((m) => m[1] !== ' ').length,
    unchecked: boxes.filter((m) => m[1] === ' ').length,
  };
}

export function parseHandoff(text) {
  const field = (label) => lineValue(text, new RegExp(`^\\s*[-*]?\\s*\\*\\*${label}:\\*\\*\\s*(.+)$`, 'mi'));
  return {
    title: lineValue(text, /^#\s+(.+)$/m),
    status: lineValue(text, /^\s*Status:\s*(.+)$/mi),
    commit: field('Branch / commit'),
    checks: field('Checks run'),
    next: field('Next action / owner'),
  };
}

export function parseCollab(text) {
  const secs = sections(text);
  const pick = (re) => { const s = findSection(secs, re); return s ? bullets(s) : null; };
  return {
    phase: lineValue(text, /^Phase:\s*(.+)$/m),
    participants: lineValue(text, /^Participants:\s*(.+)$/m),
    roles: pick(/^roles\b/i),
    decisions: pick(/^decisions\b/i),
    review: pick(/^review/i),
  };
}

export function parseQueue(text) {
  const items = [];
  let malformed = 0;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.startsWith('### ')) continue;
    const m = /^###\s+(Q-\d+)\s+\[(open|answered)\]\s+(.+)$/i.exec(line);
    if (m) items.push({ id: m[1], state: m[2].toLowerCase(), rest: m[3] }); else malformed++;
  }
  return { items, malformed };
}

// ---------- ccx rules mirrored from scripts/ccx-core.ps1 ----------

export function effectiveClass(policy, task) {
  const classes = Object.keys(obj(policy.classes));
  const levels = list(obj(policy.risk).levels);
  const cls = str(task.class) || str(obj(policy.defaults).class);
  const risk = str(task.risk) || str(obj(policy.defaults).risk);
  // Get-CcxClass rejects an unknown class or risk, so no budget can be derived for either.
  if (!cls || !classes.includes(cls) || !risk || !levels.includes(risk)) return null;
  const min = str(obj(obj(policy.risk).high).minClass);
  if (risk && levels.length && risk === levels[levels.length - 1] && min && classes.indexOf(cls) < classes.indexOf(min)) return min;
  return cls;
}

export function budgetFor(policy, task) {
  const cls = effectiveClass(policy, task);
  if (!cls) return null;
  return { cls, ...obj(obj(policy.classes[cls]).budget), ...obj(task.budget) };
}

export function effectiveTokens(tokens) {
  const t = obj(tokens);
  return [t.input, t.cached, t.output].every(Number.isFinite) ? t.input - t.cached + t.output : null;
}

function requiredVerification(policy, task, cls) {
  const type = obj(obj(policy.taskTypes)[task.type]);
  if (Array.isArray(type.verification)) return type.verification;
  const required = [...list(obj(policy.classes[cls]).verification)];
  const levels = list(obj(policy.risk).levels);
  if (levels.length && task.risk === levels[levels.length - 1]) required.push(...list(obj(obj(policy.risk).high).addVerification));
  return [...new Set(required)];
}

function openTasks(state) {
  return Object.values(obj(state?.tasks))
    .filter((t) => t && typeof t === 'object' && !CLOSED.has(t.status))
    .sort((a, b) => rank(a.status) - rank(b.status) || String(b.updated || '').localeCompare(String(a.updated || '')));
}
const rank = (status) => { const i = STATUS_ORDER.indexOf(status); return i < 0 ? STATUS_ORDER.length : i; };

function capped(lines, rows, max) {
  if (rows.length <= max) lines.push(...rows); else lines.push(...rows.slice(0, max), `  … ${rows.length - max} more`);
}

// ---------- telemetry ----------

export function dispatchRecords(records) {
  const seen = new Set();
  const unique = [];
  let duplicates = 0;
  for (const r of records) {
    if (r.kind !== 'dispatch') continue;
    const key = JSON.stringify([r.taskId, r.role, r.attempt, r.at]);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    unique.push(r);
  }
  return { records: unique, duplicates };
}

const byTime = (a, b) => (toDate(a.at)?.getTime() || 0) - (toDate(b.at)?.getTime() || 0);
const modelLabel = (m) => (str(m) ? c(m, 40) : 'not recorded');

// ---------- panels ----------

function agentsPanel(d, now) {
  const p = d.policy;
  const lines = [];
  if (!p) lines.push(`Configured: ${na('ccx/policy.json unavailable, see Health')}`);
  else {
    lines.push(`Configured (policy preferences, not runs) — ${src('ccx/policy.json', d.policyMtime, now)}`);
    const claude = obj(obj(p.models).claude);
    const codex = obj(obj(p.models).codex);
    lines.push(`  claude  lead ${c(claude.lead, 40) || 'n/a'} · standard ${c(claude.standard, 40) || 'n/a'} · cheap ${c(claude.cheap, 40) || 'n/a'}`);
    lines.push(`  codex   default ${c(codex.default, 40) || 'n/a'} · fallbacks ${list(codex.fallbacks).map((m) => c(m, 40)).join(', ') || 'n/a'}`);
    for (const [name, cls] of Object.entries(obj(p.classes))) {
      const e = obj(obj(cls).effort);
      const ce = obj(e.codex);
      const le = obj(e.claude);
      lines.push(`  ${pad(c(name, 12), 12)} codex ${c(cls.codexModel, 40) || `(default ${c(codex.default, 40) || 'n/a'})`} effort ${c(ce.base, 8) || '?'}..${c(ce.max, 8) || '?'} · claude effort ${c(le.base, 8) || '?'}..${c(le.max, 8) || '?'}`);
    }
    const providers = Object.entries(obj(p.providers));
    lines.push(`  fallback providers: ${providers.length ? providers.map(([n, v]) => `${c(n, 20)} (${c(obj(v).kind, 10) || '?'}, ${obj(v).enabled === true ? 'enabled' : 'disabled'}, ${c(obj(v).model, 40) || 'no model'})`).join(' · ') : 'none configured'}`);
  }

  lines.push('Usage-limit records (state.json)');
  if (!d.state) lines.push(`  ${na('ccx state unavailable')}`);
  else {
    const rows = [];
    for (const [agent, info] of Object.entries(obj(d.state.agents))) {
      const until = obj(info).unavailableUntil;
      if (toDate(until)) rows.push(`  ${c(agent, 20)} unavailable until ${stamp(until)} (${toDate(until) > now ? 'in future' : 'passed'})`);
    }
    for (const [provider, until] of Object.entries(obj(d.state.providerLimits))) {
      if (toDate(until)) rows.push(`  provider ${c(provider, 20)} limited until ${stamp(until)} (${toDate(until) > now ? 'in future' : 'passed'})`);
    }
    lines.push(...(rows.length ? rows : ['  none recorded']));
  }

  const routes = d.telemetry.records.filter((r) => r.kind === 'route').sort(byTime).slice(-5).reverse();
  lines.push('Routed (OMNIROUTE selections ccx logged; a selection is not proof a run happened), newest 5');
  lines.push(...(routes.length ? routes.map((r) => `  ${stamp(r.at)} ${pad(c(r.taskId, 16) || '(no task)', 16)} ${c(r.agent, 10)} ${str(r.model) ? c(r.model, 40) : 'no model'} ${c(r.effort, 8) || 'no effort'} route ${c(r.route, 10) || 'n/a'}`) : [`  ${na('no route records in telemetry')}`]));

  const { records } = dispatchRecords(d.telemetry.records);
  const recent = [...records].sort(byTime).slice(-5).reverse();
  lines.push('Observed dispatches (runs ccx recorded), newest 5');
  lines.push(...(recent.length ? recent.map((r) => `  ${stamp(r.at)} ${pad(c(r.taskId, 16) || '(no task)', 16)} ${c(r.role, 10)} ${c(r.agent, 10)}/${c(r.provider, 12) || 'provider not recorded'} model ${modelLabel(r.model)} effort ${c(r.effort, 8) || 'n/a'} exit ${Number.isFinite(r.exit) ? r.exit : 'n/a'} ${c(r.status, 30)}`) : [`  ${na('no dispatch records in telemetry')}`]));
  lines.push(`Claude runs: ${na('no Crucible source records Claude sessions or their models')}`);
  return lines;
}

function usagePanel(d) {
  const { records, duplicates } = dispatchRecords(d.telemetry.records);
  if (!records.length) return [`Usage: ${na('no dispatch records in telemetry')}`, `Claude: ${na('no source records Claude token use')}`];
  const sorted = [...records].sort(byTime);
  const groups = new Map();
  let noTokens = 0;
  for (const r of records) {
    const t = obj(r.tokens);
    if (![t.input, t.cached, t.output].every(Number.isFinite)) { noTokens++; continue; }
    const key = `${c(r.agent, 10) || 'agent not recorded'}/${c(r.provider, 12) || 'provider not recorded'}/${modelLabel(r.model)}`;
    const g = groups.get(key) || { runs: 0, input: 0, cached: 0, output: 0 };
    g.runs++; g.input += t.input; g.cached += t.cached; g.output += t.output;
    groups.set(key, g);
  }
  const lines = [
    `Scope: ccx dispatch records in retained telemetry, ${stamp(sorted[0].at)} to ${stamp(sorted[sorted.length - 1].at)}; ${records.length} run(s), ${noTokens} without a token record${duplicates ? `, ${duplicates} duplicate(s) counted once` : ''}`,
    'Units: tokens as the Codex CLI reported them to the launcher; input includes cached; effective = input − cached + output',
    `  ${pad('agent/provider/model', 40)} ${pad('runs', 5)} ${pad('input', 14)} ${pad('cached', 14)} ${pad('output', 11)} effective`,
  ];
  for (const [key, g] of [...groups].sort((a, b) => b[1].runs - a[1].runs)) {
    lines.push(`  ${pad(key, 40)} ${pad(String(g.runs), 5)} ${pad(num(g.input), 14)} ${pad(num(g.cached), 14)} ${pad(num(g.output), 11)} ${num(g.input - g.cached + g.output)}`);
  }
  lines.push('Not added: task-done telemetry and per-task totals in state.json (aggregates of these same runs)');
  lines.push(`Claude: ${na('no source records Claude token use')}`);
  return lines;
}

function taskPanel(d, now) {
  const lines = [];
  const t = d.task;
  if (!t.text) lines.push(`Task file ${c(t.rel, 80)}: ${na('unavailable, see Health')}`);
  else {
    const p = parseTask(t.text);
    lines.push(`Task file — ${src(c(t.rel, 80), t.mtime, now)}`);
    lines.push(`  title: ${p.title ? c(p.title, 120) : na('no # heading')}`);
    lines.push(`  task ID: ${p.taskId ? c(p.taskId, 60) : na('not stated')} · mode: ${p.mode ? c(p.mode, 20) : na('not stated')}`);
    const section = (label, sec, extra = '') => {
      if (!sec) { lines.push(`  ${label}: ${na('no matching heading')}`); return; }
      const body = contentLines(sec);
      lines.push(`  ${label} (## ${c(sec.heading, 60)})${extra}:`);
      capped(lines, body.map((l) => `    ${c(l, 160)}`), 4);
    };
    section('write allowlist', p.allow);
    section('completion criteria', p.done, p.checked + p.unchecked ? ` [x] ${p.checked}, [ ] ${p.unchecked}` : '');
    section('stop conditions', p.stop);
  }

  if (!d.state) lines.push(`ccx open tasks: ${na('ccx state unavailable')}`);
  else {
    const open = openTasks(d.state);
    lines.push(`ccx open tasks (state.json; owns = the write allowlist ccx enforces): ${open.length}`);
    capped(lines, open.map((x) => `  ${pad(c(x.id, 16), 16)} ${pad(c(x.status, 9), 9)} ${pad(c(x.type, 14), 14)} owner ${pad(c(x.owner, 6), 6)} owns ${c(ownsOf(x.owns).join(', '), 70) || 'none'} · file ${c(x.taskFile, 50) || 'none'}`), 10);
  }

  const g = d.git;
  lines.push(`Git: ${g.branch ? c(g.branch, 60) : 'n/a'} @ ${g.head ? c(g.head, 20) : 'n/a'}`);
  if (!g.worktrees) lines.push(`  worktrees: ${na('git worktree list failed, see Health')}`);
  else {
    lines.push(`  worktrees: ${g.worktrees.length} (structure only; not evidence of activity)`);
    capped(lines, g.worktrees.map((w) => `    ${w.branch ? c(w.branch, 70) : w.detached ? '(detached)' : '(no branch)'}`), 6);
  }
  return lines;
}

function handoffsPanel(d, now) {
  if (!d.handoffs.length) return [`Handoffs: ${na(d.handoffTotal === 0 && d.health.some((h) => h.name === 'handoffs' && h.status === 'ok') ? 'no notes in handoffs/' : 'handoffs/ unavailable, see Health')}`];
  const lines = [`handoffs/: ${d.handoffTotal} note(s), newest ${d.handoffs.length} shown. Fields appear only when a note states them.`];
  for (const h of d.handoffs) {
    if (!h.text) { lines.push(`  ${c(h.name, 60)}: ${na(`read ${h.status}`)}`); continue; }
    const p = parseHandoff(h.text);
    lines.push(`  ${c(h.name, 50)} — ${p.title ? c(p.title, 90) : 'no title'} (modified ${stamp(h.mtime)}, ${age(h.mtime, now)})`);
    lines.push(`    status: ${p.status ? c(p.status, 50) : 'not recorded'} · branch/commit: ${p.commit ? c(p.commit, 60) : 'not recorded'}`);
    lines.push(`    checks: ${p.checks ? c(p.checks, 100) : 'not recorded'} · next: ${p.next ? c(p.next, 60) : 'not recorded'}`);
  }
  return lines;
}

function collabPanel(d, now) {
  const lines = [];
  if (!d.collab.text) lines.push(`handoffs/COLLAB.md: ${na('unavailable, see Health')}`);
  else {
    const p = parseCollab(d.collab.text);
    lines.push(`COLLAB.md — ${src('handoffs/COLLAB.md', d.collab.mtime, now)}`);
    lines.push(`  phase: ${p.phase ? c(p.phase, 100) : na('no Phase: line')}`);
    lines.push(`  participants: ${p.participants ? c(p.participants, 140) : na('no Participants: line')}`);
    const block = (label, items, max, newestFirst) => {
      if (!items) { lines.push(`  ${label}: ${na('no heading')}`); return; }
      lines.push(`  ${label}: ${items.length}`);
      capped(lines, (newestFirst ? [...items].reverse() : items).map((b) => `    ${c(b, 160)}`), max);
    };
    block('roles', p.roles, 5, false);
    block('decisions (newest first)', p.decisions, 4, true);
  }
  if (!d.queue.text) lines.push(`handoffs/QUEUE.md: ${na('unavailable, see Health')}`);
  else {
    const q = parseQueue(d.queue.text);
    const open = q.items.filter((i) => i.state === 'open');
    lines.push(`Questions (QUEUE.md): ${open.length} open, ${q.items.length - open.length} answered${q.malformed ? `, ${q.malformed} heading(s) not in the documented format` : ''}`);
    capped(lines, open.map((i) => `  ${c(i.id, 10)} ${c(i.rest, 150)}`), 6);
  }
  return lines;
}

function budgetPanel(d) {
  const lines = [];
  const p = d.policy;
  if (!p) return [`Budget: ${na('ccx/policy.json unavailable')}`];
  lines.push('Class limits (configured)');
  lines.push(`  ${pad('class', 12)} ${pad('dispatches', 11)} ${pad('escalations', 12)} ${pad('reviews', 8)} ${pad('token target', 13)} timeout`);
  for (const [name, cls] of Object.entries(obj(p.classes))) {
    const b = obj(obj(cls).budget);
    lines.push(`  ${pad(c(name, 12), 12)} ${pad(num(b.maxDispatches), 11)} ${pad(num(b.maxModelEscalations), 12)} ${pad(num(b.maxReviewCycles), 8)} ${pad(num(b.tokenTarget), 13)} ${Number.isFinite(b.timeoutMinutes) ? `${b.timeoutMinutes}m` : 'n/a'}`);
  }
  if (!d.state) { lines.push(`Open tasks: ${na('ccx state unavailable')}`); return lines; }
  const open = openTasks(d.state);
  lines.push('Open tasks: recorded use against limits (dispatches = implement runs since the last escalation)');
  capped(lines, open.map((t) => {
    const b = budgetFor(p, t);
    if (!b) return `  ${pad(c(t.id, 16), 16)} ${na(`class ${c(t.class, 20) || 'unset'} or risk ${c(t.risk, 20) || 'unset'} not in policy`)}`;
    const used = int(t.dispatches) !== null ? t.dispatches - (int(t.attemptBase) ?? 0) : null;
    const dispatches = used !== null && Number.isFinite(b.maxDispatches) ? `${used}/${b.maxDispatches} (${b.maxDispatches - used} left)` : 'n/a';
    const eff = effectiveTokens(t.tokens);
    const tokens = eff !== null && Number.isFinite(b.tokenTarget) ? `${num(eff)}/${num(b.tokenTarget)} effective (${num(b.tokenTarget - eff)} left)` : 'n/a';
    const reviews = int(t.reviewCycles) !== null && Number.isFinite(b.maxReviewCycles) ? `${t.reviewCycles}/${b.maxReviewCycles}` : 'n/a';
    const cap = Number.isFinite(t.creditCap) ? ` · credit cap ${num(t.creditCap)} (spent: n/a, ledger not read)` : '';
    return `  ${pad(c(t.id, 16), 16)} ${pad(c(b.cls, 9), 9)} dispatches ${dispatches} · tokens ${tokens} · reviews ${reviews}${cap}`;
  }), 10);
  return lines;
}

function verificationPanel(d, now) {
  const lines = [];
  if (!d.state) lines.push(`Approvals: ${na('ccx state unavailable')}`);
  else {
    const approvals = Object.values(obj(d.state.approvals)).filter((a) => a && typeof a === 'object');
    const counts = {};
    for (const a of approvals) counts[c(a.status, 20) || 'unknown'] = (counts[c(a.status, 20) || 'unknown'] || 0) + 1;
    lines.push('Approvals (state.json; display only — this monitor cannot grant or resolve them)');
    lines.push(`  ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none recorded'}`);
    const live = approvals.filter((a) => a.status === 'pending' || a.status === 'approved').sort((a, b) => String(b.requested || '').localeCompare(String(a.requested || '')));
    capped(lines, live.map((a) => `  ${pad(c(a.id, 8), 8)} ${pad(c(a.status, 9), 9)} ${c(a.level, 4)} ${c(a.action, 24)} target ${c(a.target, 30) || 'none'} requested ${stamp(a.requested)} expires ${stamp(a.expires)}${toDate(a.expires) ? ` (${toDate(a.expires) > now ? 'in future' : 'passed'})` : ''}`), 6);

    const open = openTasks(d.state);
    lines.push('Open tasks: required checks, recorded verification and last review');
    capped(lines, open.map((t) => {
      const cls = d.policy ? effectiveClass(d.policy, t) : null;
      const required = cls ? requiredVerification(d.policy, t, cls).map((x) => c(x, 30)).join(', ') || 'none' : 'n/a';
      const v = obj(t.verification);
      const verification = str(v.status) ? `${c(v.status, 10)}${v.full === true ? ' (full)' : v.full === false ? ' (partial)' : ''}` : 'not recorded';
      const review = list(t.reviews).filter((r) => r && typeof r === 'object').pop();
      const last = review ? `${c(review.result, 10)} by ${c(review.by, 10)} (${c(review.kind, 10) || 'review'}, ${stamp(review.at)})` : 'none recorded';
      return `  ${pad(c(t.id, 16), 16)} required: ${required} · verification: ${verification} · last review: ${last}`;
    }), 10);

    const unacked = list(d.state.notifications).filter((n) => n && typeof n === 'object' && n.ack === false);
    lines.push(`Unacknowledged notifications: ${unacked.length}`);
    lines.push(...unacked.slice(-3).reverse().map((n) => `  ${stamp(n.at)} ${c(n.level, 8)} ${c(n.text, 140)}`));
  }
  if (!d.collab.text) lines.push(`Peer review and sign-off (COLLAB.md): ${na('file unavailable')}`);
  else {
    const review = parseCollab(d.collab.text).review;
    lines.push(`Peer review and sign-off (COLLAB.md): ${review ? review.length : na('no Review heading')}`);
    if (review) capped(lines, review.map((b) => `  ${c(b, 160)}`), 5);
  }
  return lines;
}

function healthPanel(d, now, refresh) {
  const lines = [`Refresh: #${refresh.count} at ${refresh.at ? refresh.at.toISOString().slice(11, 19) + 'Z' : 'n/a'}, took ${refresh.ms ?? 'n/a'} ms, ${refresh.interval ? `every ${refresh.interval}s` : 'one-shot snapshot'}${refresh.error ? ` · last error: ${c(refresh.error, 120)}` : ''}`];
  lines.push(`ccx state dir: via ${c(d.stateDir?.via, 40) || 'n/a'}`);
  if (d.state) lines.push(`ccx state updated ${stamp(d.state.updated)} (${age(d.state.updated, now)}); last tick ${stamp(obj(d.state.runtime).lastTick)} (${age(obj(d.state.runtime).lastTick, now)}). Ages only: no source documents a liveness timeout.`);
  for (const h of d.health) {
    const when = h.mtime ? ` · modified ${stamp(h.mtime)} (${age(h.mtime, now)})` : '';
    const size = Number.isFinite(h.size) ? ` · ${num(h.size)} B` : '';
    const records = Number.isFinite(h.records) ? ` · ${h.records} records` : '';
    lines.push(`  ${pad(c(h.name, 15), 15)} ${pad(c(h.status, 11), 11)} ${c(h.path, 60)}${size}${records}${when}${h.detail ? ` · ${c(h.detail, 120)}` : ''}`);
  }
  const kinds = new Set(['route', 'dispatch', 'verify', 'task-done']);
  const other = d.telemetry.records.filter((r) => !kinds.has(r.kind)).length;
  if (other) lines.push(`  telemetry records of unrecognised kinds ignored: ${other}`);
  return lines;
}

export function buildPanels(data, now, refresh) {
  const build = [agentsPanel, usagePanel, taskPanel, handoffsPanel, collabPanel, budgetPanel, verificationPanel, healthPanel];
  return build.map((fn, i) => {
    let lines;
    try { lines = fn(data, now, refresh); } catch (error) { lines = [`${na(`panel failed: ${c(error.message, 120)}`)}`]; }
    return { title: PANEL_TITLES[i], lines };
  });
}

// Flattens panels into lines; width truncates each line (Infinity for plain snapshots).
export function renderLines(panels, width = Infinity) {
  const lines = [];
  const starts = [];
  panels.forEach((panel, i) => {
    if (i) lines.push('');
    starts.push(lines.length);
    lines.push(cut(`[${i + 1}] ${panel.title}`, width));
    for (const line of panel.lines) lines.push(cut(line, width));
  });
  return { lines, starts };
}
