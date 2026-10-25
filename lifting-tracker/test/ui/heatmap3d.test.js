import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { meshMuscleId, matchMeshes, colourFor } from '../../src/ui/heatmap3d.js';
import { MUSCLE_LABELS, RECOVERY_BANDS } from '../../src/ui/heatmap.js';

const read = (path) => readFile(new URL('../../' + path, import.meta.url), 'utf8');

test('mesh names map only known muscles and neutral body parts', () => {
  for (const name of ['quads', 'quads_L', 'quads_R', 'quads_L.001', 'quads.002']) assert.equal(meshMuscleId(name), 'quads');
  assert.equal(meshMuscleId('front_delts_R.001'), 'front_delts');
  assert.equal(meshMuscleId('body_head.001'), 'body');
  for (const name of ['unknown', 'quads_extra', 'Chest', 'quads_Lx', '']) assert.equal(meshMuscleId(name), null);
});

test('mesh matching reports unknown and missing muscles', () => {
  const result = matchMeshes(['chest_L', 'chest_R', 'body_head', 'surprise']);
  assert.deepEqual(result.byMuscle, { chest: ['chest_L', 'chest_R'] });
  assert.deepEqual(result.body, ['body_head']);
  assert.deepEqual(result.unknown, ['surprise']);
  assert.deepEqual(result.missing, Object.keys(MUSCLE_LABELS).filter((id) => id !== 'chest'));
});

test('colours follow the shared band edges', () => {
  const palette = { 0: '#000', 1: '#111', 2: '#222', 3: '#333', 4: '#444', 5: '#555' };
  for (const [sets, band] of [[0, 0], [0.1, 1], [5.9, 1], [6, 2], [21, 5]]) assert.equal(colourFor(sets, palette), palette[band]);
  for (const [sets, band] of [[0, 0], [1.9, 1], [2, 2], [6.9, 3], [7, 4], [10, 5]]) assert.equal(colourFor(sets, palette, RECOVERY_BANDS), palette[band]);
});

test('every body GLB mesh has a known name', async () => {
  const glb = await readFile(new URL('../../assets/body.glb', import.meta.url));
  assert.equal(glb.readUInt32LE(0), 0x46546c67);
  assert.equal(glb.readUInt32LE(4), 2);
  assert.equal(glb.readUInt32LE(8), glb.length);
  assert.equal(glb.readUInt32LE(16), 0x4e4f534a);
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  assert.ok(json.meshes.length > 0);
  for (const mesh of json.meshes) assert.ok(meshMuscleId(mesh.name), mesh.name);
  for (const node of json.nodes.filter((n) => n.mesh !== undefined)) assert.ok(meshMuscleId(node.name), node.name);
});

test('import map is allowed by its exact CSP hash and precedes app startup', async () => {
  const html = await read('index.html');
  const map = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  const hash = createHash('sha256').update(map[1]).digest('base64');
  assert.ok(csp.split(';').find((s) => s.trim().startsWith('script-src ')).includes(`'sha256-${hash}'`));
  assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"));
  assert.equal(JSON.parse(map[1]).imports.three, './vendor/three/build/three.module.min.js');
  assert.ok(map.index < html.indexOf('<script type="module"'));
});

test('three is loaded lazily with no top-level three imports', async () => {
  const source = await read('src/ui/heatmap3d.js');
  const imports = source.match(/^import\s.+$/gm);
  assert.deepEqual(imports, ["import { BANDS, MUSCLE_LABELS, bandFor, fmtSets } from './heatmap.js';"]);
  assert.ok(source.includes("import('../../vendor/three/build/three.module.min.js')"));
});
