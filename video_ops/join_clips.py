from __future__ import annotations

import argparse
from pathlib import Path
from collections.abc import Sequence

from . import _ff


def join_clips(clips: Sequence[Path], dst: Path, transition: str = "cut", duration: float = 0.5,
               fps: float = 30, size: tuple[int, int] | None = None, *, overwrite: bool = False) -> Path:
    clips, dst = [Path(p) for p in clips], Path(dst)
    flags = _ff.destination(dst, clips, overwrite)
    if len(clips) < 2 or transition not in ("cut", "fade"):
        raise ValueError("Need at least two clips and transition cut or fade")
    _ff.positive(fps=fps, duration=duration)
    infos = [_ff.probe(p) for p in clips]
    if duration >= min(i["duration"] for i in infos):
        raise ValueError("Transition duration must be shorter than every clip")
    width, height = size or (infos[0]["width"] // 2 * 2, infos[0]["height"] // 2 * 2)
    if any(not isinstance(v, int) or v < 2 or v % 2 for v in (width, height)):
        raise ValueError("Size must contain positive even integers")
    audio = all(i["has_audio"] for i in infos)
    filters = []
    for n, info in enumerate(infos):
        filters.append(f"[{n}:v]fps={fps},scale={width}:{height},setsar=1,format=yuv420p,"
                       f"settb=AVTB,setpts=PTS-STARTPTS[v{n}]")
        if audio:
            filters.append(f"[{n}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
                           f"apad,atrim=duration={info['duration']},asetpts=PTS-STARTPTS[a{n}]")
    if transition == "cut":
        labels = "".join(f"[v{n}]" + (f"[a{n}]" if audio else "") for n in range(len(clips)))
        filters.append(f"{labels}concat=n={len(clips)}:v=1:a={int(audio)}[v]" + ("[a]" if audio else ""))
    else:
        elapsed = infos[0]["duration"]
        previous_v, previous_a = "v0", "a0"
        for n in range(1, len(clips)):
            out_v = "v" if n == len(clips) - 1 else f"mixv{n}"
            out_a = "a" if n == len(clips) - 1 else f"mixa{n}"
            filters.append(f"[{previous_v}][v{n}]xfade=transition=fade:duration={duration}:"
                           f"offset={elapsed - duration}[{out_v}]")
            if audio:
                filters.append(f"[{previous_a}][a{n}]acrossfade=d={duration}[{out_a}]")
            elapsed += infos[n]["duration"] - duration
            previous_v, previous_a = out_v, out_a
    inputs = [arg for p in clips for arg in ("-i", str(p))]
    audio_args = ["-map", "[a]", "-c:a", "aac"] if audio else ["-an"]
    _ff.run_ff([*flags, *inputs, "-filter_complex", ";".join(filters), "-map", "[v]",
                *audio_args, *_ff.encode_args(), str(dst)])
    return dst


def main() -> None:
    parser = argparse.ArgumentParser(description="Join clips with hard cuts or crossfades")
    parser.add_argument("dst", type=Path)
    parser.add_argument("clips", type=Path, nargs="+")
    parser.add_argument("--transition", choices=("cut", "fade"), default="cut")
    parser.add_argument("--duration", type=float, default=0.5)
    parser.add_argument("--fps", type=float, default=30)
    parser.add_argument("--size", type=int, nargs=2)
    parser.add_argument("--overwrite", action="store_true")
    join_clips(**vars(parser.parse_args()))


if __name__ == "__main__":
    main()
