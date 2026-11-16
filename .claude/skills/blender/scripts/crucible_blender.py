"""Shared helpers for the Crucible Blender skill. Standard library only, no bpy.

Imported by render.py (inside Blender) and check_frames.py (any Python 3.8+), and tested
offline by test_blender.py. Nothing here touches a .blend file.
"""
import os
import re
import shutil
import struct
import subprocess
import zlib

_RANGE = re.compile(r'^(-?\d+)(?:-(-?\d+)(?::(\d+))?)?$')


def parse_frames(spec):
    """'1-10,15,20-30:5' -> sorted unique frame list. Raises ValueError on bad input."""
    if spec is None or not str(spec).strip():
        raise ValueError('empty frame spec')
    frames = set()
    for part in str(spec).replace(' ', '').split(','):
        match = _RANGE.match(part)
        if not match:
            raise ValueError('bad frame spec part: %r (use 1-10,15,20-30:5)' % part)
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) is not None else start
        step = int(match.group(3)) if match.group(3) else 1
        if end < start:
            raise ValueError('range runs backwards: %r' % part)
        if step < 1:
            raise ValueError('step must be at least 1: %r' % part)
        if (end - start) // step > 1000000:
            raise ValueError('range too large: %r' % part)
        frames.update(range(start, end + 1, step))
    return sorted(frames)


def frame_path(directory, prefix, frame, ext):
    return os.path.join(directory, '%s%04d.%s' % (prefix, frame, ext.lstrip('.').lower()))


def is_complete(path):
    """True when the file exists and its format's end marker is present (catches half-written frames)."""
    try:
        size = os.path.getsize(path)
    except OSError:
        return False
    if size == 0:
        return False
    ext = os.path.splitext(path)[1].lower()
    with open(path, 'rb') as handle:
        head = handle.read(8)
        handle.seek(max(0, size - 16))
        tail = handle.read()
    if ext == '.png':
        return head == b'\x89PNG\r\n\x1a\n' and b'IEND' in tail
    if ext in ('.jpg', '.jpeg'):
        return head[:2] == b'\xff\xd8' and tail.rstrip(b'\x00').endswith(b'\xff\xd9')
    if ext == '.exr':
        return head[:4] == b'\x76\x2f\x31\x01'
    return True


class Undecodable(Exception):
    pass


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def png_mean_luma(path, stride=4):
    """Mean luma 0..1 of a non-interlaced 8/16-bit PNG, pure Python (slow on big frames; ffmpeg is preferred)."""
    with open(path, 'rb') as handle:
        data = handle.read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise Undecodable('not a PNG')
    pos, idat, palette, header = 8, [], None, None
    while pos + 8 <= len(data):
        length, kind = struct.unpack('>I4s', data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        if kind == b'IHDR':
            header = struct.unpack('>IIBBBBB', body)
        elif kind == b'PLTE':
            palette = body
        elif kind == b'IDAT':
            idat.append(body)
        elif kind == b'IEND':
            break
        pos += 12 + length
    if header is None:
        raise Undecodable('no IHDR')
    width, height, depth, colour, _, _, interlace = header
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(colour)
    if channels is None or interlace or depth not in (8, 16) or (colour == 3 and depth != 8):
        raise Undecodable('unsupported PNG layout (colour %s, depth %s, interlace %s)' % (colour, depth, interlace))
    bytes_per = depth // 8
    bpp = channels * bytes_per
    row_len = width * bpp
    raw = zlib.decompress(b''.join(idat))
    if len(raw) < height * (row_len + 1):
        raise Undecodable('truncated image data')
    prev = bytearray(row_len)
    total, count = 0.0, 0
    for y in range(height):
        start = y * (row_len + 1)
        kind = raw[start]
        row = bytearray(raw[start + 1:start + 1 + row_len])
        if kind == 1:
            for i in range(bpp, row_len):
                row[i] = (row[i] + row[i - bpp]) & 0xFF
        elif kind == 2:
            for i in range(row_len):
                row[i] = (row[i] + prev[i]) & 0xFF
        elif kind == 3:
            for i in range(row_len):
                left = row[i - bpp] if i >= bpp else 0
                row[i] = (row[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif kind == 4:
            for i in range(row_len):
                left = row[i - bpp] if i >= bpp else 0
                upleft = prev[i - bpp] if i >= bpp else 0
                row[i] = (row[i] + _paeth(left, prev[i], upleft)) & 0xFF
        elif kind != 0:
            raise Undecodable('bad filter type %d' % kind)
        if y % stride == 0:
            for x in range(0, width, stride):
                o = x * bpp
                if colour == 2 or colour == 6:
                    r, g, b = row[o], row[o + bytes_per], row[o + 2 * bytes_per]
                elif colour == 3:
                    idx = row[o] * 3
                    r, g, b = palette[idx], palette[idx + 1], palette[idx + 2]
                else:
                    r = g = b = row[o]
                total += 0.2126 * r + 0.7152 * g + 0.0722 * b
                count += 1
        prev = row
    return total / (count * 255.0) if count else 0.0


def ffmpeg_mean_luma(path, ffmpeg=None):
    """Mean luma 0..1 via ffmpeg (any format ffmpeg reads). Returns None when ffmpeg is absent."""
    exe = ffmpeg or shutil.which('ffmpeg')
    if not exe:
        return None
    result = subprocess.run(
        [exe, '-v', 'error', '-i', path, '-frames:v', '1', '-vf', 'scale=64:36:flags=area,format=gray',
         '-f', 'rawvideo', '-'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
    if result.returncode != 0 or not result.stdout:
        raise Undecodable('ffmpeg could not decode: ' + result.stderr.decode('utf-8', 'replace').strip()[:200])
    return sum(result.stdout) / (len(result.stdout) * 255.0)


def mean_luma(path, use_ffmpeg=True):
    if use_ffmpeg:
        value = ffmpeg_mean_luma(path)
        if value is not None:
            return value, 'ffmpeg'
    if path.lower().endswith('.png'):
        return png_mean_luma(path), 'python'
    raise Undecodable('no decoder for %s without ffmpeg' % os.path.splitext(path)[1])


def check_frames(directory, frames, prefix='f_', ext='png', black=0.01, jump=0.35, cuts=(), sample=1,
                 use_ffmpeg=True):
    """Check a rendered sequence: every frame present and complete, none black, no brightness jump
    except at a planned cut. Returns a report dict; report['ok'] is the verdict."""
    cuts = set(cuts)
    report = {'directory': os.path.abspath(directory), 'expected': len(frames), 'missing': [], 'incomplete': [],
              'black': [], 'jumps': [], 'undecoded': [], 'decoder': None, 'luma': {}}
    previous = None
    for index, frame in enumerate(frames):
        path = frame_path(directory, prefix, frame, ext)
        if not os.path.exists(path):
            report['missing'].append(frame)
            previous = None
            continue
        if not is_complete(path):
            report['incomplete'].append(frame)
            previous = None
            continue
        if sample > 1 and index % sample and frame not in cuts:
            continue
        try:
            value, decoder = mean_luma(path, use_ffmpeg)
        except (Undecodable, zlib.error, OSError, subprocess.SubprocessError) as exc:
            report['undecoded'].append({'frame': frame, 'reason': str(exc)[:200]})
            previous = None
            continue
        report['decoder'] = decoder
        report['luma'][frame] = round(value, 4)
        if value < black:
            report['black'].append(frame)
        if previous is not None and frame not in cuts:
            prev_frame, prev_value = previous
            change = abs(value - prev_value) / max(value, prev_value, 0.02)
            if change > jump:
                report['jumps'].append({'from': prev_frame, 'to': frame, 'change': round(change, 3)})
        previous = (frame, value)
    report['ok'] = not (report['missing'] or report['incomplete'] or report['black'] or report['jumps']
                        or report['undecoded'])
    return report
