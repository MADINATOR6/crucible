import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { snapshot } from '../src/sources.js';
import { buildCockpit, parseCollabSection, parseQueueFeed, parseDecisions, topSection } from '../src/model.js';
import { fixtureCopy } from './helpers.js';

const NOW = new Date('2026-01-01T01:00:00Z');
const GIT = { branches: [{ name: 'claude/feat-ui', committedAt: '2026-01-01T00:50:00Z', sha: 'aaa1111' }, { name: 'codex/feat-backend', committedAt: '2026-01-01T00:20:00Z', sha: 'bbb2222' }], upstream: null, health: [] };
const options = (repo) => ({ repo, stateDir: 'state', env: {}, silenceMinutes: 30 });

test('view model: task, allowlist, budget, loop, agents and queue from the fixture', async (t) => {
  const repo = fixtureCopy(t);
  const { view } = await snapshot(options(repo), NOW, GIT);
  assert.equal(view.task.title, 'Synthetic cockpit fixture');
  assert.equal(view.task.id, 'FIX-COCKPIT');
  assert.equal(view.task.mode, 'Peer');
  assert.deepEqual(view.task.allowlist, ['tools/fixture/**', 'handoffs/QUEUE.md', 'handoffs/APPROVALS.md']);
  assert.deepEqual(view.task.items.map((i) => [i.done, i.owner]), [[true, 'Claude'], [false, 'Codex'], [false, null]]);
  assert.equal(view.task.unassigned, 1);

  // effective = 2000 - 1000 + 200; normal class target 4000 in the fixture policy.
  assert.deepEqual({ ...view.budget, unit: undefined }, { available: true, taskId: 'FIX-COCKPIT', class: 'normal', used: 1200, target: 4000, remaining: 2800, unit: undefined, dispatchesUsed: 1, maxDispatches: 2 });

  // Only the newest COLLAB section counts; the older task's Phase 9 is ignored.
  assert.deepEqual(view.loop.phases.map((p) => `${p.n}:${p.agent}:${p.role}:${p.status}`), ['1:Claude:PLAN:done', '2:Claude:IMPLEMENT:active', '3:Codex:REVIEW:pending']);
  assert.equal(view.loop.summary, 'Claude planned → Claude implementing → next: Codex (Review)');
  assert.deepEqual(view.collab.unparsedRoles, ['A free-form role line the cockpit cannot place']);
  assert.deepEqual(view.collab.decisions, ['F2: second synthetic decision.', 'F1: first synthetic decision.']);

  const [claude, codex] = view.agents;
  assert.deepEqual([claude.status, claude.role, claude.phase], ['active', 'IMPLEMENT', 'Implementation']);
  assert.deepEqual([codex.status, codex.role, codex.phase], ['next', 'REVIEW', 'Review']);
  assert.deepEqual(claude.waitingFor, ['Q-3 from Codex']);
  assert.deepEqual(codex.waitingFor, ['Q-2 from Claude']);
  assert.deepEqual(claude.branches.map((b) => b.name), ['claude/feat-ui']);
  assert.equal(codex.lastDispatch, '2026-01-01T00:40:00.000Z');
  assert.equal(claude.lastDispatch, null, 'no source records Claude runs');

  assert.equal(view.queue.entries.length, 4);
  assert.equal(view.queue.malformed, 1);
  assert.equal(view.queue.open, 3);
  const q1 = view.queue.entries.find((e) => e.id === 'Q-1');
  assert.deepEqual(q1.answers, [{ by: 'Codex', text: '4780 is fine.' }]);
  assert.deepEqual(q1.body, ['Default port question.']);

  assert.ok(view.flags.some((f) => f.kind === 'deadlock' && /Q-3.*Q-2/.test(f.text)));
  assert.ok(!view.flags.some((f) => f.kind === 'silence'), 'files changed just now are not silent');
});

test('human review items: pending ccx approvals, waiting tags, questions for Human, unpushed commits', async (t) => {
  const repo = fixtureCopy(t);
  const { data, view } = await snapshot(options(repo), NOW, GIT);
  const keys = view.review.items.map((i) => i.key);
  assert.ok(keys.includes('ccx:A-0007'));
  assert.ok(!keys.includes('ccx:A-0006'), 'used approvals are not waiting');
  assert.ok(keys.includes('qa:Q-4'));
  const tag = view.review.items.find((i) => i.kind === 'waiting tag');
  assert.equal(tag.source, 'handoffs/NOTES-fixture.md:3');
  assert.match(tag.title, /confirm the release window/);
  assert.match(view.review.items.find((i) => i.key === 'ccx:A-0007').command, /ccx\.ps1 approve -Id A-0007/);
  assert.ok(!keys.some((k) => k.startsWith('push:')), 'no git repo, no push item');

  const withGit = buildCockpit({ ...data, git: { ...data.git, branch: 'main', head: 'abc1234' } }, { ...GIT, upstream: { name: 'origin/main', ahead: 2, behind: 0 } }, NOW, {});
  const push = withGit.review.items.find((i) => i.key === 'push:main@abc1234');
  assert.match(push.title, /main is 2 commit\(s\) ahead of origin\/main/);
  assert.match(push.note, /ccx gate/);
});

test('decisions in APPROVALS.md attach to their items; the newest decision wins', async (t) => {
  const repo = fixtureCopy(t);
  writeFileSync(path.join(repo, 'handoffs', 'APPROVALS.md'), '# Human decisions\n\n### AP-1 [changes-requested] ccx:A-0007\n- At: 2026-01-01T00:50:00Z\n- Note: wait\n\n### AP-2 [approved] ccx:A-0007\n- At: 2026-01-01T00:55:00Z\n- Note: go\n');
  const { view } = await snapshot(options(repo), NOW, GIT);
  const item = view.review.items.find((i) => i.key === 'ccx:A-0007');
  assert.equal(item.decision.id, 'AP-2');
  assert.equal(item.decision.decision, 'approved');
  assert.equal(item.decision.note, 'go');
  assert.equal(view.review.decisions[0].id, 'AP-2', 'log is newest first');
});

test('silence after the threshold; blocked phases; budget n/a when the task is not in ccx', async (t) => {
  const repo = fixtureCopy(t);
  const later = new Date(Date.now() + 2 * 3600 * 1000);
  let { view } = await snapshot(options(repo), later, GIT);
  const silence = view.flags.find((f) => f.kind === 'silence');
  assert.ok(silence);
  assert.match(silence.text, /threshold 30 min/);

  const collab = path.join(repo, 'handoffs', 'COLLAB.md');
  writeFileSync(collab, readFileSync(collab, 'utf8').replace('Claude [IMPLEMENT] (active)', 'Claude [IMPLEMENT] (blocked)'));
  writeFileSync(path.join(repo, 'TASK.md'), readFileSync(path.join(repo, 'TASK.md'), 'utf8').replace('FIX-COCKPIT', 'NOT-REGISTERED'));
  ({ view } = await snapshot(options(repo), NOW, GIT));
  assert.ok(view.flags.some((f) => f.kind === 'blocked' && /Phase 2/.test(f.text)));
  assert.equal(view.loop.summary, 'No active phase declared');
  assert.equal(view.budget.available, false);
  assert.match(view.budget.reason, /NOT-REGISTERED is not registered in ccx/);
});

test('missing sources degrade to n/a instead of failing', async (t) => {
  const repo = mkdtempSync(path.join(tmpdir(), 'crucible-cockpit-empty-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const { view } = await snapshot(options(repo), NOW, { branches: [], upstream: null, health: [] });
  assert.equal(view.task, null);
  assert.equal(view.collab, null);
  assert.equal(view.budget.available, false);
  assert.equal(view.loop.summary, 'No active phase declared');
  assert.deepEqual(view.queue.entries, []);
  assert.deepEqual(view.review.items, []);
  assert.ok(view.health.some((h) => h.name === 'task file' && h.status === 'missing'));
  assert.ok(view.health.some((h) => h.name === 'approvals' && h.status === 'missing'));
});

test('parsers: partial writes, odd headings and control characters', () => {
  assert.equal(topSection('no heading\nPhase: 1').title, null);
  const half = parseCollabSection('# C\nPhase: 1 x\n## Roles\n- Phase 1 Build: Claude [IMPLEMENT] (act');
  assert.deepEqual(half.phases, [], 'a half-written role line is not guessed');
  assert.deepEqual(half.unparsedRoles, ['Phase 1 Build: Claude [IMPLEMENT] (act']);
  const unknown = parseCollabSection('# C\n## Roles\n- Phase 1 Build: Gemini [IMPLEMENT] (active)\n- Phase 2 Review: Codex [REVIEW]');
  assert.deepEqual(unknown.phases.map((p) => p.status), ['unknown']);
  const feed = parseQueueFeed('### Q-1 [open] Claude -> Codex: title \u001b[2J‮\nbody line\n### Q-2 [open] Codex -> Claude');
  assert.equal(feed.entries.length, 1);
  assert.equal(feed.malformed, 1);
  assert.doesNotMatch(feed.entries[0].title, /[\u001b‮]/);
  assert.deepEqual(parseDecisions('### AP-1 [approved] ccx:A-1\n- Note: ok\n### AP-x [maybe] ccx:A-2\n- Note: ignored'), [{ id: 'AP-1', decision: 'approved', key: 'ccx:A-1', at: null, item: null, note: 'ok' }]);
});
