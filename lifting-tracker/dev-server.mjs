// Tiny static file server for local development (no dependencies).
// Usage: node lifting-tracker/dev-server.mjs [port]
// Serves this folder only, on 127.0.0.1 unless HOST is set (HOST=0.0.0.0 lets a phone on the same Wi-Fi open it).
// Service workers and ES modules need http://, not file://. Plain http on a LAN address has no service worker (no offline install).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(root, p));
    // Never serve outside this folder, and never the gitignored private folder.
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end('Forbidden'); return; }
    if (file.slice(root.length).split(sep).includes('private')) { res.writeHead(403).end('Forbidden'); return; } // private/ and data/private/ are gitignored
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(port, host, () => console.log(`Lifting tracker: http://${host === '0.0.0.0' ? '<this PC\'s Wi-Fi address>' : host}:${port}/`));
