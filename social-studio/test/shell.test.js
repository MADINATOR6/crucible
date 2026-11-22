// Every file the service worker precaches must exist, and every app module must be precached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const sw = readFileSync(new URL('sw.js', root), 'utf8');
const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

test('service worker precache list matches the files on disk', () => {
  for (const f of shell.filter(f => f !== './')) assert.ok(existsSync(new URL(f, root)), `missing ${f}`);
  const modules = [...readdirSync(new URL('src/', root)).filter(f => f.endsWith('.js')).map(f => `src/${f}`),
    ...readdirSync(new URL('src/views/', root)).map(f => `src/views/${f}`)];
  for (const m of modules) assert.ok(shell.includes(m), `${m} not precached`);
});

test('service worker never caches cross-origin requests and only cleans its own caches', () => {
  assert.match(sw, /url\.origin !== self\.location\.origin\) return/);
  assert.match(sw, /k\.startsWith\(PREFIX\)/);
});
