"""Check a rendered frame sequence before encoding. Any Python 3.8+, no bpy.

  python -I check_frames.py --dir media-out/blender/<project>/renders/final --frames 1-240 [--cuts 61,121]

Fails (exit 1) on a missing, half-written, black or undecodable frame, or a brightness jump that is
not at a planned cut. Uses ffmpeg when it is on PATH (fast, reads PNG/JPEG/EXR), otherwise a slow
pure-Python PNG reader. Exit 0 = every check passed; this is evidence, not a visual review.
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crucible_blender import check_frames, parse_frames  # noqa: E402


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--dir', required=True)
    parser.add_argument('--frames', help='expected frames, e.g. 1-240 or 1-60,121-180; default: lowest to highest found')
    parser.add_argument('--prefix', default='f_')
    parser.add_argument('--ext', default='png')
    parser.add_argument('--black', type=float, default=0.01, help='mean luma below this (0..1) counts as black')
    parser.add_argument('--jump', type=float, default=0.35, help='relative luma change that counts as a jump')
    parser.add_argument('--cuts', help='frames that start a new shot (a jump into them is allowed)')
    parser.add_argument('--sample', type=int, default=1, help='decode every Nth frame (all are checked for presence)')
    parser.add_argument('--no-ffmpeg', action='store_true')
    parser.add_argument('--json', action='store_true', help='print the full report as JSON')
    args = parser.parse_args(argv)
    if not os.path.isdir(args.dir):
        parser.error('--dir does not exist: %s' % args.dir)
    if args.sample < 1:
        parser.error('--sample must be at least 1')
    try:
        if args.frames:
            frames = parse_frames(args.frames)
        else:
            pattern = re.compile(r'^%s(-?\d+)\.%s$' % (re.escape(args.prefix), re.escape(args.ext.lstrip('.'))), re.I)
            found = sorted(int(m.group(1)) for m in (pattern.match(n) for n in os.listdir(args.dir)) if m)
            if not found:
                parser.error('no %s*.%s frames in %s' % (args.prefix, args.ext, args.dir))
            frames = list(range(found[0], found[-1] + 1))
        cuts = parse_frames(args.cuts) if args.cuts else []
    except ValueError as exc:
        parser.error(str(exc))
    report = check_frames(args.dir, frames, args.prefix, args.ext, args.black, args.jump, cuts, args.sample,
                          not args.no_ffmpeg)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print('frames %d-%d expected %d, decoder %s' % (frames[0], frames[-1], len(frames), report['decoder']))
        for key in ('missing', 'incomplete', 'black', 'jumps', 'undecoded'):
            if report[key]:
                print('FAIL %s (%d): %s' % (key, len(report[key]), json.dumps(report[key][:20])))
        print('PASS' if report['ok'] else 'FAIL')
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
