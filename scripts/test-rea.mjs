// Integration check: cached npm packages or registry access required; synthetic target only.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const claude = JSON.parse(await read('.mcp.json'));
const toml = await read('.codex/config.toml');
const table = toml.match(/^\[mcp_servers\.rea\]\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1];
assert(table, 'Codex Rea registration missing');
const setting = name => JSON.parse(table.match(new RegExp(`^${name} = (.+)$`, 'm'))?.[1] ?? 'null');
const config = claude.mcpServers.rea;
assert.equal(config.type, 'stdio');
assert.equal(config.command, setting('command'));
assert.deepEqual(config.args, setting('args'));
assert.deepEqual(config.args, ['/d', '/c', 'npx.cmd', '--yes', '--package=node@24.22.1', '--package=rea-agents@6.8.0', '--', 'rea', 'mcp']);
assert(claude.mcpServers.higgsfield && toml.includes('[mcp_servers.higgsfield]'), 'Existing MCP missing');
const section = text => text.replaceAll('\r\n', '\n').match(/^# External Tools\n[\s\S]*?(?=^# Windows$|$(?![\s\S]))/m)?.[0];
const instructions = section(await read('AGENTS.md'));
assert(instructions?.includes('Rea is optional'));
assert(instructions.trim() === section(await read('CLAUDE.md'))?.trim(), 'Shared instructions differ');
console.log('PASS: pinned MCP configuration parity; existing Higgsfield; shared instructions');

const fixture = await mkdtemp(join(tmpdir(), 'crucible-rea-'));
let child;
let exited;
const pending = new Map();
let nextId = 0;
let stderr = '';
const failPending = error => {
  for (const request of pending.values()) request.reject(error);
  pending.clear();
};
try {
  await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'rea-synthetic', version: '1.0.0', type: 'module', main: 'index.js' }));
  await writeFile(join(fixture, 'index.js'), "import { double } from './math.js';\nexport const result = double(21);\nthrow new Error('Synthetic target must never execute');\n");
  await writeFile(join(fixture, 'math.js'), 'export const double = value => value * 2;\n');
  child = spawn(config.command, config.args, { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  exited = once(child, 'exit');
  child.on('error', failPending);
  child.on('exit', code => failPending(new Error(`Rea exited (${code}): ${stderr.slice(-2000)}`)));
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });
  child.stdin.on('error', failPending);
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    try {
      const response = JSON.parse(line);
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      if (response.error) request.reject(new Error(JSON.stringify(response.error)));
      else request.resolve(response.result);
    } catch (error) { failPending(error); }
  });
  const send = message => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  async function rpc(method, params) {
    const id = ++nextId;
    let timer;
    try {
      return await new Promise((resolve, reject) => {
        timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}; ${stderr}`)); }, 120_000);
        pending.set(id, { resolve, reject });
        send({ id, method, params });
      });
    } finally { clearTimeout(timer); }
  }
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'crucible-rea-check', version: '1.0.0' } });
  assert.equal(init.serverInfo.version, '6.8.0');
  send({ method: 'notifications/initialized' });
  const catalog = await rpc('tools/list', {});
  assert(catalog.tools.some(tool => tool.name === 'binary_session'));
  const analyzer = catalog.tools.find(tool => tool.name === 'analyze_javascript_application');
  assert(analyzer, 'JavaScript analysis tool missing');
  console.log(`PASS: MCP initialize (Rea ${init.serverInfo.version}); ${catalog.tools.length} tools discovered`);
  const result = await rpc('tools/call', { name: analyzer.name, arguments: { input_path: fixture } });
  assert(!result.isError, JSON.stringify(result).slice(0, 2000));
  const evidence = JSON.stringify(result);
  assert(evidence.includes('index.js') && evidence.includes('math.js'), 'Synthetic modules missing from evidence');
  assert(evidence.includes('double'), 'Synthetic symbol missing from evidence');
  console.log('PASS: MCP static analysis found both synthetic modules and double without executing the target');
} finally {
  if (child?.pid) {
    child.stdin.end();
    let timer;
    try {
      await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 5000); })]);
    } finally { clearTimeout(timer); }
    if (child.exitCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10_000 });
      else child.kill('SIGTERM');
    }
  }
  await rm(fixture, { recursive: true, force: true });
}
