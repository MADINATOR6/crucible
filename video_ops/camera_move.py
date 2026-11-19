from __future__ import annotations

import argparse
import math
from pathlib import Path

from . import _ff

MOVES = ("push", "pull", "truck_left", "truck_right", "crane_up", "crane_down")


def camera_move(src: Path, dst: Path, move: str = "push", amount: float = 0.12,
                duration: float | None = None, fps: float = 30, *, overwrite: bool = False) -> Path:
    src, dst = Path(src), Path(dst)
    flags = _ff.destination(dst, [src], overwrite)
    if move not in MOVES or not math.isfinite(amount) or not 0.02 <= amount <= 0.4:
        raise ValueError("Unknown move or amount outside 0.02-0.4")
    _ff.positive(fps=fps)
    info = _ff.probe(src)
    still = info["duration"] == 0
    seconds = duration if duration is not None else (4 if still else info["duration"])
    _ff.positive(duration=seconds)
    frames = max(1, round(seconds * fps))
    progress = f"min(on/{max(1, frames - 1)},1)"
    zoom = f"1+{amount}*({progress})" if move == "push" else f"1+{amount}*(1-({progress}))"
    x, y = "(iw-iw/zoom)/2", "(ih-ih/zoom)/2"
    if move.startswith(("truck", "crane")):
        zoom = str(1 / (1 - amount))
        travel = progress if move in ("truck_right", "crane_down") else f"1-({progress})"
        if move.startswith("truck"):
            x = f"(iw-iw/zoom)*({travel})"
        else:
            y = f"(ih-ih/zoom)*({travel})"
    width, height = info["width"] // 2 * 2, info["height"] // 2 * 2
    if min(width, height) < 2:
        raise ValueError("Input must be at least 2x2")
    inputs = ["-loop", "1", "-framerate", str(fps)] if still else []
    filters = (f"fps={fps},scale={width * 4}:{height * 4}:flags=lanczos,"
               f"zoompan=z='{zoom}':x='{x}':y='{y}':d=1:s={width}x{height}:fps={fps},setsar=1")
    _ff.run_ff([*flags, *inputs, "-i", str(src), "-vf", filters, "-frames:v", str(frames),
                "-map", "0:v:0", "-map", "0:a?", "-c:a", "aac", "-t", str(seconds),
                *_ff.encode_args(), str(dst)])
    return dst


def main() -> None:
    parser = argparse.ArgumentParser(description="Constant-speed camera move on a still or clip")
    parser.add_argument("src", type=Path)
    parser.add_argument("dst", type=Path)
    parser.add_argument("--move", choices=MOVES, default="push")
    parser.add_argument("--amount", type=float, default=0.12)
    parser.add_argument("--duration", type=float)
    parser.add_argument("--fps", type=float, default=30)
    parser.add_argument("--overwrite", action="store_true")
    camera_move(**vars(parser.parse_args()))


if __name__ == "__main__":
    main()
