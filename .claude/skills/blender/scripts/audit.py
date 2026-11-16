"""Read-only audit of a .blend: safety findings plus a scene inventory, written as JSON.

Run inside Blender, with auto-run scripts OFF for any file you did not make:
  blender --background --factory-startup --disable-autoexec --python-exit-code 1 scene.blend \
      --python audit.py -- --output media-out/blender/<project>/review/audit-v1.json [--match "Chair|Sofa"]

Never edits, renders or saves the scene, and never overwrites an existing report. Safety: text
blocks (a registered module runs on open when auto-run is on), scripted drivers, OSL script nodes
and linked libraries; verdict 'review' when any exist. Inventory: units, render settings, cameras,
lights, missing or packed resources and per-object transforms. It does not judge contact,
collisions or how real anything looks: that needs renders and eyes.
"""
import argparse
from collections import Counter
import json
import os
import re
import sys

import bpy


def _r(values, digits=4):
    return [round(float(v), digits) for v in values]


def _file_record(block, kind):
    path = getattr(block, 'filepath', '') or ''
    packed = bool(getattr(block, 'packed_file', None))
    source = getattr(block, 'source', None)
    if kind == 'font' and path == '<builtin>':
        status = 'builtin'
    elif kind == 'image' and source in ('GENERATED', 'VIEWER'):
        status = 'generated'
    elif packed:
        status = 'packed'
    elif not path:
        status = 'no_path'
    elif kind == 'image' and source in ('SEQUENCE', 'TILED', 'MOVIE'):
        status = 'check_by_hand'
    else:
        resolved = bpy.path.abspath(path, library=getattr(block, 'library', None))
        status = 'present' if os.path.isfile(resolved) else 'missing'
    # File names only: absolute paths can carry personal folder names. Split on '/' ourselves:
    # on Windows os.path reads Blender's relative '//dir/name.png' as a UNC drive and returns ''.
    return {'name': block.name, 'kind': kind, 'source': source, 'file': path.replace('\\', '/').rsplit('/', 1)[-1],
            'status': status, 'users': block.users}


def _node_trees(idblock):
    trees = []
    if isinstance(idblock, bpy.types.NodeTree):
        trees.append(idblock)
    embedded = getattr(idblock, 'node_tree', None)
    if embedded is not None and embedded not in trees:
        trees.append(embedded)
    return trees


def safety(max_items=50):
    texts = [{'name': t.name, 'lines': len(t.lines), 'registers_on_open': bool(t.use_module),
              'in_memory_only': bool(t.is_in_memory)} for t in bpy.data.texts]
    drivers, osl = [], []
    for idblock in bpy.data.user_map():
        owners = [idblock] + [t for t in _node_trees(idblock) if t is not idblock]
        for owner in owners:
            anim = getattr(owner, 'animation_data', None)
            if anim:
                for fcurve in anim.drivers:
                    if fcurve.driver.type == 'SCRIPTED':
                        drivers.append({'owner': idblock.name, 'path': fcurve.data_path,
                                        'expression': fcurve.driver.expression[:120]})
        for tree in _node_trees(idblock):
            for node in tree.nodes:
                if node.bl_idname == 'ShaderNodeScript':
                    osl.append({'owner': idblock.name, 'node': node.name, 'mode': node.mode})
    libraries = [_file_record(lib, 'library') for lib in bpy.data.libraries]
    findings = len(texts) + len(drivers) + len(osl) + len(libraries)
    return {
        'verdict': 'review' if findings else 'clean',
        'autoexec_blocked': bool(getattr(bpy.app, 'autoexec_fail', False)),
        'text_blocks': texts[:max_items],
        'scripted_drivers': drivers[:max_items],
        'osl_script_nodes': osl[:max_items],
        'linked_libraries': libraries[:max_items],
        'counts': {'text_blocks': len(texts), 'scripted_drivers': len(drivers), 'osl_script_nodes': len(osl),
                   'linked_libraries': len(libraries)},
        'note': 'clean = none of these four found. Still read any add-on or script before running it.',
    }


def _object_record(obj):
    scale = [abs(v) for v in obj.scale]
    record = {
        'name': obj.name, 'type': obj.type, 'parent': obj.parent.name if obj.parent else None,
        'rotation_mode': obj.rotation_mode,
        'world_location': _r(obj.matrix_world.translation),
        'dimensions': _r(obj.dimensions), 'scale': _r(obj.scale),
        'nonuniform_scale': max(scale) - min(scale) > 1e-5,
        'negative_scale': any(v < 0 for v in obj.scale),
        'hide_render': obj.hide_render,
        'materials': [s.material.name if s.material else None for s in obj.material_slots],
        'modifiers': [m.type for m in obj.modifiers],
        'constraints': [c.type for c in obj.constraints],
        'instance_collection': obj.instance_collection.name if obj.instance_collection else None,
    }
    if obj.type == 'MESH':
        record['mesh'] = {'vertices': len(obj.data.vertices), 'faces': len(obj.data.polygons)}
    return record


def inventory(scene, pattern=None, max_objects=100):
    objects = sorted(scene.objects, key=lambda o: o.name)
    render = scene.render
    cycles = getattr(scene, 'cycles', None)
    images = [_file_record(i, 'image') for i in bpy.data.images]
    other = [_file_record(s, 'sound') for s in bpy.data.sounds] + [_file_record(f, 'font') for f in bpy.data.fonts]
    other += [_file_record(c, 'cache') for c in bpy.data.cache_files]
    matches = [o for o in objects if pattern is None or pattern.search(o.name)]
    warnings = []
    flags = {'nonuniform_scale': [], 'negative_scale': [], 'quaternion_or_axis_angle': []}
    for obj in objects:
        scale = [abs(v) for v in obj.scale]
        if max(scale) - min(scale) > 1e-5:
            flags['nonuniform_scale'].append(obj.name)
        if any(v < 0 for v in obj.scale):
            flags['negative_scale'].append(obj.name)
        if obj.rotation_mode in ('QUATERNION', 'AXIS_ANGLE'):
            flags['quaternion_or_axis_angle'].append(obj.name)
    missing = [r for r in images + other if r['status'] == 'missing']
    if missing:
        warnings.append('%d missing external files: renders will show pink or silent gaps' % len(missing))
    if flags['negative_scale']:
        warnings.append('negative scale flips normals on %d objects' % len(flags['negative_scale']))
    if flags['quaternion_or_axis_angle']:
        warnings.append('%d objects do not rotate through rotation_euler; set rotation by their rotation_mode'
                        % len(flags['quaternion_or_axis_angle']))
    if not scene.camera:
        warnings.append('scene has no active camera')
    unit = scene.unit_settings
    if unit.system == 'NONE' or abs(unit.scale_length - 1.0) > 1e-6:
        warnings.append('units are %s with scale %s: check real-world sizes before judging scale'
                        % (unit.system, unit.scale_length))
    cameras = [{'name': o.name, 'lens_mm': round(o.data.lens, 2), 'sensor_mm': round(o.data.sensor_width, 2),
                'type': o.data.type, 'dof': bool(o.data.dof.use_dof), 'clip': _r((o.data.clip_start, o.data.clip_end))}
               for o in objects if o.type == 'CAMERA']
    lights = [{'name': o.name, 'type': o.data.type, 'energy': round(o.data.energy, 3), 'colour': _r(o.data.color, 3)}
              for o in objects if o.type == 'LIGHT']
    return {
        'scene': scene.name,
        'units': {'system': unit.system, 'scale_length': unit.scale_length, 'length_unit': unit.length_unit},
        'render': {
            'engine': render.engine, 'resolution': [render.resolution_x, render.resolution_y],
            'percentage': render.resolution_percentage, 'fps': round(render.fps / render.fps_base, 3),
            'frames': [scene.frame_start, scene.frame_end, scene.frame_step],
            'camera': scene.camera.name if scene.camera else None,
            'view_transform': scene.view_settings.view_transform, 'look': scene.view_settings.look,
            'exposure': scene.view_settings.exposure,
            'cycles_samples': getattr(cycles, 'samples', None) if render.engine == 'CYCLES' else None,
            'cycles_device': getattr(cycles, 'device', None) if render.engine == 'CYCLES' else None,
            'persistent_data': render.use_persistent_data, 'motion_blur': render.use_motion_blur,
        },
        'camera_markers': [{'frame': m.frame, 'camera': m.camera.name} for m in scene.timeline_markers if m.camera],
        'object_types': dict(Counter(o.type for o in objects)),
        'cameras': cameras, 'lights': lights,
        'images': images, 'other_files': other, 'missing_files': missing,
        'flags': flags, 'warnings': warnings,
        'matched_objects': len(matches), 'objects_truncated': len(matches) > max_objects,
        'objects': [_object_record(o) for o in matches[:max_objects]],
        'limits': 'Base objects only (no evaluated modifiers or geometry-node instances). '
                  'Contact, collisions, clearance and realism are not checked.',
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--output', required=True, help='new JSON report path (never overwritten)')
    parser.add_argument('--scene', help='scene name; default: the active scene')
    parser.add_argument('--match', help='case-insensitive regex selecting objects for detailed records')
    parser.add_argument('--max-objects', type=int, default=100)
    args = parser.parse_args(argv)
    try:
        pattern = re.compile(args.match, re.IGNORECASE) if args.match else None
    except re.error as exc:
        parser.error('bad --match: %s' % exc)
    scene = bpy.data.scenes.get(args.scene) if args.scene else bpy.context.scene
    if scene is None:
        parser.error('no scene named %r' % args.scene)
    output = os.path.abspath(os.path.expanduser(args.output))
    if bpy.data.filepath and os.path.normcase(output) == os.path.normcase(os.path.abspath(bpy.data.filepath)):
        parser.error('--output must not be the .blend file')
    if os.path.exists(output):
        parser.error('--output already exists; pick a new report name')
    report = {
        'schema': 1, 'tool': 'crucible-blender-audit',
        'blender': bpy.app.version_string,
        'file': os.path.basename(bpy.data.filepath) if bpy.data.filepath else None,
        'scenes': [s.name for s in bpy.data.scenes],
        'safety': safety(),
        'inventory': inventory(scene, pattern, max(0, args.max_objects)),
    }
    os.makedirs(os.path.dirname(output) or '.', exist_ok=True)
    with open(output, 'x', encoding='utf-8') as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    print('AUDIT ' + json.dumps({'report': output, 'safety': report['safety']['verdict'],
                                 'warnings': len(report['inventory']['warnings']),
                                 'missing_files': len(report['inventory']['missing_files'])}))
    return report


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
