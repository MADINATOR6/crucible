import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync, unlinkSync, mkdirSync, appendFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, readBounded, parseJsonl } from '../src/collect.js';
import { buildPanels, renderLines, PANEL_TITLES, effectiveClass } from '../src/panels.js';
import { clean } from '../src/text.js';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'repo');
const NOW = new Date('2026-01-01T01:00:00Z');

function copyFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'crucible-monitor-'));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

async function view(repo, extra = {}) {
  const data = await collect({ repo, stateDir: 'state', env: {}, ...extra });
  const panels = buildPanels(data, NOW, { count: 1, at: NOW, ms: 1, interval: 0 });
  const byTitle = Object.fromEntries(panels.map((p) => [p.title, p.lines.join('\n')]));
  return { data, panels, byTitle, text: renderLines(panels).lines.join('\n') };
}

const health = (data, name) => data.health.find((h) => h.name === name);

test('renders all eight panels with correct fixture values', async (t) => {
  const repo = copyFixture();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const { panels, byTitle, data } = await view(repo);
  assert.deepEqual(panels.map((p) => p.title), PANEL_TITLES);

  // Configured versus routed versus observed.
  assert.match(byTitle['Agents & Models'], /lead fixture-claude-lead/);
  assert.match(byTitle['Agents & Models'], /routine\s+codex fixture-codex-routine effort low\.\.medium/);
  assert.match(byTitle['Agents & Models'], /complex\s+codex \(default fixture-codex-default\)/);
  assert.match(byTitle['Agents & Models'], /Routed .*\n.*T-1\s+codex fixture-codex-routed low route worker/);
  assert.match(byTitle['Agents & Models'], /T-1\s+implement codex\/openai model not recorded effort medium exit 0/);
  assert.doesNotMatch(byTitle['Agents & Models'], /T-1\s+implement codex\/openai model fixture-codex-normal/, 'configured model never shown as used');
  assert.match(byTitle['Agents & Models'], /codex unavailable until 2099-01-01 00:00Z \(in future\)/);
  assert.match(byTitle['Agents & Models'], /provider gemini limited until 2020-01-01 00:00Z \(passed\)/);
  assert.match(byTitle['Agents & Models'], /Claude runs: n\/a/);

  // Usage: duplicate counted once, null tokens excluded, task-done not added, partial line skipped.
  const usage = byTitle.Usage;
  assert.match(usage, /3 run\(s\), 1 without a token record, 1 duplicate\(s\) counted once/);
  assert.match(usage, /codex\/openai\/not recorded\s+1\s+1,000\s+400\s+100\s+700/);
  assert.match(usage, /gemini\/gemini\/auto\s+1\s+200\s+0\s+50\s+250/);
  assert.doesNotMatch(usage, /999,999/);
  assert.match(usage, /Claude: n\/a/);

  // Task.
  const task = byTitle.Task;
  assert.match(task, /title: Task: synthetic fixture task/);
  assert.match(task, /task ID: FIX-1 · mode: Dispatch/);
  assert.match(task, /write allowlist \(## Write allowlist\):\n\s+- `src\/a\.js`/);
  assert.match(task, /completion criteria \(## Done When\) \[x\] 1, \[ \] 1/);
  assert.match(task, /stop conditions \(## Stop conditions\):\n\s+- Stop if the fixture is missing\./);
  assert.match(task, /ccx open tasks .*: 2\n\s+T-1\s+active\s+implement\s+owner codex\s+owns src\/a\.js, test\/a\.test\.js/);
  assert.match(task, /T-2\s+planned\s+docs\s+owner claude owns docs\//);
  assert.doesNotMatch(task, /T-3/, 'done tasks are not open');

  // Handoffs: explicit fields only; a hopeful filename proves nothing; template excluded.
  const handoffs = byTitle.Handoffs;
  assert.match(handoffs, /2 note\(s\)/);
  assert.match(handoffs, /status: READY_FOR_CLAUDE_REVIEW · branch\/commit: fixture\/branch @ abc1234 \(pushed: no\)/);
  assert.match(handoffs, /checks: node --test - PASS \(synthetic\) · next: Codex reviews/);
  assert.match(handoffs, /verified-approved-committed\.md — A note whose filename sounds finished .*\n\s+status: not recorded · branch\/commit: not recorded\n\s+checks: not recorded · next: not recorded/);
  assert.doesNotMatch(handoffs, /excluded template value/);

  // Collaboration.
  const collab = byTitle.Collaboration;
  assert.match(collab, /phase: 2 Implementation and tests/);
  assert.match(collab, /decisions \(newest first\): 2\n\s+D2: second/);
  assert.match(collab, /1 open, 1 answered, 1 heading\(s\) not in the documented format\n\s+Q-2 Codex -> Claude: synthetic open question/);

  // Budget: class + override, attemptBase, high risk raises routine to complex, effective tokens.
  const budget = byTitle['Budget & Limits'];
  assert.match(budget, /T-1\s+normal\s+dispatches 1\/2 \(1 left\) · tokens 700\/4,000 effective \(3,300 left\) · reviews 1\/1/);
  assert.match(budget, /T-2\s+complex\s+dispatches 1\/3 \(2 left\) · tokens 0\/15,000 effective \(15,000 left\) · reviews 0\/2 · credit cap 7 \(spent: n\/a, ledger not read\)/);

  // Verification & approvals.
  const verify = byTitle['Verification & Approvals'];
  assert.match(verify, /cannot grant or resolve/);
  assert.match(verify, /pending 1 · used 1/);
  assert.match(verify, /A-0001\s+pending\s+L4 push target abc1234/);
  assert.doesNotMatch(verify, /A-0002\s+used/, 'used approvals are counted, not listed');
  assert.match(verify, /T-1\s+required: deterministic, cross-model-review · verification: PASS \(full\) · last review: pass by codex/);
  assert.match(verify, /T-2\s+required: deterministic, cross-model-review, independent-verifier · verification: not recorded · last review: none recorded/);
  assert.match(verify, /Unacknowledged notifications: 1\n.*Synthetic unread notice/);
  assert.match(verify, /Pending: synthetic review/);

  // Health.
  assert.equal(health(data, 'policy').status, 'ok');
  assert.equal(health(data, 'ccx state').status, 'ok');
  const tele = data.health.find((h) => h.name === 'telemetry');
  assert.equal(tele.status, 'partial');
  assert.match(tele.detail, /1 partial line\(s\) skipped; 2 invalid line\(s\) skipped/);
  assert.match(byTitle.Health, /unrecognised kinds ignored: 1/);
  assert.equal(health(data, 'git').status, 'unreadable', 'a temp copy is not a git repository');
});

test('missing sources: every panel still renders with n/a and Health says missing', async (t) => {
  const repo = mkdtempSync(path.join(tmpdir(), 'crucible-monitor-empty-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const { panels, data, byTitle } = await view(repo);
  assert.equal(panels.length, 8);
  for (const p of panels) assert.ok(p.lines.length > 0, `${p.title} has lines`);
  assert.equal(health(data, 'policy').status, 'missing');
  assert.equal(health(data, 'ccx state').status, 'missing');
  assert.equal(health(data, 'task file').status, 'missing');
  assert.equal(health(data, 'handoffs').status, 'missing');
  assert.match(byTitle.Usage, /n\/a \(no dispatch records/);
  assert.match(byTitle['Budget & Limits'], /n\/a/);
  assert.match(byTitle['Verification & Approvals'], /Approvals: n\/a \(ccx state unavailable\)/);
});

test('empty, malformed, unreadable and unsupported sources are reported, not fabricated', async (t) => {
  const repo = copyFixture();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  writeFileSync(path.join(repo, 'state', 'state.json'), '');
  writeFileSync(path.join(repo, 'state', 'telemetry.jsonl'), '');
  writeFileSync(path.join(repo, 'ccx', 'policy.json'), '{ "schema": 1, "models": ');
  unlinkSync(path.join(repo, 'TASK.md'));
  mkdirSync(path.join(repo, 'TASK.md'));
  let v = await view(repo);
  assert.equal(health(v.data, 'ccx state').status, 'parse-error');
  assert.equal(health(v.data, 'policy').status, 'parse-error');
  assert.equal(health(v.data, 'task file').status, 'unreadable');
  assert.equal(v.data.health.find((h) => h.name === 'telemetry').status, 'ok');
  assert.match(v.byTitle['Agents & Models'], /Configured: n\/a/);
  assert.match(v.byTitle.Usage, /n\/a \(no dispatch records/);

  writeFileSync(path.join(repo, 'state', 'state.json'), JSON.stringify({ schema: 2, tasks: { X: { id: 'X', status: 'active' } } }));
  writeFileSync(path.join(repo, 'ccx', 'policy.json'), '[1,2,3]');
  v = await view(repo);
  assert.equal(health(v.data, 'ccx state').status, 'unsupported');
  assert.match(health(v.data, 'ccx state').detail, /schema 2; supported 1/);
  assert.equal(health(v.data, 'policy').status, 'unsupported');
  assert.doesNotMatch(v.text, /\bX\s+active/, 'unsupported state is not interpreted');
});

test('JSON Lines: tail window, partial writes and invalid lines', async (t) => {
  assert.deepEqual(parseJsonl('{"a":1}\n{"b":2}\n', false), { records: [{ a: 1 }, { b: 2 }], partial: 0, invalid: 0 });
  assert.deepEqual(parseJsonl('1}\n{"b":2}\n{"c":', true), { records: [{ b: 2 }], partial: 2, invalid: 0 });
  assert.deepEqual(parseJsonl('', false), { records: [], partial: 0, invalid: 0 });
  const dir = mkdtempSync(path.join(tmpdir(), 'crucible-monitor-jsonl-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'big.jsonl');
  writeFileSync(file, Array.from({ length: 50 }, (_, i) => JSON.stringify({ i })).join('\n') + '\n');
  const read = await readBounded(file, 64, { tail: true });
  assert.equal(read.cut, true);
  const parsed = parseJsonl(read.text, read.cut);
  assert.equal(parsed.records.at(-1).i, 49);
  assert.ok(parsed.records.length < 50);
  assert.equal((await readBounded(file, 64)).status, 'too-large', 'whole-file reads refuse oversize files');
});

test('terminal control sequences in source text are neutralised', async (t) => {
  const repo = copyFixture();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const evil = '# Evil \u001b[2J\u001b]0;pwned\u0007 title ‮eman\u009b31m\n\nStatus: OK\u001b[31m red\n';
  writeFileSync(path.join(repo, 'handoffs', 'evil.md'), evil);
  appendFileSync(path.join(repo, 'state', 'telemetry.jsonl'), '\n' + JSON.stringify({ kind: 'route', at: '2026-01-01T00:59:00Z', taskId: 'T-\u001b[5m', agent: 'codex\r\nIGNORE PREVIOUS', model: 'm', effort: 'low', route: 'worker' }) + '\n');
  const { text } = await view(repo);
  assert.doesNotMatch(text, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/, 'no control or bidi characters reach the screen');
  assert.match(text, /Evil \?\[2J\?\]0;pwned\? title \?eman\?31m/);
  assert.match(text, /T-\?\[5m\s+codex IGN…/, 'embedded line breaks are flattened and the field capped');
  assert.equal(clean('a b c\td'), 'a b c d');
  assert.equal(clean('x'.repeat(10), 5), 'xxxx…');
});

test('refresh picks up changed and deleted sources without crashing', async (t) => {
  const repo = copyFixture();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  let v = await view(repo);
  assert.match(v.byTitle.Collaboration, /phase: 2 Implementation and tests/);
  writeFileSync(path.join(repo, 'handoffs', 'COLLAB.md'), '# C\n\nPhase: 3 Independent review\n');
  unlinkSync(path.join(repo, 'state', 'telemetry.jsonl'));
  rmSync(path.join(repo, 'handoffs', 'QUEUE.md'));
  v = await view(repo);
  assert.match(v.byTitle.Collaboration, /phase: 3 Independent review/);
  assert.match(v.byTitle.Collaboration, /roles: n\/a \(no heading\)/);
  assert.match(v.byTitle.Collaboration, /QUEUE\.md: n\/a/);
  assert.equal(v.data.health.find((h) => h.name === 'telemetry').status, 'missing');
  assert.match(v.byTitle.Usage, /n\/a/);
  rmSync(path.join(repo, 'state'), { recursive: true });
  v = await view(repo);
  assert.equal(health(v.data, 'ccx state').status, 'missing');
});

test('task file option refuses paths outside the repo and privacy-excluded paths', async (t) => {
  const repo = copyFixture();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  mkdirSync(path.join(repo, 'private'));
  writeFileSync(path.join(repo, 'private', 'secret.md'), '# PRIVATE CONTENT\n');
  let v = await view(repo, { taskFile: 'private/secret.md' });
  assert.equal(health(v.data, 'task file').status, 'refused');
  assert.doesNotMatch(v.text, /PRIVATE CONTENT/);
  v = await view(repo, { taskFile: '../outside.md' });
  assert.equal(health(v.data, 'task file').status, 'refused');
  writeFileSync(path.join(repo, 'handoffs', 'T-ALT.md'), '# alt\n');
  v = await view(repo, { taskFile: 'handoffs/2026-01-01-claude-fixture.md' });
  assert.match(v.byTitle.Task, /title: 2026-01-01 · Claude · fixture handoff/);
});

test('links and junctions cannot carry the task file or handoffs outside the repo or into private paths', async (t) => {
  const repo = copyFixture();
  const outside = mkdtempSync(path.join(tmpdir(), 'crucible-monitor-outside-'));
  t.after(() => { rmSync(repo, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });
  writeFileSync(path.join(outside, 'secret.md'), '# OUTSIDE SECRET\n');
  mkdirSync(path.join(repo, 'private'));
  writeFileSync(path.join(repo, 'private', 'secret.md'), '# PRIVATE SECRET\n');
  symlinkSync(outside, path.join(repo, 'out-link'), 'junction');
  symlinkSync(path.join(repo, 'private'), path.join(repo, 'alias'), 'junction');
  let v = await view(repo, { taskFile: 'out-link/secret.md' });
  assert.equal(health(v.data, 'task file').status, 'refused');
  assert.match(health(v.data, 'task file').detail, /outside the repository \(after resolving links\)/);
  v = await view(repo, { taskFile: 'alias/secret.md' });
  assert.match(health(v.data, 'task file').detail, /privacy\.excludePaths \(after resolving links\)/);
  assert.doesNotMatch(v.text, /SECRET/);

  rmSync(path.join(repo, 'handoffs'), { recursive: true });
  symlinkSync(outside, path.join(repo, 'handoffs'), 'junction');
  v = await view(repo);
  assert.equal(health(v.data, 'handoffs').status, 'refused');
  assert.doesNotMatch(v.text, /OUTSIDE SECRET/);
});

test('an unknown risk or class gives no budget, like Get-CcxClass', () => {
  const policy = { classes: { normal: {} }, defaults: { class: 'normal', risk: 'low' }, risk: { levels: ['low', 'high'] } };
  assert.equal(effectiveClass(policy, { class: 'normal', risk: 'bogus' }), null);
  assert.equal(effectiveClass({ ...policy, risk: {} }, { class: 'normal' }), null);
});

test('effective class mirrors ccx: high risk raises the class, unknown class is n/a', () => {
  const policy = { classes: { routine: {}, normal: {}, complex: {} }, defaults: { class: 'normal', risk: 'low' }, risk: { levels: ['low', 'medium', 'high'], high: { minClass: 'complex' } } };
  assert.equal(effectiveClass(policy, { class: 'routine', risk: 'high' }), 'complex');
  assert.equal(effectiveClass(policy, { class: 'routine', risk: 'medium' }), 'routine');
  assert.equal(effectiveClass(policy, {}), 'normal');
  assert.equal(effectiveClass(policy, { class: 'mystery' }), null);
});
