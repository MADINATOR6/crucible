// The only two writes the cockpit makes, both append-only and both started by a person in the UI.
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { guardPath } from '../../crucible-monitor/src/collect.js';
import { clean } from '../../crucible-monitor/src/text.js';
import { APPROVALS, QUEUE } from './sources.js';

export const DECISIONS = ['approved', 'changes-requested'];
const KEY = /^(ccx|tag|qa|push):[A-Za-z0-9._@\/-]{1,120}$/;
const APPROVALS_HEADER = `# Human decisions (crucible-cockpit)

Recorded by a person through crucible-cockpit for the agents to read. An entry here is NOT a ccx approval
and does not authorise an L4/L5 action: those still need \`ccx gate\` and the user's approval in chat or at
their own console (AGENTS.md, Control Plane). Format: \`### AP-<n> [approved|changes-requested] <item key>\`.
`;

let chain = Promise.resolve();
// One write at a time inside this process, so two browser tabs cannot pick the same id.
const serial = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

export class InputError extends Error {}

// Single line, no control characters, no leading Markdown heading marks.
function line(value, max, field) {
  if (typeof value !== 'string') throw new InputError(`${field} must be text`);
  const text = clean(value, max).trim().replace(/^#+/, (m) => '\\' + m);
  if (Array.from(value).length > max) throw new InputError(`${field} is longer than ${max} characters`);
  return text;
}

// A write lands only in <repo>/handoffs/<name>: the folder must be a plain folder that resolves to exactly
// that place, and the file must be absent or a plain, singly linked file. Links (symlinks, junctions,
// dangling links, hard links) are refused rather than followed.
// ponytail: a link swapped in between these checks and the append is not prevented (no O_NOFOLLOW on Windows).
async function target(repo, policy, rel) {
  const shown = rel.split(path.sep).join('/');
  const refuse = (why) => { throw new InputError(`${shown} refused: ${why}`); };
  const lexical = await guardPath(repo, path.join(repo, rel), policy);
  if (lexical.refused) refuse(lexical.refused);
  let realRepo;
  try { realRepo = await fsp.realpath(repo); } catch { refuse('repository not found'); }
  const dir = path.join(repo, path.dirname(rel));
  let info;
  try { info = await fsp.lstat(dir); } catch { refuse(`${path.dirname(rel)} is missing`); }
  if (info.isSymbolicLink() || !info.isDirectory()) refuse(`${path.dirname(rel)} is a link or not a folder`);
  const realDir = await fsp.realpath(dir);
  if (path.relative(path.join(realRepo, path.dirname(rel)), realDir) !== '') refuse(`${path.dirname(rel)} resolves outside its place in the repository`);
  const file = path.join(realDir, path.basename(rel));
  try {
    const st = await fsp.lstat(file);
    if (st.isSymbolicLink() || !st.isFile()) refuse('the file is a link or not a regular file');
    if (st.nlink > 1) refuse('the file has other hard links');
  } catch (error) {
    if (error instanceof InputError) throw error;
    if (error.code !== 'ENOENT') refuse(error.code || 'cannot inspect the file');
  }
  return file;
}

async function readOrEmpty(file) {
  try { return await fsp.readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function nextId(text, prefix) {
  let max = 0;
  for (const m of (text || '').matchAll(new RegExp(`^###\\s+${prefix}-(\\d+)\\b`, 'gm'))) max = Math.max(max, Number(m[1]));
  return `${prefix}-${max + 1}`;
}

export function appendApproval(repo, policy, input, knownKeys, now = new Date()) {
  return serial(async () => {
    const decision = String(input?.decision || '');
    if (!DECISIONS.includes(decision)) throw new InputError('decision must be approved or changes-requested');
    const key = String(input?.key || '');
    if (!KEY.test(key)) throw new InputError('unknown item key');
    if (!knownKeys.has(key)) throw new InputError('that item is no longer waiting for review; refresh');
    const item = line(input?.item ?? '', 200, 'item');
    const note = line(input?.note ?? '', 2000, 'note');
    const file = await target(repo, policy, APPROVALS);
    const existing = await readOrEmpty(file);
    const id = nextId(existing, 'AP');
    let text = existing === null ? APPROVALS_HEADER : existing.endsWith('\n') ? '' : '\n';
    text += `\n### ${id} [${decision}] ${key}\n- At: ${now.toISOString()}\n- Item: ${item || '(none)'}\n- Note: ${note || '(none)'}\n`;
    await fsp.appendFile(file, text, { encoding: 'utf8', flag: 'a' });
    return { id, file: 'handoffs/APPROVALS.md' };
  });
}

export function appendQuestion(repo, policy, input, now = new Date()) {
  return serial(async () => {
    const to = ['Claude', 'Codex'].find((a) => a === input?.to);
    if (!to) throw new InputError('to must be Claude or Codex');
    const title = line(input?.title ?? '', 160, 'title');
    if (!title) throw new InputError('title is required');
    const body = line(input?.body ?? '', 2000, 'body');
    const file = await target(repo, policy, QUEUE);
    const existing = await readOrEmpty(file);
    const id = nextId(existing, 'Q');
    let text = existing === null ? '# Question queue\n' : existing.endsWith('\n') ? '' : '\n';
    text += `\n### ${id} [open] Human -> ${to}: ${title}\n${body ? body + '\n' : ''}(asked ${now.toISOString()} via crucible-cockpit)\n`;
    await fsp.appendFile(file, text, { encoding: 'utf8', flag: 'a' });
    return { id, file: 'handoffs/QUEUE.md' };
  });
}
