import { MUSCLE_LABELS, bandFor, fmtSets } from './heatmap.js';

export function meshMuscleId(name) {
  if (name.startsWith('body_')) return 'body';
  const id = name.replace(/\.\d+$/, '').replace(/_[LR]$/, '');
  return Object.hasOwn(MUSCLE_LABELS, id) ? id : null;
}

export function matchMeshes(names) {
  const byMuscle = {}, body = [], unknown = [];
  for (const name of names) {
    const id = meshMuscleId(name);
    if (id === 'body') body.push(name);
    else if (id) (byMuscle[id] ||= []).push(name);
    else unknown.push(name);
  }
  return { byMuscle, body, unknown, missing: Object.keys(MUSCLE_LABELS).filter((id) => !byMuscle[id]) };
}

export const colourFor = (sets, palette) => palette[bandFor(sets).id];

let viewer, pending;

export async function mount3d(container, options) {
  if (!viewer) {
    pending ||= createViewer().finally(() => { pending = null; });
    viewer = await pending;
  }
  viewer.attach(container, options);
  return viewer;
}

async function createViewer() {
  const [T, { GLTFLoader }, { OrbitControls }] = await Promise.all([
    import('../../vendor/three/build/three.module.min.js'),
    import('../../vendor/three/examples/jsm/loaders/GLTFLoader.js'),
    import('../../vendor/three/examples/jsm/controls/OrbitControls.js'),
  ]);
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
  const canvas = renderer.domElement;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(40, 1, 0.01, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = Math.PI - 0.2;
  controls.enableDamping = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  scene.add(new T.HemisphereLight(0xffffff, 0x555566, 2));
  const light = new T.DirectionalLight(0xffffff, 3);
  light.position.set(2, 3, 4);
  scene.add(light);
  const back = new T.DirectionalLight(0xffffff, 2); // so the back muscles read as well as the front ones
  back.position.set(-2, 2, -4);
  scene.add(back);
  let host, tip, onPick, onError, frame = 0, dead = false, down;
  const meshes = [];
  const geometries = new Set(), materials = new Set(), textures = new Set();
  function dispose() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    controls.dispose();
    canvas.removeEventListener('pointerdown', pointerdown);
    canvas.removeEventListener('pointerup', pointerup);
    canvas.removeEventListener('webglcontextlost', lost);
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    renderer.dispose();
    canvas.remove(); tip?.remove();
    if (viewer === api) viewer = null;
  }
  function draw() {
    frame = 0;
    if (dead) return;
    controls.update();
    renderer.render(scene, camera);
  }
  function requestDraw() {
    if (!dead && !frame) frame = requestAnimationFrame(draw);
  }
  function resize() {
    if (!host || dead) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight || 420);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestDraw();
  }
  const observer = new ResizeObserver(resize);
  controls.addEventListener('change', requestDraw);
  const raycaster = new T.Raycaster();
  function pointerdown(e) { down = { x: e.clientX, y: e.clientY, id: e.pointerId }; }
  function pointerup(e) {
    const start = down; down = null;
    if (!start || start.id !== e.pointerId || Math.hypot(e.clientX - start.x, e.clientY - start.y) >= 6) return;
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    const id = hit && meshMuscleId(hit.object.name);
    if (id && id !== 'body') onPick?.(id);
  }
  function lost(e) {
    e.preventDefault();
    const fail = onError;
    dispose();
    fail?.(new Error('WebGL context lost'));
  }
  canvas.addEventListener('pointerdown', pointerdown);
  canvas.addEventListener('pointerup', pointerup);
  canvas.addEventListener('webglcontextlost', lost);
  function update({ data, selected }) {
    const css = getComputedStyle(document.documentElement);
    const palette = Object.fromEntries([0, 1, 2, 3, 4, 5].map((n) => [n, css.getPropertyValue(`--b${n}`).trim()]));
    const neutral = css.getPropertyValue('--line-strong').trim(); // lighter than the card in dark mode, darker in light
    for (const mesh of meshes) {
      const id = meshMuscleId(mesh.name);
      mesh.material.color.set(id && id !== 'body' ? colourFor(data[id] ?? 0, palette) : neutral);
      mesh.material.emissive.set(id && id === selected ? palette[3] : 0x000000);
      mesh.material.emissiveIntensity = 0.35;
    }
    tip.textContent = selected && MUSCLE_LABELS[selected]
      ? `${MUSCLE_LABELS[selected]} · ${fmtSets(data[selected] ?? 0)} sets · ${bandFor(data[selected] ?? 0).label}` : 'Drag to turn · pinch to zoom · tap a muscle';
    requestDraw();
  }
  const api = { update, dispose, attach(container, options) {
    if (dead) throw new Error('3D viewer disposed');
    observer.disconnect();
    host = container; onPick = options.onPick; onError = options.onError;
    host.querySelector('.hm3d-status')?.remove();
    tip ||= Object.assign(document.createElement('p'), { className: 'hm3d-tip' });
    host.append(canvas, tip);
    observer.observe(host); resize(); update(options);
  } };
  try {
    const gltf = await new GLTFLoader().loadAsync(new URL('../../assets/body.glb', import.meta.url).href);
    gltf.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      geometries.add(obj.geometry);
      for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        materials.add(material);
        Object.values(material).filter((v) => v?.isTexture).forEach((t) => textures.add(t));
      }
      obj.material = new T.MeshStandardMaterial({ roughness: 0.8 });
      materials.add(obj.material); meshes.push(obj);
    });
    if (dead) throw new Error('WebGL context lost while loading');
    if (!meshes.length) throw new Error('Body model has no meshes');
    const { unknown } = matchMeshes(meshes.map((m) => m.name));
    if (unknown.length) console.warn('Unknown body mesh names:', unknown.join(', '));
    scene.add(gltf.scene);
    const box = new T.Box3().setFromObject(gltf.scene);
    const centre = box.getCenter(new T.Vector3());
    const size = box.getSize(new T.Vector3());
    centre.y -= size.y * 0.05; // aim a little low so the feet clear the hint pill at the bottom
    controls.target.copy(centre);
    // Fit the body's height with a little headroom; the canvas is portrait, so height is the limit.
    const distance = (size.y / 2) / Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * 1.1 + size.z / 2;
    camera.position.copy(centre).add(new T.Vector3(0, 0, distance));
    controls.minDistance = distance * 0.4; // close enough to see a single muscle
    controls.maxDistance = distance * 1.6;
    controls.update();
    return api;
  } catch (error) { dispose(); throw error; }
}
