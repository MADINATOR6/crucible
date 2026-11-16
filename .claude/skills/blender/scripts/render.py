"""Resumable frame render from a saved .blend. Never saves or edits the file on disk.

Run inside background Blender (never in the live UI session):
  blender --background --disable-autoexec --python-exit-code 1 scene.blend --python render.py -- \
      --output <abs dir> --frames 1-240 [--samples 128] [--percent 50] [--engine CYCLES] [--device GPU]

Writes <output>/f_####.png, skipping frames already complete on disk, so re-running the same command
continues after a crash or power cut. A run manifest records the .blend fingerprint and settings; if
either changed since frames were written, it stops (exit 2) instead of mixing old and new frames.
Progress goes to <output>/status.json and one 'FRAME' line per frame (seconds included), which is
also how to benchmark: render the same frames twice with different settings and compare.
"""
import argparse
import json
import os
import re
import sys
import time

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crucible_blender import frame_path, is_complete, parse_frames  # noqa: E402

FORMATS = {'PNG': 'png', 'JPEG': 'jpg', 'OPEN_EXR': 'exr'}


def _write_json(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as handle:
        json.dump(data, handle, indent=2)
    os.replace(tmp, path)


def _lower_priority():
    try:
        if os.name == 'nt':
            import ctypes
            kernel = ctypes.windll.kernel32
            kernel.SetPriorityClass(kernel.GetCurrentProcess(), 0x00004000)  # below normal: the PC stays usable
        else:
            os.nice(5)
    except Exception:
        pass


def _apply(scene, args):
    render = scene.render
    if args.engine:
        try:
            render.engine = args.engine
        except TypeError:
            items = [i.identifier for i in render.bl_rna.properties['engine'].enum_items]
            raise SystemExit('engine %r is not available here; listed (the list can be incomplete): %s'
                             % (args.engine, ', '.join(items)))
    if args.samples is not None:
        if render.engine == 'CYCLES':
            scene.cycles.samples = args.samples
        elif hasattr(scene, 'eevee') and render.engine.startswith('BLENDER_EEVEE'):
            scene.eevee.taa_render_samples = args.samples
        else:
            print('WARN --samples ignored for engine %s' % render.engine)
    if args.device:
        if render.engine != 'CYCLES':
            print('WARN --device only applies to Cycles')
        else:
            scene.cycles.device = args.device
            if args.device == 'GPU':
                # Cycles quietly falls back to the CPU when Preferences > System has no usable GPU device
                # (seen on Windows: compute_device_type NONE, OptiX refused by an old driver). Say so.
                try:
                    prefs = bpy.context.preferences.addons['cycles'].preferences
                    if prefs.compute_device_type == 'NONE' or not prefs.has_active_device():
                        print('WARN --device GPU, but Cycles has no active GPU device (Preferences > System: %s); '
                              'this render runs on the CPU' % prefs.compute_device_type, flush=True)
                except (KeyError, AttributeError):
                    print('WARN --device GPU: could not read the Cycles device preferences', flush=True)
    if args.percent is not None:
        render.resolution_percentage = args.percent
    if args.persistent_data:
        render.use_persistent_data = True
    settings = render.image_settings
    if hasattr(settings, 'media_type'):
        settings.media_type = 'IMAGE'
    settings.file_format = args.format
    render.use_file_extension = True
    camera = None
    if args.camera:
        camera = bpy.data.objects.get(args.camera)
        if camera is None or camera.type != 'CAMERA':
            raise SystemExit('no camera named %r' % args.camera)
    return camera


def _effective(scene, args):
    render = scene.render
    return {
        'scene': scene.name, 'engine': render.engine,
        'samples': getattr(scene.cycles, 'samples', None) if render.engine == 'CYCLES' else
        getattr(getattr(scene, 'eevee', None), 'taa_render_samples', None),
        'device': getattr(scene.cycles, 'device', None) if render.engine == 'CYCLES' else None,
        'resolution': [render.resolution_x, render.resolution_y, render.resolution_percentage],
        'format': args.format, 'prefix': args.prefix, 'camera': args.camera,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--output', required=True, help='output folder (made absolute against the current folder)')
    parser.add_argument('--frames', help='e.g. 1-240 or 1-60,121-180 or 1-240:10; default: the scene range')
    parser.add_argument('--scene')
    parser.add_argument('--camera', help='force one camera; default: timeline markers, then the scene camera')
    parser.add_argument('--engine', help='e.g. CYCLES, BLENDER_EEVEE, BLENDER_WORKBENCH (as registered)')
    parser.add_argument('--samples', type=int)
    parser.add_argument('--device', choices=['CPU', 'GPU'])
    parser.add_argument('--percent', type=int, help='resolution percentage 1-100')
    parser.add_argument('--format', default='PNG', choices=sorted(FORMATS))
    parser.add_argument('--prefix', default='f_')
    parser.add_argument('--persistent-data', action='store_true', help='keep scene data in memory between frames')
    parser.add_argument('--allow-mismatch', action='store_true', help='resume although the .blend or settings changed')
    parser.add_argument('--normal-priority', action='store_true')
    args = parser.parse_args(argv)
    if args.samples is not None and args.samples < 1:
        parser.error('--samples must be at least 1')
    if args.percent is not None and not 1 <= args.percent <= 100:
        parser.error('--percent must be 1-100')

    scene = bpy.data.scenes.get(args.scene) if args.scene else bpy.context.scene
    if scene is None:
        parser.error('no scene named %r' % args.scene)
    try:
        frames = parse_frames(args.frames) if args.frames else list(
            range(scene.frame_start, scene.frame_end + 1, max(1, scene.frame_step)))
    except ValueError as exc:
        parser.error(str(exc))
    out = os.path.abspath(os.path.expanduser(args.output))
    os.makedirs(out, exist_ok=True)
    fixed_camera = _apply(scene, args)
    ext = FORMATS[args.format]

    blend = bpy.data.filepath
    stat = os.stat(blend) if blend and os.path.exists(blend) else None
    manifest = {
        'blend': os.path.basename(blend) if blend else None,
        'blend_size': stat.st_size if stat else None,
        'blend_mtime_ns': stat.st_mtime_ns if stat else None,
        'settings': _effective(scene, args),
    }
    manifest_path = os.path.join(out, 'render-manifest.json')
    # Every frame already in the folder counts, not only the ones requested now: a run over other frames
    # with new settings would otherwise replace the manifest, and a later run would mix old and new frames.
    name = re.compile(r'^%s\d+\.%s$' % (re.escape(args.prefix), re.escape(ext)), re.IGNORECASE)
    existing = [n for n in os.listdir(out) if name.match(n)]
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding='utf-8') as handle:
            previous = json.load(handle)
        if previous != manifest and existing and not args.allow_mismatch:
            changed = sorted(k for k in set(previous) | set(manifest) if previous.get(k) != manifest.get(k))
            print('MISMATCH the .blend or render settings changed since frames were written (%s). '
                  'Use a new --output folder, or --allow-mismatch if the change cannot affect them.' % ', '.join(changed))
            raise SystemExit(2)
    _write_json(manifest_path, manifest)
    if not args.normal_priority:
        _lower_priority()

    markers = sorted((m for m in scene.timeline_markers if m.camera), key=lambda m: m.frame)
    status_path = os.path.join(out, 'status.json')
    done = skipped = 0
    times = []
    last = None
    started = time.time()
    for frame in frames:
        path = frame_path(out, args.prefix, frame, ext)
        if is_complete(path):
            skipped += 1
            continue
        scene.frame_set(frame)
        if fixed_camera is not None:
            scene.camera = fixed_camera
        else:
            # Same rule as Blender's animation render: the latest marker at or before the frame,
            # and before the first marker, the first marker's camera.
            earlier = [m.camera for m in markers if m.frame <= frame]
            if earlier:
                scene.camera = earlier[-1]
            elif markers:
                scene.camera = markers[0].camera
        if scene.camera is None:
            raise SystemExit('no camera for frame %d' % frame)
        remaining = len(frames) - skipped - done
        average = sum(times[-12:]) / len(times[-12:]) if times else None
        _write_json(status_path, {'total': len(frames), 'done': done, 'skipped': skipped, 'current': frame,
                                  'last': last, 'avg_seconds': average,
                                  'eta_seconds': round(average * remaining) if average else None,
                                  'updated': time.strftime('%Y-%m-%d %H:%M:%S')})
        scene.render.filepath = path
        began = time.time()
        bpy.ops.render.render(write_still=True, scene=scene.name)
        seconds = time.time() - began
        if not is_complete(path):
            raise SystemExit('frame %d did not write a complete file: %s' % (frame, path))
        times.append(seconds)
        done += 1
        last = frame
        print('FRAME %d %s %.1fs %s' % (frame, scene.camera.name, seconds, path), flush=True)
    summary = {'total': len(frames), 'done': done, 'skipped': skipped, 'current': None, 'last': last,
               'avg_seconds': sum(times) / len(times) if times else None, 'eta_seconds': 0,
               'wall_seconds': round(time.time() - started, 1), 'output': out, 'finished': True,
               'updated': time.strftime('%Y-%m-%d %H:%M:%S')}
    _write_json(status_path, summary)
    print('RENDER ' + json.dumps(summary), flush=True)
    return summary


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
