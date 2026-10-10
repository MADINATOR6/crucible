"""Original, synthesised 'silly klezmer' loop: fast hora-style two-step, Phrygian-dominant scale, squeaky clarinet lead,
oom-pah bass and accordion stabs, deliberately bit-crushed for meme quality. The tune is composed here; it is not any existing song.
"""
from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 152
EIGHTH = 60 / BPM / 2
ROOT_HZ = 164.81  # E3
SCALE = [0, 1, 4, 5, 7, 8, 10, 12, 13, 16, 17]  # E Phrygian dominant, semitones from the root
# (scale index, length in eighths); each phrase is 16 eighths = 4 bars of 2/4
PHRASE_A = [(4, 1), (5, 1), (4, 1), (2, 1), (1, 1), (2, 1), (4, 2), (5, 1), (7, 1), (5, 1), (4, 1), (2, 1), (1, 1), (0, 2)]
PHRASE_B = [(7, 1), (8, 1), (7, 1), (5, 1), (4, 1), (5, 1), (7, 2), (8, 1), (9, 1), (8, 1), (7, 1), (5, 1), (4, 1), (0, 2)]


def _hz(semi: float, octave: int = 0) -> float:
    return ROOT_HZ * 2 ** ((semi + 12 * octave) / 12)


def _lead(f: float, dur: float, t0: float) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.8 * (t + t0))
    ph = 2 * np.pi * f * np.cumsum(vib) / SR
    wave_ = sum(np.sin(k * ph) / k for k in (1, 3, 5, 7))  # odd harmonics: reedy, clarinet-ish
    env = np.minimum(t / 0.012, 1) * np.minimum((dur - t) / 0.05, 1).clip(0, 1)
    return wave_ * env * 0.55


def _pluck(f: float, dur: float) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    tri = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * f * t))
    return tri * np.exp(-t * 9) * 0.9


def _stab(freqs: list[float], dur: float) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros(t.size)
    for f in freqs:
        for det in (0.996, 1.004):  # detuned pair = accordion-ish wobble
            out += 2 * ((f * det * t) % 1) - 1
    return out / (len(freqs) * 2) * np.exp(-t * 14) * 0.8


def _crush(x: np.ndarray, bits: int = 7, hold: int = 3) -> np.ndarray:
    x = np.repeat(x[::hold], hold)[: x.size]  # sample-and-hold: lo-fi
    q = 2 ** (bits - 1)
    return np.round(x * q) / q


def write_music(seconds: float, path: Path) -> None:
    n = int((seconds + 1) * SR)
    lead, rhythm = np.zeros(n), np.zeros(n)
    bar = 4 * EIGHTH
    t = 0.0
    phrase_i = 0
    while t < seconds + 1:
        phrase = PHRASE_A if phrase_i % 2 == 0 else PHRASE_B
        for idx, ln in phrase:
            if t >= seconds + 1:
                break
            d = ln * EIGHTH
            note = _lead(_hz(SCALE[idx], 1), d * 0.88, t)  # staccato = sillier
            i = int(t * SR)
            lead[i:i + note.size] += note[: n - i]
            t += d
        phrase_i += 1
    bars = int((seconds + 1) / bar) + 1
    for b in range(bars):  # oom (bass) on beat 1, pah (stab) on beat 2; F chord every 4th bar for the minor-second bite
        t0 = b * bar
        root = 5 if b % 4 == 3 else 0
        for off, snd in ((0, _pluck(_hz(root, -1) if b % 2 == 0 else _hz(root + 7, -1), EIGHTH * 1.8)),
                         (2 * EIGHTH, _stab([_hz(root + s, 0) for s in (0, 4, 7)], EIGHTH * 1.6))):
            i = int((t0 + off) * SR)
            if i < n:
                rhythm[i:i + snd.size] += snd[: n - i]
    mix = _crush(lead * 0.8) + rhythm * 0.6
    mix[: int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
    fade = int(0.6 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)
    mix = np.tanh(mix * 1.1)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((mix / max(np.abs(mix).max(), 1e-9) * 0.9 * 32767).astype("<i2").tobytes())
