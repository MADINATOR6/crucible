# Builds the 2D heat map from the 3D body: src/ui/heatmap-body.js (traced outlines per muscle, front and back) and
# assets/body-front.webp / body-back.webp (soft shading laid over the colours).
# Run after build_body.py:
#   blender --background --factory-startup --python assets/build_map2d.py -- assets/body.glb src/ui/heatmap-body.js assets
# How it works: each muscle is rendered from the front and the back in its own flat colour (orthographic, no
# anti-aliasing), every pixel is matched to the nearest colour, and each muscle's pixels are traced with marching
# squares, smoothed and simplified into an SVG path. A second render of the sculpt in plain grey becomes the
# shading image. Pill positions (the number on each muscle) are picked so no two overlap.
import bpy, sys, json, math
import numpy as np

import os
GLB, OUT_JS, OUT_DIR = map(os.path.abspath, sys.argv[sys.argv.index('--') + 1:])  # Blender reads relative paths from the drive root
W, H = 220, 476            # view box units
PPM = 256                  # units per metre: 1.80 m body plus margins fits 476
FEET = 468                 # y of the soles
K = 3                      # render pixels per unit
# Muscles that get a number pill in each view (the others are drawn where visible, without a pill).
PILLS = {
    'front': ['traps', 'front_delts', 'side_delts', 'chest', 'biceps', 'forearms', 'abs', 'adductors', 'quads'],
    'back': ['traps', 'upper_back', 'rear_delts', 'side_delts', 'lats', 'lower_back', 'triceps', 'forearms', 'glutes', 'hamstrings', 'calves'],
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
objs = [o for o in bpy.data.objects if o.type == 'MESH']
muscle_of = {o.name: (None if o.name.startswith('body_') else o.name.rsplit('_', 1)[0]) for o in objs}

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x, scene.render.resolution_y = W * K, H * K
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
bpy.ops.object.camera_add()
cam = bpy.context.object
cam.data.type, cam.data.ortho_scale = 'ORTHO', H / PPM
scene.camera = cam
cz = (FEET - H / 2) / PPM
VIEWS = {'front': ((0, -5, cz), (math.pi / 2, 0, 0)), 'back': ((0, 5, cz), (math.pi / 2, 0, math.pi))}

# One colour per object, spread over the RGB cube.
rng = np.random.default_rng(7)
palette = {}
for i, o in enumerate(objs):
    c = rng.uniform(0.05, 0.95, 3) if i else np.array([0.5, 0.5, 0.5])
    palette[o.name] = c
    o.color = (*c, 1)


def render(path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H * K, W * K, 4)[::-1]  # row 0 at the top
    bpy.data.images.remove(img)
    return px


def loops(mask):
    """Closed boundary loops of a boolean mask (marching squares on pixel centres), in pixel coordinates."""
    m = np.pad(mask, 1).astype(np.uint8)
    case = m[:-1, :-1] * 8 + m[:-1, 1:] * 4 + m[1:, 1:] * 2 + m[1:, :-1]
    # Edge midpoints of a cell (r, c): top, right, bottom, left.
    mid = lambda r, c, e: ((c + 0.5, r), (c + 1, r + 0.5), (c + 0.5, r + 1), (c, r + 0.5))[e]
    SEG = {1: [(3, 2)], 2: [(2, 1)], 3: [(3, 1)], 4: [(1, 0)], 5: [(3, 0), (1, 2)], 6: [(2, 0)], 7: [(3, 0)],
           8: [(0, 3)], 9: [(0, 2)], 10: [(0, 1), (2, 3)], 11: [(0, 1)], 12: [(1, 3)], 13: [(1, 2)], 14: [(2, 3)]}
    nxt = {}
    for r, c in zip(*np.nonzero((case > 0) & (case < 15))):
        for a, b in SEG[int(case[r, c])]:
            nxt[mid(r, c, a)] = mid(r, c, b)
    out = []
    while nxt:
        start, p = next(iter(nxt.items()))
        loop = [start]
        while p != start and p in nxt:
            loop.append(p); q = nxt.pop(p); p = q
        nxt.pop(start, None)
        if len(loop) > 8:
            out.append(np.array(loop) - 1)  # undo the padding
    return out


def smooth(pts, n=3):
    for _ in range(n):
        pts = (np.roll(pts, 1, 0) + 2 * pts + np.roll(pts, -1, 0)) / 4
    return pts


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    d = np.abs(np.cross(ab, pts - a)) / (np.linalg.norm(ab) + 1e-9)
    i = int(np.argmax(d))
    if d[i] > eps:
        return np.vstack([rdp(pts[:i + 1], eps)[:-1], rdp(pts[i:], eps)])
    return np.array([a, b])


def path(loop_list):
    """Smooth closed curves: simplified points become quadratic control points, joined at their midpoints."""
    parts = []
    for lp in loop_list:
        pts = smooth(lp.astype(float)) / K
        i = len(pts) // 2
        pts = np.vstack([rdp(pts[:i + 1], 0.6)[:-1], rdp(pts[i:], 0.6)[:-1]])
        if len(pts) < 3:
            continue
        mids = (pts + np.roll(pts, -1, 0)) / 2
        f = lambda p: f'{p[0]:.1f} {p[1]:.1f}'
        seg = ''.join(f'Q{f(pts[(j + 1) % len(pts)])} {f(mids[(j + 1) % len(pts)])}' for j in range(len(pts)))
        parts.append(f'M{f(mids[0])}{seg}Z')
    return ''.join(parts)


def pill_box(x, y, tiny):
    w, h = (31, 14.5) if tiny else (31, 16.5)  # widest realistic label ("99.5")
    return (x - w / 2 - 1, y - h / 2 - 1, x + w / 2 + 1, y + h / 2 + 1)


def overlap(a, b):
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])


data = {}
for view, (loc, rotn) in VIEWS.items():
    cam.location, cam.rotation_euler = loc, rotn
    shading = scene.display.shading
    # ID pass.
    scene.display.render_aa = 'OFF'
    shading.light, shading.color_type, shading.show_cavity, shading.show_shadows = 'FLAT', 'OBJECT', False, False
    px = render(f'{OUT_DIR}/_id.png')
    names = list(palette)
    lin = np.array([palette[n] for n in names])
    cols = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)  # object colours are linear; the PNG is sRGB
    body = px[..., 3] > 0.5
    d = ((px[..., None, :3] - cols[None, None]) ** 2).sum(-1)
    idx = np.where(body, d.argmin(-1), -1)
    regions, cands = {}, {}
    for m in sorted({v for v in muscle_of.values() if v}):
        ids = [i for i, n in enumerate(names) if muscle_of[n] == m]
        mask = np.isin(idx, ids)
        if mask.sum() < 30 * K * K:  # hardly visible from this side
            continue
        regions[m] = {'d': path(loops(mask))}
        # Pill candidates: the centroid of each side's largest visible part, and the middle for muscles on the midline.
        ys, xs = np.nonzero(mask)
        cx = W * K / 2
        c = []
        for side in (xs < cx, xs >= cx):
            if side.sum() > 20 * K * K:
                c.append((xs[side].mean() / K, ys[side].mean() / K))
        if abs(xs.mean() - cx) < 4 * K and np.abs(xs - cx).min() < 3 * K:
            c.insert(0, (W / 2, ys.mean() / K))
        cands[m] = ([(float(x), float(y)) for x, y in c], bool(mask.sum() / (K * K) < 900))
    outline = path(loops(body))
    # Place pills greedily (largest muscles first), nudging down/up when every candidate collides.
    placed = []
    for m in sorted(PILLS[view], key=lambda m: -len(regions.get(m, {'d': ''})['d'])):
        if m not in cands:
            continue
        c, tiny = cands[m]
        pick = None
        offsets = sorted(((dx, dy) for dx in range(-12, 13, 4) for dy in range(-40, 41, 4)), key=lambda o: math.hypot(*o))
        for dx, dy in offsets:
            for x, y in c:
                b = pill_box(x + dx, y + dy, tiny)
                if not any(overlap(b, q) for q in placed):
                    pick = (round(x + dx, 1), round(y + dy, 1)); break
            if pick:
                break
        assert pick, f'no room for the {m} pill on the {view}: {c} vs {placed}'
        placed.append(pill_box(*pick, tiny))
        regions[m]['label'] = list(pick)
        regions[m]['tiny'] = tiny
    data[view] = {'outline': outline, 'regions': regions}

    # Shading pass: the sculpt in plain grey, remapped so the body's median tone is 50% grey (neutral for soft-light).
    scene.display.render_aa = '16'
    shading.light, shading.color_type, shading.single_color = 'STUDIO', 'SINGLE', (0.8, 0.8, 0.8)
    shading.show_cavity, shading.cavity_type = True, 'BOTH'
    px = render(f'{OUT_DIR}/_shade.png')
    lum = px[..., :3] @ np.array([0.2126, 0.7152, 0.0722])
    med = np.median(lum[px[..., 3] > 0.5])
    g = np.clip(0.5 + (lum - med) * 2.4, 0, 1)
    img = bpy.data.images.new('shade', W * K, H * K, alpha=True)
    out = np.dstack([g, g, g, px[..., 3]])[::-1]
    img.pixels[:] = out.astype(np.float32).ravel()
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.quality = 82
    img.save_render(f'{OUT_DIR}/body-{view}.webp', scene=scene)
    scene.render.image_settings.file_format = 'PNG'
    bpy.data.images.remove(img)

import glob
for f in glob.glob(f'{OUT_DIR}/_id.*') + glob.glob(f'{OUT_DIR}/_shade.*'):
    os.remove(f)

js = ('// Generated by assets/build_map2d.py from assets/body.glb; do not edit by hand.\n'
      f'// View box 0 0 {W} {H}. Each view: the body outline and, per muscle, its traced path; `label` is where\n'
      '// its number pill sits and `tiny` picks the smaller pill.\n'
      f'export const VIEW = {{ w: {W}, h: {H} }};\n'
      f'export const FRONT = {json.dumps(data["front"], separators=(",", ":"))};\n'
      f'export const BACK = {json.dumps(data["back"], separators=(",", ":"))};\n')
with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(js)
print('WROTE', OUT_JS, len(js), {v: sorted(data[v]['regions']) for v in data})
