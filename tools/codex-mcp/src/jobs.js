// In-memory job table with per-run budgets. Codex runs take minutes and tunnels cut requests off
// after about 100 s, so tools start a job and the caller polls it.
import { randomUUID } from 'node:crypto';
import { ToolError } from './protocol.js';

export function createJobs({ run, maxJobs = 20, maxTokens = 5_000_000, keep = 50, now = Date.now, newId = () => randomUUID().slice(0, 8) }) {
  const table = new Map();
  const used = { jobs: 0, tokens: 0 };

  const running = () => [...table.values()].find((j) => j.status === 'running');

  function prune() {
    const finished = [...table.values()].filter((j) => j.status !== 'running');
    for (const job of finished.slice(0, Math.max(0, finished.length - keep))) table.delete(job.id);
  }

  function start(kind, params) {
    const active = running();
    if (active) throw new ToolError(`busy: job ${active.id} is still running. Poll it with codex_job or stop it with codex_cancel.`);
    if (used.jobs >= maxJobs) throw new ToolError(`job budget used up (${used.jobs}/${maxJobs} for this server run). The operator must restart the bridge.`);
    if (used.tokens >= maxTokens) throw new ToolError(`token budget used up (${used.tokens}/${maxTokens} for this server run). The operator must restart the bridge.`);
    used.jobs++; // a failed start still spends its slot
    const job = { id: newId(), kind, status: 'running', startedAt: now(), endedAt: null, result: null, reason: null, cancel: null };
    job.promise = Promise.resolve()
      .then(() => run(job, params))
      .then((result) => {
        job.result = result;
        used.tokens += Math.max(0, result.tokens.input - result.tokens.cached) + result.tokens.output;
        job.reason = result.reason;
        job.status = result.reason ? (result.reason.startsWith('tool use') ? 'blocked' : 'failed') : 'done';
      })
      .catch(() => {
        job.reason = 'the job could not be started';
        job.status = 'failed';
      })
      .finally(() => {
        job.endedAt = now();
        prune();
      });
    table.set(job.id, job);
    return job;
  }

  function cancel(id) {
    const job = table.get(id);
    if (!job) throw new ToolError('unknown job_id');
    if (job.status !== 'running') return job;
    job.cancelRequested = true;
    if (job.cancel) job.cancel();
    return job;
  }

  async function wait(id, ms) {
    const job = table.get(id);
    if (!job || job.status !== 'running' || ms <= 0) return job;
    let timer;
    await Promise.race([job.promise, new Promise((resolve) => { timer = setTimeout(resolve, ms); })]);
    clearTimeout(timer);
    return job;
  }

  return {
    start, cancel, wait,
    get: (id) => table.get(id),
    stats: () => ({ jobs: used.jobs, maxJobs, tokens: used.tokens, maxTokens, running: running()?.id ?? null })
  };
}
