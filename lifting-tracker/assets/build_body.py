# Builds assets/body.glb: a smooth anatomical figure whose muscles are separate meshes cut from one surface.
# Run: blender --background --factory-startup --python assets/build_body.py -- assets/body.glb [preview_dir]
# Mesh names are the muscle ids in data/exercises.json plus _L/_R; the rest of the surface (and the grooves
# between muscles) is body_skin. Blender is Z-up with the figure facing -Y; the glTF exporter turns that into
# Y-up facing +Z. Metres, feet on 0.
#
# How it works: the body is a union of ellipsoids, voxel-remeshed and smoothed into one surface. Each muscle is
# one or more "patch" volumes (superellipsoids, so a block of the abs can be a rounded box). The surface inside a
# patch belongs to that muscle, minus a thin groove where two patch groups meet. Vertices on a muscle's edge are
# moved onto its exact outline, so edges are smooth curves rather than the voxel grid's stair steps, and the muscle
# is raised a few mm, falling to zero at its edge.
import bpy, sys, math
import numpy as np
from mathutils import Vector, Euler, Matrix

bpy.ops.wm.read_factory_settings(use_empty=True)
VOXEL = 0.0085          # surface resolution in metres; smaller is smoother and bigger (0.0085 keeps the GLB near 1.3 MB)
GAP = 0.1               # groove between two patch groups, in patch-radius units
RISE = 0.3              # how far in from the edge a muscle reaches its full relief, in the same units

SKIN = []     # (centre, radii, rotation)
PATCHES = []  # (mesh label, groove group, centre, radii, rotation, relief in metres, superellipse power)
MIRROR = Matrix.Diagonal((-1, 1, 1))


def rot(along=None, tilt=0.0, lean=0.0):
    """Rotation whose columns are the ellipsoid's local axes. `along` aligns local Z with a segment;
    `tilt` turns about Y (in the frontal plane), `lean` about X (forwards/backwards)."""
    if along:
        return (Vector(along[1]) - Vector(along[0])).to_track_quat('Z', 'Y').to_matrix()
    return Euler((lean, tilt, 0)).to_matrix()


def skin(c, r, R=None):
    """Body volume. Off-centre parts are given for the left side (+X) and mirrored."""
    R = R or Matrix.Identity(3)
    SKIN.append((Vector(c), Vector(r), R))
    if abs(c[0]) > 1e-6:
        SKIN.append((Vector((-c[0], c[1], c[2])), Vector(r), MIRROR @ R @ MIRROR))


def patch(muscle, group, c, r, relief, R=None, p=2.0):
    """Muscle region on the left side; the right side is mirrored. Patches sharing a group merge without a groove.
    `p` is the superellipse power: 2 is an ellipsoid, higher is boxier."""
    R = R or Matrix.Identity(3)
    PATCHES.append((muscle + '_L', group + '_L', Vector(c), Vector(r), R, relief, p))
    PATCHES.append((muscle + '_R', group + '_R', Vector((-c[0], c[1], c[2])), Vector(r), MIRROR @ R @ MIRROR, relief, p))


def lerp(a, b, t):
    return Vector(a).lerp(Vector(b), t)


def at(p, dx=0.0, dy=0.0, dz=0.0):
    return Vector(p) + Vector((dx, dy, dz))


# ---------- Body volumes (left side; +X is the figure's left, front is -Y) ----------
SH, EL, WR = (0.205, 0.0, 1.405), (0.258, 0.012, 1.13), (0.285, -0.005, 0.885)
HP, KN, AN = (0.088, 0.0, 0.905), (0.098, -0.004, 0.50), (0.098, 0.012, 0.085)

skin((0, -0.008, 1.675), (0.077, 0.094, 0.108))               # cranium
skin((0, -0.04, 1.618), (0.056, 0.055, 0.052))                # jaw
skin((0, 0.006, 1.535), (0.058, 0.06, 0.085))                 # neck
skin((0.045, 0.018, 1.49), (0.07, 0.045, 0.04), rot(tilt=0.45))  # trapezius slope
skin((0, 0, 1.33), (0.158, 0.114, 0.165))                     # ribcage
skin((0, 0.004, 1.435), (0.175, 0.08, 0.055))                 # shoulder girdle
skin((0, 0.002, 1.13), (0.128, 0.095, 0.15))                  # waist
skin((0, 0.006, 0.955), (0.138, 0.1, 0.1))                    # pelvis
skin(at(SH, 0.006, 0, 0.01), (0.06, 0.064, 0.074))            # deltoid
skin((0.082, -0.058, 1.352), (0.088, 0.05, 0.072), rot(tilt=-0.22))  # pectoral
skin((0.118, 0.035, 1.225), (0.058, 0.068, 0.13), rot(tilt=0.25))    # lat flare
skin((0.07, 0.056, 0.93), (0.078, 0.053, 0.09))               # glute
skin(lerp(SH, EL, 0.5), (0.046, 0.049, 0.16), rot(along=(SH, EL)))   # upper arm
skin(at(lerp(SH, EL, 0.52), 0, -0.016), (0.038, 0.036, 0.1), rot(along=(SH, EL)))  # biceps bulk
skin(at(lerp(SH, EL, 0.42), 0, 0.016), (0.042, 0.038, 0.11), rot(along=(SH, EL)))  # triceps bulk
skin(EL, (0.037, 0.038, 0.042))                               # elbow
skin(lerp(EL, WR, 0.3), (0.043, 0.04, 0.095), rot(along=(EL, WR)))   # forearm, thick end
skin(lerp(EL, WR, 0.72), (0.031, 0.027, 0.09), rot(along=(EL, WR)))  # forearm, thin end
skin(WR, (0.026, 0.02, 0.02))                                 # wrist
skin(at(WR, 0.004, -0.006, -0.07), (0.022, 0.048, 0.075))     # hand
skin(lerp(HP, KN, 0.3), (0.086, 0.095, 0.17), rot(along=(HP, KN)))   # thigh, upper
skin(lerp(HP, KN, 0.72), (0.062, 0.066, 0.14), rot(along=(HP, KN)))  # thigh, lower
skin(at(KN, 0, -0.006), (0.047, 0.05, 0.056))                 # knee
skin(lerp(KN, AN, 0.5), (0.042, 0.046, 0.225), rot(along=(KN, AN)))  # shin
skin(at(lerp(KN, AN, 0.3), 0, 0.024), (0.05, 0.054, 0.11), rot(along=(KN, AN)))  # calf bulk
skin(AN, (0.03, 0.032, 0.036))                                # ankle
skin((0.102, -0.045, 0.036), (0.045, 0.115, 0.037))           # foot

# ---------- Muscle patches: (muscle, groove group, centre, radii, relief) ----------
arm, fore, thigh, shin = rot(along=(SH, EL)), rot(along=(EL, WR)), rot(along=(HP, KN)), rot(along=(KN, AN))

# Patches overlap on purpose: where two overlap, the surface splits between them along a groove, so the muscles
# tile the body like an anatomy chart. Head, neck, hands, knees, shins and feet stay skin.
patch('chest', 'chest', (0.088, -0.105, 1.352), (0.112, 0.08, 0.09), 0.006, rot(tilt=-0.2), p=2.4)
patch('front_delts', 'front_delts', at(SH, -0.012, -0.052, 0.0), (0.05, 0.055, 0.088), 0.005)
patch('side_delts', 'side_delts', at(SH, 0.056, 0.0, -0.01), (0.042, 0.062, 0.095), 0.005)
patch('rear_delts', 'rear_delts', at(SH, -0.012, 0.052, 0.0), (0.05, 0.055, 0.088), 0.005)
patch('traps', 'traps', (0.07, 0.03, 1.49), (0.1, 0.07, 0.055), 0.005, rot(tilt=0.42))
patch('traps', 'traps', (0.05, 0.095, 1.38), (0.08, 0.06, 0.08), 0.005)
patch('traps', 'traps', (0.024, 0.1, 1.27), (0.05, 0.06, 0.1), 0.004)
patch('upper_back', 'upper_back', (0.112, 0.105, 1.33), (0.065, 0.06, 0.07), 0.004)
patch('lats', 'lats', (0.127, 0.06, 1.225), (0.078, 0.075, 0.145), 0.006, rot(tilt=0.3))
patch('lats', 'lats', (0.08, 0.09, 1.12), (0.06, 0.05, 0.08), 0.005)
patch('lower_back', 'lower_back', (0.036, 0.095, 1.055), (0.036, 0.06, 0.14), 0.004)
for i, (z, h) in enumerate(((1.238, 0.034), (1.168, 0.034), (1.098, 0.034), (1.012, 0.046))):
    patch('abs', f'abs{i}', (0.04, -0.09, z), (0.036, 0.06, h), 0.004, p=3.5)
patch('abs', 'obliques', (0.11, -0.055, 1.09), (0.05, 0.075, 0.105), 0.004, rot(tilt=-0.12))
patch('biceps', 'biceps', at(lerp(SH, EL, 0.56), 0, -0.04), (0.044, 0.042, 0.125), 0.006, arm)
patch('triceps', 'triceps', at(lerp(SH, EL, 0.45), 0, 0.044), (0.05, 0.042, 0.135), 0.005, arm)
patch('forearms', 'forearm_flexors', at(lerp(EL, WR, 0.4), -0.012, -0.03), (0.04, 0.042, 0.135), 0.004, fore)
patch('forearms', 'forearm_extensors', at(lerp(EL, WR, 0.4), 0.025, 0.02), (0.038, 0.042, 0.135), 0.004, fore)
patch('glutes', 'glutes', (0.074, 0.105, 0.93), (0.095, 0.08, 0.105), 0.004)
patch('quads', 'rectus_femoris', at(lerp(HP, KN, 0.45), -0.004, -0.08), (0.04, 0.06, 0.19), 0.006, thigh)
patch('quads', 'vastus_lateralis', at(lerp(HP, KN, 0.5), 0.066, -0.03), (0.046, 0.07, 0.19), 0.006, thigh)
patch('quads', 'vastus_medialis', at(lerp(HP, KN, 0.78), -0.036, -0.05), (0.038, 0.05, 0.085), 0.006, thigh)
patch('hamstrings', 'biceps_femoris', at(lerp(HP, KN, 0.55), 0.026, 0.075), (0.038, 0.06, 0.18), 0.005, thigh)
patch('hamstrings', 'semitendinosus', at(lerp(HP, KN, 0.55), -0.026, 0.075), (0.038, 0.06, 0.18), 0.005, thigh)
patch('adductors', 'adductors', at(lerp(HP, KN, 0.3), -0.072, -0.012), (0.05, 0.06, 0.14), 0.004, thigh)
patch('calves', 'gastroc_lateral', at(lerp(KN, AN, 0.32), 0.022, 0.06), (0.032, 0.055, 0.11), 0.006, shin)
patch('calves', 'gastroc_medial', at(lerp(KN, AN, 0.32), -0.022, 0.06), (0.032, 0.055, 0.115), 0.006, shin)

# ---------- One smooth surface ----------
parts = []
for c, r, R in SKIN:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=14, radius=1)
    ob = bpy.context.object
    ob.matrix_world = Matrix.Translation(c) @ R.to_4x4() @ Matrix.Diagonal((r.x, r.y, r.z, 1))
    parts.append(ob)
bpy.ops.object.select_all(action='DESELECT')
for ob in parts:
    ob.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
body = bpy.context.object
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def apply(ob, kind, **opts):
    mod = ob.modifiers.new(kind.lower(), kind)
    for k, v in opts.items():
        setattr(mod, k, v)
    bpy.ops.object.modifier_apply(modifier=mod.name)


apply(body, 'REMESH', mode='VOXEL', voxel_size=VOXEL)
apply(body, 'SMOOTH', factor=0.7, iterations=8)

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

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = args[0] if args else 'body.glb'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True,
                          export_materials='NONE', export_normals=True)

if len(args) > 1:  # optional preview renders for review
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
        scene.render.filepath = f'{args[1]}/body-{name}.png'
        bpy.ops.render.render(write_still=True)
    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons)
    print('MESHES', len(made), 'TRIS', tris)
