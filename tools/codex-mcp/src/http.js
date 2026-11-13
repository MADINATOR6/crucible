// HTTP front for the MCP core: Host/Origin policy, bearer auth, size, time and concurrency limits,
// a lockout that never locks out the real token, fixed-label logs. No sessions, no SSE.
import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value).digest();
const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];
const METHODS = new Set(['initialize', 'ping', 'tools/list', 'tools/call', 'notifications/initialized', 'notifications/cancelled']);

export function tokenMatches(header, token) {
  if (typeof token !== 'string' || token.length < 32) return false;
  const given = /^Bearer\s+(\S+)\s*$/i.exec(header || '');
  if (!given) return false;
  return timingSafeEqual(digest(given[1]), digest(token));
}

export function hostAllowed(hostHeader, allowedHosts) {
  if (typeof hostHeader !== 'string' || !hostHeader) return false;
  const host = hostHeader.trim().toLowerCase().replace(/:\d{1,5}$/, '');
  return allowedHosts.has(host);
}

export function createHttp({
  mcp, getToken, publicHosts = [], toolNames = [], maxBody = 512 * 1024, maxInFlight = 8,
  failLimit = 20, failWindowMs = 60_000, now = Date.now, log = () => {}
}) {
  const allowedHosts = new Set([...LOOPBACK, ...publicHosts.map((h) => h.toLowerCase())]);
  const tools = new Set(toolNames);
  let failures = [];
  let inFlight = 0;

  const locked = () => {
    const cutoff = now() - failWindowMs;
    failures = failures.filter((t) => t > cutoff);
    return failures.length >= failLimit;
  };

  function send(res, status, body, headers = {}) {
    const payload = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
    res.end(payload);
  }

  async function readBody(req) {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBody) return null;
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBody) return null;
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  const label = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'invalid';
    const method = METHODS.has(body.method) ? body.method : 'other';
    if (method !== 'tools/call') return method;
    return `tools/call ${tools.has(body.params && body.params.name) ? body.params.name : 'unknown'}`;
  };

  const server = createServer(async (req, res) => {
    try {
      const path = (req.url || '').split('?')[0];
      if (!hostAllowed(req.headers.host, allowedHosts)) { log('403 host'); return send(res, 403, { error: 'host not allowed' }); }
      if (req.headers.origin !== undefined) { log('403 origin'); return send(res, 403, { error: 'browser origins are not allowed' }); }
      if (path === '/healthz' && req.method === 'GET') return send(res, 200, { ok: true });
      if (!tokenMatches(req.headers.authorization, getToken())) {
        if (locked()) return send(res, 429, { error: 'too many failed attempts' }, { 'retry-after': '60' });
        failures.push(now());
        log('401');
        return send(res, 401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer' });
      }
      if (path !== '/mcp') return send(res, 404, { error: 'not found' });
      if (req.method !== 'POST') return send(res, 405, { error: 'POST only' }, { allow: 'POST' });
      if (inFlight >= maxInFlight) { log('503 busy'); return send(res, 503, { error: 'too many requests in flight' }, { 'retry-after': '5' }); }
      inFlight++;
      try {
        const raw = await readBody(req);
        if (raw === null) { log('413'); return send(res, 413, { error: 'body too large' }); }
        let body;
        try { body = JSON.parse(raw); } catch { log('400 parse'); return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
        const reply = await mcp.handle(body);
        log(`200 ${label(body)}`);
        if (reply === null) return send(res, 202);
        return send(res, 200, reply);
      } finally {
        inFlight--;
      }
    } catch {
      log('500');
      if (!res.headersSent) send(res, 500, { error: 'server error' });
      else res.end();
    }
  });

  server.headersTimeout = 10_000;
  server.requestTimeout = 40_000; // codex_job waits at most 25 s
  // Longer than tunnel daemons keep pooled origin connections (cloudflared: 90 s), so the bridge
  // never closes a socket the tunnel is about to reuse (that race shows up as ECONNRESET / 502).
  server.keepAliveTimeout = 95_000;
  server.maxHeadersCount = 50;
  server.maxConnections = 32;
  server.setTimeout(120_000);
  return server;
}
