from __future__ import annotations

from video_ops import _ff
from video_ops.join_clips import join_clips
from video_ops.tests import VideoTest


class JoinClipsTests(VideoTest):
    def test_cli_cut_fade_and_audio(self) -> None:
        a = self.clip("a.mp4", color="red", audio=True)
        b = self.clip("b.mp4", color="blue", audio=True, size="192x128", fps=30)
        c = self.clip("c.mp4", color="green", audio=True)
        for transition, expected in (("cut", 6), ("fade", 5)):
            with self.subTest(transition=transition):
                dst = self.root / f"{transition}.mp4"
                self.cli("join_clips", dst, a, b, c, "--transition", transition)
                info = _ff.probe(dst)
                self.assertAlmostEqual(info["duration"], expected, delta=1 / 30)
                self.assertEqual((info["width"], info["height"], info["fps"]), (160, 120, 30))
                self.assertTrue(info["has_audio"])
        silent = self.clip("silent.mp4")
        dst = self.root / "mixed.mp4"
        self.cli("join_clips", dst, a, silent, "--size", 192, 128)
        info = _ff.probe(dst)
        self.assertFalse(info["has_audio"])
        self.assertEqual((info["width"], info["height"]), (192, 128))

    def test_errors_and_overwrite(self) -> None:
        src = self.clip("source.mp4")
        dst = self.root / "out.mp4"
        for clips, options in (([src], {}), ([src, src], {"duration": 3}),
                               ([src, src], {"duration": 2}), ([src, src], {"transition": "bad"})):
            with self.assertRaises(ValueError):
                join_clips(clips, dst, **options)
        dst.write_bytes(b"keep")
        with self.assertRaises(FileExistsError):
            join_clips([src, src], dst)
        self.assertEqual(dst.read_bytes(), b"keep")
        with self.assertRaises(ValueError):
            join_clips([src, src], src, overwrite=True)
