from __future__ import annotations

from video_ops import _ff
from video_ops.camera_move import camera_move, MOVES
from video_ops.tests import VideoTest


class CameraMoveTests(VideoTest):
    def test_cli_and_still_moves(self) -> None:
        src = self.clip("source.mp4", audio=True)
        dst = self.root / "camera.mp4"
        self.cli("camera_move", src, dst, "--fps", 30)
        info = _ff.probe(dst)
        self.assertEqual((info["width"], info["height"], info["frames"]), (160, 120, 60))
        self.assertTrue(info["has_audio"])
        first, last = self.pixels(dst, 0), self.pixels(dst, 1.9)
        self.assertGreater(sum(abs(a - b) for a, b in zip(first, last)) / len(first), 0)
        still = self.root / "still.png"
        _ff.run_ff(["-i", str(src), "-frames:v", "1", str(still)])
        for move in MOVES:
            with self.subTest(move=move):
                output = self.root / f"{move}.mp4"
                self.cli("camera_move", still, output, "--move", move, "--duration", 1, "--fps", 12)
                self.assertEqual(_ff.probe(output)["frames"], 12)
                a, b = self.pixels(output, 0), self.pixels(output, 0.9)
                self.assertGreater(sum(abs(x - y) for x, y in zip(a, b)), 0)

    def test_errors_and_overwrite(self) -> None:
        src = self.clip("source.mp4", audio=True)
        dst = self.root / "exists.mp4"
        dst.write_bytes(b"keep")
        with self.assertRaises(FileExistsError):
            camera_move(src, dst)
        self.assertEqual(dst.read_bytes(), b"keep")
        for move, amount in (("bad", 0.12), ("push", 0.01), ("push", 0.41), ("push", float("nan"))):
            with self.assertRaises(ValueError):
                camera_move(src, self.root / "bad.mp4", move=move, amount=amount)
        with self.assertRaises(ValueError):
            camera_move(src, src, overwrite=True)
        camera_move(src, dst, duration=1, overwrite=True)
        info = _ff.probe(dst)
        self.assertEqual(info["width"], 160)
        self.assertAlmostEqual(info["duration"], 1, delta=1 / 30)
