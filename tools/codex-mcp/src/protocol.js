// Minimal MCP server core (JSON-RPC 2.0), stateless, no dependencies.
// Speaks the subset Claude Code needs: initialize, ping, tools/list, tools/call. No batches.

export const LATEST = '2025-06-18';
export const SUPPORTED = [LATEST, '2025-03-26', '2024-11-05'];

// A ToolError is shown to the model as a tool result; anything else is reported generically.
export class ToolError extends Error {}

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });

export function createMcp({ name, version, instructions, tools, onError = () => {} }) {
  const byName = new Map(tools.map((t) => [t.name, t]));
  const listing = tools.map(({ name: n, description, inputSchema, annotations }) => ({ name: n, description, inputSchema, annotations }));

  async function callTool(id, params) {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return rpcError(id, -32602, 'Invalid params');
    const tool = byName.get(params.name);
    if (!tool) return rpcError(id, -32602, 'Unknown tool');
    try {
      const raw = params.arguments ?? {};
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ToolError('arguments must be an object');
      const allowed = Object.keys(tool.inputSchema.properties || {});
      const extra = Object.keys(raw).filter((k) => !allowed.includes(k));
      if (extra.length) throw new ToolError(`unknown argument(s): ${extra.slice(0, 5).map((k) => k.slice(0, 40)).join(', ')}`);
      const text = await tool.handler(tool.parse(raw));
      return rpcResult(id, { content: [{ type: 'text', text }] });
    } catch (error) {
      if (error instanceof ToolError) return rpcResult(id, { content: [{ type: 'text', text: error.message }], isError: true });
      onError(error);
      return rpcResult(id, { content: [{ type: 'text', text: 'Internal error' }], isError: true });
    }
  }

  // body is already-parsed JSON. Returns null when nothing should be sent back (HTTP 202).
  async function handle(msg) {
    if (Array.isArray(msg)) return rpcError(null, -32600, 'Batch requests are not supported');
    if (!msg || typeof msg !== 'object') return rpcError(null, -32600, 'Invalid Request');
    if (typeof msg.method !== 'string') return null; // a response from the client: nothing to answer
    if (!('id' in msg)) return null; // notifications/initialized, cancelled, ...: accepted silently
    const { id, method, params } = msg;
    if (typeof id !== 'string' && typeof id !== 'number') return rpcError(null, -32600, 'Invalid Request');
    switch (method) {
      case 'initialize': {
        const asked = params && params.protocolVersion;
        return rpcResult(id, {
          protocolVersion: SUPPORTED.includes(asked) ? asked : LATEST,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name, version },
          instructions
        });
      }
      case 'ping': return rpcResult(id, {});
      case 'tools/list': return rpcResult(id, { tools: listing });
      case 'tools/call': return callTool(id, params);
      default: return rpcError(id, -32601, 'Method not found');
    }
  }

  return { handle, toolNames: tools.map((t) => t.name) };
}

// Small argument parsers so each tool states its limits in one line.
export function text(value, field, { min = 1, max, optional = false, pattern } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined;
    throw new ToolError(`${field} is required`);
  }
  if (typeof value !== 'string') throw new ToolError(`${field} must be a string`);
  if (value.length < min || value.length > max) throw new ToolError(`${field} must be ${min}-${max} characters`);
  if (pattern && !pattern.test(value)) throw new ToolError(`${field} has characters that are not allowed`);
  return value;
}

export function whole(value, field, { min, max, fallback }) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new ToolError(`${field} must be a whole number from ${min} to ${max}`);
  return value;
}

export function choice(value, field, allowed, fallback) {
  if (value === undefined || value === null) return fallback;
  if (!allowed.includes(value)) throw new ToolError(`${field} must be one of: ${allowed.join(', ')}`);
  return value;
}
