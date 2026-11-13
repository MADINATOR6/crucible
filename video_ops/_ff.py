from __future__ import annotations

import json
import math
import os
from pathlib import Path
import shutil
import subprocess
from fractions import Fraction


def ffmpeg_bin() -> str:
    return os.environ.get("VIDEO_OPS_FFMPEG") or shutil.which("ffmpeg") or "ffmpeg"


def ffprobe_bin() -> str:
    return os.environ.get("VIDEO_OPS_FFPROBE") or shutil.which("ffprobe") or "ffprobe"


def run_ff(args: list[str]) -> None:
    result = subprocess.run([ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-nostdin", *args],
                            capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"ffmpeg failed ({result.returncode}): {result.stderr[-800:]}")


def probe(path: Path) -> dict:
    result = subprocess.run([ffprobe_bin(), "-v", "error", "-show_streams", "-show_format",
                             "-of", "json", str(path)], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"ffprobe failed ({result.returncode}): {result.stderr[-800:]}")
    data = json.loads(result.stdout)
    video = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
    if video is None:
        raise ValueError(f"No video stream: {path}")
    rate = video.get("avg_frame_rate", "0/0")
    fps = float(Fraction(rate)) if rate != "0/0" else 0.0
    return {"width": video["width"], "height": video["height"], "fps": fps,
            "duration": float(video.get("duration", data.get("format", {}).get("duration", 0))),
            "frames": int(video["nb_frames"]) if video.get("nb_frames", "N/A") != "N/A" else None,
            "has_audio": any(s["codec_type"] == "audio" for s in data["streams"])}


def encode_args() -> list[str]:
    # SAR is set on the encoded stream without replacing a caller's filter graph.
    return ["-c:v", "libx264", "-crf", "20", "-maxrate", "12M", "-bufsize", "24M",
            "-pix_fmt", "yuv420p", "-bsf:v", "h264_metadata=sample_aspect_ratio=1/1",
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
            "-movflags", "+faststart"]


def destination(dst: Path, sources: list[Path], overwrite: bool) -> list[str]:
    if any(dst.resolve() == src.resolve() or
           (dst.exists() and src.exists() and dst.samefile(src)) for src in sources):
        raise ValueError("Destination must never overwrite an input")
    if dst.exists() and not overwrite:
        raise FileExistsError(dst)
    return ["-y" if overwrite else "-n"]


def positive(**values: float) -> None:
    for name, value in values.items():
        if not math.isfinite(value) or value <= 0:
            raise ValueError(f"{name} must be finite and positive")
