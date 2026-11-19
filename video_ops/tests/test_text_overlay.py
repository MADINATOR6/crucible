from __future__ import annotations

from video_ops import _ff
from video_ops.text_overlay import text_overlay
from video_ops.tests import VideoTest


class TextOverlayTests(VideoTest):
    def test_cli_pixels(self) -> None:
        src = self.clip("gray.mp4", seconds=5, color="gray", audio=True, size="320x240", fps=30)
        dst = self.root / "text.mp4"
        self.cli("text_overlay", src, dst, "HELLO", "LOCAL VIDEO")
        info = _ff.probe(dst)
        self.assertAlmostEqual(info["duration"], 5, delta=1 / 30)
        self.assertTrue(info["has_audio"])
        original, initial = self.pixels(src, 0), self.pixels(dst, 0)
        self.assertLessEqual(max(abs(a - b) for a, b in zip(original, initial)), 1)
        shown = self.pixels(dst, 3.1)
        background = sum(shown[:320 * 20 * 3]) / (320 * 20 * 3)
        before = sum(original[:320 * 20 * 3]) / (320 * 20 * 3)
        self.assertAlmostEqual(background / before, 0.30, delta=0.035)
        self.assertGreater(max(shown), 220)
        # Bright pixels must stay in the centered text area.
        for y in range(240):
            if y < 70 or y > 170:
                self.assertLess(max(shown[y * 320 * 3:(y + 1) * 320 * 3]), 60)
        mid_dim = self.pixels(dst, 1.9)
        self.assertAlmostEqual(sum(mid_dim[:960]) / sum(original[:960]), 0.65, delta=0.05)
        end = self.pixels(dst, 4.96)
        self.assertLess(sum(end) / len(end), 10)

    def test_errors_and_overwrite(self) -> None:
        src = self.clip("source.mp4", seconds=5)
        dst = self.root / "out.mp4"
        for lines in ([], [""], [" "], ["x"] * 5, "abc"):
            with self.assertRaises(ValueError):
                text_overlay(src, dst, lines)
        dst.write_bytes(b"keep")
        with self.assertRaises(FileExistsError):
            text_overlay(src, dst, ["Hello"])
        self.assertEqual(dst.read_bytes(), b"keep")
        with self.assertRaises(ValueError):
            text_overlay(src, src, ["Hello"], overwrite=True)
