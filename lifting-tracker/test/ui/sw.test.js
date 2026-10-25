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

const shellOf = async () => new Set([...(/const SHELL = \[([\s\S]*?)\];/.exec(await readFile(new URL('../../sw.js', import.meta.url), 'utf8'))[1]).matchAll(/'([^']+)'/g)].map((m) => m[1]));
async function walk(dir, base = '') {
  const { readdir } = await import('node:fs/promises');
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...await walk(dir + e.name + '/', base + e.name + '/'));
    else if (e.name.endsWith('.js')) out.push(base + e.name);
  }
  return out;
}

test('every app module is precached; the 3D library loads on first use and its files exist', async () => {
  const shell = await shellOf();
  for (const folder of ['src/', 'vendor/']) {
    for (const f of await walk(root + folder)) {
      const path = folder + f;
      // App code is installed up front; the vendored 3D library is fetched (and then cached) when a 3D view opens.
      if (folder === 'src/') assert.ok(shell.has(path), 'not precached: ' + path);
      else assert.ok(!shell.has(path), 'vendor file should load on first use, not at install: ' + path);
      const module = await readFile(root + path, 'utf8');
      // Static imports must start a line, so prose like `from "srgb-linear"` in a vendored warning string doesn't count.
      for (const match of module.matchAll(/^\s*(?:import|export)\b[^;'"`]*?\bfrom\s*['"]([\w./-]+)['"]|\bimport\s*\(\s*['"]([\w./-]+)['"]/gm)) {
        const specifier = match[1] ?? match[2];
        const target = specifier === 'three' ? 'vendor/three/build/three.module.min.js'
          : specifier.startsWith('.') ? new URL(specifier, new URL(path, 'https://offline.test/')).pathname.slice(1) : null;
        assert.ok(target, `${path} imports an unknown bare module: ${specifier}`);
        if (target.startsWith('vendor/')) await access(root + target).catch(() => assert.fail(`${path} imports a missing file: ${specifier}`));
        else assert.ok(shell.has(target), `${path} import not precached: ${specifier}`);
      }
    }
  }
});

test('3D files are not installed up front, and offline fallbacks only answer page loads', async () => {
  const src = await readFile(new URL('../../sw.js', import.meta.url), 'utf8');
  const shell = await shellOf();
  assert.ok(Number(/const VERSION = 'lt-v(\d+)'/.exec(src)?.[1]) >= 5, 'VERSION moved past the release that precached 3D files');
  assert.ok(!shell.has('assets/body.glb'));
  for (const path of ['src/ui/heatmap3d.js', 'src/ui/barbell3d.js']) assert.ok(shell.has(path), path); // small, and imported statically
  assert.match(src, /req\.mode === 'navigate' \? caches\.match\('index\.html'\)/);
  await access(root + 'assets/body.glb');
});

test('every icon the manifest names exists and is precached', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../manifest.webmanifest', import.meta.url), 'utf8'));
  const shell = await shellOf();
  const icons = [...manifest.icons, ...(manifest.shortcuts || []).flatMap((s) => s.icons || [])].map((i) => i.src);
  assert.ok(manifest.icons.some((i) => i.sizes === '192x192' && i.type === 'image/png'), 'Android needs a 192 px PNG');
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'), 'Android adaptive icon');
  for (const src of new Set(icons)) { await access(root + src); assert.ok(shell.has(src), 'not precached: ' + src); }
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const touch = /rel="apple-touch-icon" href="([^"]+)"/.exec(html)?.[1];
  assert.match(touch || '', /\.png$/, 'iPhone needs a PNG home-screen icon');
  await access(root + touch);
});
