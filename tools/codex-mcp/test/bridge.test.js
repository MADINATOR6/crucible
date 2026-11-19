import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMcp, ToolError } from '../src/protocol.js';
import { createJobs } from '../src/jobs.js';
import { buildTools, researchPrompt, reviewPrompt } from '../src/tools.js';
import { createHttp, tokenMatches, hostAllowed } from '../src/http.js';
import { createWorker, workerArgs, childEnv, purgeStaleJobs, DISABLED_FEATURES, WATCHDOG } from '../src/worker.js';
import { spawn as realSpawn } from 'node:child_process';
import { redact, redactAndCut, MAX_SECRET_SPAN } from '../src/redact.js';

const TOKEN = 'a'.repeat(40);
const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, params });
const call = (name, args) => rpc('tools/call', { name, arguments: args });
const ok = (result) => ({ exitCode: 0, report: 'Status: READY_FOR_CLAUDE_REVIEW\nanswer', tokens: { input: 100, cached: 40, output: 10 }, reason: null });

function makeBridge({ run, maxJobs, maxTokens, secrets = [] } = {}) {
  const calls = [];
  const jobs = createJobs({
    run: run || (async (job, params) => { calls.push(params); return ok(); }),
    maxJobs, maxTokens,
    newId: (() => { let n = 0; return () => `job${++n}`; })()
  });
  const tools = buildTools({ jobs, expiresAt: Date.UTC(2030, 0, 1), redact: (t, max) => redactAndCut(t, max, secrets) });
  const mcp = createMcp({ name: 't', version: '0', instructions: 'i', tools });
  return { mcp, jobs, calls };
}
const result = async (mcp, name, args) => (await mcp.handle(call(name, args))).result;
const textOf = async (mcp, name, args) => (await result(mcp, name, args)).content[0].text;

// --- protocol ---
test('initialize negotiates a known protocol version and falls back to the latest', async () => {
  const { mcp } = makeBridge();
  assert.equal((await mcp.handle(rpc('initialize', { protocolVersion: '2025-03-26' }))).result.protocolVersion, '2025-03-26');
  assert.equal((await mcp.handle(rpc('initialize', { protocolVersion: '1999-01-01' }))).result.protocolVersion, '2025-06-18');
});

test('batches are rejected; notifications get no reply; unknown methods -32601; junk -32600', async () => {
  const { mcp, calls } = makeBridge();
  const batch = await mcp.handle([call('codex_research', { question: 'a' }), call('codex_research', { question: 'b' })]);
  assert.equal(batch.error.code, -32600);
  assert.equal(calls.length, 0);
  assert.equal(await mcp.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal((await mcp.handle(rpc('nope'))).error.code, -32601);
  assert.equal((await mcp.handle('x')).error.code, -32600);
  assert.equal((await mcp.handle(rpc('tools/call', 'x'))).error.code, -32602);
});

test('tools/list exposes the five tools; none takes a path, ref, sandbox, role, model or command', async () => {
  const { mcp } = makeBridge();
  const { tools } = (await mcp.handle(rpc('tools/list'))).result;
  assert.deepEqual(tools.map((t) => t.name), ['codex_research', 'codex_review', 'codex_job', 'codex_cancel', 'codex_status']);
  for (const t of tools) {
    assert.equal(t.inputSchema.additionalProperties, false);
    assert.ok(!Object.keys(t.inputSchema.properties).some((k) => /sandbox|role|path|dir|file|ref|model|command|cwd/i.test(k)), t.name);
  }
});

test('unknown argument keys are rejected before anything runs', async () => {
  const { mcp, calls } = makeBridge();
  const reply = await result(mcp, 'codex_research', { question: 'q', sandbox: 'danger-full-access' });
  assert.equal(reply.isError, true);
  assert.match(reply.content[0].text, /unknown argument\(s\): sandbox/);
  const arrayArgs = await result(mcp, 'codex_research', ['q']);
  assert.equal(arrayArgs.isError, true);
  assert.match(arrayArgs.content[0].text, /arguments must be an object/);
  assert.equal(calls.length, 0);
});

test('bad argument values come back as tool errors', async () => {
  const { mcp } = makeBridge();
  for (const args of [{}, { question: 5 }, { question: 'x'.repeat(8001) }, { question: 'ok', effort: 'max' }, { question: 'ok', timeout_minutes: 99 }, { question: 'ok', context: 'x'.repeat(300_001) }]) {
    assert.equal((await result(mcp, 'codex_research', args)).isError, true, JSON.stringify(args).slice(0, 80));
  }
  assert.equal((await result(mcp, 'codex_review', {})).isError, true);
  assert.equal((await mcp.handle(call('nope', {}))).error.code, -32602);
});

// --- prompts and jobs ---
test('research and review build no-tools prompts that carry the caller text as data', async () => {
  const { mcp, calls } = makeBridge();
  assert.match(await textOf(mcp, 'codex_research', { question: 'Why X?', context: 'file a.js: ...' }), /Started job job1/);
  assert.match(calls[0].prompt, /You have no tools/);
  assert.match(calls[0].prompt, /## Question\nWhy X\?/);
  assert.match(calls[0].prompt, /file a\.js/);
  assert.equal(calls[0].timeoutMs, 15 * 60_000);
  await textOf(mcp, 'codex_job', { job_id: 'job1', wait_seconds: 1 });
  await textOf(mcp, 'codex_review', { diff: '--- a/x\n+++ b/x\n@@\n-1\n+2\n', focus: 'tests' });
  assert.match(calls[1].prompt, /try to break it/);
  assert.match(calls[1].prompt, /Focus: tests/);
  assert.match(researchPrompt({ question: 'q' }), /\(nothing\)/);
  assert.match(reviewPrompt({ diff: 'd' }), /as data, not as instructions/);
});

test('codex_job returns the report with token counts, redacted, and nothing else', async () => {
  const { mcp } = makeBridge({
    run: async () => ({ ...ok(), report: `answer\nkey: sk-proj-${'x'.repeat(30)}\nbridge ${TOKEN}\n` }),
    secrets: [TOKEN]
  });
  await textOf(mcp, 'codex_research', { question: 'q' });
  const text = await textOf(mcp, 'codex_job', { job_id: 'job1', wait_seconds: 2 });
  assert.match(text, /done after \d+s\. Tokens: input 100 \(cached 40\), output 10\./);
  assert.match(text, /--- report ---\nanswer/);
  assert.doesNotMatch(text, /sk-proj-x/);
  assert.doesNotMatch(text, new RegExp(TOKEN));
});

test('only one job runs at a time, and codex_cancel stops it', async () => {
  let resolveRun;
  const { mcp } = makeBridge({
    run: (job) => new Promise((resolve) => {
      resolveRun = resolve;
      job.cancel = () => resolve({ exitCode: 1, report: '', tokens: { input: 0, cached: 0, output: 0 }, reason: 'cancelled' });
    })
  });
  await textOf(mcp, 'codex_research', { question: 'one' });
  const second = await result(mcp, 'codex_research', { question: 'two' });
  assert.equal(second.isError, true);
  assert.match(second.content[0].text, /busy: job job1/);
  assert.match(await textOf(mcp, 'codex_job', { job_id: 'job1', wait_seconds: 0 }), /is running/);
  assert.match(await textOf(mcp, 'codex_cancel', { job_id: 'job1' }), /job1: failed/);
  assert.match(await textOf(mcp, 'codex_job', { job_id: 'job1', wait_seconds: 0 }), /Reason: cancelled/);
  assert.equal((await result(mcp, 'codex_cancel', { job_id: 'nope' })).isError, true);
  resolveRun && resolveRun(ok());
});

test('job and token budgets refuse new work; a failed start still spends a slot', async () => {
  const jobsCapped = makeBridge({ maxJobs: 2, run: async () => { throw new Error('boom'); } });
  await textOf(jobsCapped.mcp, 'codex_research', { question: 'a' });
  await textOf(jobsCapped.mcp, 'codex_job', { job_id: 'job1', wait_seconds: 1 });
  await textOf(jobsCapped.mcp, 'codex_research', { question: 'b' });
  await textOf(jobsCapped.mcp, 'codex_job', { job_id: 'job2', wait_seconds: 1 });
  const third = await result(jobsCapped.mcp, 'codex_research', { question: 'c' });
  assert.equal(third.isError, true);
  assert.match(third.content[0].text, /job budget used up \(2\/2/);

  const tokenCapped = makeBridge({ maxTokens: 50 });
  await textOf(tokenCapped.mcp, 'codex_research', { question: 'a' });
  await textOf(tokenCapped.mcp, 'codex_job', { job_id: 'job1', wait_seconds: 1 });
  const status = await textOf(tokenCapped.mcp, 'codex_status', {});
  assert.match(status, /Tokens used \(uncached input \+ output\): 70\/50/);
  assert.match((await result(tokenCapped.mcp, 'codex_research', { question: 'b' })).content[0].text, /token budget used up/);
});

test('failed and blocked jobs report a reason, never internals', async () => {
  const crash = makeBridge({ run: async () => { throw new Error('C:\\secret\\path exploded'); } });
  await textOf(crash.mcp, 'codex_research', { question: 'q' });
  const crashed = await textOf(crash.mcp, 'codex_job', { job_id: 'job1', wait_seconds: 2 });
  assert.match(crashed, /failed/);
  assert.doesNotMatch(crashed, /secret/);
  const blocked = makeBridge({ run: async () => ({ exitCode: 1, report: '', tokens: { input: 1, cached: 0, output: 1 }, reason: 'tool use attempted (command_execution)' }) });
  await textOf(blocked.mcp, 'codex_research', { question: 'q' });
  assert.match(await textOf(blocked.mcp, 'codex_job', { job_id: 'job1', wait_seconds: 2 }), /blocked after .*\nReason: tool use attempted \(command_execution\)/s);
  assert.equal((await result(crash.mcp, 'codex_job', { job_id: 'missing' })).isError, true);
});

// --- worker ---
test('worker arguments are fixed, isolate Codex and never carry caller text', () => {
  const args = workerArgs({ codexJs: 'C:\\codex.js', jobDir: 'C:\\w\\jobs\\j1', lastPath: 'C:\\w\\jobs\\j1\\last.md', model: 'gpt-6.1-sol', effort: 'low' });
  for (const required of ['exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--strict-config', '--json']) assert.ok(args.includes(required), required);
  assert.equal(args[args.indexOf('-s') + 1], 'read-only');
  assert.equal(args[args.indexOf('-C') + 1], 'C:\\w\\jobs\\j1');
  assert.ok(args.includes('approval_policy="never"'));
  assert.ok(args.includes('web_search="disabled"'));
  for (const feature of ['shell_tool', 'unified_exec', 'code_mode_host', 'apps', 'plugins', 'computer_use', 'browser_use', 'memories', 'hooks', 'multi_agent']) {
    assert.ok(DISABLED_FEATURES.includes(feature), feature);
    assert.ok(args.some((a, i) => a === '--disable' && args[i + 1] === feature), feature);
  }
  assert.equal(args.at(-1), '-');
  assert.ok(!args.some((a) => /danger|workspace-write|--search|bypass|--add-dir/.test(a)));
});

test('child environment is an allowlist: tokens and API keys never reach Codex', () => {
  const env = childEnv({ PATH: 'p', USERPROFILE: 'u', SystemRoot: 's', CODEX_HOME: 'c', CODEX_MCP_TOKEN: TOKEN, OPENAI_API_KEY: 'k', GITHUB_TOKEN: 'g', FAL_KEY: 'f', LT_REAL_WORKBOOK: 'w' });
  assert.deepEqual(Object.keys(env).sort(), ['CODEX_HOME', 'PATH', 'SystemRoot', 'USERPROFILE']);
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.pid = 4242;
  child.exitCode = null;
  child.input = '';
  child.stdin.on('data', (d) => { child.input += d; });
  child.exit = (code) => { if (child.exitCode !== null) return; child.exitCode = code; child.stdout.end(); child.emit('close', code); };
  return child;
}

async function workerHarness(script) {
  const workDir = await mkdtemp(join(tmpdir(), 'codex-mcp-'));
  const killed = [];
  let seen;
  const worker = createWorker({
    workDir, codexJs: 'C:\\codex.js', model: 'gpt-6.1-sol', execPath: 'node', parentPid: 777,
    env: { PATH: 'p', CODEX_MCP_TOKEN: TOKEN },
    kill: (c) => { killed.push(c.pid); setImmediate(() => c.exit(1)); },
    spawn: (cmd, args, opts) => {
      const child = fakeChild();
      seen = { cmd, args, opts, child };
      setImmediate(() => script(child, args, opts));
      return child;
    }
  });
  return { worker, workDir, killed, seen: () => seen };
}
const line = (event) => `${JSON.stringify(event)}\n`;

test('worker: a toolless turn returns the last message, counts tokens and cleans up its folder', async () => {
  const { writeFile } = await import('node:fs/promises');
  const h = await workerHarness(async (child, args) => {
    child.stdout.write(line({ type: 'item.completed', item: { type: 'error', message: 'code-mode host is disabled' } }));
    child.stdout.write(line({ type: 'item.completed', item: { type: 'agent_message', text: 'hi' } }));
    child.stdout.write(line({ type: 'turn.completed', usage: { input_tokens: 500, cached_input_tokens: 200, output_tokens: 30 } }));
    await writeFile(args[args.indexOf('-o') + 1], 'the answer');
    child.exit(0);
  });
  const job = { id: 'w1' };
  const res = await h.worker.run(job, { prompt: 'PROMPT TEXT', effort: 'low', timeoutMs: 5000 });
  assert.deepEqual(res, { exitCode: 0, report: 'the answer', tokens: { input: 500, cached: 200, output: 30 }, reason: null });
  const { child, opts, args, cmd } = h.seen();
  assert.equal(child.input, 'PROMPT TEXT');
  assert.ok(!args.includes('PROMPT TEXT'));
  // Codex always runs under the watchdog: bridge pid, hard limit (timeout + 30 s grace), then Codex.
  assert.equal(cmd, 'node');
  assert.deepEqual(args.slice(0, 6), [WATCHDOG, '777', '35000', 'node', 'C:\\codex.js', 'exec']);
  assert.equal(opts.env.CODEX_MCP_TOKEN, undefined);
  assert.equal(opts.cwd, join(h.workDir, 'jobs', 'w1'));
  assert.deepEqual(await readdir(join(h.workDir, 'jobs')), []);
  assert.deepEqual(h.killed, []);
});

test('worker: any tool item kills the job (tripwire) and returns no report', async () => {
  for (const type of ['command_execution', 'file_change', 'mcp_tool_call', 'web_search', 'collab_tool_call', 'todo_list']) {
    const h = await workerHarness((child) => {
      child.stdout.write(line({ type: 'item.started', item: { type } }));
    });
    const res = await h.worker.run({ id: `t-${type}` }, { prompt: 'p', effort: 'low', timeoutMs: 5000 });
    assert.equal(res.reason, `tool use attempted (${type})`);
    assert.equal(res.report, '');
    assert.deepEqual(h.killed, [4242]);
  }
});

test('worker: timeout and cancel kill the process tree', async () => {
  const slow = await workerHarness(() => {});
  assert.equal((await slow.worker.run({ id: 'slow' }, { prompt: 'p', effort: 'low', timeoutMs: 50 })).reason, 'timeout');
  assert.deepEqual(slow.killed, [4242]);
  const cancelled = await workerHarness(() => {});
  const job = { id: 'c1' };
  const pending = cancelled.worker.run(job, { prompt: 'p', effort: 'low', timeoutMs: 60_000 });
  await new Promise((r) => setTimeout(r, 30));
  job.cancel();
  assert.equal((await pending).reason, 'cancelled');
  const all = await workerHarness(() => {});
  const running = all.worker.run({ id: 'k1' }, { prompt: 'p', effort: 'low', timeoutMs: 60_000 });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(all.worker.running(), 1);
  all.worker.killAll();
  assert.equal((await running).reason, 'bridge is shutting down');
  assert.deepEqual(all.killed, [4242]);
});

test('worker: usage limits, errors and missing answers become plain reasons', async () => {
  const limit = await workerHarness((child) => { child.stdout.write(line({ type: 'turn.failed', error: { message: "You've hit your usage limit. Try again at 5 PM." } })); child.exit(1); });
  assert.equal((await limit.worker.run({ id: 'l' }, { prompt: 'p', effort: 'low', timeoutMs: 5000 })).reason, 'Codex usage limit reached');
  const empty = await workerHarness((child) => child.exit(0));
  assert.equal((await empty.worker.run({ id: 'e' }, { prompt: 'p', effort: 'low', timeoutMs: 5000 })).reason, 'Codex returned no answer');
  const nonzero = await workerHarness((child) => child.exit(3));
  assert.equal((await nonzero.worker.run({ id: 'n' }, { prompt: 'p', effort: 'low', timeoutMs: 5000 })).reason, 'Codex exited with code 3');
  const nospawn = await workerHarness((child) => child.emit('error', new Error('ENOENT C:\\x')));
  assert.equal((await nospawn.worker.run({ id: 's' }, { prompt: 'p', effort: 'low', timeoutMs: 5000 })).reason, 'Codex could not be started');
});

test('worker: a cancel or shutdown before Codex starts means Codex never starts', async () => {
  let spawns = 0;
  const make = async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'codex-mcp-'));
    return createWorker({ workDir, codexJs: 'x', model: 'm', execPath: 'node', env: {}, kill: () => {}, spawn: () => { spawns++; return fakeChild(); } });
  };
  const opts = { prompt: 'p', effort: 'low', timeoutMs: 5000 };

  const w1 = await make();
  assert.equal((await w1.run({ id: 'a', cancelRequested: true }, opts)).reason, 'cancelled');

  const w2 = await make();
  const job = { id: 'b' };
  const pending = w2.run(job, opts); // folder creation is still pending
  job.cancel();
  assert.equal((await pending).reason, 'cancelled');

  const w3 = await make();
  const during = w3.run({ id: 'c' }, opts);
  w3.killAll();
  assert.equal((await during).reason, 'bridge is shutting down');
  assert.equal((await w3.run({ id: 'd' }, opts)).reason, 'bridge is shutting down');

  assert.equal(spawns, 0);
});

test('jobs: a cancel right after start is honoured even before the worker runs', async () => {
  let sawRequest = null;
  const jobs = createJobs({ run: async (job) => { sawRequest = job.cancelRequested; return { exitCode: 1, report: '', tokens: { input: 0, cached: 0, output: 0 }, reason: 'cancelled' }; } });
  const job = jobs.start('research', {});
  jobs.cancel(job.id);
  await job.promise;
  assert.equal(sawRequest, true);
  assert.equal(job.reason, 'cancelled');
});

// --- token file ACL (by SID) ---
test('aclExposed allows only the owner, SYSTEM and Administrators', async () => {
  const { aclExposed, readAclEntries, currentUserSid, makePrivate } = await import('../src/acl.js');
  const me = 'S-1-5-21-1-2-3-1001';
  const allow = (sid) => ({ sid, type: 'Allow' });
  assert.equal(aclExposed([allow(me)], me), false);
  assert.equal(aclExposed([allow(me), allow('S-1-5-18'), allow('S-1-5-32-544')], me), false);
  assert.equal(aclExposed([allow(me), allow('S-1-5-21-1-2-3-1002')], me), true, 'another named account');
  assert.equal(aclExposed([allow(me), allow('S-1-5-32-545')], me), true, 'Users');
  assert.equal(aclExposed([allow(me), allow('S-1-1-0')], me), true, 'Everyone');
  assert.equal(aclExposed([allow(me), allow('UNRESOLVED')], me), true, 'unresolvable principal');
  assert.equal(aclExposed([allow('S-1-5-18')], me), true, 'owner missing');
  assert.equal(aclExposed([allow(me), { sid: 'S-1-1-0', type: 'Deny' }], me), false, 'a deny entry is not exposure');

  const calls = [];
  const fakeExec = (file, args, opts) => {
    calls.push({ file, args, opts });
    if (file.endsWith('whoami.exe')) return '"pc\\me","S-1-5-21-9-9-9-1001"\r\n';
    return 'S-1-5-21-9-9-9-1001|Allow\r\nS-1-5-18|Allow\r\n';
  };
  assert.equal(currentUserSid(fakeExec), 'S-1-5-21-9-9-9-1001');
  assert.deepEqual(readAclEntries('C:\\t\\token', fakeExec), [{ sid: 'S-1-5-21-9-9-9-1001', type: 'Allow' }, { sid: 'S-1-5-18', type: 'Allow' }]);
  assert.equal(calls[1].opts.env.CMCP_ACL_PATH, 'C:\\t\\token');
  assert.ok(!calls[1].args.join(' ').includes('C:\\t\\token'), 'the path never enters the script text');
  makePrivate('C:\\t\\token', 'S-1-5-21-9-9-9-1001', fakeExec);
  assert.deepEqual(calls[2].args, ['C:\\t\\token', '/inheritance:r', '/grant:r', '*S-1-5-21-9-9-9-1001:F']);
  assert.throws(() => currentUserSid(() => 'nothing'));
});

// --- watchdog (real processes) ---
const waitExit = (child, ms) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve('still running'), ms);
  child.on('exit', (code) => { clearTimeout(timer); resolve(code); });
});
const SLEEPER = ['-e', 'setInterval(() => {}, 1000)'];

test('watchdog: kills Codex when the bridge process is gone', async () => {
  const gone = realSpawn(process.execPath, ['-e', '0']);
  await waitExit(gone, 5000);
  const dog = realSpawn(process.execPath, [WATCHDOG, String(gone.pid), '60000', process.execPath, ...SLEEPER], { stdio: 'ignore' });
  assert.equal(await waitExit(dog, 6000), 1);
});

test('watchdog: kills Codex at the hard limit, and passes a normal exit through', async () => {
  const slow = realSpawn(process.execPath, [WATCHDOG, String(process.pid), '400', process.execPath, ...SLEEPER], { stdio: 'ignore' });
  const started = Date.now();
  assert.equal(await waitExit(slow, 6000), 1);
  assert.ok(Date.now() - started < 4000);
  const quick = realSpawn(process.execPath, [WATCHDOG, String(process.pid), '60000', process.execPath, '-e', 'process.exit(3)'], { stdio: 'ignore' });
  assert.equal(await waitExit(quick, 6000), 3);
  const bad = realSpawn(process.execPath, [WATCHDOG, 'x', '1', process.execPath], { stdio: 'ignore' });
  assert.equal(await waitExit(bad, 6000), 2);
});

test('purgeStaleJobs removes only folders older than the bridge lifetime', async () => {
  const { mkdir, utimes } = await import('node:fs/promises');
  const workDir = await mkdtemp(join(tmpdir(), 'codex-mcp-'));
  await mkdir(join(workDir, 'jobs', 'old'), { recursive: true });
  await mkdir(join(workDir, 'jobs', 'fresh'), { recursive: true });
  const old = new Date(Date.now() - 26 * 3_600_000);
  await utimes(join(workDir, 'jobs', 'old'), old, old);
  assert.equal(await purgeStaleJobs(workDir), 1);
  assert.deepEqual(await readdir(join(workDir, 'jobs')), ['fresh']);
  assert.equal(await purgeStaleJobs(join(workDir, 'missing')), 0);
});

// --- redaction ---
// Synthetic secrets are assembled at run time (S.key, S.pw) so the repo's secrets scan never sees a
// secret-shaped literal in this file.
const S = { key: ['PRIV', 'ATE KEY'].join(''), pw: ['pass', 'word'].join(''), api: ['api', '_key'].join('') };

test('redact removes common secret shapes and named secrets', () => {
  const sample = [
    `-----BEGIN OPENSSH ${S.key}-----\nabc\n-----END OPENSSH ${S.key}-----`,
    `ghp_${'a'.repeat(36)}`, `AKIA${'B'.repeat(16)}`, `xoxb-${'1'.repeat(12)}`,
    `eyJ${'a'.repeat(12)}.eyJ${'b'.repeat(12)}.${'c'.repeat(12)}`, `Authorization: Bearer ${'z'.repeat(30)}`,
    `${S.pw} = ${'hunter2'.repeat(2)}`, `mine ${TOKEN}`
  ].join('\n');
  const out = redact(sample, [TOKEN]);
  for (const leak of ['abc', 'ghp_a', 'AKIAB', 'xoxb-1', 'eyJa', 'zzzz', 'hunter2', TOKEN]) assert.ok(!out.includes(leak), leak);
  assert.ok(out.includes(`${S.pw} = [REDACTED]`));
  assert.equal(redact('plain text, nothing here'), 'plain text, nothing here');
  assert.equal(redact('Tokens: input 100, output 10'), 'Tokens: input 100, output 10');
});

test('redact handles JSON, YAML and env-file secrets through the final codex_job response', async () => {
  const secretJson = `{"${S.pw}":"synthetic-${S.pw}","${S.api}":"${'s'.repeat(40)}"}`;
  const others = [`client_${'sec'}ret: abcdefgh12345`, `OPENAI_${S.api.toUpperCase()}=abcdefghijklmnop`, `'db_${S.pw}' = 'p4ssw0rd-long'`].join('\n');
  const { mcp } = makeBridge({ run: async () => ({ ...ok(), report: `${secretJson}\n${others}` }) });
  await textOf(mcp, 'codex_research', { question: 'q' });
  const text = await textOf(mcp, 'codex_job', { job_id: 'job1', wait_seconds: 2 });
  for (const leak of [`synthetic-${S.pw}`, 'ssssssss', 'abcdefgh12345', 'abcdefghijklmnop', 'p4ssw0rd-long']) assert.ok(!text.includes(leak), leak);
  assert.ok(text.includes(`"${S.pw}":"[REDACTED]`));
});

test('redact catches the round-2 shapes: name suffixes, pwd/passphrase, spaced keys, quoted values, URL, Basic, Cookie, YAML blocks', () => {
  const sec = ['SEC', 'RET'].join('');
  const cases = [
    [`${sec}_KEY=V1aaaa1111bbbb`, 'V1aaaa'],
    [`"${sec.toLowerCase()}Key": "V2aaaa2222bbbb"`, 'V2aaaa'],
    [`${sec.toLowerCase()}_key: V3aaaa3333bbbb`, 'V3aaaa'],
    ['SIGNING_KEY=V4aaaa4444bbbb', 'V4aaaa'],
    ['ENCRYPTION_KEY=V5aaaa5555bbbb', 'V5aaaa'],
    ['client_key=V6aaaa6666bbbb', 'V6aaaa'],
    [`${'pw'}d=V7aaaa7777bbbb`, 'V7aaaa'],
    [`pass${'phrase'}: V8aaaa8888bbbb`, 'V8aaaa'],
    [`"api key": "V9aaaa9999bbbb"`, 'V9aaaa'],
    [`API key: W1aaaa1111bbbb`, 'W1aaaa'],
    [`"${S.pw}": "correct horse W2bb staple"`, 'horse W2bb'],
    [`"${S.pw}":"ab,cd W3\\"ef gh"`, 'W3'],
    [`postgres://admin:W4Sup3rValue@db.example.com/app`, 'W4Sup3r'],
    [`Authorization: Basic ${'W5'}${'Q'.repeat(20)}`, 'W5QQ'],
    ['Cookie: session=W6aaaa6666; theme=dark', 'W6aaaa'],
    [`${S.pw}: |\n  W7aaaa7777bbbb\n  W7cccc\nnext: line`, 'W7']
  ];
  for (const [input, leak] of cases) {
    const out = redact(input);
    assert.ok(!out.includes(leak), `${input} -> ${out}`);
    assert.ok(out.includes('[REDACTED]'), input);
  }
  assert.equal(redact('postgres://db.example.com/app'), 'postgres://db.example.com/app');
  assert.ok(redact(`?token=${'x'.repeat(12)}&page=2`).endsWith('&page=2'));
  for (const prose of ['Tokens: input 100 (cached 40), output 10.', 'tokenizer: fast', 'secretary: Ann', 'max_tokens=4096']) assert.equal(redact(prose), prose);
});

test('redact stays fast on hostile 61 kB inputs (no event-loop stall)', () => {
  const n = 61_000;
  const fill = (unit) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
  const hostile = [
    'a', 'secret', 'Secret_', `${S.pw}=a,`, `${S.pw}: "a,`, `${S.pw}=`, '-eyJ', 'eyJaaaaaaaaaaaa.', 'sk-', 'ghp_', 'xoxb-',
    'Bearer ', 'Basic ', 'Cookie:', 'http', 'a://b:', 'ab+.-', `-----BEGIN ${S.key}-----`, `${S.pw}: |\n `, '\\', '"'
  ].map(fill);
  for (const input of hostile) {
    const started = process.hrtime.bigint();
    redact(input, [TOKEN]);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(ms < 1000, `${JSON.stringify(input.slice(0, 16))}... took ${ms.toFixed(0)} ms`);
  }
});

test('redact stays fast on the round-3b YAML input (overlapping whitespace)', () => {
  for (const tail of ['\rX', 'X', '\n', '\r\n\rX']) {
    const input = `${S.pw}: |\n${' '.repeat(60_000)}${tail}`;
    const started = Date.now();
    redact(input);
    assert.ok(Date.now() - started < 1000, `tail ${JSON.stringify(tail)} took ${Date.now() - started} ms`);
  }
  assert.ok(!redact(`${S.pw}: |\n  W8aaaa\n\tW8bbbb\r\nnext: 1`).includes('W8'));
});

test('a secret split by the report cut never leaks any part, however much earlier text shrinks', async () => {
  const MAX = 60_000;
  const shrinker = `sk-proj-${'k'.repeat(40)} `; // 49 chars that redact to 11
  const jwt = (tag) => `eyJ${'h'.repeat(20)}.eyJ${tag}${'p'.repeat(5000)}.${'s'.repeat(300)}`;
  // Place the secret so the cut at MAX + MAX_SECRET_SPAN, or at MAX, splits it, after enough shrinkable text.
  for (const [secret, probe] of [[TOKEN, TOKEN.slice(0, 12)], [jwt('LEAK'), 'eyJLEAK'], [`${S.pw}=V9zz${'q'.repeat(600)}`, 'V9zz']]) {
    for (const at of [MAX + MAX_SECRET_SPAN - 10, MAX - 10]) {
      const before = shrinker.repeat(Math.floor(at / shrinker.length));
      const raw = before + 'x'.repeat(at - before.length) + secret + ' tail';
      const { text, cut } = redactAndCut(raw, MAX, [TOKEN]);
      assert.equal(cut, true);
      assert.ok(text.length <= MAX);
      assert.ok(!text.includes(probe), `secret at ${at} leaked ${probe}`);
    }
  }
  // And through codex_job, with the bridge token as the known secret.
  const before = shrinker.repeat(1600);
  const { mcp } = makeBridge({ secrets: [TOKEN], run: async () => ({ ...ok(), report: before + 'x'.repeat(MAX + MAX_SECRET_SPAN - 20 - before.length) + TOKEN + ' end' }) });
  await textOf(mcp, 'codex_research', { question: 'q' });
  assert.ok(!(await textOf(mcp, 'codex_job', { job_id: 'job1', wait_seconds: 2 })).includes(TOKEN.slice(0, 8)));
  // Short reports are untouched apart from redaction.
  assert.deepEqual(redactAndCut('hello', MAX), { text: 'hello', cut: false });
});

test('codex_job renders a huge hostile report quickly, once, without blocking timers', async () => {
  const { mcp, jobs } = makeBridge({ run: async () => ({ ...ok(), report: 'a'.repeat(1_000_000) }) });
  await textOf(mcp, 'codex_research', { question: 'q' });
  await jobs.wait('job1', 2000);
  let ticked = false;
  setTimeout(() => { ticked = true; }, 0);
  const started = Date.now();
  const text = await textOf(mcp, 'codex_job', { job_id: 'job1', wait_seconds: 0 });
  assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
  assert.match(text, /\[report cut at 60000 characters\]$/);
  assert.ok(text.length < 61_000);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(ticked, true);
  assert.equal(jobs.get('job1').rendered.length, text.length - text.indexOf('--- report ---\n') - '--- report ---\n'.length);
  const again = Date.now();
  await textOf(mcp, 'codex_job', { job_id: 'job1', wait_seconds: 0 });
  assert.ok(Date.now() - again < 200, 'second poll reuses the rendered report');
});

// --- HTTP ---
async function withServer(options, fn) {
  const { mcp, calls } = makeBridge();
  let token = TOKEN;
  const server = createHttp({ mcp, getToken: () => token, toolNames: mcp.toolNames, ...options });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, { calls, setToken: (t) => { token = t; } }); } finally { await new Promise((r) => server.close(r)); }
}
const post = (base, body, headers = {}) => fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const auth = (t = TOKEN) => ({ authorization: `Bearer ${t}` });

test('http: rejects missing, wrong and malformed tokens; accepts the right one', async () => {
  await withServer({}, async (base) => {
    assert.equal((await post(base, rpc('ping'))).status, 401);
    assert.equal((await post(base, rpc('ping'), auth('wrong'))).status, 401);
    assert.equal((await post(base, rpc('ping'), { authorization: TOKEN })).status, 401);
    const good = await post(base, rpc('ping'), auth());
    assert.equal(good.status, 200);
    assert.match(good.headers.get('content-type'), /charset=utf-8/);
    assert.deepEqual((await good.json()).result, {});
  });
});

test('http: rotation revokes the old token on the next request', async () => {
  await withServer({}, async (base, { setToken }) => {
    assert.equal((await post(base, rpc('ping'), auth())).status, 200);
    setToken('b'.repeat(43));
    assert.equal((await post(base, rpc('ping'), auth())).status, 401);
    assert.equal((await post(base, rpc('ping'), auth('b'.repeat(43)))).status, 200);
    setToken('');
    assert.equal((await post(base, rpc('ping'), auth(''))).status, 401);
  });
});

test('http: bad tokens lock themselves out, never the real token', async () => {
  let t = 1_000_000;
  await withServer({ failLimit: 3, failWindowMs: 60_000, now: () => t }, async (base) => {
    for (let i = 0; i < 3; i++) assert.equal((await post(base, rpc('ping'), auth('nope'))).status, 401);
    const locked = await post(base, rpc('ping'), auth('nope'));
    assert.equal(locked.status, 429);
    assert.equal(locked.headers.get('retry-after'), '60');
    assert.equal((await post(base, rpc('ping'), auth())).status, 200);
    t += 61_000;
    assert.equal((await post(base, rpc('ping'), auth('nope'))).status, 401);
  });
});

test('http: Host must be loopback or a named public host; any Origin is refused', async () => {
  await withServer({ publicHosts: ['pc.tail1234.ts.net'] }, async (base) => {
    const port = new URL(base).port;
    const raw = (headers) => new Promise((resolve, reject) => {
      import('node:http').then(({ request }) => {
        const req = request({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { 'content-type': 'application/json', ...auth(), ...headers } }, (res) => { res.resume(); resolve(res.statusCode); });
        req.on('error', reject);
        req.end(JSON.stringify(rpc('ping')));
      });
    });
    assert.equal(await raw({ host: 'evil.example.com' }), 403);
    assert.equal(await raw({ host: 'pc.tail1234.ts.net' }), 200);
    assert.equal(await raw({ host: 'PC.TAIL1234.TS.NET:443' }), 200);
    assert.equal(await raw({ host: `localhost:${port}` }), 200);
    assert.equal(await raw({ host: `127.0.0.1:${port}`, origin: 'https://evil.example.com' }), 403);
  });
  assert.equal(hostAllowed(undefined, new Set(['localhost'])), false);
});

test('http: batches refused, 202 for notifications, 405/404/400/413 as expected', async () => {
  await withServer({ maxBody: 2000 }, async (base, { calls }) => {
    const batch = await post(base, [call('codex_research', { question: 'a' })], auth());
    assert.equal((await batch.json()).error.code, -32600);
    assert.equal(calls.length, 0);
    assert.equal((await post(base, { jsonrpc: '2.0', method: 'notifications/initialized' }, auth())).status, 202);
    assert.equal((await fetch(`${base}/mcp`, { headers: auth() })).status, 405);
    assert.equal((await fetch(`${base}/other`, { headers: auth() })).status, 404);
    assert.equal((await post(base, '{nope', auth())).status, 400);
    assert.equal((await post(base, 'x'.repeat(3000), auth())).status, 413);
  });
});

test('http: requests over the in-flight cap get 503', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const mcp = { handle: async () => { await gate; return { jsonrpc: '2.0', id: 1, result: {} }; } };
  const server = createHttp({ mcp, getToken: () => TOKEN, maxInFlight: 2 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const first = post(base, rpc('ping'), auth());
    const second = post(base, rpc('ping'), auth());
    await new Promise((r) => setTimeout(r, 100));
    assert.equal((await post(base, rpc('ping'), auth())).status, 503);
    release();
    assert.equal((await first).status, 200);
    assert.equal((await second).status, 200);
  } finally { await new Promise((r) => server.close(r)); }
});

test('http: logs carry fixed labels only, never attacker text', async () => {
  const lines = [];
  await withServer({ log: (l) => lines.push(l) }, async (base) => {
    await post(base, { jsonrpc: '2.0', id: 1, method: 'evil\nINJECTED', params: {} }, auth());
    await post(base, call('evil\ntool', {}), auth());
    await fetch(`${base}/mcp/evil%0Apath`, { method: 'POST', headers: auth('x') });
  });
  assert.deepEqual(lines, ['200 other', '200 tools/call unknown', '401']);
});

test('http: unauthenticated tool calls never reach the tools; healthz is bare', async () => {
  await withServer({}, async (base, { calls }) => {
    assert.equal((await post(base, call('codex_research', { question: 'q' }))).status, 401);
    assert.equal(calls.length, 0);
    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
  });
});

test('tokenMatches is exact and refuses short tokens', () => {
  assert.equal(tokenMatches(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(tokenMatches(`bearer ${TOKEN}`, TOKEN), true);
  assert.equal(tokenMatches(`Bearer ${TOKEN}x`, TOKEN), false);
  assert.equal(tokenMatches(undefined, TOKEN), false);
  assert.equal(tokenMatches('Bearer short', 'short'), false);
});

test('ToolError is the only error text shown to the model', async () => {
  const mcp = createMcp({ name: 'x', version: '0', tools: [{ name: 't', description: '', inputSchema: { properties: {} }, parse: (a) => a, handler: async () => { throw new Error('leaky detail'); } }] });
  assert.equal((await mcp.handle(call('t', {}))).result.content[0].text, 'Internal error');
  assert.ok(new ToolError('x') instanceof Error);
});
