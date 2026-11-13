// Runs one Codex turn with no tools: no shell, no code mode, no MCP, plugins, browser, computer
// use, memories, hooks or web search; an empty per-job folder outside any repository; a minimal
// environment; the prompt on stdin. Verified against codex-cli 0.160.0 (tasks/CMCP-SEC-1.md).
import { spawn as nodeSpawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WATCHDOG = fileURLToPath(new URL('./watchdog.js', import.meta.url));
const GRACE_MS = 30_000; // the watchdog's limit trails the worker's own timeout

export const DISABLED_FEATURES = [
  'shell_tool', 'unified_exec', 'unified_exec_tty', 'shell_snapshot', 'code_mode_host',
  'apps', 'plugins', 'remote_plugin', 'skill_search', 'skill_mcp_dependency_install', 'tool_suggest',
  'tool_call_mcp_elicitation', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access',
  'computer_use', 'in_app_browser', 'in_app_local_automation', 'in_app_chat', 'memories', 'multi_agent',
  'hooks', 'image_generation', 'view_image', 'goals', 'worktrees', 'workspace_dependencies',
  'realtime_conversation', 'daemon_auto_start', 'write_stdin_approval', 'sleep_tool'
];

// --json item types a toolless turn produces. Anything else means a tool ran: the job is killed.
export const ALLOWED_ITEM_TYPES = new Set(['agent_message', 'reasoning', 'error']);

const ENV_ALLOW = new Set([
  'systemroot', 'systemdrive', 'windir', 'comspec', 'pathext', 'path', 'temp', 'tmp', 'userprofile',
  'homedrive', 'homepath', 'appdata', 'localappdata', 'programdata', 'programfiles', 'programfiles(x86)',
  'commonprogramfiles', 'codex_home', 'number_of_processors', 'processor_architecture', 'os',
  'username', 'userdomain', 'computername'
]);

const MAX_STDOUT = 32 * 1024 * 1024;

export function childEnv(source) {
  const env = {};
  for (const [key, value] of Object.entries(source)) {
    if (ENV_ALLOW.has(key.toLowerCase()) && typeof value === 'string') env[key] = value;
  }
  return env;
}

export function workerArgs({ codexJs, jobDir, lastPath, model, effort }) {
  return [
    codexJs, 'exec',
    '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--strict-config',
    '-s', 'read-only',
    '-C', jobDir,
    '-m', model,
    '-c', `model_reasoning_effort="${effort}"`,
    '-c', 'approval_policy="never"',
    '-c', 'web_search="disabled"',
    ...DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
    '--json',
    '-o', lastPath,
    '-'
  ];
}

export function findCodexJs(env = process.env) {
  const override = env.CODEX_MCP_CODEX_JS;
  if (override) return existsSync(override) ? override : null;
  for (const dir of String(env.PATH || env.Path || '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (existsSync(join(dir, 'codex.cmd')) && existsSync(candidate)) return candidate;
  }
  return null;
}

export function killTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    const taskkill = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    spawnSync(taskkill, ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true, stdio: 'ignore' });
  } else {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }
}

const safeType = (type) => (typeof type === 'string' && /^[a-z_]{1,40}$/.test(type) ? type : 'unknown');

// Job folders left by a bridge that was killed hard. No bridge lives longer than 24 h.
export async function purgeStaleJobs(workDir, { olderThanMs = 25 * 3_600_000, now = Date.now() } = {}) {
  const root = join(workDir, 'jobs');
  let removed = 0;
  for (const name of await readdir(root).catch(() => [])) {
    const dir = join(root, name);
    const info = await stat(dir).catch(() => null);
    if (info && info.isDirectory() && now - info.mtimeMs > olderThanMs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      removed++;
    }
  }
  return removed;
}

export function createWorker({ workDir, codexJs, model, spawn = nodeSpawn, kill = killTree, env = process.env, execPath = process.execPath, parentPid = process.pid }) {
  const children = new Map(); // child -> stop(reason)
  let closed = false; // after killAll() no job may start

  function run(job, { prompt, effort, timeoutMs }) {
    return (async () => {
      const jobDir = join(workDir, 'jobs', job.id);
      const lastPath = join(jobDir, 'last.md');
      const none = { input: 0, cached: 0, output: 0 };
      // A cancel that arrives before Codex exists is remembered and honoured before spawning.
      let cancelledEarly = Boolean(job.cancelRequested);
      job.cancel = () => { cancelledEarly = true; };
      if (closed) return { exitCode: 1, report: '', tokens: none, reason: 'bridge is shutting down' };
      await mkdir(jobDir, { recursive: true });
      if (cancelledEarly || closed) {
        job.cancel = null;
        await rm(jobDir, { recursive: true, force: true }).catch(() => {});
        return { exitCode: 1, report: '', tokens: none, reason: closed ? 'bridge is shutting down' : 'cancelled' };
      }
      const watched = [WATCHDOG, String(parentPid), String(timeoutMs + GRACE_MS), execPath, ...workerArgs({ codexJs, jobDir, lastPath, model, effort })];
      const child = spawn(execPath, watched, {
        cwd: jobDir, env: childEnv(env), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
      });
      return new Promise((resolve) => {
        const tokens = { input: 0, cached: 0, output: 0 };
        let pending = '';
        let seen = 0;
        let stopped = null;
        let codexError = false;
        let usageLimit = false;
        let settled = false;

        const stop = (reason) => {
          if (stopped) return;
          stopped = reason;
          kill(child);
        };
        children.set(child, stop);
        job.cancel = () => stop('cancelled');

        const inspect = (line) => {
          let event;
          try { event = JSON.parse(line); } catch { return; }
          if (!event || typeof event !== 'object') return;
          if ((event.type === 'item.started' || event.type === 'item.completed' || event.type === 'item.updated') && event.item) {
            if (!ALLOWED_ITEM_TYPES.has(event.item.type)) stop(`tool use attempted (${safeType(event.item.type)})`);
          }
          if (event.type === 'turn.completed' && event.usage) {
            tokens.input += Number(event.usage.input_tokens) || 0;
            tokens.cached += Number(event.usage.cached_input_tokens) || 0;
            tokens.output += Number(event.usage.output_tokens) || 0;
          }
          if (event.type === 'turn.failed' || event.type === 'error') {
            codexError = true;
            const message = String((event.error && event.error.message) || event.message || '');
            if (/usage limit|quota exceeded|usage not included/i.test(message)) usageLimit = true;
          }
        };

        const finish = async (exitCode, spawnFailed = false) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          children.delete(child);
          job.cancel = null;
          let report = '';
          if (!stopped && !spawnFailed) report = await readFile(lastPath, 'utf8').catch(() => '');
          await rm(jobDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
          let reason = stopped;
          if (!reason && spawnFailed) reason = 'Codex could not be started';
          if (!reason && usageLimit) reason = 'Codex usage limit reached';
          if (!reason && codexError && !report.trim()) reason = 'Codex reported an error';
          if (!reason && exitCode !== 0) reason = `Codex exited with code ${Number.isInteger(exitCode) ? exitCode : 'unknown'}`;
          if (!reason && !report.trim()) reason = 'Codex returned no answer';
          resolve({ exitCode: Number.isInteger(exitCode) ? exitCode : 1, report: reason ? '' : report, tokens, reason });
        };

        const timer = setTimeout(() => stop('timeout'), timeoutMs);
        child.stdout.on('data', (chunk) => {
          seen += chunk.length;
          if (seen > MAX_STDOUT) return stop('output too large');
          pending += chunk;
          let newline;
          while ((newline = pending.indexOf('\n')) >= 0) {
            inspect(pending.slice(0, newline));
            pending = pending.slice(newline + 1);
          }
        });
        child.stderr.on('data', () => {}); // drained and discarded: it can hold paths and internals
        child.on('error', () => finish(1, true));
        child.on('close', (code) => {
          if (pending) inspect(pending);
          finish(code);
        });
        child.stdin.on('error', () => {});
        child.stdin.end(prompt);
      });
    })();
  }

  return {
    run,
    killAll() { closed = true; for (const stop of children.values()) stop('bridge is shutting down'); },
    running: () => children.size
  };
}
