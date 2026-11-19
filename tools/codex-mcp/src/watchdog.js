// Sits between the bridge and Codex. Kills the Codex process tree when the bridge dies (even a
// hard kill, which skips the bridge's own cleanup and would leave Codex running on Windows) or
// when the hard time limit passes.
//   node watchdog.js <bridge pid> <limit ms> <command> [args...]
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const [parentArg, limitArg, command, ...args] = process.argv.slice(2);
const parent = Number(parentArg);
const limit = Number(limitArg);
if (!Number.isInteger(parent) || parent <= 0 || !Number.isFinite(limit) || limit <= 0 || !command) process.exit(2);

const child = spawn(command, args, { stdio: 'inherit', windowsHide: true });
let done = false;

function killChild() {
  if (done || !child.pid) return;
  if (process.platform === 'win32') {
    spawnSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true, stdio: 'ignore' });
  } else {
    try { child.kill('SIGKILL'); } catch { /* gone */ }
  }
}

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
};

const poll = setInterval(() => { if (!alive(parent)) { killChild(); process.exit(1); } }, 1000);
const deadline = setTimeout(() => { killChild(); process.exit(1); }, limit);

child.on('error', () => process.exit(1));
child.on('exit', (code) => {
  done = true;
  clearInterval(poll);
  clearTimeout(deadline);
  process.exit(Number.isInteger(code) ? code : 1);
});
