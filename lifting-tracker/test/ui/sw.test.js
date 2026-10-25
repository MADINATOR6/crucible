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
  for (const folder of ['src/', 'vendor/']) {
    for (const f of await walk(root + folder)) {
      const path = folder + f;
      assert.ok(shell.has(path), 'not precached: ' + path);
      const module = await readFile(root + path, 'utf8');
      // Static imports must start a line, so prose like `from "srgb-linear"` in a vendored warning string doesn't count.
      for (const match of module.matchAll(/^\s*(?:import|export)\b[^;'"`]*?\bfrom\s*['"]([\w./-]+)['"]|\bimport\s*\(\s*['"]([\w./-]+)['"]/gm)) {
        const specifier = match[1] ?? match[2];
        const target = specifier === 'three' ? 'vendor/three/build/three.module.min.js'
          : specifier.startsWith('.') ? new URL(specifier, new URL(path, 'https://offline.test/')).pathname.slice(1) : null;
        assert.ok(target && shell.has(target), `${path} import not precached: ${specifier}`);
      }
    }
  }
});

test('3D assets are precached in the updated cache', async () => {
  const src = await readFile(new URL('../../sw.js', import.meta.url), 'utf8');
  assert.match(src, /const VERSION = 'lt-v2'/);
  for (const path of ['assets/body.glb', 'src/ui/heatmap3d.js', 'vendor/three/build/three.module.min.js', 'vendor/three/examples/jsm/loaders/GLTFLoader.js', 'vendor/three/examples/jsm/utils/BufferGeometryUtils.js', 'vendor/three/examples/jsm/controls/OrbitControls.js']) assert.ok(src.includes(`'${path}'`), path);
});
