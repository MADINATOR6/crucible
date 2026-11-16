"""Offline tests for the Blender skill helpers. Standard library only; no provider calls.

  python -I .claude/skills/blender/scripts/test_blender.py

The frame-check tests always run. The scene tests (audit + render on a synthetic scene) run only
when 'import bpy' works, i.e. under Blender's own Python or a venv with the 'bpy' wheel; otherwise
they are reported as skipped. Every scene is synthetic and lives in a temporary folder.
"""
import json
import os
import shutil
import struct
import sys
import tempfile
import unittest
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import crucible_blender as cb  # noqa: E402

try:
    import bpy  # noqa: F401
    HAVE_BPY = True
except ImportError:
    HAVE_BPY = False


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    return a if pa <= pb and pa <= pc else (b if pb <= pc else c)


def write_png(path, width, height, pixel, filters=(0, 1, 2, 3, 4), truncate=False):
    """RGB 8-bit PNG; row y uses filters[y % len(filters)] so the decoder sees every filter type."""
    raw = bytearray()
    prev = bytearray(width * 3)
    for y in range(height):
        row = bytearray()
        for x in range(width):
            row.extend(pixel(x, y))
        kind = filters[y % len(filters)]
        out = bytearray([kind])
        for i, value in enumerate(row):
            left = row[i - 3] if i >= 3 else 0
            up = prev[i]
            upleft = prev[i - 3] if i >= 3 else 0
            predictor = {0: 0, 1: left, 2: up, 3: (left + up) >> 1, 4: _paeth(left, up, upleft)}[kind]
            out.append((value - predictor) & 0xFF)
        raw.extend(out)
        prev = row

    def chunk(kind, body):
        return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xFFFFFFFF)

    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(bytes(raw))) + chunk(b'IEND', b'')
    if truncate:
        data = data[:len(data) // 2]
    with open(path, 'wb') as handle:
        handle.write(data)


def grey(level):
    return lambda x, y: (level, level, level)


class FrameSpecTests(unittest.TestCase):
    def test_ranges_steps_and_singles(self):
        self.assertEqual(cb.parse_frames('1-3,7, 10-20:5'), [1, 2, 3, 7, 10, 15, 20])
        self.assertEqual(cb.parse_frames('5,5,4'), [4, 5])

    def test_rejects_bad_specs(self):
        for bad in ('', 'a', '5-1', '1-10:0', '1--3', '1-3,'):
            with self.assertRaises(ValueError, msg=bad):
                cb.parse_frames(bad)


class PngTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix='crucible-blender-')

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_decoder_handles_every_filter(self):
        path = os.path.join(self.dir, 'g.png')
        write_png(path, 23, 17, lambda x, y: ((x * 11) % 256, (y * 13) % 256, (x * y) % 256))
        expected_total, n = 0.0, 0
        for y in range(0, 17, 1):
            for x in range(0, 23, 1):
                r, g, b = (x * 11) % 256, (y * 13) % 256, (x * y) % 256
                expected_total += 0.2126 * r + 0.7152 * g + 0.0722 * b
                n += 1
        self.assertAlmostEqual(cb.png_mean_luma(path, stride=1), expected_total / (n * 255.0), places=6)

    def test_completeness(self):
        good, cut = os.path.join(self.dir, 'a.png'), os.path.join(self.dir, 'b.png')
        write_png(good, 8, 8, grey(100))
        write_png(cut, 64, 64, lambda x, y: (x * 4, y * 4, 7), truncate=True)
        self.assertTrue(cb.is_complete(good))
        self.assertFalse(cb.is_complete(cut))
        self.assertFalse(cb.is_complete(os.path.join(self.dir, 'none.png')))

    @unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg not on PATH')
    def test_ffmpeg_agrees_with_python(self):
        path = os.path.join(self.dir, 'f.png')
        write_png(path, 64, 36, grey(128))
        self.assertAlmostEqual(cb.ffmpeg_mean_luma(path), cb.png_mean_luma(path, stride=1), delta=0.02)


class CheckFramesTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix='crucible-frames-')

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def make(self, levels):
        for frame, level in levels.items():
            write_png(cb.frame_path(self.dir, 'f_', frame, 'png'), 16, 9, grey(level))

    def test_clean_sequence_passes(self):
        self.make({1: 120, 2: 122, 3: 118})
        for ffmpeg in (False, True):
            report = cb.check_frames(self.dir, [1, 2, 3], use_ffmpeg=ffmpeg)
            self.assertTrue(report['ok'], report)

    def test_missing_black_and_jump_fail(self):
        self.make({1: 120, 2: 0, 4: 120, 5: 240})
        report = cb.check_frames(self.dir, [1, 2, 3, 4, 5], use_ffmpeg=False)
        self.assertFalse(report['ok'])
        self.assertEqual(report['missing'], [3])
        self.assertEqual(report['black'], [2])
        self.assertIn({'from': 4, 'to': 5, 'change': 0.5}, report['jumps'])

    def test_jump_at_planned_cut_passes(self):
        self.make({1: 60, 2: 61, 3: 200, 4: 201})
        self.assertFalse(cb.check_frames(self.dir, [1, 2, 3, 4], use_ffmpeg=False)['ok'])
        self.assertTrue(cb.check_frames(self.dir, [1, 2, 3, 4], cuts=[3], use_ffmpeg=False)['ok'])

    def test_cli_exit_codes(self):
        import check_frames
        self.make({1: 120, 2: 121})
        self.assertEqual(check_frames.main(['--dir', self.dir, '--no-ffmpeg']), 0)
        self.assertEqual(check_frames.main(['--dir', self.dir, '--frames', '1-3', '--no-ffmpeg']), 1)


@unittest.skipUnless(HAVE_BPY, 'bpy not importable: run under Blender Python or a venv with the bpy wheel')
class SceneTests(unittest.TestCase):
    """Synthetic scene: audit flags the risky bits, render writes, resumes and refuses mixed settings."""

    @classmethod
    def setUpClass(cls):
        import bpy
        cls.dir = tempfile.mkdtemp(prefix='crucible-scene-')
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 64, 36, 100
        scene.frame_start, scene.frame_end = 1, 3
        mesh = bpy.data.meshes.new('CubeMesh')
        mesh.from_pydata([(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)], [], [(0, 1, 2, 3)])
        plane = bpy.data.objects.new('Floor', mesh)
        plane.scale = (2, 1, 1)
        scene.collection.objects.link(plane)
        cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
        cam.location = (0, -6, 4)
        cam.rotation_euler = (1.0, 0, 0)
        scene.collection.objects.link(cam)
        scene.camera = cam
        sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
        sun.data.energy = 3
        scene.collection.objects.link(sun)
        world = bpy.data.worlds.new('World')
        scene.world = world
        cls.clean = os.path.join(cls.dir, 'clean.blend')
        bpy.ops.wm.save_as_mainfile(filepath=cls.clean)
        text = bpy.data.texts.new('autorun.py')
        text.write('print("hello")\n')
        text.use_module = True
        driver = plane.driver_add('location', 2).driver
        driver.type = 'SCRIPTED'
        driver.expression = '0.0'
        texture = bpy.data.images.new('Wood', 4, 4)
        texture.source = 'FILE'
        texture.filepath = '//textures/missing_wood.png'
        texture.use_fake_user = True
        cls.risky = os.path.join(cls.dir, 'risky.blend')
        bpy.ops.wm.save_as_mainfile(filepath=cls.risky)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dir, ignore_errors=True)

    def open(self, path):
        import bpy
        bpy.ops.wm.open_mainfile(filepath=path)

    def test_audit_clean_and_risky(self):
        import audit
        self.open(self.clean)
        report = audit.main(['--output', os.path.join(self.dir, 'clean.json')])
        self.assertEqual(report['safety']['verdict'], 'clean')
        self.assertIn('Floor', report['inventory']['flags']['nonuniform_scale'])
        self.open(self.risky)
        out = os.path.join(self.dir, 'risky.json')
        report = audit.main(['--output', out, '--match', 'Floor'])
        self.assertEqual(report['safety']['verdict'], 'review')
        self.assertEqual(report['safety']['counts']['text_blocks'], 1)
        self.assertTrue(report['safety']['text_blocks'][0]['registers_on_open'])
        self.assertEqual(report['safety']['counts']['scripted_drivers'], 1)
        self.assertEqual(report['inventory']['matched_objects'], 1)
        self.assertEqual([r['file'] for r in report['inventory']['missing_files']], ['missing_wood.png'])
        self.assertTrue(any('missing external files' in w for w in report['inventory']['warnings']))
        with open(out, encoding='utf-8') as handle:
            self.assertEqual(json.load(handle)['safety']['verdict'], 'review')
        with self.assertRaises(SystemExit):
            audit.main(['--output', out])  # never overwrites a report

    def test_render_resume_and_mismatch(self):
        import render
        self.open(self.clean)
        out = os.path.join(self.dir, 'frames')
        base = ['--output', out, '--frames', '1-2', '--samples', '1', '--device', 'CPU', '--normal-priority']
        first = render.main(base)
        self.assertEqual((first['done'], first['skipped']), (2, 0))
        for frame in (1, 2):
            self.assertTrue(cb.is_complete(cb.frame_path(out, 'f_', frame, 'png')))
        self.open(self.clean)
        again = render.main(base)
        self.assertEqual((again['done'], again['skipped']), (0, 2))
        self.open(self.clean)
        with self.assertRaises(SystemExit) as stop:
            render.main(['--output', out, '--frames', '1-3', '--samples', '2', '--device', 'CPU', '--normal-priority'])
        self.assertEqual(stop.exception.code, 2)
        # Frames already in the folder count even when the new request does not include them:
        # otherwise new settings replace the manifest and a later run mixes old and new frames.
        self.open(self.clean)
        with self.assertRaises(SystemExit) as stop:
            render.main(['--output', out, '--frames', '3', '--samples', '2', '--device', 'CPU', '--normal-priority'])
        self.assertEqual(stop.exception.code, 2)
        self.assertFalse(os.path.exists(cb.frame_path(out, 'f_', 3, 'png')))
        self.assertTrue(cb.check_frames(out, [1, 2], black=0.0, use_ffmpeg=False)['ok'])


if __name__ == '__main__':
    result = unittest.main(argv=[sys.argv[0]], exit=False, verbosity=1).result
    skipped = len(result.skipped)
    print('scene tests: %s' % ('ran' if HAVE_BPY else 'SKIPPED (no bpy)'), '| skipped total:', skipped)
    sys.exit(0 if result.wasSuccessful() else 1)
