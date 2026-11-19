// Stand-in for the claude / codex CLIs in tests. Reads the prompt from stdin like the real ones.
// Usage: node fake-agent.js <mode> [...cli arguments]
//   claude                stream-json events like `claude -p --output-format stream-json`
//   codex                 stdout answer, stderr progress; also answers `mcp list --json`
//   codex-stuck           like codex, but MCP server srv-a stays enabled
//   codex-badname         like codex, but lists a server whose name is unsafe to pass on
//   sleep | linger | fail lifecycle cases
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { appendFileSync } from 'node:fs';

const [mode, ...rest] = process.argv.slice(2);

if (rest.includes('mcp') && rest.includes('list')) {
  // codex-mutate <file>: someone edits a Codex config file while the second listing runs.
  if (mode === 'codex-mutate' && rest.some((a) => a.startsWith('mcp_servers.'))) appendFileSync(rest[0], '\n[mcp_servers.added_during_check]\n');
  const names = mode === 'codex-badname' ? ['srv-a', 'bad name'] : ['srv-a', 'srv_b'];
  const servers = names.map((name) => ({ name, enabled: !(rest.includes(`mcp_servers.${name}.enabled=false`) && !(mode === 'codex-stuck' && name === 'srv-a')), transport: { type: 'stdio' } }));
  process.stdout.write(JSON.stringify(servers));
} else {
  let prompt = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { prompt += c; });
  process.stdin.on('end', () => {
    if (mode === 'claude') {
      const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
      out({ type: 'system', subtype: 'init', model: 'fake-claude-model', tools: ['Glob', 'Grep', 'Read'], mcp_servers: [] });
      out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'TASK.md' } }] } });
      out({ type: 'assistant', message: { content: [{ type: 'text', text: `echo: ${prompt}` }] } });
      out({ type: 'result', subtype: 'success', is_error: false, result: `echo: ${prompt}`, total_cost_usd: 0.0123, duration_ms: 42, num_turns: 2, usage: { input_tokens: 10, output_tokens: 5 } });
    } else if (mode.startsWith('codex')) {
      const has = (flag) => rest.includes(flag);
      const sandbox = rest[rest.indexOf('--sandbox') + 1];
      process.stderr.write(`model: fake-codex\nargv: plugins-off=${has('features.plugins=false')} hooks-off=${has('features.hooks=false')} mcp-off=${['srv-a', 'srv_b'].filter((n) => has(`mcp_servers.${n}.enabled=false`)).join(',')} sandbox=${sandbox} stdin=${rest.at(-1) === '-'}\n`);
      process.stdout.write(`codex says: ${prompt}`);
    } else if (mode === 'sleep') {
      setTimeout(() => process.stdout.write('late'), 60000);
    } else if (mode === 'linger') {
      // Like codex's sandbox helper: a grandchild keeps our stdout/stderr open after we exit.
      // Its cwd is outside the test's temp repo, so Windows can still delete that folder afterwards.
      process.stdout.write(`answered: ${prompt}`);
      spawn(process.execPath, ['-e', 'setTimeout(() => {}, 6000)'], { stdio: ['ignore', 'inherit', 'inherit'], detached: true, cwd: tmpdir() }).unref();
    } else if (mode === 'fail') {
      process.stderr.write('fake failure\n');
      process.exitCode = 3;
    }
  });
}
