"""Original, synthesised background tracks. Every tune is composed here; none is an existing song.

  mobster  smoky minor-key swing: walking bass, piano comping, brushes, muted-sax lead, mandolin fill, vinyl crackle (default)
  klezmer  silly hora-style two-step, reedy clarinet, oom-pah bass, bit-crushed for meme quality
Audition both: python -m src.music  ->  assets/music-samples/
"""
from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

SR = 44100
STYLES = ("mobster", "klezmer")


def _t(sec: float) -> np.ndarray:
    return np.arange(int(sec * SR)) / SR


def _put(buf: np.ndarray, snd: np.ndarray, at_sec: float) -> None:
    i = int(at_sec * SR)
    if 0 <= i < buf.size:
        buf[i:i + snd.size] += snd[: buf.size - i]


def _pluck(f: float, dur: float, decay: float = 9.0) -> np.ndarray:
    t = _t(dur)
    return 2 / np.pi * np.arcsin(np.sin(2 * np.pi * f * t)) * np.exp(-t * decay) * 0.9


def _crush(x: np.ndarray, bits: int = 7, hold: int = 3) -> np.ndarray:
    x = np.repeat(x[::hold], hold)[: x.size]  # sample-and-hold: lo-fi
    q = 2 ** (bits - 1)
    return np.round(x * q) / q


# ---------- klezmer ----------

K_BPM, K_ROOT = 152, 164.81  # E3
K_EIGHTH = 60 / K_BPM / 2
K_SCALE = [0, 1, 4, 5, 7, 8, 10, 12, 13, 16, 17]  # E Phrygian dominant
K_A = [(4, 1), (5, 1), (4, 1), (2, 1), (1, 1), (2, 1), (4, 2), (5, 1), (7, 1), (5, 1), (4, 1), (2, 1), (1, 1), (0, 2)]
K_B = [(7, 1), (8, 1), (7, 1), (5, 1), (4, 1), (5, 1), (7, 2), (8, 1), (9, 1), (8, 1), (7, 1), (5, 1), (4, 1), (0, 2)]


def _klez_lead(f: float, dur: float, t0: float) -> np.ndarray:
    t = _t(dur)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.8 * (t + t0))
    ph = 2 * np.pi * f * np.cumsum(vib) / SR
    w = sum(np.sin(k * ph) / k for k in (1, 3, 5, 7))  # odd harmonics: reedy
    return w * np.minimum(t / 0.012, 1) * np.clip((dur - t) / 0.05, 0, 1) * 0.55


def _klez_stab(freqs: list[float], dur: float) -> np.ndarray:
    t = _t(dur)
    out = np.zeros(t.size)
    for f in freqs:
        for det in (0.996, 1.004):  # detuned pair = accordion-ish wobble
            out += 2 * ((f * det * t) % 1) - 1
    return out / (len(freqs) * 2) * np.exp(-t * 14) * 0.8


def _klezmer(seconds: float) -> np.ndarray:
    n = int((seconds + 1) * SR)
    lead, rhythm = np.zeros(n), np.zeros(n)
    hz = lambda semi, octv=0: K_ROOT * 2 ** ((semi + 12 * octv) / 12)  # noqa: E731
    t, k = 0.0, 0
    while t < seconds + 1:
        for idx, ln in (K_A if k % 2 == 0 else K_B):
            d = ln * K_EIGHTH
            _put(lead, _klez_lead(hz(K_SCALE[idx], 1), d * 0.88, t), t)  # staccato = sillier
            t += d
        k += 1
    bar = 4 * K_EIGHTH
    for b in range(int((seconds + 1) / bar) + 1):  # oom (bass) beat 1, pah (stab) beat 2; F chord every 4th bar
        root = 5 if b % 4 == 3 else 0
        _put(rhythm, _pluck(hz(root if b % 2 == 0 else root + 7, -1), K_EIGHTH * 1.8), b * bar)
        _put(rhythm, _klez_stab([hz(root + s) for s in (0, 4, 7)], K_EIGHTH * 1.6), b * bar + 2 * K_EIGHTH)
    return np.tanh((_crush(lead * 0.8) + rhythm * 0.6) * 1.1)


# ---------- mobster jazz ----------

M_BPM, A3, A2 = 118, 220.0, 110.0
M_BEAT = 60 / M_BPM
# progression per bar: Am7, Dm7, E7, Am7 (root semitones above A, chord intervals)
M_CHORDS = [(0, (0, 3, 7, 10)), (5, (0, 3, 7, 10)), (7, (0, 4, 7, 10)), (0, (0, 3, 7, 10))]
M_WALK = [(0, 3, 7, 3), (5, 8, 12, 8), (7, 11, 14, 11), (0, 3, 7, 10)]  # walking-bass semitones, one per beat
# lead over 4 bars: (start in swung eighths, length in eighths, semitones above A3)
M_MELODY = [(0, 2, 12), (2, 1, 15), (3, 1, 14), (4, 2, 12), (6, 2, 7), (8, 1, 17), (9, 1, 15), (10, 2, 12), (12, 1, 8), (13, 1, 12),
            (14, 2, 17), (16, 2, 14), (18, 1, 11), (19, 1, 14), (20, 2, 17), (22, 2, 14), (24, 3, 12), (27, 1, 11), (28, 4, 12)]
M_FILL = [(0, 4, 19), (4, 2, 15), (6, 2, 12)]  # mandolin tremolo, last bar of each 8-bar loop


def _swing(pos8: float) -> float:
    """Seconds for an eighth-note slot, off-beats pushed late (triplet swing)."""
    return (pos8 // 2 + (2 / 3 if pos8 % 2 else 0)) * M_BEAT


def _sax(f: float, dur: float, t0: float) -> np.ndarray:
    t = _t(dur)
    vib = 1 + 0.008 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(t / 0.25, 1)  # vibrato fades in
    ph = 2 * np.pi * np.cumsum(f * vib * (1 - 0.03 * np.exp(-t / 0.03))) / SR  # scoop up into the note
    w = sum(np.sin(k * ph) / k ** 1.1 for k in range(1, 8) if f * k < 3500)
    breath = 0.03 * np.random.default_rng(int(t0 * 1000) % 2**31).normal(size=t.size)
    return (w + breath) * np.minimum(t / 0.03, 1) * np.clip((dur - t) / 0.09, 0, 1) * 0.5


def _keys(freqs: list[float], dur: float) -> np.ndarray:
    t = _t(dur)
    return sum(np.sin(2 * np.pi * f * t) + 0.4 * np.sin(4 * np.pi * f * t) + 0.15 * np.sin(6 * np.pi * f * t)
               for f in freqs) / len(freqs) * np.exp(-t * 5.5) * 0.5


def _mandolin(f: float, dur: float) -> np.ndarray:
    out = np.zeros(int(dur * SR))
    for k in range(int(dur / 0.075)):  # rapid repeated plucks = tremolo
        t = _t(0.2)
        _put(out, sum(np.sin(2 * np.pi * f * h * t) / h for h in (1, 2, 3, 4)) * np.exp(-t * 20) * 0.35, k * 0.075)
    return out


def _brush(dur: float, high: bool) -> np.ndarray:
    noise = np.random.default_rng(7 if high else 9).normal(size=int(dur * SR))
    if high:
        noise = np.diff(noise, prepend=0)  # crude highpass = ride/hat
    return noise * np.exp(-_t(dur) * (28 if high else 14)) * (0.10 if high else 0.12)


def _mobster(seconds: float) -> np.ndarray:
    n = int((seconds + 1) * SR)
    lead, band = np.zeros(n), np.zeros(n)
    hz = lambda semi, base=A3: base * 2 ** (semi / 12)  # noqa: E731
    bar = 4 * M_BEAT
    for b in range(int((seconds + 1) / bar) + 1):
        start, ci = b * bar, b % 4
        for beat in range(4):  # walking bass
            _put(band, _pluck(hz(M_WALK[ci][beat], A2), M_BEAT * 0.9, 4.5) * 0.9, start + beat * M_BEAT)
        root, ivs = M_CHORDS[ci]
        for beat in (1, 3):  # piano comping on 2 and 4
            _put(band, _keys([hz(root + i) for i in ivs], M_BEAT * 0.8), start + beat * M_BEAT)
        for p8 in (0, 2, 3, 4, 6, 7):  # swung ride pattern
            _put(band, _brush(0.12, True), start + _swing(p8))
        for beat in (1, 3):  # soft brush snare
            _put(band, _brush(0.16, False), start + beat * M_BEAT)
        if b % 8 < 4:  # lead plays 4 bars, then rests while the mandolin turns it around
            for p8, ln, semi in M_MELODY:
                if p8 // 8 == b % 4:
                    q = p8 % 8
                    d = (_swing(q + ln) - _swing(q)) * 0.95
                    _put(lead, _sax(hz(semi), d, start + _swing(q)), start + _swing(q))
        elif b % 8 == 7:
            for p8, ln, semi in M_FILL:
                _put(lead, _mandolin(hz(semi), _swing(p8 + ln) - _swing(p8)), start + _swing(p8))
    rng = np.random.default_rng(3)
    crackle = np.zeros(n)
    crackle[rng.integers(0, n, int(seconds * 14))] = rng.uniform(-0.05, 0.05, int(seconds * 14))  # vinyl pops
    return np.tanh((lead * 0.9 + band * 0.8 + crackle) * 1.05)


def write_music(seconds: float, path: Path, style: str = "mobster") -> None:
    if style not in STYLES:
        raise ValueError(f"unknown music style {style!r}; choose from {STYLES}")
    mix = (_mobster if style == "mobster" else _klezmer)(seconds)
    mix[: int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
    fade = int(0.6 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((mix / max(np.abs(mix).max(), 1e-9) * 0.9 * 32767).astype("<i2").tobytes())


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "assets" / "music-samples"
    for s in STYLES:
        write_music(16.0, out / f"{s}.wav", s)
        print("wrote", out / f"{s}.wav")
