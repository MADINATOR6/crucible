"""Synthesised sound effects (no sample licences needed): whoosh, pop, tick, chime, cash. Mono 44.1 kHz wav."""
from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

SR = 44100


def _t(sec: float) -> np.ndarray:
    return np.arange(int(sec * SR)) / SR


def whoosh() -> np.ndarray:
    t = _t(0.3)
    f = 250 * (10 ** (t / 0.3 * 0.9))  # rising sweep
    sweep = np.sin(2 * np.pi * np.cumsum(f) / SR)
    noise = np.random.default_rng(1).normal(size=t.size)
    env = np.sin(np.pi * t / 0.3) ** 2
    return (0.35 * sweep + 0.25 * noise) * env


def pop() -> np.ndarray:
    t = _t(0.09)
    f = 520 + 520 * (t / 0.09)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 45)


def tick() -> np.ndarray:
    t = _t(0.05)
    return (np.sin(2 * np.pi * 1900 * t) + 0.4 * np.sin(2 * np.pi * 3800 * t)) * np.exp(-t * 110)


def chime() -> np.ndarray:
    t = _t(1.0)
    return sum(a * np.sin(2 * np.pi * f * t) for f, a in ((1318.5, 1.0), (1760.0, 0.6), (2637.0, 0.3))) * np.exp(-t * 4.2) * 0.5


def cash() -> np.ndarray:
    out = np.zeros(int(0.7 * SR))
    for start, f in ((0.0, 2093.0), (0.09, 2637.0)):
        t = _t(0.45)
        ping = np.sin(2 * np.pi * f * t) * np.exp(-t * 9)
        i = int(start * SR)
        out[i:i + ping.size] += ping[: out.size - i]
    return out * 0.6


def boing() -> np.ndarray:
    """Cartoon spring: pitch bends up with a wobble. Used on hook slams."""
    t = _t(0.38)
    f = 200 + 560 * (t / 0.38) ** 0.6
    ph = 2 * np.pi * np.cumsum(f) / SR + 3.0 * np.sin(2 * np.pi * 13 * t)
    return np.sin(ph) * np.exp(-t * 6) * 0.8


KINDS = {"whoosh": whoosh, "pop": pop, "tick": tick, "chime": chime, "cash": cash, "boing": boing}


def write_sfx(events: list[tuple[float, str, float]], total: float, path: Path) -> None:
    """events: (start seconds, kind, volume) over the whole video."""
    buf = np.zeros(int((total + 1.2) * SR))
    for start, kind, vol in events:
        s = KINDS[kind]() * vol
        i = int(start * SR)
        buf[i:i + s.size] += s[: buf.size - i]
    buf = np.tanh(buf * 0.9)  # soft clip
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((buf * 32000).astype("<i2").tobytes())
