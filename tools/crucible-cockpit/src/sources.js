// Cockpit-specific reads on top of crucible-monitor's collect(): APPROVALS.md, branch commit times,
// upstream distance, and a cheap change signature for live updates. Read-only.
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { collect, git, guardPath, readBounded, LIMITS } from '../../crucible-monitor/src/collect.js';
import { buildCockpit } from './model.js';

export const APPROVALS = path.join('handoffs', 'APPROVALS.md');
export const QUEUE = path.join('handoffs', 'QUEUE.md');

export async function gitExtras(repo) {
  const health = [];
  const refs = await git(repo, ['for-each-ref', '--sort=-committerdate', '--count=40', '--format=%(refname:short)%09%(committerdate:iso-strict)%09%(objectname:short)', 'refs/heads/claude', 'refs/heads/codex']);
  const branches = refs.ok
    ? refs.out.split('\n').map((l) => l.replace(/\r$/, '').split('\t')).filter((p) => p.length === 3 && p[0]).map(([name, committedAt, sha]) => ({ name, committedAt, sha }))
    : [];
  if (!refs.ok) health.push({ name: 'git branches', path: 'git for-each-ref', status: 'unreadable', detail: refs.error });
  let upstream = null;
  const name = await git(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  if (name.ok) {
    const counts = await git(repo, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']);
    const m = counts.ok ? /^(\d+)\s+(\d+)/.exec(counts.out.trim()) : null;
    if (m) upstream = { name: name.out.trim(), ahead: Number(m[1]), behind: Number(m[2]) };
  }
  return { branches, upstream, health };
}

export async function readApprovals(repo, policy) {
  const file = path.join(repo, APPROVALS);
  const guard = await guardPath(repo, file, policy);
  if (guard.refused) return { text: null, health: { name: 'approvals', path: 'handoffs/APPROVALS.md', status: 'refused', detail: guard.refused } };
  const result = await readBounded(guard.real, LIMITS.md);
  return { text: result.status === 'ok' ? result.text : null, health: { name: 'approvals', path: 'handoffs/APPROVALS.md', status: result.status, detail: result.status === 'missing' ? 'created on the first decision' : result.detail || '' } };
}

export async function snapshot(options, now = new Date(), cachedGit = null) {
  const data = await collect(options);
  const extras = cachedGit || (await gitExtras(data.repo));
  const approvals = await readApprovals(data.repo, data.policy);
  return {
    data,
    extras,
    view: buildCockpit(data, { ...extras, approvalsText: approvals.text, health: [...extras.health, approvals.health] }, now, { silenceMinutes: options.silenceMinutes }),
  };
}

// mtime+size of every file the view depends on; a change triggers a rebuild and an SSE push.
export async function signature(repo, stateDir) {
  const files = [path.join(repo, 'TASK.md'), path.join(repo, 'ccx', 'policy.json')];
  if (stateDir) files.push(path.join(stateDir, 'state.json'), path.join(stateDir, 'telemetry.jsonl'), path.join(stateDir, 'telemetry.1.jsonl'));
  try {
    const entries = await fsp.readdir(path.join(repo, 'handoffs'), { withFileTypes: true });
    for (const e of entries.slice(0, 500)) if (e.isFile() && e.name.toLowerCase().endsWith('.md')) files.push(path.join(repo, 'handoffs', e.name));
  } catch { /* missing folder is part of the signature as "no entries" */ }
  const parts = await Promise.all(files.map(async (f) => {
    try { const s = await fsp.stat(f); return `${f}|${s.mtimeMs}|${s.size}`; } catch { return `${f}|-`; }
  }));
  return parts.join('\n');
}
