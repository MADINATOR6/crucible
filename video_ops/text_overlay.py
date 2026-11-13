from __future__ import annotations

import argparse
from collections.abc import Sequence
import math
from pathlib import Path
import tempfile

import cairo

from . import _ff

FONT = "Arial"


def text_overlay(src: Path, dst: Path, lines: Sequence[str], start: float = 2.0,
                 stagger: float = 0.16, fade_in: float = 0.3, dim_to: float = 0.30,
                 dim_dur: float = 0.6, fade_out: float = 0.45, *, overwrite: bool = False) -> Path:
    src, dst = Path(src), Path(dst)
    flags = _ff.destination(dst, [src], overwrite)
    if isinstance(lines, str) or not 1 <= len(lines) <= 4 or any(not s.strip() for s in lines):
        raise ValueError("Provide one to four non-empty lines")
    _ff.positive(fade_in=fade_in, dim_dur=dim_dur, fade_out=fade_out)
    if any(not math.isfinite(v) or v < 0 for v in (start, stagger)) or not 0 <= dim_to <= 1:
        raise ValueError("Invalid start, stagger or dim_to")
    info = _ff.probe(src)
    seconds, width, height = info["duration"], info["width"] // 2 * 2, info["height"] // 2 * 2
    if seconds <= 0 or start + (len(lines) - 1) * stagger + fade_in > seconds - fade_out:
        raise ValueError("Clip is too short for text timing and fade out")
    fps = info["fps"]
    _ff.positive(fps=fps)
    with tempfile.TemporaryDirectory() as temporary:
        inputs = ["-i", str(src)]
        filters = [f"[0:v]scale={width}:{height},setsar=1,setpts=PTS-STARTPTS[base]",
                   f"color=c=black:s={width}x{height}:r={fps}:d={seconds},format=rgba,"
                   f"colorchannelmixer=aa={1 - dim_to},fade=t=in:st={max(0, start - 0.4)}:"
                   f"d={dim_dur}:alpha=1[dim]",
                   "[base][dim]overlay=shortest=1[layer0]"]
        font_size = min(width * 0.065, height / (len(lines) * 1.6 + 2))
        for n, line in enumerate(lines):
            surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, width, height)
            context = cairo.Context(surface)
            context.select_font_face(FONT, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
            context.set_font_size(font_size)
            extents = context.text_extents(line)
            fitted = font_size * min(1, width * 0.9 / max(extents.width, extents.x_advance, 1))
            context.set_font_size(fitted)
            extents = context.text_extents(line)
            center_y = height / 2 + (n - (len(lines) - 1) / 2) * font_size * 1.4
            context.move_to((width - extents.width) / 2 - extents.x_bearing,
                            center_y - extents.height / 2 - extents.y_bearing)
            context.text_path(line)
            context.set_source_rgba(1, 1, 1, 1)
            context.fill()
            png = Path(temporary) / f"line{n}.png"
            surface.write_to_png(str(png))
            inputs.extend(["-loop", "1", "-framerate", str(fps), "-i", str(png)])
            filters.extend([f"[{n + 1}:v]format=rgba,fade=t=in:st={start + n * stagger}:"
                            f"d={fade_in}:alpha=1[text{n}]",
                            f"[layer{n}][text{n}]overlay=shortest=1[layer{n + 1}]"])
        filters.append(f"[layer{len(lines)}]fade=t=out:st={seconds - fade_out}:d={fade_out}[v]")
        _ff.run_ff([*flags, *inputs, "-filter_complex", ";".join(filters), "-map", "[v]",
                    "-map", "0:a?", "-c:a", "aac", "-t", str(seconds), *_ff.encode_args(), str(dst)])
    return dst


def main() -> None:
    parser = argparse.ArgumentParser(description="Centered white text, linear dim and fade to black")
    parser.add_argument("src", type=Path)
    parser.add_argument("dst", type=Path)
    parser.add_argument("lines", nargs="+")
    for name, default in (("start", 2.0), ("stagger", 0.16), ("fade_in", 0.3),
                          ("dim_to", 0.30), ("dim_dur", 0.6), ("fade_out", 0.45)):
        parser.add_argument("--" + name.replace("_", "-"), type=float, default=default)
    parser.add_argument("--overwrite", action="store_true")
    text_overlay(**vars(parser.parse_args()))


if __name__ == "__main__":
    main()
