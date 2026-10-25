# Builds assets/body.glb: a sculpted anatomical figure whose muscles are separate meshes cut from one surface.
# Run: blender --background --factory-startup --python assets/build_body.py -- <source.glb> assets/body.glb [preview_dir]
# The source is a sculpted figure in A-pose (generated with Higgsfield image_to_3d from a generic mannequin image;
# kept out of the repo under media-out/higgsfield/body3d/meshy-raw.glb). Any Z-up figure facing -Y works if the
# joint and patch positions below are re-measured. Mesh names are the muscle ids in data/exercises.json plus _L/_R;
# the rest of the surface is body_skin and the outlines between muscles are body_groove. Blender is Z-up with the
# figure facing -Y; the glTF exporter turns that into Y-up facing +Z. Metres, feet on 0, 1.80 m tall.
#
# How it works: the source is scaled to 1.80 m, voxel-remeshed into one closed quad surface and lightly smoothed.
# Each muscle is one or more "patch" volumes (superellipsoids, so a block of the abs can be a rounded box) centred
# where a ray from inside the body meets the skin, so patches sit on the sculpted forms. The surface inside a patch
# belongs to that muscle, minus a thin groove where two patch groups meet. Vertices on a muscle's edge are moved
# onto its exact outline, so edges are smooth curves rather than the voxel grid's stair steps, and the muscle is
# raised slightly, falling to zero at its edge.
import bpy, sys, math
import numpy as np
from mathutils import Vector, Euler, Matrix
from mathutils.bvhtree import BVHTree

bpy.ops.wm.read_factory_settings(use_empty=True)
HEIGHT = 1.80
VOXEL = 0.0072          # surface resolution in metres; smaller keeps more sculpt detail and makes a bigger GLB
GAP = 0.1               # groove between two patch groups, in patch-radius units
RISE = 0.3              # how far in from the edge a muscle reaches its full relief, in the same units

PATCHES = []  # (mesh label, groove group, ray origin, ray direction, radii, rotation, relief in metres, power)
MIRROR = Matrix.Diagonal((-1, 1, 1))


def rot(along=None, tilt=0.0, lean=0.0):
    """Rotation whose columns are the patch's local axes. `along` aligns local Z with a segment and keeps local Y
    facing front/back; `tilt` turns about Y (in the frontal plane), `lean` about X (forwards/backwards)."""
    if along:
        z = (Vector(along[1]) - Vector(along[0])).normalized()
        y = Vector((0, 1, 0)); y = (y - z * y.dot(z)).normalized()
        return Matrix((y.cross(z), y, z)).transposed()
    return Euler((lean, tilt, 0)).to_matrix()


def patch(muscle, group, origin, direction, r, relief, R=None, p=2.0):
    """Muscle region on the left side, centred where a ray from `origin` (inside the body) along `direction` first
    meets the skin; the right side is mirrored. Patches sharing a group merge without a groove. `p` is the
    superellipse power: 2 is an ellipsoid, higher is boxier."""
    PATCHES.append((muscle, group, Vector(origin), Vector(direction).normalized(), Vector(r), R or Matrix.Identity(3), relief, p))


def lerp(a, b, t):
    return Vector(a).lerp(Vector(b), t)


# ---------- Source surface ----------
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
bpy.ops.import_scene.gltf(filepath=args[0])
parts = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for ob in parts:
    ob.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
if len(parts) > 1:
    bpy.ops.object.join()
body = bpy.context.object
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for ob in [o for o in bpy.data.objects if o is not body]:
    bpy.data.objects.remove(ob)
body.data.materials.clear()
lo = np.min([v.co[:] for v in body.data.vertices], axis=0); hi = np.max([v.co[:] for v in body.data.vertices], axis=0)
k = HEIGHT / (hi[2] - lo[2])
body.data.transform(Matrix.Diagonal((k, k, k, 1)) @ Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2])))


def apply(ob, kind, **opts):
    mod = ob.modifiers.new(kind.lower(), kind)
    for k, v in opts.items():
        setattr(mod, k, v)
    bpy.ops.object.modifier_apply(modifier=mod.name)


apply(body, 'REMESH', mode='VOXEL', voxel_size=VOXEL)
apply(body, 'SMOOTH', factor=0.5, iterations=3)

# ---------- Muscle patches (left side; +X is the figure's left, front is -Y) ----------
# Joint centres measured on the scaled source.
SH, EL, WR = (0.215, 0.01, 1.42), (0.315, 0.03, 1.17), (0.378, -0.02, 0.95)
HP, KN, AN = (0.10, 0.0, 0.88), (0.135, 0.02, 0.52), (0.155, 0.055, 0.10)
arm, fore, thigh, shin = rot(along=(SH, EL)), rot(along=(EL, WR)), rot(along=(HP, KN)), rot(along=(KN, AN))
F, B, L = (0, -1, 0), (0, 1, 0), (1, 0, 0)

# Patches overlap on purpose: where two overlap, the surface splits between them along a groove, so the muscles
# tile the body like an anatomy chart. Head, neck, hands, knees, shins and feet stay skin.
patch('chest', 'chest', (0.1, 0, 1.37), F, (0.125, 0.08, 0.095), 0.002, rot(tilt=-0.15), p=2.4)
patch('front_delts', 'front_delts', SH, (0.35, -1, 0), (0.06, 0.06, 0.1), 0.002)
patch('side_delts', 'side_delts', SH, L, (0.06, 0.07, 0.105), 0.002)
patch('rear_delts', 'rear_delts', SH, (0.35, 1, 0), (0.06, 0.06, 0.1), 0.002)
patch('traps', 'traps', (0.09, 0.02, 1.45), (0, 0.4, 1), (0.12, 0.08, 0.07), 0.002, rot(tilt=0.42))
patch('traps', 'traps', (0.06, 0, 1.38), B, (0.09, 0.07, 0.1), 0.002)
patch('traps', 'traps', (0.03, 0, 1.24), B, (0.06, 0.07, 0.11), 0.002)
patch('upper_back', 'upper_back', (0.13, 0, 1.34), B, (0.08, 0.07, 0.08), 0.002)
patch('lats', 'lats', (0.1, 0, 1.21), (0.6, 1, 0), (0.1, 0.09, 0.16), 0.002, rot(tilt=0.3))
patch('lats', 'lats', (0.08, 0, 1.11), B, (0.075, 0.06, 0.08), 0.002)
patch('lats', 'lats', (0.05, 0.01, 1.24), L, (0.06, 0.06, 0.1), 0.002)
patch('lower_back', 'lower_back', (0.04, 0, 1.1), B, (0.05, 0.07, 0.12), 0.002)
for i, (z, h) in enumerate(((1.278, 0.036), (1.213, 0.034), (1.148, 0.036), (1.035, 0.07))):
    patch('abs', f'abs{i}', (0.045, 0, z), F, (0.046, 0.07, h), 0.002, p=3.5)
patch('abs', 'obliques', (0.05, 0, 1.12), (0.65, -0.75, 0), (0.07, 0.07, 0.14), 0.002)
patch('biceps', 'biceps', lerp(SH, EL, 0.6), (-0.2, -1, 0), (0.055, 0.05, 0.15), 0.002, arm)
patch('triceps', 'triceps', lerp(SH, EL, 0.5), (0.2, 1, 0), (0.06, 0.05, 0.17), 0.002, arm)
patch('forearms', 'forearm_flexors', lerp(EL, WR, 0.3), (-0.7, -0.7, 0), (0.05, 0.05, 0.14), 0.002, fore)
patch('forearms', 'forearm_extensors', lerp(EL, WR, 0.3), (0.7, 0.4, 0), (0.05, 0.05, 0.14), 0.002, fore)
patch('glutes', 'glutes', (0.09, 0, 1.0), B, (0.11, 0.09, 0.12), 0.002)
patch('quads', 'rectus_femoris', lerp(HP, KN, 0.42), F, (0.055, 0.06, 0.21), 0.002, thigh)
patch('quads', 'vastus_lateralis', lerp(HP, KN, 0.5), (0.85, -0.5, 0), (0.06, 0.07, 0.21), 0.002, thigh)
patch('quads', 'vastus_medialis', lerp(HP, KN, 0.8), (-0.6, -0.8, 0), (0.05, 0.055, 0.1), 0.002, thigh)
patch('hamstrings', 'biceps_femoris', lerp(HP, KN, 0.55), (0.45, 1, 0), (0.05, 0.06, 0.2), 0.002, thigh)
patch('hamstrings', 'semitendinosus', lerp(HP, KN, 0.55), (-0.45, 1, 0), (0.05, 0.06, 0.2), 0.002, thigh)
patch('adductors', 'adductors', lerp(HP, KN, 0.3), (-1, -0.3, 0), (0.06, 0.07, 0.15), 0.002, thigh)
patch('calves', 'gastroc_lateral', lerp(KN, AN, 0.27), (0.55, 1, 0), (0.042, 0.06, 0.13), 0.002, shin)
patch('calves', 'gastroc_medial', lerp(KN, AN, 0.27), (-0.55, 1, 0), (0.045, 0.06, 0.135), 0.002, shin)

# Centre each patch on the skin, then mirror it to the right side.
bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
resolved = []
for muscle, group, o, d, r, R, relief, p in PATCHES:
    hit = bvh.ray_cast(o, d)[0]
    assert hit is not None, f'{group}: ray from {tuple(o)} misses the body'
    resolved.append((muscle + '_L', group + '_L', hit, r, R, relief, p))
    resolved.append((muscle + '_R', group + '_R', Vector((-hit.x, hit.y, hit.z)), r, MIRROR @ R @ MIRROR, relief, p))
PATCHES = resolved

# ---------- Assign the surface to muscles and raise them ----------
me = body.data
n = len(me.vertices)
V = np.empty(n * 3); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
N = np.empty(n * 3); me.vertex_normals.foreach_get('vector', N); N = N.reshape(-1, 3)
loop_v = np.empty(len(me.loops), dtype=np.int64); me.loops.foreach_get('vertex_index', loop_v)
totals = np.empty(len(me.polygons), dtype=np.int64); me.polygons.foreach_get('loop_total', totals)
assert (totals == 4).all(), 'voxel remesh should give quads'
quads = loop_v.reshape(-1, 4)
# Edges plus quad diagonals: a corner that touches the outside only across a diagonal must snap too, or the
# skin-coloured face it leaves behind shows as a notch in the muscle's outline.
E = np.empty(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get('vertices', E)
E = np.concatenate([E.reshape(-1, 2), quads[:, [0, 2]], quads[:, [1, 3]]])

groups = sorted({p[1] for p in PATCHES})
gi = {g: i for i, g in enumerate(groups)}
glabel, grelief = [None] * len(groups), np.zeros(len(groups))
for label, group, c, r, R, relief, p in PATCHES:
    glabel[gi[group]], grelief[gi[group]] = label, relief


def fields(P):
    """Superellipsoid distance from each point to each patch group (below 1 inside it)."""
    G = np.full((len(groups), len(P)), np.inf)
    for label, group, c, r, R, relief, p in PATCHES:
        local = np.abs((P - np.array(c)) @ np.array(R)) / np.array(r)  # columns of R are the patch's axes
        k = gi[group]
        G[k] = np.minimum(G[k], (local ** p).sum(axis=1) ** (1 / p))
    return G


def margin(G, k, i):
    """How far point i is inside group k's territory: positive inside, 0 on its outline. A group's territory is
    inside its patch and at least GAP nearer to it than to any other group (the GAP strip is the groove)."""
    j = np.arange(len(i))
    dk = G[k, i]
    rest = G[:, i]
    rest[k, j] = np.inf
    return np.minimum(1 - dk, rest.min(axis=0) - dk - GAP)


G = fields(V)
idx = np.arange(n)
nearest = np.argmin(G, axis=0)
own = np.where(margin(G, nearest, idx) > 0, nearest, -1)   # -1 is skin

# Move every edge vertex of a muscle to where its margin crosses zero along its edges (averaged), so the outline
# follows the patch shape instead of the voxel grid.
acc, cnt = np.zeros_like(V), np.zeros(n)
for a, b in (E.T, E.T[::-1]):
    sel = (own[a] >= 0) & (own[a] != own[b])
    a, b = a[sel], b[sel]
    k = own[a]
    ha, hb = margin(G, k, a), margin(G, k, b)
    t = np.clip(ha / np.maximum(ha - hb, 1e-9), 0, 1)[:, None]
    np.add.at(acc, a, V[a] + t * (V[b] - V[a]))
    np.add.at(cnt, a, 1)
moved = cnt > 0
V[moved] = acc[moved] / cnt[moved][:, None]

# Raise each muscle: zero on its outline, full relief RISE inside it, slightly domed in the middle.
G = fields(V)
mem = own >= 0
k, i = own[mem], idx[mem]
s = np.clip(margin(G, k, i) / RISE, 0, 1)
dome = 0.65 + 0.35 * np.clip(1 - G[k, i] ** 2, 0, 1)
V[mem] += N[mem] * (grelief[k] * s * s * (3 - 2 * s) * dome)[:, None]
me.vertices.foreach_set('co', V.ravel())
me.update()

# A face belongs to a muscle group when all its corners do. Faces across two groups, or a group and skin, are the
# outline between them (body_groove, drawn dark by the viewer); faces with no muscle corner are plain skin.
labels = ['body_skin', 'body_groove'] + sorted({p[0] for p in PATCHES})
li = {l: i for i, l in enumerate(labels)}
vlab = np.where(mem, np.array([li[l] for l in glabel])[np.maximum(own, 0)], 0)
fg = own[quads]
same = (fg == fg[:, :1]).all(axis=1) & (fg[:, 0] >= 0)
face_mat = np.where(same, vlab[quads[:, 0]], np.where((fg >= 0).any(axis=1), li['body_groove'], 0))
for l in labels:
    me.materials.append(bpy.data.materials.new(l))
me.polygons.foreach_set('material_index', face_mat.astype(np.int32))

# Keep the shading continuous across the cuts, then split into one object per label.
bpy.ops.object.shade_smooth()
vn = np.empty(n * 3); me.vertex_normals.foreach_get('vector', vn)
me.normals_split_custom_set_from_vertices(vn.reshape(-1, 3).tolist())
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='MATERIAL')
bpy.ops.object.mode_set(mode='OBJECT')
made = []
for ob in [o for o in bpy.data.objects if o.type == 'MESH']:
    label = ob.data.materials[ob.data.polygons[0].material_index].name
    ob.name = ob.data.name = label
    made.append(label)
missing = sorted(set(labels) - set(made))
print('MISSING', missing)

bpy.ops.export_scene.gltf(filepath=args[1], export_format='GLB', export_yup=True, export_apply=True,
                          export_materials='NONE', export_normals=True)

if len(args) > 2:  # optional preview renders for review
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x, scene.render.resolution_y = 700, 1000
    shading = scene.display.shading
    shading.light, shading.color_type, shading.show_cavity = 'STUDIO', 'OBJECT', True
    world = bpy.data.worlds.new('bg'); world.color = (0.02, 0.02, 0.025); scene.world = world
    for ob in bpy.data.objects:
        ob.color = {'body_skin': (0.09, 0.09, 0.1, 1), 'body_groove': (0.01, 0.01, 0.012, 1)}.get(ob.name, (0.0, 0.55, 0.95, 1))
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.type, cam.data.ortho_scale = 'ORTHO', 1.95
    scene.camera = cam
    for name, loc, rotn in [('front', (0, -4, 0.9), (math.pi / 2, 0, 0)), ('back', (0, 4, 0.9), (math.pi / 2, 0, math.pi)),
                            ('side', (4, 0, 0.9), (math.pi / 2, 0, math.pi / 2)),
                            ('three-quarter', (2.6, -3.1, 1.0), (math.pi / 2, 0, math.radians(40)))]:
        cam.location, cam.rotation_euler = loc, rotn
        scene.render.filepath = f'{args[2]}/body-{name}.png'
        bpy.ops.render.render(write_still=True)
    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons)
    print('MESHES', len(made), 'TRIS', tris)
