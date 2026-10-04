import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Every file the service worker precaches must exist, or install fails and the app is not available offline.
const root = fileURLToPath(new URL('../../', import.meta.url));

test('service worker precache list only names files that exist', async () => {
  const src = await readFile(new URL('../../sw.js', import.meta.url), 'utf8');
  const list = /const SHELL = \[([\s\S]*?)\];/.exec(src)[1];
  const files = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((f) => f !== './');
  assert.ok(files.length > 20);
  for (const f of files) await access(root + f).catch(() => assert.fail('missing precache file: ' + f));
});

test('every module the app imports is precached', async () => {
  const src = await readFile(new URL('../../sw.js', import.meta.url), 'utf8');
  const shell = new Set([...(/const SHELL = \[([\s\S]*?)\];/.exec(src)[1]).matchAll(/'([^']+)'/g)].map((m) => m[1]));
  const { readdir } = await import('node:fs/promises');
  async function walk(dir, base = '') {
    const out = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) out.push(...await walk(dir + e.name + '/', base + e.name + '/'));
      else if (e.name.endsWith('.js')) out.push(base + e.name);
    }
    return out;
  }
  for (const f of await walk(root + 'src/')) assert.ok(shell.has('src/' + f), 'not precached: src/' + f);
});
