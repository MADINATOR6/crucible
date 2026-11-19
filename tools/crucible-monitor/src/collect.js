// Reads the identified Crucible sources. Read-only: no writes, no network, no shell.
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

export const LIMITS = { json: 16 * 1024 * 1024, jsonl: 2 * 1024 * 1024, md: 256 * 1024 };
export const SUPPORTED_SCHEMA = 1;
const HANDOFF_EXCLUDE = new Set(['template.md', 'collab.md', 'queue.md']);
const HANDOFF_SHOWN = 8;

// Reads at most `max` bytes: from the start (whole file required) or, with tail, the last `max` bytes.
export async function readBounded(file, max, { tail = false } = {}) {
  let handle;
  try {
    handle = await fsp.open(file, 'r');
    const info = await handle.stat();
    if (!info.isFile()) return { status: 'unreadable', detail: 'not a regular file' };
    if (!tail && info.size > max) return { status: 'too-large', detail: `${info.size} bytes > ${max}`, size: info.size, mtime: info.mtime };
    const length = Math.min(info.size, max);
    const position = info.size - length;
    const buffer = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const { bytesRead } = await handle.read(buffer, read, length - read, position + read);
      if (!bytesRead) break; // truncated while reading
      read += bytesRead;
    }
    return { status: 'ok', text: buffer.subarray(0, read).toString('utf8').replace(/^﻿/, ''), size: info.size, mtime: info.mtime, cut: position > 0 };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return { status: 'missing' };
    return { status: 'unreadable', detail: error.code || 'read error' };
  } finally {
    await handle?.close().catch(() => {});
  }
}

export function parseJsonl(text, cutAtStart) {
  const lines = text.split('\n');
  let partial = 0;
  let invalid = 0;
  if (cutAtStart && lines.length) { lines.shift(); partial++; }
  // No trailing newline: the last line is a write in progress.
  if (lines.length && lines[lines.length - 1] !== '') { lines.pop(); partial++; } else lines.pop();
  const records = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === 'object' && !Array.isArray(value)) records.push(value); else invalid++;
    } catch { invalid++; }
  }
  return { records, partial, invalid };
}

function source(name, rel, result, extra = {}) {
  return { name, path: rel, status: result.status, detail: result.detail || '', size: result.size, mtime: result.mtime, ...extra };
}

async function readJson(name, file, rel, health) {
  const result = await readBounded(file, LIMITS.json);
  if (result.status !== 'ok') { health.push(source(name, rel, result)); return { value: null, mtime: result.mtime }; }
  let value;
  try { value = JSON.parse(result.text); } catch (error) {
    health.push(source(name, rel, { ...result, status: 'parse-error', detail: cleanError(error) }));
    return { value: null, mtime: result.mtime };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    health.push(source(name, rel, { ...result, status: 'unsupported', detail: 'not a JSON object' }));
    return { value: null, mtime: result.mtime };
  }
  if (value.schema !== SUPPORTED_SCHEMA) {
    health.push(source(name, rel, { ...result, status: 'unsupported', detail: `schema ${JSON.stringify(value.schema)}; supported ${SUPPORTED_SCHEMA}` }));
    return { value: null, mtime: result.mtime };
  }
  health.push(source(name, rel, result));
  return { value, mtime: result.mtime };
}

function cleanError(error) {
  return String(error.message || error).slice(0, 120);
}

export function git(repo, args) {
  return new Promise((resolve) => {
    // cwd is Node's own folder: Windows may resolve a bare 'git' from the cwd first, and the repo is not trusted to hold binaries.
    execFile('git', ['--no-optional-locks', '-C', repo, ...args], { cwd: path.dirname(process.execPath), timeout: 3000, windowsHide: true, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => resolve(error ? { ok: false, error: (stderr || error.code || error.message || 'failed').toString().trim().split('\n')[0] } : { ok: true, out: stdout }));
  });
}

export function parseWorktrees(text) {
  const trees = [];
  let current = null;
  for (const line of text.split('\n').map((l) => l.replace(/\r$/, ''))) {
    if (line.startsWith('worktree ')) trees.push(current = { path: line.slice(9), branch: null, detached: false });
    else if (current && line.startsWith('branch ')) current.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (current && line === 'detached') current.detached = true;
  }
  return trees;
}

function insideRepo(repo, target) {
  const rel = path.relative(repo, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function excluded(policy, rel) {
  const norm = rel.split(path.sep).join('/').toLowerCase();
  const list = Array.isArray(policy?.privacy?.excludePaths) ? policy.privacy.excludePaths : [];
  return list.some((entry) => {
    if (typeof entry !== 'string' || !entry) return false;
    const base = entry.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    return norm === base || norm.startsWith(base + '/');
  });
}

// Refuses a target outside the repo or under privacy.excludePaths, both as written and after
// resolving symlinks and junctions. A missing target passes; the read then reports it missing.
// ponytail: a swap between this check and the open is not prevented; the reader is the user's own account.
export async function guardPath(repo, target, policy) {
  const check = (root, file) => {
    if (!insideRepo(root, file)) return 'outside the repository';
    if (excluded(policy, path.relative(root, file))) return 'under privacy.excludePaths';
    return null;
  };
  const lexical = check(repo, target);
  if (lexical) return { refused: lexical };
  let realRepo;
  let real;
  try { realRepo = await fsp.realpath(repo); } catch { realRepo = repo; }
  try { real = await fsp.realpath(target); } catch { return { refused: null, real: target }; }
  const resolved = check(realRepo, real);
  return resolved ? { refused: `${resolved} (after resolving links)` } : { refused: null, real };
}

async function resolveStateDir(repo, options, health) {
  if (options.stateDir) return { dir: path.resolve(repo, options.stateDir), via: '--state-dir' };
  if (options.env?.CCX_STATE_DIR) return { dir: path.resolve(options.env.CCX_STATE_DIR), via: 'CCX_STATE_DIR' };
  const common = await git(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (common.ok && common.out.trim()) return { dir: path.join(common.out.trim(), 'ccx'), via: 'git common dir' };
  health.push({ name: 'git common dir', path: 'git rev-parse', status: 'unreadable', detail: common.error });
  return { dir: path.join(repo, '.git', 'ccx'), via: 'fallback <repo>/.git/ccx' };
}

export async function collect(options) {
  const repo = path.resolve(options.repo);
  const health = [];
  const rel = (file) => (insideRepo(repo, file) ? path.relative(repo, file).split(path.sep).join('/') || '.' : file);

  const policy = await readJson('policy', path.join(repo, 'ccx', 'policy.json'), 'ccx/policy.json', health);

  const stateDir = await resolveStateDir(repo, options, health);
  const statePath = path.join(stateDir.dir, 'state.json');
  const state = await readJson('ccx state', statePath, rel(statePath), health);

  const telemetry = { records: [], partial: 0, invalid: 0 };
  for (const name of ['telemetry.1.jsonl', 'telemetry.jsonl']) {
    const file = path.join(stateDir.dir, name);
    const result = await readBounded(file, LIMITS.jsonl, { tail: true });
    if (result.status !== 'ok') {
      // The rotated archive exists only after the first rotation.
      if (!(name === 'telemetry.1.jsonl' && result.status === 'missing')) health.push(source('telemetry', rel(file), result));
      continue;
    }
    const parsed = parseJsonl(result.text, result.cut);
    telemetry.records.push(...parsed.records);
    telemetry.partial += parsed.partial;
    telemetry.invalid += parsed.invalid;
    const notes = [];
    if (result.cut) notes.push(`read last ${LIMITS.jsonl} of ${result.size} bytes`);
    if (parsed.partial) notes.push(`${parsed.partial} partial line(s) skipped`);
    if (parsed.invalid) notes.push(`${parsed.invalid} invalid line(s) skipped`);
    health.push(source('telemetry', rel(file), { ...result, status: parsed.invalid || parsed.partial ? 'partial' : 'ok', detail: notes.join('; ') }, { records: parsed.records.length }));
  }

  const taskRel = options.taskFile || 'TASK.md';
  const taskPath = path.resolve(repo, taskRel);
  let task = { rel: taskRel, text: null, mtime: null };
  const taskGuard = await guardPath(repo, taskPath, policy.value);
  if (taskGuard.refused) health.push({ name: 'task file', path: taskRel, status: 'refused', detail: taskGuard.refused });
  else {
    const result = await readBounded(taskGuard.real, LIMITS.md);
    health.push(source('task file', rel(taskPath), result));
    task = { rel: rel(taskPath), text: result.status === 'ok' ? result.text : null, mtime: result.mtime };
  }

  const handoffDir = path.join(repo, 'handoffs');
  const handoffs = [];
  let handoffTotal = 0;
  let collab = { text: null };
  let queue = { text: null };
  let entries = null;
  const dirGuard = await guardPath(repo, handoffDir, policy.value);
  if (dirGuard.refused) health.push({ name: 'handoffs', path: 'handoffs/', status: 'refused', detail: dirGuard.refused });
  // Dirent types come from lstat: symlinked notes are not files here and are skipped below.
  else try { entries = await fsp.readdir(handoffDir, { withFileTypes: true }); } catch (error) {
    health.push({ name: 'handoffs', path: 'handoffs/', status: error.code === 'ENOENT' ? 'missing' : 'unreadable', detail: error.code === 'ENOENT' ? '' : error.code || '' });
  }
  if (entries) {
    const notes = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
      const lower = entry.name.toLowerCase();
      if (lower === 'collab.md' || lower === 'queue.md') {
        const result = await readBounded(path.join(handoffDir, entry.name), LIMITS.md);
        health.push(source(lower === 'collab.md' ? 'collaboration' : 'question queue', `handoffs/${entry.name}`, result));
        const value = { text: result.status === 'ok' ? result.text : null, mtime: result.mtime };
        if (lower === 'collab.md') collab = value; else queue = value;
        continue;
      }
      if (HANDOFF_EXCLUDE.has(lower)) continue;
      try { notes.push({ name: entry.name, mtime: (await fsp.stat(path.join(handoffDir, entry.name))).mtime }); } catch { /* deleted between list and stat */ }
    }
    handoffTotal = notes.length;
    notes.sort((a, b) => b.mtime - a.mtime);
    let failed = 0;
    for (const note of notes.slice(0, HANDOFF_SHOWN)) {
      const result = await readBounded(path.join(handoffDir, note.name), LIMITS.md);
      if (result.status !== 'ok') failed++;
      handoffs.push({ name: note.name, mtime: result.mtime || note.mtime, text: result.status === 'ok' ? result.text : null, status: result.status });
    }
    health.push({ name: 'handoffs', path: 'handoffs/', status: failed ? 'partial' : 'ok', detail: `${handoffTotal} note(s); newest ${Math.min(HANDOFF_SHOWN, handoffTotal)} read${failed ? `; ${failed} unreadable` : ''}` });
    if (!collab.text && !health.some((h) => h.name === 'collaboration')) health.push({ name: 'collaboration', path: 'handoffs/COLLAB.md', status: 'missing', detail: '' });
    if (!queue.text && !health.some((h) => h.name === 'question queue')) health.push({ name: 'question queue', path: 'handoffs/QUEUE.md', status: 'missing', detail: '' });
  }

  const [branch, head, trees] = await Promise.all([
    git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(repo, ['rev-parse', '--short', 'HEAD']),
    git(repo, ['worktree', 'list', '--porcelain']),
  ]);
  const gitInfo = {
    branch: branch.ok ? branch.out.trim() : null,
    head: head.ok ? head.out.trim() : null,
    worktrees: trees.ok ? parseWorktrees(trees.out) : null,
  };
  const gitError = [branch, head, trees].find((r) => !r.ok);
  health.push({ name: 'git', path: 'git rev-parse / worktree list', status: gitError ? 'unreadable' : 'ok', detail: gitError ? gitError.error : '' });

  return { repo, stateDir, policy: policy.value, policyMtime: policy.mtime, state: state.value, stateMtime: state.mtime, telemetry, task, handoffs, handoffTotal, collab, queue, git: gitInfo, health };
}
