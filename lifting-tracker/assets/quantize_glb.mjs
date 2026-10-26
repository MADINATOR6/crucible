// Shrinks a GLB by storing positions as 16-bit and normals as 8-bit integers (glTF KHR_mesh_quantization, which
// three.js's GLTFLoader reads natively, so no decoder is vendored). Indices are kept as they are.
// Run after build_body.py: node assets/quantize_glb.mjs assets/body.glb
// Positions are scaled into [-1, 1] around the whole model's centre with ONE uniform scale, undone by each mesh
// node's translation and scale; a uniform scale keeps normals correct. Precision: 1.8 m / 65535, about 0.03 mm.
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const glb = readFileSync(file);
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
const jsonLen = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLen));
if (json.extensionsUsed?.includes('KHR_mesh_quantization')) throw new Error('already quantized');
if (json.nodes.some((n) => n.translation || n.rotation || n.scale || n.matrix)) throw new Error('nodes with transforms are not handled');

const FLOAT = 5126, BYTE = 5120, SHORT = 5122;
const view = (acc) => {
  const bv = json.bufferViews[acc.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const size = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType];
  return { bv, comps, size, offset: (bv.byteOffset || 0) + (acc.byteOffset || 0), stride: bv.byteStride || comps * size };
};

// Whole-model centre and half-extent from the POSITION accessors' min/max.
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (const m of json.meshes) for (const p of m.primitives) {
  const a = json.accessors[p.attributes.POSITION];
  for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a.min[k]); hi[k] = Math.max(hi[k], a.max[k]); }
}
const centre = lo.map((v, k) => (v + hi[k]) / 2);
const scale = Math.max(...hi.map((v, k) => (v - lo[k]) / 2));

const chunks = [];
let length = 0;
const push = (buf) => { const offset = length; chunks.push(buf); length += buf.length; const pad = (4 - (length % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; } return offset; };
const bufferViews = [], accessors = [];
const copyAccessor = (acc) => {
  const { bv, offset } = view(acc);
  const at = push(Buffer.from(bin.subarray(offset, offset + bv.byteLength - (acc.byteOffset || 0))));
  bufferViews.push({ buffer: 0, byteOffset: at, byteLength: bv.byteLength - (acc.byteOffset || 0), ...(bv.target ? { target: bv.target } : {}) });
  accessors.push({ ...acc, bufferView: bufferViews.length - 1, byteOffset: 0 });
  return accessors.length - 1;
};
const quantAccessor = (acc, kind) => {
  if (acc.componentType !== FLOAT || acc.type !== 'VEC3') throw new Error('expected float VEC3');
  const { offset, stride } = view(acc);
  const isPos = kind === 'POSITION', step = isPos ? 8 : 4, max = isPos ? 32767 : 127;
  const out = Buffer.alloc(acc.count * step);
  const qmin = [Infinity, Infinity, Infinity], qmax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < acc.count; i++) for (let k = 0; k < 3; k++) {
    const f = bin.readFloatLE(offset + i * stride + k * 4);
    const q = Math.max(-max, Math.min(max, Math.round((isPos ? (f - centre[k]) / scale : f) * max)));
    if (isPos) out.writeInt16LE(q, i * step + k * 2); else out.writeInt8(q, i * step + k);
    qmin[k] = Math.min(qmin[k], q); qmax[k] = Math.max(qmax[k], q);
  }
  const at = push(out);
  bufferViews.push({ buffer: 0, byteOffset: at, byteLength: out.length, byteStride: step, target: 34962 });
  accessors.push({ bufferView: bufferViews.length - 1, byteOffset: 0, componentType: isPos ? SHORT : BYTE, normalized: true, count: acc.count, type: 'VEC3',
    ...(isPos ? { min: qmin, max: qmax } : {}) }); // glTF bounds of integer data are the raw integers, not the normalized values
  return accessors.length - 1;
};

const done = new Map();
for (const m of json.meshes) for (const p of m.primitives) {
  for (const [name, idx] of Object.entries(p.attributes)) {
    const key = `${name}:${idx}`;
    if (!done.has(key)) done.set(key, name === 'POSITION' || name === 'NORMAL' ? quantAccessor(json.accessors[idx], name) : copyAccessor(json.accessors[idx]));
    p.attributes[name] = done.get(key);
  }
  if (p.indices !== undefined) p.indices = copyAccessor(json.accessors[p.indices]);
}
for (const n of json.nodes) if (n.mesh !== undefined) { n.translation = centre; n.scale = [scale, scale, scale]; }
json.accessors = accessors; json.bufferViews = bufferViews;
json.buffers = [{ byteLength: length }];
json.extensionsUsed = [...(json.extensionsUsed || []), 'KHR_mesh_quantization'];
json.extensionsRequired = [...(json.extensionsRequired || []), 'KHR_mesh_quantization'];

let text = Buffer.from(JSON.stringify(json));
text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
const body = Buffer.concat(chunks);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + text.length + 8 + body.length, 8);
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
writeFileSync(file, Buffer.concat([header, ch(text.length, 0x4e4f534a), text, ch(body.length, 0x004e4942), body]));
console.log(`${file}: ${glb.length} -> ${12 + 8 + text.length + 8 + body.length} bytes`);
