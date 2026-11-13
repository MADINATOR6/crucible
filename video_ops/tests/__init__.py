from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from video_ops import _ff


class VideoTest(unittest.TestCase):
    def setUp(self) -> None:
        scratch = Path("media-out/video_ops")
        scratch.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=scratch)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def clip(self, name: str, seconds: float = 2, color: str | None = None,
             audio: bool = False, size: str = "160x120", fps: int = 24) -> Path:
        dst = self.root / name
        source = f"color=c={color}:s={size}:r={fps}" if color else f"testsrc2=s={size}:r={fps}"
        args = ["-f", "lavfi", "-i", source]
        if audio:
            args += ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-c:a", "aac"]
        _ff.run_ff(["-y", *args, "-t", str(seconds), *_ff.encode_args(), str(dst)])
        return dst

    def cli(self, module: str, *args: object) -> None:
        result = subprocess.run([sys.executable, "-m", f"video_ops.{module}", *map(str, args)],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def pixels(self, path: Path, time: float) -> bytes:
        result = subprocess.run([_ff.ffmpeg_bin(), "-v", "error", "-i", str(path),
                                 "-ss", str(time), "-frames:v", "1", "-f", "rawvideo",
                                 "-pix_fmt", "rgb24", "pipe:1"], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(result.stdout)
        return result.stdout
