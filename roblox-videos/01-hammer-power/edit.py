"""This Hammer Needed More Power: 27 s, 9:16.
Record: tools\\record.ps1 -Episode 01-hammer-power -Seconds 45, save Studio's [FILM] lines to footage\\console.txt.
Render: ..\\tools\\kokoro\\.venv\\Scripts\\python.exe edit.py
"""
import os
import re
import sys

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "forge_kit"))
import forge

RAW = os.path.join(HERE, "footage", "raw.mp4")
BUILD = os.path.join(HERE, "build")
SR = forge.SR

# ---- footage marks: seconds since the white sync flash -> seconds into raw.mp4 ----
flash = forge.find_flash(RAW)
if flash is None:
    sys.exit("No sync flash found in raw.mp4; was Director started after recording began?")
marks = {m.group(1): float(m.group(2)) + flash
         for line in open(os.path.join(HERE, "footage", "console.txt"), encoding="utf8", errors="ignore")
         if (m := re.search(r"\[FILM\]\s+(\S+)\s+([\d.]+)", line))}

# Output time each contact lands on (these drive cuts, narration, sfx).
OUT = {"tap": 1.4, "hit1": 6.0, "hit2": 13.0, "smash": 21.6}
CUTS = [  # (source start, duration); contiguous output 0-3, 3-10, 10-17, 17-27
    (marks["tap"] - OUT["tap"], 3.0),
    (marks["hit1"] - (OUT["hit1"] - 3.0), 7.0),
    (marks["hit2"] - (OUT["hit2"] - 10.0), 7.0),
    (marks["smash"] - (OUT["smash"] - 17.0), 10.0),  # one continuous shot: raise, pause, strike, aftermath
]

# Typed fast (voice off, ~0.045 s/char), then held readable (3rd value).
REQUESTS = [
    (3.2, "Add a heavy impact and dust.", 2.6),
    (10.2, "Add spreading cracks and a shockwave.", 2.8),
    (17.2, "Make it smash through.", 2.4),
]
NARRATION = [  # subtitles = exactly what is said
    (1.6, "That was supposed to break it?", 1.1),
    (6.3, "Better hit. Still standing.", 1.1),
    (13.3, "Okay. Now it's cracking.", 1.1),
    (17.9, "One more.", 1.0),
    (24.4, "That did it.", 1.0),
]


# ---- synthesized sfx (no licensed audio): tink, thud+grit, deep hit+cracks, smash ----
def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1) * np.exp(-t / d)


def noise(n, seed):
    return np.random.default_rng(seed).standard_normal(n).astype(np.float32)


def lp(x, k):  # crude one-pole low-pass
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += k * (v - acc)
        y[i] = acc
    return y


def tink():
    n = int(0.12 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 2300 * t) * env(n, 0.001, 0.02) * 0.5
            + np.sin(2 * np.pi * 3400 * t) * env(n, 0.001, 0.012) * 0.25).astype(np.float32)


def thud(depth=1.0, grit=0.6):
    n = int(0.9 * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * (70 - 25 * np.minimum(t * 6, 1)) * t * depth) * env(n, 0.002, 0.14)
    return (body * 0.9 + lp(noise(n, 1), 0.3) * env(n, 0.001, 0.25) * grit * 0.5).astype(np.float32)


def crack(seed):
    n = int(0.18 * SR)
    return (noise(n, seed) * env(n, 0.0005, 0.02) * 0.45).astype(np.float32)


def debris(seed, count):
    out = np.zeros(int(1.2 * SR), np.float32)
    rng = np.random.default_rng(seed)
    for _ in range(count):
        at = int(rng.uniform(0, 0.9) * SR)
        c = lp(noise(int(0.05 * SR), int(rng.integers(1e6))), 0.5) * env(int(0.05 * SR), 0.0005, 0.012) * rng.uniform(0.2, 0.5)
        out[at:at + len(c)] += c
    return out


def place(buf, at, a):
    i = int(at * SR)
    buf[i:i + len(a)] += a[: max(len(buf) - i, 0)]


def sfx_track():
    buf = np.zeros(int(28 * SR), np.float32)
    place(buf, OUT["tap"], tink())
    place(buf, OUT["hit1"], thud(1.0, 0.7) * 0.8)
    place(buf, OUT["hit2"], thud(1.3, 0.5))
    for k, dt in enumerate((0.12, 0.3, 0.52)):
        place(buf, OUT["hit2"] + dt, crack(10 + k))
    place(buf, OUT["hit2"] + 0.6, debris(3, 8) * 0.8)
    place(buf, OUT["smash"], thud(1.6, 1.0) * 1.1)
    for k, dt in enumerate((0.05, 0.2, 0.4)):
        place(buf, OUT["smash"] + dt, crack(20 + k) * 1.2)
    place(buf, OUT["smash"] + 0.5, debris(5, 24))
    place(buf, OUT["smash"] + 1.4, debris(6, 14) * 0.7)
    return buf / max(1.0, float(np.abs(buf).max()) / 0.8)  # headroom; loudnorm in forge.build does the rest


os.makedirs(BUILD, exist_ok=True)
SFX = os.path.join(BUILD, "sfx.wav")
sf.write(SFX, sfx_track(), SR)

forge.build(
    out=os.path.join(HERE, "episode.mp4"),
    footage=RAW,
    cuts=CUTS,
    requests=REQUESTS,
    narration=NARRATION,
    speak_requests=False,   # the brief shows requests as text only
    title=None,             # only the three requests may appear as text
    logo_at=26.0,           # official logo over the aftermath, 26-27 s; no outro
    logo_dur=1.0,
    logo_y=1480,            # over the empty floor, clear of the opening (panel is hidden by then)
    cta_text=None,
    sfx=[(0.0, SFX, 0.9)],
    work=BUILD,
)
