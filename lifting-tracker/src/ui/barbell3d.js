import { convert } from '../core/units.js';

export const BAR = Object.freeze({ length: 2.20, shaftDiameter: 0.029, sleeveDiameter: 0.050,
  innerLength: 1.31, collarLength: 0.030, collarDiameter: 0.075, sleeveLength: 0.415,
  centreKnurl: 0.075, outerKnurlStart: 0.21, outerKnurlEnd: 0.62, ring: 0.405, ringWidth: 0.005 });
const SIZES = [[25,450,27],[20,450,22.5],[15,450,21],[10,450,21],[5,230,21.5],[2.5,190,16],[1.25,160,12],[1,145,10],[0.5,130,8],[0.25,110,6]];
export function plateSize(plate) {
  const kg = convert(plate.value, plate.unit, 'kg');
  const fallback = SIZES.reduce((a, b) => Math.abs(b[0] - kg) < Math.abs(a[0] - kg) ? b : a);
  return { diameter: (plate.drawHeightMm > 0 ? plate.drawHeightMm : fallback[1]) / 1000,
    thickness: (plate.thicknessMm > 0 ? plate.thicknessMm : fallback[2]) / 1000 };
}
export function layout(plates, { collar = false } = {}) {
  let x = BAR.innerLength / 2 + BAR.collarLength;
  const placed = plates.map((plate, index) => {
    const size = plateSize(plate), entry = { index, x, ...size };
    x += size.thickness + 0.001;
    return entry;
  });
  const collarX = collar ? x : null;
  const end = collar ? x + 0.07 : x - (plates.length ? 0.001 : 0);
  return { plates: placed, collarX, overflow: end > BAR.length / 2 + 1e-9 };
}

const FONT = "Bahnschrift, 'Arial Narrow', system-ui, sans-serif"; // the same lettering as the 2D bar

// Lathe cross-section of a plate rim: the rectangle [x0, x1] x [-h, h] with its two outer corners rounded by b.
function rounded(x0, x1, h, b) {
  const arc = (cy, from, to) => Array.from({ length: 7 }, (_, i) => {
    const a = from + ((to - from) * i) / 6;
    return [x1 - b + b * Math.cos(a), cy + b * Math.sin(a)];
  });
  return [[x0, -h], ...arc(-h + b, -Math.PI / 2, 0), ...arc(h - b, 0, Math.PI / 2), [x0, h], [x0, -h]];
}

let viewer, pending;
export async function mount3d(container, options) {
  if (!viewer) {
    pending ||= createViewer().finally(() => { pending = null; });
    viewer = await pending;
  }
  try { viewer.attach(container, options); return viewer; }
  catch (error) { viewer?.dispose(); throw error; }
}

async function createViewer() {
  const [T, { OrbitControls }, { RoomEnvironment }] = await Promise.all([
    import('../../vendor/three/build/three.module.min.js'),
    import('../../vendor/three/examples/jsm/controls/OrbitControls.js'),
    import('../../vendor/three/examples/jsm/environments/RoomEnvironment.js'),
  ]);
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
  const canvas = renderer.domElement, scene = new T.Scene();
  const camera = new T.PerspectiveCamera(40, 0.6, 0.01, 30);
  const controls = new OrbitControls(camera, canvas);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  controls.enablePan = false; controls.enableDamping = !reduced.matches;
  controls.minPolarAngle = 0.15; controls.maxPolarAngle = Math.PI - 0.15;
  controls.minDistance = 0.3; controls.maxDistance = 5;
  // Frame one loaded end (inner collar to sleeve tip, full plate height) from a three-quarter angle; resize() refits
  // the distance to the canvas shape so the stack never runs off a narrow phone screen.
  const FRAME = { target: new T.Vector3(0.84, -0.01, 0), dir: new T.Vector3(0.93, 0.42, 0.85).normalize(), radius: 0.29 };
  function fit() {
    const v = T.MathUtils.degToRad(camera.fov) / 2, h = Math.atan(Math.tan(v) * camera.aspect);
    controls.target.copy(FRAME.target);
    camera.position.copy(FRAME.target).addScaledVector(FRAME.dir, (FRAME.radius / Math.sin(Math.min(v, h))) * 1.04);
    controls.update();
  }
  const pmrem = new T.PMREMGenerator(renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture; room.dispose(); pmrem.dispose();
  scene.add(new T.HemisphereLight(0xffffff, 0x555566, 2));
  const light = new T.DirectionalLight(0xffffff, 3); light.position.set(1, 3, 2); scene.add(light);
  let host, tip, opts, frame = 0, dead = false, down, started = 0, slides = [];
  let model = new T.Group(); scene.add(model);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const geometry = (g) => { geometries.add(g); return g; };
  const material = (p) => { const m = new T.MeshStandardMaterial(p); materials.add(m); return m; };
  const metal = () => material({ color: 0xcbd0d5, metalness: 1, roughness: 0.2 });
  function mesh(g, m, parent = model) { const o = new T.Mesh(geometry(g), m); parent.add(o); return o; }
  function cylinder(radius, length, x, m, parent = model) {
    const o = mesh(new T.CylinderGeometry(radius, radius, length, 64), m, parent);
    o.rotation.z = -Math.PI / 2; o.position.x = x; return o;
  }
  function texture(draw) {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    draw(c.getContext('2d'));
    const t = new T.CanvasTexture(c); textures.add(t); return t;
  }
  function clearModel() {
    scene.remove(model); geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose());
    geometries.clear(); materials.clear(); textures.clear();
    model = new T.Group(); scene.add(model); slides = [];
  }
  function build() {
    clearModel();
    const chrome = metal();
    cylinder(BAR.shaftDiameter / 2, BAR.innerLength, 0, material({ color: 0x9fa6ad, metalness: 1, roughness: 0.42 }));
    const knurl = texture((ctx) => {
      ctx.fillStyle = '#777'; ctx.fillRect(0,0,512,512); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 3;
      for (let i = -512; i < 1024; i += 32) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i+512,512); ctx.moveTo(i,0); ctx.lineTo(i-512,512); ctx.stroke(); }
    });
    knurl.wrapS = knurl.wrapT = T.RepeatWrapping; knurl.repeat.set(2, 8);
    const grip = material({ color: 0xa9afb5, metalness: 1, roughness: 0.5, bumpMap: knurl, bumpScale: 0.0003 });
    cylinder(0.0146, BAR.centreKnurl * 2, 0, grip);
    for (const sign of [-1, 1]) {
      for (const [a,b] of [[BAR.outerKnurlStart, BAR.ring - BAR.ringWidth/2], [BAR.ring + BAR.ringWidth/2, BAR.outerKnurlEnd]]) cylinder(0.0146, b-a, sign*(a+b)/2, grip);
      cylinder(0.01455, BAR.ringWidth, sign*BAR.ring, chrome);
      cylinder(BAR.collarDiameter/2, BAR.collarLength, sign*(BAR.innerLength/2 + BAR.collarLength/2), chrome);
      cylinder(BAR.sleeveDiameter/2, BAR.sleeveLength, sign*(BAR.length/2 - BAR.sleeveLength/2), chrome);
    }
    const placed = layout(opts.plates, { collar: opts.collar });
    const boltMetal = material({ color: 0x8d949c, metalness: 1, roughness: 0.3 });
    for (const entry of placed.plates) {
      const p = opts.plates[entry.index], r = entry.diameter/2, h = entry.thickness/2, lip = 0.003 * Math.min(1, entry.diameter/0.45), width = 0.012 * Math.min(1, entry.diameter/0.45);
      const paint = material({ color: p.colour || '#555555', roughness: 0.6, metalness: 0.05 });
      const lipPaint = material({ color: p.colour || '#555555', roughness: 0.35, metalness: 0.1 }); // the raised rim, a little glossier
      const label = texture((ctx) => {
        const c = new T.Color(p.colour || '#555555');
        ctx.fillStyle = 0.2126*c.r + 0.7152*c.g + 0.0722*c.b < 0.35 ? '#ffffff' : '#101114';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `800 ${String(p.value).length > 3 ? 78 : 96}px ${FONT}`; ctx.fillText(String(p.value),256,118);
        ctx.font = `800 40px ${FONT}`; ctx.fillText((p.unit || 'kg').toUpperCase(),256,402);
        ctx.globalAlpha = 0.28; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(256,256,226,0,Math.PI*2); ctx.stroke(); // printed ring
      });
      label.colorSpace = T.SRGBColorSpace;
      const ink = material({ map: label, transparent: true, roughness: 0.6, depthWrite: false, side: T.DoubleSide });
      for (const sign of [-1, 1]) {
        const disc = new T.Group(); disc.position.x = sign*(entry.x+h); disc.userData.index = entry.index; model.add(disc);
        // A plate's stated thickness is across its rim; the painted face sits `lip` inside that on each side, so
        // neighbouring plates touch rim to rim. Face and rim are separate lathes that share no surface (no z-fighting).
        const f = h - lip;
        const profile = [[0.0252,-f],[r-width,-f],[r-width,f],[0.0252,f],[0.0252,-f]].map(([x,y])=>new T.Vector2(x,y));
        const body = mesh(new T.LatheGeometry(profile,96), paint, disc); body.rotation.z = -Math.PI/2;
        const rim = rounded(r-width, r, h, Math.min(0.004, h*0.45, width*0.45)).map(([x,y])=>new T.Vector2(x,y));
        const edge = mesh(new T.LatheGeometry(rim,96), lipPaint, disc); edge.rotation.z = -Math.PI/2;
        // Chrome hub insert standing 1.5 mm proud of the face, with six bolt heads on each side.
        const hubR = Math.min(Math.max(0.032, r*0.42), 0.068, r-width-0.004), hubH = f+0.0015;
        const hub = mesh(new T.LatheGeometry(rounded(0.0252, hubR, hubH, 0.0012).map(([x,y])=>new T.Vector2(x,y)),64),chrome,disc); hub.rotation.z=-Math.PI/2;
        const bolts = new T.InstancedMesh(geometry(new T.CylinderGeometry(0.0042, 0.0046, 0.002, 16)), boltMetal, 12);
        bolts.raycast = () => {}; // taps go to the plate behind
        const m4 = new T.Matrix4(), q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1), Math.PI/2);
        for (let k = 0; k < 12; k++) {
          const face = k < 6 ? -1 : 1, a = (k % 6) * Math.PI / 3 + Math.PI / 6, br = (0.0252 + hubR) / 2;
          bolts.setMatrixAt(k, m4.compose(new T.Vector3(face*(hubH+0.001), br*Math.cos(a), br*Math.sin(a)), q, new T.Vector3(1,1,1)));
        }
        disc.add(bolts);
        for (const face of [-1,1]) {
          const decal = mesh(new T.RingGeometry(hubR+0.001, r-width,96),ink,disc);
          decal.rotation.y = face*Math.PI/2; decal.position.x = face*(f+0.0008);
        }
        if (entry.index === opts.justAdded && !reduced.matches) slides.push({ disc, x: disc.position.x, from: sign*(BAR.length/2 + h + 0.12) });
      }
    }
    // Soft contact shadow under the loaded end (seen from above only).
    const floorR = Math.max(0.025, ...placed.plates.map((e) => e.diameter / 2));
    const shade = texture((ctx) => {
      const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
      g.addColorStop(0, 'rgba(0,0,0,.34)'); g.addColorStop(.55, 'rgba(0,0,0,.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
    });
    const floor = mesh(new T.PlaneGeometry(0.62, 0.34),material({ map: shade, transparent: true, depthWrite: false, roughness: 1, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0.8, -floorR - 0.004, 0);
    if (opts.collar) for (const sign of [-1,1]) {
      cylinder(0.04,0.07,sign*(placed.collarX+0.035),chrome);
      const lever = mesh(new T.BoxGeometry(0.015,0.07,0.014),chrome); lever.position.set(sign*(placed.collarX+0.04),0.055,0);
    }
    started = performance.now();
    tip.textContent = opts.plates.length ? 'Drag to turn · tap a plate to remove it' : 'Empty bar';
    if (placed.overflow) tip.textContent += ' · Stack exceeds sleeve';
    requestDraw();
  }
  function draw(now) {
    frame = 0; if (dead) return;
    const t = Math.min(1,(now-started)/250);
    for (const s of slides) s.disc.position.x = s.from + (s.x-s.from)*(1-(1-t)**3);
    if (t === 1) slides = [];
    controls.update(); renderer.render(scene,camera);
    if (slides.length) requestDraw();
  }
  function requestDraw() { if (!dead && !frame) frame=requestAnimationFrame(draw); }
  function resize() {
    if (!host || dead) return;
    const w=Math.max(1,host.clientWidth), h=Math.max(1,host.clientHeight || 420);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1,2)); renderer.setSize(w,h);
    camera.aspect=w/h; camera.updateProjectionMatrix(); fit(); requestDraw();
  }
  const observer = new ResizeObserver(resize), scheme=matchMedia('(prefers-color-scheme: dark)');
  function theme() { light.intensity=scheme.matches ? 3 : 2; requestDraw(); }
  scheme.addEventListener('change',theme); controls.addEventListener('change',requestDraw);
  const raycaster=new T.Raycaster();
  const pointers = new Set();
  function pointerdown(e) {
    pointers.add(e.pointerId);
    down = pointers.size === 1 && (e.pointerType !== 'mouse' || e.button === 0) ? {x:e.clientX,y:e.clientY,id:e.pointerId} : null;
  }
  function pointermove(e) {
    if (down && e.pointerId === down.id && Math.hypot(e.clientX-down.x,e.clientY-down.y)>=6) down=null;
  }
  function pointercancel(e) { pointers.delete(e.pointerId); down=null; }
  function pointerup(e) {
    pointers.delete(e.pointerId);
    const start=down; down=null;
    if (!start || start.id!==e.pointerId || Math.hypot(e.clientX-start.x,e.clientY-start.y)>=6) return;
    const r=canvas.getBoundingClientRect();
    raycaster.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
    let hit=raycaster.intersectObject(model,true)[0]?.object;
    while (hit && hit.userData.index === undefined) hit=hit.parent;
    if (hit) opts.onRemove?.(hit.userData.index);
  }
  function lost(e) { e.preventDefault(); const fail=opts?.onError; dispose(); fail?.(new Error('WebGL context lost')); }
  canvas.addEventListener('pointerdown',pointerdown); canvas.addEventListener('pointermove',pointermove);
  canvas.addEventListener('pointercancel',pointercancel); canvas.addEventListener('pointerup',pointerup); canvas.addEventListener('webglcontextlost',lost);
  function update(options) { opts={...opts,...options}; build(); }
  function dispose() {
    if (dead) return; dead=true; cancelAnimationFrame(frame); observer.disconnect();
    scheme.removeEventListener('change',theme); controls.dispose();
    canvas.removeEventListener('pointerdown',pointerdown); canvas.removeEventListener('pointerup',pointerup); canvas.removeEventListener('webglcontextlost',lost);
    canvas.removeEventListener('pointermove',pointermove); canvas.removeEventListener('pointercancel',pointercancel);
    clearModel(); environment.dispose(); renderer.dispose(); canvas.remove(); tip?.remove();
    if (viewer===api) viewer=null;
  }
  const api={update,dispose,attach(container,options) {
    if (dead) throw new Error('3D viewer disposed');
    observer.disconnect(); host=container; host.querySelector('.bb3d-status')?.remove();
    tip ||= Object.assign(document.createElement('p'),{className:'bb3d-tip'});
    host.append(canvas,tip); observer.observe(host); resize(); theme(); update(options);
  }};
  return api;
}
