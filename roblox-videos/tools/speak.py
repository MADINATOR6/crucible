"""Kokoro TTS helper: python speak.py out.wav "text" [speed] [voice]"""
import sys

import numpy as np
import soundfile as sf
from kokoro import KPipeline

out, text = sys.argv[1], sys.argv[2]
speed = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
voice = sys.argv[4] if len(sys.argv) > 4 else "am_michael"

pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
chunks = [np.asarray(a) for _, _, a in pipe(text, voice=voice, speed=speed) if a is not None]
audio = np.concatenate(chunks) if chunks else np.zeros(2400, dtype=np.float32)
sf.write(out, audio, 24000)
