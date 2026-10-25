# Builds assets/body.glb: a low-poly mannequin with one mesh per muscle and side.
# Run: blender --background --factory-startup --python assets/build_body.py -- assets/body.glb [preview_dir]
# Mesh names are the muscle ids in data/exercises.json plus _L/_R; the skin is body_skin.
# Blender is Z-up with the figure facing -Y; the glTF exporter turns that into Y-up facing +Z. Metres, feet on 0.
import bpy, sys, math
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
SEG, RINGS = 16, 10
SKIN = []


def finish(ob, along=None, tilt=0.0):
    if along:
        d = Vector(along[1]) - Vector(along[0])
        ob.rotation_mode = 'QUATERNION'
        ob.rotation_quaternion = d.to_track_quat('Z', 'Y')
    elif tilt:
        ob.rotation_euler = (0, tilt, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.shade_smooth()
    return ob


def ellipsoid(centre, radii, along=None, tilt=0.0):
    """UV sphere scaled to radii (x, y, z). `along` = (a, b) aligns the z radius with the segment a->b."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=SEG, ring_count=RINGS, radius=1, location=centre)
    ob = bpy.context.object
    ob.scale = radii
    return finish(ob, along, tilt)


def pillow(centre, half, tilt=0.0):
    """Rounded box (a cube smoothed twice), for the blocks of the abs."""
    bpy.ops.mesh.primitive_cube_add(size=2, location=centre)
    ob = bpy.context.object
    ob.scale = half
    mod = ob.modifiers.new('round', 'SUBSURF')
    mod.levels = 2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(ob, tilt=tilt)


def skin(centre, radii, along=None, tilt=0.0):
    SKIN.append(ellipsoid(centre, radii, along, tilt))


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def offset(p, dx=0, dy=0, dz=0):
    return (p[0] + dx, p[1] + dy, p[2] + dz)


def join(name, parts):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = name
    ob.data.name = name
    return ob


# Joints for the left side (+X is the figure's left). Arms hang in a slight A-pose so the lats show.
SHOULDER, ELBOW, WRIST = (0.205, 0.0, 1.40), (0.255, 0.01, 1.12), (0.285, -0.01, 0.875)
HIP, KNEE, ANKLE = (0.09, 0.0, 0.90), (0.10, 0.0, 0.50), (0.10, 0.015, 0.085)


def side(s):
    """Build one side; s = 'L' or 'R'. Muscle objects are named <muscle>_<side>."""
    m = 1 if s == 'L' else -1
    X = lambda p: (p[0] * m, p[1], p[2])
    sh, el, wr, hp, kn, an = map(X, (SHOULDER, ELBOW, WRIST, HIP, KNEE, ANKLE))
    mid = lerp

    skin(mid(sh, el, 0.5), (0.043, 0.043, 0.16), along=(sh, el))
    skin(mid(el, wr, 0.5), (0.034, 0.034, 0.14), along=(el, wr))
    skin(offset(wr, 0.004 * m, 0, -0.06), (0.026, 0.045, 0.075))
    skin(mid(hp, kn, 0.5), (0.07, 0.072, 0.23), along=(hp, kn))
    skin(mid(kn, an, 0.5), (0.045, 0.048, 0.235), along=(kn, an))
    skin(offset(kn, 0, -0.01, 0), (0.05, 0.05, 0.06))
    skin((0.105 * m, -0.045, 0.035), (0.045, 0.115, 0.035))

    # Upper body
    join(f'chest_{s}', [ellipsoid((0.088 * m, -0.093, 1.355), (0.09, 0.03, 0.07), tilt=-0.25 * m)])
    join(f'front_delts_{s}', [ellipsoid(offset(sh, -0.012 * m, -0.04, 0.01), (0.042, 0.032, 0.065))])
    join(f'side_delts_{s}', [ellipsoid(offset(sh, 0.025 * m, 0.0, 0.0), (0.034, 0.045, 0.07))])
    join(f'rear_delts_{s}', [ellipsoid(offset(sh, -0.012 * m, 0.04, 0.01), (0.042, 0.032, 0.065))])
    join(f'traps_{s}', [
        ellipsoid((0.065 * m, 0.035, 1.475), (0.085, 0.045, 0.045), tilt=0.35 * m),
        ellipsoid((0.032 * m, 0.092, 1.33), (0.04, 0.025, 0.13)),
    ])
    join(f'upper_back_{s}', [ellipsoid((0.105 * m, 0.088, 1.33), (0.06, 0.03, 0.06))])
    join(f'lats_{s}', [ellipsoid((0.118 * m, 0.065, 1.19), (0.06, 0.045, 0.14), tilt=0.2 * m)])
    join(f'lower_back_{s}', [ellipsoid((0.035 * m, 0.088, 1.04), (0.03, 0.025, 0.13))])
    join(f'abs_{s}', [pillow((0.036 * m, -0.094, z), (0.046, 0.028, 0.042)) for z in (1.225, 1.155, 1.085, 1.01)]
         + [ellipsoid((0.112 * m, -0.058, 1.08), (0.04, 0.045, 0.095), tilt=-0.15 * m)])

    # Arms
    join(f'biceps_{s}', [ellipsoid(offset(mid(sh, el, 0.55), 0, -0.032), (0.036, 0.03, 0.1), along=(sh, el))])
    join(f'triceps_{s}', [ellipsoid(offset(mid(sh, el, 0.5), 0, 0.025), (0.038, 0.032, 0.11), along=(sh, el))])
    join(f'forearms_{s}', [ellipsoid(mid(el, wr, 0.38), (0.042, 0.04, 0.1), along=(el, wr))])

    # Legs
    join(f'glutes_{s}', [ellipsoid((0.075 * m, 0.08, 0.925), (0.08, 0.055, 0.09))])
    join(f'quads_{s}', [ellipsoid(offset(mid(hp, kn, 0.52), 0.005 * m, -0.04), (0.064, 0.05, 0.175), along=(hp, kn))])
    join(f'hamstrings_{s}', [ellipsoid(offset(mid(hp, kn, 0.55), 0, 0.04), (0.058, 0.045, 0.16), along=(hp, kn))])
    join(f'adductors_{s}', [ellipsoid(offset(mid(hp, kn, 0.32), -0.045 * m, -0.022), (0.035, 0.045, 0.12), along=(hp, kn))])
    join(f'calves_{s}', [ellipsoid(offset(mid(kn, an, 0.3), 0, 0.03), (0.048, 0.045, 0.11), along=(kn, an))])


skin((0, -0.005, 1.665), (0.088, 0.1, 0.115))  # head
skin((0, 0.0, 1.535), (0.056, 0.056, 0.08))    # neck
skin((0, 0, 1.36), (0.185, 0.1, 0.13))         # ribcage and shoulders
skin((0, 0, 1.15), (0.145, 0.092, 0.2))        # waist
skin((0, 0.0, 0.94), (0.15, 0.097, 0.11))      # pelvis
side('L')
side('R')

# Fuse the skin parts into one smooth surface, then thin it back out to low-poly.
body = join('body_skin', SKIN)
for kind, opts in [('REMESH', {'mode': 'VOXEL', 'voxel_size': 0.008}), ('SMOOTH', {'factor': 0.8, 'iterations': 8}),
                   ('DECIMATE', {'ratio': 0.12})]:
    mod = body.modifiers.new(kind.lower(), kind)
    for k, v in opts.items():
        setattr(mod, k, v)
    bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.shade_smooth()

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = args[0] if args else 'body.glb'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True,
                          export_materials='NONE', export_normals=True)

if len(args) > 1:  # optional preview renders for review
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x, scene.render.resolution_y = 600, 900
    scene.display.shading.color_type = 'RANDOM'
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 2.0
    scene.camera = cam
    for label, loc, rot in [('front', (0, -4, 0.9), (math.pi / 2, 0, 0)), ('back', (0, 4, 0.9), (math.pi / 2, 0, math.pi)),
                            ('side', (4, 0, 0.9), (math.pi / 2, 0, math.pi / 2))]:
        cam.location, cam.rotation_euler = loc, rot
        scene.render.filepath = f'{args[1]}/body-{label}.png'
        bpy.ops.render.render(write_still=True)
    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons)
    print('MESHES', len([o for o in bpy.data.objects if o.type == 'MESH']), 'TRIS', tris)
