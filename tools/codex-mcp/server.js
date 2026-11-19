#!/usr/bin/env node
// Codex MCP bridge. Codex answers from text the caller sends; it has no tools and sees no files.
//   node server.js --init [--rotate]      create (or replace) the token file; prints its path only
//   node server.js [options]              HTTP on 127.0.0.1:8787/mcp (a tunnel in front for cloud sessions)
//   node server.js --stdio [options]      local stdio server, no token
// Options: --public-host <name[,name]>  tunnel hostname(s) to accept   --port <n> (8787)
//          --hours <n> (8, max 24)        --max-jobs <n> (20)             --max-tokens <n> (5000000)
//          --model <slug> (gpt-6.1-sol)
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { aclExposed, currentUserSid, makePrivate, readAclEntries } from './src/acl.js';
import { userInfo } from 'node:os';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { createMcp } from './src/protocol.js';
import { createJobs } from './src/jobs.js';
import { createWorker, findCodexJs, purgeStaleJobs } from './src/worker.js';
import { buildTools } from './src/tools.js';
import { createHttp } from './src/http.js';
import { redactAndCut } from './src/redact.js';

const VERSION = '0.2.0';
const workDir = join(process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '.', 'AppData', 'Local'), 'Crucible', 'codex-mcp');
const tokenPath = join(workDir, 'token');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 ? fallback : argv[at + 1];
};
const log = (line) => process.stderr.write(`${new Date().toISOString()} ${line}\n`);
const fail = (message) => { console.error(message); process.exit(1); };

function wholeOption(name, fallback, min, max) {
  const raw = option(name, undefined);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) fail(`${name} must be a whole number from ${min} to ${max}`);
  return value;
}

const account = () => (process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${userInfo().username}` : userInfo().username);

// Readable by more than the owner (plus SYSTEM and Administrators)? Then the token is not a secret.
function tokenFileExposed() {
  if (process.platform !== 'win32') return (statSync(tokenPath).mode & 0o077) !== 0;
  return aclExposed(readAclEntries(tokenPath), currentUserSid());
}

async function init() {
  await mkdir(workDir, { recursive: true });
  if (existsSync(tokenPath) && !flag('--rotate')) {
    console.log(`Token already exists: ${tokenPath}\nUse --init --rotate to replace it.`);
    return;
  }
  // A new file, never an overwrite: overwriting keeps whatever extra grants the old file had.
  await rm(tokenPath, { force: true });
  await writeFile(tokenPath, `${randomBytes(32).toString('base64url')}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  if (process.platform === 'win32') makePrivate(tokenPath, currentUserSid());
  if (tokenFileExposed()) {
    await rm(tokenPath, { force: true });
    fail('Could not make the token file private to this account; it was deleted. Check the folder permissions and run --init again.');
  }
  console.log(`Token written to ${tokenPath} (readable by ${account()} only; not printed).`);
  console.log(`Copy it with: Get-Content "${tokenPath}" | Set-Clipboard`);
  console.log('A running bridge picks up a rotated token on its next request; the old one stops working.');
}

// The env token wins; otherwise the file is re-read when it changes, so rotation revokes at once.
function tokenSource() {
  const fromEnv = (process.env.CODEX_MCP_TOKEN || '').trim();
  if (fromEnv) return { kind: 'env', get: () => fromEnv };
  let cached = '';
  let stamp = '';
  return {
    kind: 'file',
    get() {
      try {
        const s = statSync(tokenPath);
        const next = `${s.mtimeMs}:${s.size}`;
        if (next !== stamp) { cached = readFileSync(tokenPath, 'utf8').trim(); stamp = next; }
        return cached;
      } catch {
        cached = ''; stamp = '';
        return '';
      }
    }
  };
}

async function main() {
  if (flag('--init')) return init();

  const hours = wholeOption('--hours', 8, 1, 24);
  const maxJobs = wholeOption('--max-jobs', 20, 1, 200);
  const maxTokens = wholeOption('--max-tokens', 5_000_000, 10_000, 100_000_000);
  const port = wholeOption('--port', 8787, 1024, 65535);
  const model = option('--model', 'gpt-6.1-sol');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(model)) fail('--model has characters that are not allowed');
  const publicHosts = String(option('--public-host', '')).split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  for (const host of publicHosts) {
    if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) fail(`--public-host is not a hostname: ${host}`);
  }

  const codexJs = findCodexJs();
  if (!codexJs) fail('Codex CLI not found (codex.cmd and node_modules/@openai/codex/bin/codex.js on PATH, or CODEX_MCP_CODEX_JS).');

  const tokens = tokenSource();
  const stdio = flag('--stdio');
  if (!stdio) {
    if (tokens.get().length < 32) fail('No usable token. Run: node server.js --init   (or set CODEX_MCP_TOKEN to 32+ characters)');
    if (tokens.kind === 'file' && tokenFileExposed()) fail(`The token file is readable by other accounts. Fix it with: node server.js --init --rotate`);
  }

  await mkdir(join(workDir, 'jobs'), { recursive: true });
  const purged = await purgeStaleJobs(workDir);
  if (purged) log(`removed ${purged} stale job folder(s)`);
  const worker = createWorker({ workDir, codexJs, model });
  const jobs = createJobs({ run: worker.run, maxJobs, maxTokens });
  const expiresAt = Date.now() + hours * 3_600_000;
  const tools = buildTools({ jobs, expiresAt, redact: (t, max) => redactAndCut(t, max, [tokens.get()]) });
  const mcp = createMcp({
    name: 'codex-mcp',
    version: VERSION,
    instructions: 'Codex with no tools: it sees only the text you send. Paste the files or diff it needs into codex_research (context) or codex_review (diff), then poll codex_job until done. Never send secrets or private data.',
    tools,
    onError: () => log('tool error')
  });

  let server = null;
  let closing = false;
  const shutdown = (why) => {
    if (closing) return;
    closing = true;
    log(`shutting down: ${why}`);
    worker.killAll();
    if (server) server.close();
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('exit', () => worker.killAll());
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(signal, () => shutdown(signal));
  setTimeout(() => shutdown(`lifetime of ${hours} h reached`), hours * 3_600_000);

  if (stdio) {
    const rl = createInterface({ input: process.stdin });
    rl.on('close', () => shutdown('stdin closed'));
    for await (const line of rl) {
      if (!line.trim()) continue;
      if (line.length > 512 * 1024) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } })}\n`); continue; }
      let reply;
      try { reply = await mcp.handle(JSON.parse(line)); } catch { reply = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }; }
      if (reply !== null) process.stdout.write(`${JSON.stringify(reply)}\n`);
    }
    return;
  }

  server = createHttp({ mcp, getToken: tokens.get, publicHosts, toolNames: mcp.toolNames, log });
  server.listen(port, '127.0.0.1', () => {
    log(`codex-mcp ${VERSION} on http://127.0.0.1:${port}/mcp; public hosts: ${publicHosts.join(', ') || 'none'}; model ${model}; budget ${maxJobs} jobs / ${maxTokens} tokens; stops in ${hours} h`);
  });
}

main().catch((error) => fail(error && error.message ? error.message : 'startup failed'));
