// Prompt runs: the cockpit starts Claude Code or Codex read-only on the repo with a prompt you typed,
// and streams the reply back. No shell is used; the prompt goes in on stdin, never on the command line.
import { spawn, execFile } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { clean } from '../../crucible-monitor/src/text.js';

export const RUN_AGENTS = ['Claude', 'Codex'];
const MAX_PROMPT = 20000;
const MAX_REPLY = 200 * 1024;
const MAX_ACTIVITY = 300;
const KEEP_RUNS = 20;

// Claude Code, print mode. --tools limits which built-in tools exist; dontAsk + the allow/deny lists deny
// anything else; --strict-mcp-config loads no MCP servers; disableAllHooks stops user, project and plugin
// hooks (which also load plugin MCP servers). Verified against claude 2.1.287's init event: tools
// Glob, Grep, Read and no MCP servers; without disableAllHooks two SessionStart hooks ran and a plugin
// MCP server connected.
export const CLAUDE_READ_ONLY = [
  '-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
  '--permission-mode', 'dontAsk', '--strict-mcp-config',
  '--settings', '{"disableAllHooks":true}',
  '--tools', 'Read', 'Grep', 'Glob',
  '--allowedTools', 'Read', 'Grep', 'Glob',
  '--disallowedTools', 'Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell', 'WebFetch', 'WebSearch', 'Agent', 'Task',
];

// Codex reads files through shell commands, so its shell stays, inside the read-only OS sandbox (no file
// writes; the sandbox also has no network). `code_mode_host` stays on: codex 0.160.0 runs its tools through
// it, and with it off Codex cannot read files at all. Everything that reaches beyond that is switched off: plugin,
// app, browser, computer-use, image, hook, memory and multi-agent features, web search, and every MCP
// server (see codexArgs). `--sandbox read-only` overrides a full-access default in ~/.codex/config.toml.
const CODEX_FEATURES_OFF = ['plugins', 'apps', 'computer_use', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'in_app_browser', 'in_app_local_automation', 'image_generation', 'hooks', 'memories', 'multi_agent', 'multi_agent_v2', 'remote_plugin', 'skill_mcp_dependency_install', 'tool_suggest', 'workspace_dependencies'];
export const CODEX_OVERRIDES = [...CODEX_FEATURES_OFF.flatMap((f) => ['-c', `features.${f}=false`]), '-c', 'web_search="disabled"'];
export const CODEX_EXEC = ['exec', '--sandbox', 'read-only', '--color', 'never', '--ephemeral', '-'];
const SAFE_SERVER = /^[A-Za-z0-9_-]{1,64}$/;

function onPath(name, env) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  // Only absolute PATH entries: a relative one would resolve against the server's working directory.
  for (const dir of String(env.PATH || env.Path || '').split(path.delimiter).filter((d) => d && path.isAbsolute(d))) {
    for (const ext of exts) {
      const file = path.join(dir, name + ext);
      try { if (statSync(file).isFile()) return file; } catch { /* not here */ }
    }
  }
  return null;
}

// Resolves each agent to a program plus fixed leading arguments. Windows .cmd shims are not run (they need
// a shell): Codex's shim is replaced by Node running the same codex.js it would start.
export function resolveAgents(env = process.env) {
  const out = {};
  const claude = onPath('claude', env);
  out.Claude = claude && !claude.toLowerCase().endsWith('.cmd')
    ? { command: claude, args: CLAUDE_READ_ONLY, parse: 'claude' }
    : { unavailable: claude ? 'claude resolves to a .cmd shim; install the native claude executable' : 'claude is not on PATH' };
  const codex = onPath('codex', env);
  if (!codex) out.Codex = { unavailable: 'codex is not on PATH' };
  else if (process.platform === 'win32') {
    const script = path.join(path.dirname(codex), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    out.Codex = existsSync(script) ? { command: process.execPath, prefix: [script], parse: 'codex', preflight: 'codex', codexHome: env.CODEX_HOME || null } : { unavailable: 'codex.js was not found next to the codex shim' };
  } else out.Codex = { command: codex, prefix: [], parse: 'codex', preflight: 'codex', codexHome: env.CODEX_HOME || null };
  return out;
}

function capture(command, args, cwd, timeout = 30000) {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8', shell: false },
      (error, stdout, stderr) => resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: String(stdout), stderr: String(stderr || error?.message || '') }));
  });
}

// The files Codex builds its configuration from. A change to any of them between the pre-flight and the
// start of `exec` could add an MCP server the pre-flight never saw, so the run is refused instead.
// Codex loads project config from the project root down to the working folder, and the project root can be
// any ancestor (project_root_markers), so every ancestor's .codex/config.toml counts, plus the system
// config on Unix.
export function codexConfigFiles(spec, repo) {
  const home = spec.codexHome || path.join(homedir(), '.codex');
  const files = [path.join(home, 'config.toml'), path.join(home, 'managed_config.toml')];
  for (let dir = path.resolve(repo); ; dir = path.dirname(dir)) {
    files.push(path.join(dir, '.codex', 'config.toml'));
    if (path.dirname(dir) === dir) break;
  }
  if (process.platform !== 'win32') files.push('/etc/codex/config.toml', '/etc/codex/managed_config.toml');
  return files;
}
export function codexConfigFingerprint(spec, repo) {
  const hash = createHash('sha256');
  for (const file of codexConfigFiles(spec, repo)) {
    let content = '<missing>';
    try { content = readFileSync(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') content = `<unreadable ${error.code}>`; }
    hash.update(`${file}\n${content}\n\0`);
  }
  return hash.digest('hex');
}

// Fail-closed Codex preparation: list MCP servers with the features off, disable every one, list again and
// refuse unless all are disabled and the config files did not change meanwhile. Returns the argument list
// and the config fingerprint that launch() checks again immediately before starting exec.
// ponytail: a config edit in the milliseconds between that last check and Codex reading its config is not
// prevented; an isolated CODEX_HOME would close it but means copying the user's Codex credentials.
export async function codexArgs(spec, repo) {
  const before = codexConfigFingerprint(spec, repo);
  const list = async (extra) => {
    const r = await capture(spec.command, [...spec.prefix, ...CODEX_OVERRIDES, ...extra, 'mcp', 'list', '--json'], repo);
    if (r.code !== 0) throw new Error(`codex mcp list failed: ${clean(r.stderr.split('\n')[0], 160)}`);
    let servers;
    try { servers = JSON.parse(r.stdout); } catch { throw new Error('codex mcp list --json did not return JSON'); }
    if (!Array.isArray(servers)) throw new Error('codex mcp list --json returned an unexpected shape');
    return servers;
  };
  const off = [];
  const names = [];
  for (const server of await list([])) {
    const name = String(server?.name ?? '');
    if (!SAFE_SERVER.test(name)) throw new Error(`an MCP server name cannot be disabled safely: ${clean(name, 60)}`);
    names.push(name);
    off.push('-c', `mcp_servers.${name}.enabled=false`);
  }
  const still = (await list(off)).filter((s) => s?.enabled !== false).map((s) => clean(String(s?.name), 60));
  if (still.length) throw new Error(`MCP servers still enabled after disabling: ${still.join(', ')}`);
  if (codexConfigFingerprint(spec, repo) !== before) throw new Error('Codex configuration changed during the check; run it again');
  return { args: [...spec.prefix, ...CODEX_OVERRIDES, ...off, ...CODEX_EXEC], disabled: names, fingerprint: before };
}

// Turns one stream-json line from `claude -p` into reply text, activity and metadata.
export function claudeEvent(event, run) {
  if (event.type === 'system' && event.subtype === 'init') {
    if (event.model) run.meta.model = clean(event.model, 60);
    if (Array.isArray(event.tools)) run.meta.tools = event.tools.map((t) => clean(t, 40));
    run.activity.push(`session started${event.model ? ` · model ${clean(event.model, 60)}` : ''}${Array.isArray(event.tools) ? ` · tools ${event.tools.map((t) => clean(t, 40)).join(', ') || 'none'}` : ''}${Array.isArray(event.mcp_servers) ? ` · MCP servers ${event.mcp_servers.length}` : ''}`);
  } else if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
    for (const block of event.message.content) {
      if (block.type === 'text' && typeof block.text === 'string') run.reply += (run.reply ? '\n\n' : '') + block.text;
      else if (block.type === 'tool_use') run.activity.push(`tool ${clean(block.name, 40)} ${clean(JSON.stringify(block.input ?? {}), 160)}`);
    }
  } else if (event.type === 'result') {
    if (typeof event.result === 'string' && !run.reply) run.reply = event.result;
    if (event.is_error) run.activity.push(`error: ${clean(typeof event.result === 'string' && event.result ? event.result : event.subtype, 200)}`);
    if (Number.isFinite(event.total_cost_usd)) run.meta.costUsd = event.total_cost_usd;
    if (Number.isFinite(event.duration_ms)) run.meta.durationMs = event.duration_ms;
    if (Number.isFinite(event.num_turns)) run.meta.turns = event.num_turns;
    if (event.usage && typeof event.usage === 'object') run.meta.usage = { input: event.usage.input_tokens, output: event.usage.output_tokens, cacheRead: event.usage.cache_read_input_tokens };
  } else if (event.type === 'system' && /^hook/.test(String(event.subtype))) {
    run.activity.push(`hook event ${clean(event.subtype, 30)} ${clean(event.hook_name, 60)}`); // should never appear: hooks are disabled
  }
}

export function createRunner({ repo, agents = resolveAgents(), timeoutMs = 15 * 60 * 1000, onChange = () => {} }) {
  const runs = [];
  let seq = 0;
  let active = null;

  const publicRun = (r) => ({ id: r.id, agent: r.agent, prompt: r.prompt, status: r.status, startedAt: r.startedAt, endedAt: r.endedAt, exitCode: r.exitCode, reply: r.reply, activity: r.activity.slice(-MAX_ACTIVITY), meta: r.meta });
  const availability = () => Object.fromEntries(RUN_AGENTS.map((a) => [a, agents[a]?.command ? { available: true } : { available: false, reason: agents[a]?.unavailable || 'not configured' }]));

  let pending = null;
  const changed = (run) => {
    // Coalesce bursts of output into one update every 250 ms.
    if (pending) return;
    pending = setTimeout(() => { pending = null; onChange(publicRun(run)); }, 250);
  };
  const finish = (run, status, exitCode = null) => {
    if (run.status !== 'running') return;
    run.status = status;
    run.exitCode = exitCode;
    run.endedAt = new Date().toISOString();
    clearTimeout(run.timer);
    if (active === run) active = null;
    clearTimeout(pending); pending = null;
    onChange(publicRun(run));
  };

  function killTree(run) {
    const child = run.child;
    if (!child?.pid || child.exitCode !== null || child.signalCode) return;
    const fallback = (why) => {
      run.activity.push(`could not stop the process tree: ${clean(why, 200)}; stopping the agent process only`);
      try { child.kill(); } catch (error) { run.activity.push(`could not stop the agent: ${clean(error.message, 120)}`); }
      changed(run);
    };
    if (process.platform === 'win32') execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, (error, _out, stderr) => { if (error) fallback(String(stderr || error.message).trim()); });
    else { try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { fallback(error.message); } }
  }

  function launch(run, spec, args) {
    let child;
    try {
      child = spawn(spec.command, args, { cwd: repo, env: process.env, windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      run.activity.push(`could not start: ${clean(error.message, 200)}`);
      return finish(run, 'failed');
    }
    run.child = child;
    child.on('error', (error) => { run.activity.push(`could not start: ${clean(error.message, 200)}`); finish(run, 'failed'); });

    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (spec.parse === 'claude') {
        buffer += chunk;
        let at;
        while ((at = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, at).trim();
          buffer = buffer.slice(at + 1);
          if (!line) continue;
          try { claudeEvent(JSON.parse(line), run); } catch { run.activity.push(clean(line, 200)); }
        }
      } else run.reply += chunk; // codex exec prints the final answer on stdout
      if (run.reply.length > MAX_REPLY) run.reply = run.reply.slice(0, MAX_REPLY);
      changed(run);
    });
    child.stderr.setEncoding('utf8');
    let errBuffer = '';
    child.stderr.on('data', (chunk) => {
      errBuffer += chunk;
      const lines = errBuffer.split(/\r?\n/);
      errBuffer = lines.pop();
      for (const l of lines) if (l.trim()) run.activity.push(clean(l, 300));
      if (run.activity.length > MAX_ACTIVITY * 2) run.activity.splice(0, run.activity.length - MAX_ACTIVITY);
      changed(run);
    });
    const settle = (code) => {
      if (run.status !== 'running') return;
      if (errBuffer.trim()) { run.activity.push(clean(errBuffer, 300)); errBuffer = ''; }
      finish(run, run.cancelled ? 'cancelled' : run.timedOut ? 'timeout' : code === 0 ? 'done' : 'failed', code);
    };
    child.on('close', settle);
    // A helper the agent started can keep the inherited pipes open after the agent exits (seen with
    // codex-windows-sandbox-setup.exe), so 'close' may never come: settle shortly after 'exit' instead.
    child.on('exit', (code) => setTimeout(() => { settle(code); child.stdout.destroy(); child.stderr.destroy(); }, 750));
    child.stdin.on('error', () => {}); // agent exited before reading the prompt
    child.stdin.end(run.prompt);
    changed(run);
  }

  function start(input) {
    const agent = RUN_AGENTS.find((a) => a === input?.agent);
    if (!agent) return { status: 400, error: 'agent must be Claude or Codex' };
    if (typeof input.prompt !== 'string' || !input.prompt.trim()) return { status: 400, error: 'prompt is required' };
    if (input.prompt.length > MAX_PROMPT) return { status: 400, error: `prompt is longer than ${MAX_PROMPT} characters` };
    const spec = agents[agent];
    if (!spec?.command) return { status: 503, error: `${agent} is unavailable: ${spec?.unavailable || 'not configured'}` };
    if (active) return { status: 409, error: `${active.agent} run ${active.id} is still running; cancel it or wait` };

    const run = { id: `R-${++seq}`, agent, prompt: input.prompt, status: 'running', startedAt: new Date().toISOString(), endedAt: null, exitCode: null, reply: '', activity: [`read-only run started in ${path.basename(repo)}`], meta: {}, timer: null, child: null };
    runs.push(run);
    while (runs.length > KEEP_RUNS) runs.shift();
    active = run;
    run.timer = setTimeout(() => {
      run.timedOut = true;
      run.activity.push(`timed out after ${Math.round(timeoutMs / 60000)} min`);
      if (run.child) killTree(run); else finish(run, 'timeout');
    }, timeoutMs);

    if (spec.preflight === 'codex') {
      run.activity.push('checking Codex configuration: switching off plugins, apps, browser, computer use, hooks, memories and every MCP server');
      codexArgs(spec, repo).then(({ args, disabled, fingerprint }) => {
        if (run.status !== 'running') return;
        if (run.cancelled) return finish(run, 'cancelled');
        run.activity.push(`MCP servers disabled: ${disabled.length ? disabled.map((n) => clean(n, 60)).join(', ') : 'none configured'}`);
        // Last check, synchronously right before spawning: the config must be what the pre-flight saw.
        if (codexConfigFingerprint(spec, repo) !== fingerprint) {
          run.activity.push('refused: Codex configuration changed after the check; run it again');
          return finish(run, 'failed');
        }
        launch(run, spec, args);
      }, (error) => {
        run.activity.push(`refused: ${clean(error.message, 240)}`);
        finish(run, 'failed');
      });
    } else launch(run, spec, spec.args);
    onChange(publicRun(run));
    return { status: 201, run: publicRun(run) };
  }

  function cancel(id) {
    const run = runs.find((r) => r.id === id);
    if (!run) return { status: 404, error: 'no such run' };
    if (run.status !== 'running') return { status: 409, error: `run is ${run.status}` };
    run.cancelled = true;
    run.activity.push('cancel requested');
    if (!run.child) { /* still in preflight: it stops before launching */ }
    else if (run.child.exitCode !== null || run.child.signalCode) finish(run, 'cancelled', run.child.exitCode);
    else killTree(run);
    changed(run);
    return { status: 202, run: publicRun(run) };
  }

  return {
    start,
    cancel,
    list: () => runs.map(publicRun).reverse(),
    availability,
    stopAll: () => { for (const r of runs) if (r.status === 'running') { r.cancelled = true; if (r.child) killTree(r); else finish(r, 'cancelled'); } },
  };
}
